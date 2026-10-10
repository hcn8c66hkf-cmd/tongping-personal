import {
  createConnection,
  createServer as createNetServer,
  type Socket,
} from "node:net";

export interface CommitAcknowledgementDropProxyOptions {
  readonly armed?: boolean;
}

export interface CommitAcknowledgementDropProxy {
  readonly connectionString: string;
  readonly commitQueriesSeen: number;
  readonly acknowledgementDropped: boolean;
  readonly clientConnectionsSeen: number;
  arm(): void;
  close(): Promise<void>;
}

/**
 * A PostgreSQL wire proxy that drops exactly one COMMIT acknowledgement after
 * PostgreSQL has already reached ReadyForQuery. COMMIT counting continues on
 * later client connections so reconnect/replay attempts remain observable.
 */
export async function startCommitAcknowledgementDropProxy(
  targetConnectionString: string,
  options: CommitAcknowledgementDropProxyOptions = {},
): Promise<CommitAcknowledgementDropProxy> {
  const target = new URL(targetConnectionString);
  const sockets = new Set<Socket>();
  let armed = options.armed ?? true;
  let commitQueriesSeen = 0;
  let acknowledgementDropped = false;
  let clientConnectionsSeen = 0;

  const server = createNetServer((downstream) => {
    clientConnectionsSeen += 1;
    sockets.add(downstream);
    downstream.once("close", () => sockets.delete(downstream));

    const upstream = createConnection({
      host: target.hostname,
      port: Number(target.port || 5432),
    });
    sockets.add(upstream);
    upstream.once("close", () => sockets.delete(upstream));

    let frontendReady = false;
    let interceptCommitResponse = false;
    let frontendBuffer = Buffer.alloc(0);
    let backendBuffer = Buffer.alloc(0);

    downstream.on("data", (chunk) => {
      if (!upstream.destroyed) upstream.write(chunk);
      if (!frontendReady) return;

      frontendBuffer = Buffer.concat([frontendBuffer, chunk]);
      while (frontendBuffer.length >= 5) {
        const length = frontendBuffer.readUInt32BE(1);
        const total = 1 + length;
        if (
          length < 4 ||
          total > 16 * 1024 * 1024 ||
          frontendBuffer.length < total
        ) {
          break;
        }

        if (frontendBuffer[0] === 0x51) {
          const query = frontendBuffer
            .subarray(5, total - 1)
            .toString("utf8")
            .trim()
            .toUpperCase();
          if (query === "COMMIT") {
            commitQueriesSeen += 1;
            if (
              armed &&
              !acknowledgementDropped &&
              !interceptCommitResponse
            ) {
              interceptCommitResponse = true;
              backendBuffer = Buffer.alloc(0);
            }
          }
        }
        frontendBuffer = frontendBuffer.subarray(total);
      }
    });

    upstream.on("data", (chunk) => {
      if (interceptCommitResponse && !acknowledgementDropped) {
        backendBuffer = Buffer.concat([backendBuffer, chunk]);
        while (backendBuffer.length >= 5) {
          const length = backendBuffer.readUInt32BE(1);
          const total = 1 + length;
          if (
            length < 4 ||
            total > 16 * 1024 * 1024 ||
            backendBuffer.length < total
          ) {
            break;
          }
          const type = backendBuffer[0];
          backendBuffer = backendBuffer.subarray(total);
          if (type === 0x5a) {
            acknowledgementDropped = true;
            armed = false;
            if (!downstream.destroyed) downstream.destroy();
            if (!upstream.destroyed) upstream.destroy();
            return;
          }
        }
        return;
      }

      if (!downstream.destroyed) downstream.write(chunk);

      if (!frontendReady) {
        backendBuffer = Buffer.concat([backendBuffer, chunk]);
        while (backendBuffer.length >= 5) {
          const length = backendBuffer.readUInt32BE(1);
          const total = 1 + length;
          if (
            length < 4 ||
            total > 16 * 1024 * 1024 ||
            backendBuffer.length < total
          ) {
            break;
          }
          const type = backendBuffer[0];
          backendBuffer = backendBuffer.subarray(total);
          if (type === 0x5a) frontendReady = true;
        }
      }
    });

    downstream.once("error", () => {});
    upstream.once("error", () => {});
    downstream.once("close", () => {
      if (!upstream.destroyed) upstream.destroy();
    });
    upstream.once("close", () => {
      if (!downstream.destroyed) downstream.destroy();
    });
  });

  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", resolve),
  );
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("failed to bind PostgreSQL COMMIT fault proxy");
  }

  const proxyUrl = new URL(targetConnectionString);
  proxyUrl.hostname = "127.0.0.1";
  proxyUrl.port = String(address.port);

  return {
    connectionString: proxyUrl.toString(),
    get commitQueriesSeen() {
      return commitQueriesSeen;
    },
    get acknowledgementDropped() {
      return acknowledgementDropped;
    },
    get clientConnectionsSeen() {
      return clientConnectionsSeen;
    },
    arm() {
      if (acknowledgementDropped) {
        throw new Error("COMMIT acknowledgement fault already consumed");
      }
      armed = true;
    },
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) =>
        server.close(() => resolve()),
      );
    },
  };
}
