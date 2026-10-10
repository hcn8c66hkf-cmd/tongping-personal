import type http from "node:http";
import { WebSocket } from "ws";
import type { VerifiedWorkerConnectionContext, WorkerConnectionHandle } from "./worker-connection-registry.js";

/** `true` is the explicit legacy private compatibility authority. */
export type WorkerTransportAuthority = true | WorkerConnectionHandle;
export type WorkerTransportAuthenticator = (request: http.IncomingMessage) =>
  WorkerTransportAuthority | null | Promise<WorkerTransportAuthority | null>;

const socketContexts = new WeakMap<WebSocket, VerifiedWorkerConnectionContext>();

export function workerSocketContext(ws: WebSocket): VerifiedWorkerConnectionContext | null {
  return socketContexts.get(ws) ?? null;
}

export async function admitWorkerSocket(authority: WorkerTransportAuthority, ws: WebSocket): Promise<boolean> {
  if (authority === true) return ws.readyState === WebSocket.OPEN;
  if (!(await authority.isCurrent()) || ws.readyState !== WebSocket.OPEN) return false;
  socketContexts.set(ws, authority.context);
  await authority.registerRetirementResource(() => {
    try { ws.close(1012, "worker session retired"); } catch { ws.terminate(); }
  });
  return await workerSocketCurrent(authority, ws);
}

export async function workerSocketCurrent(authority: WorkerTransportAuthority, ws: WebSocket): Promise<boolean> {
  if (ws.readyState !== WebSocket.OPEN) return false;
  try {
    return (authority === true || await authority.isCurrent()) && ws.readyState === WebSocket.OPEN;
  } catch { return false; }
}
