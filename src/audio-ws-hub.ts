import type http from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, WebSocket } from "ws";
import { admitWorkerSocket, workerSocketCurrent, type WorkerTransportAuthority, type WorkerTransportAuthenticator } from "./worker-transport-authority.js";
import OpusScript from "opusscript";

export interface AudioWsChunk {
  packet: Buffer;
  sequence: number;
  sampleRate: number;
  channels: number;
  frames: number;
  capturedAt: number;
  bytes: number;
}

export interface AudioWsHubOptions {
  authenticateWorker: WorkerTransportAuthenticator;
  authenticateApp: (
    profile: string,
    url: URL,
    request: http.IncomingMessage,
  ) => boolean;
  onChunk?: (profile: string, chunk: AudioWsChunk) => void;
  onWorkerPresence?: (profile: string, connected: boolean) => void;
  onAppPresence?: (profile: string, connected: boolean) => void;
}

const HEADER_BYTES = 24;
const MAX_AUDIO_PAYLOAD = 256_000;
const MAX_APP_CREDITS = 128;

const WORKER_OPUS_MAGIC = 0x4d4f5055; // "MOPU"
const WORKER_OPUS_HEADER_BYTES = 28;
const MAX_WORKER_OPUS_PAYLOAD = 16_000;

export interface OpusWorkerAudioPacket {
  sequence: number;
  sampleRate: number;
  channels: number;
  frames: number;
  capturedAt: number;
  buffer: Buffer;
  bytes: number;
}

export function encodeOpusWorkerAudioPacket(input: {
  buffer: Buffer;
  sequence: number;
  sampleRate: number;
  channels: number;
  frames: number;
  capturedAt: number;
}): Buffer {
  const payload = Buffer.from(input.buffer);
  if (payload.length <= 0 || payload.length > MAX_WORKER_OPUS_PAYLOAD) {
    throw new Error("invalid opus audio payload");
  }
  const packet = Buffer.allocUnsafe(
    WORKER_OPUS_HEADER_BYTES + payload.length,
  );
  packet.writeUInt32BE(WORKER_OPUS_MAGIC, 0);
  packet.writeUInt32BE(input.sequence >>> 0, 4);
  packet.writeUInt32BE(input.sampleRate >>> 0, 8);
  packet.writeUInt32BE(input.channels >>> 0, 12);
  packet.writeUInt32BE(input.frames >>> 0, 16);
  packet.writeBigUInt64BE(
    BigInt(Math.max(0, Math.round(input.capturedAt))),
    20,
  );
  payload.copy(packet, WORKER_OPUS_HEADER_BYTES);
  return packet;
}

export function parseOpusWorkerAudioPacket(
  packet: Buffer,
): OpusWorkerAudioPacket | null {
  if (
    packet.length <= WORKER_OPUS_HEADER_BYTES ||
    packet.length >
      WORKER_OPUS_HEADER_BYTES + MAX_WORKER_OPUS_PAYLOAD ||
    packet.readUInt32BE(0) !== WORKER_OPUS_MAGIC
  ) {
    return null;
  }
  const sequence = packet.readUInt32BE(4);
  const sampleRate = packet.readUInt32BE(8);
  const channels = packet.readUInt32BE(12);
  const frames = packet.readUInt32BE(16);
  const capturedAt = Number(packet.readBigUInt64BE(20));
  const buffer = Buffer.from(packet.subarray(WORKER_OPUS_HEADER_BYTES));
  if (
    ![8_000, 12_000, 16_000, 24_000, 48_000].includes(sampleRate) ||
    channels !== 1 ||
    frames < 1 ||
    frames > 2_880 ||
    !Number.isSafeInteger(capturedAt) ||
    capturedAt <= 0
  ) {
    return null;
  }
  return {
    sequence,
    sampleRate,
    channels,
    frames,
    capturedAt,
    buffer,
    bytes: buffer.length,
  };
}

export function encodeAudioWsPacket(input: {
  buffer: Buffer;
  sequence: number;
  sampleRate: number;
  channels: number;
  frames: number;
  capturedAt: number;
}): Buffer {
  const payload = Buffer.from(input.buffer);
  const packet = Buffer.allocUnsafe(HEADER_BYTES + payload.length);
  packet.writeUInt32BE(input.sequence >>> 0, 0);
  packet.writeUInt32BE(input.sampleRate >>> 0, 4);
  packet.writeUInt32BE(input.channels >>> 0, 8);
  packet.writeUInt32BE(input.frames >>> 0, 12);
  packet.writeBigUInt64BE(BigInt(Math.max(0, Math.round(input.capturedAt))), 16);
  payload.copy(packet, HEADER_BYTES);
  return packet;
}

export function parseAudioWsPacket(packet: Buffer): AudioWsChunk | null {
  if (packet.length <= HEADER_BYTES || packet.length > MAX_AUDIO_PAYLOAD) {
    return null;
  }

  const sequence = packet.readUInt32BE(0);
  const sampleRate = packet.readUInt32BE(4);
  const channels = packet.readUInt32BE(8);
  const frames = packet.readUInt32BE(12);
  const capturedAt = Number(packet.readBigUInt64BE(16));
  const payloadBytes = packet.length - HEADER_BYTES;

  if (
    sampleRate < 8_000 ||
    sampleRate > 96_000 ||
    channels !== 1 ||
    frames < 1 ||
    frames > 16_384 ||
    payloadBytes !== frames * channels * 2 ||
    !Number.isSafeInteger(capturedAt) ||
    capturedAt <= 0
  ) {
    return null;
  }

  return {
    packet,
    sequence,
    sampleRate,
    channels,
    frames,
    capturedAt,
    bytes: payloadBytes,
  };
}

export class AudioWsHub {
  private readonly wss = new WebSocketServer({
    noServer: true,
    perMessageDeflate: false,
    maxPayload: MAX_AUDIO_PAYLOAD,
  });

  private readonly workers = new Map<string, WebSocket>();
  private readonly apps = new Map<string, WebSocket>();
  private readonly workerLastChunkAt = new Map<string, number>();
  private readonly appCredits = new Map<WebSocket, number>();
  private readonly appPcmBatches = new Map<string, {
    sampleRate: number;
    channels: number;
    frames: number;
    capturedAt: number;
    buffers: Buffer[];
    appSequence: number;
  }>();
  private readonly appPlaybackStatus = new Map<string, {
    at: string;
    enabled: boolean;
    contextState: string;
    packetsReceived: number;
    scheduledAheadMs: number;
    pcmRms: number;
    gain: number;
    presentationClock: boolean;
    liveRenderedCapturedAt: number;
    liveFrameAgeMs: number;
    audioCapturedAt: number;
    syncErrorMs: number;
  }>();
  private readonly opusDecoders = new Map<string, {
    sampleRate: number;
    channels: number;
    decoder: OpusScript;
  }>();

  private readonly counters = {
    workerAttempts: 0,
    workerAccepted: 0,
    workerRejected: 0,
    workerCloses: 0,
    appAttempts: 0,
    appAccepted: 0,
    appRejected: 0,
    appCloses: 0,
    appStatusReports: 0,
    chunksAccepted: 0,
    chunksDroppedNoViewer: 0,
    chunksDroppedBackpressure: 0,
    chunksSent: 0,
    opusWorkerChunks: 0,
    opusWorkerBytes: 0,
    decodedPcmBytes: 0,
    opusDecodeErrors: 0,
    lastProfile: "",
    lastSequence: 0,
    lastBytes: 0,
    lastAt: "",
    lastWorkerCloseCode: 0,
    lastWorkerCloseReason: "",
    lastAppCloseCode: 0,
    lastAppCloseReason: "",
  };

  constructor(private readonly options: AudioWsHubOptions) {}

  handleUpgrade(
    request: http.IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ): boolean {
    const host = request.headers.host || "localhost";
    const url = new URL(request.url || "/", "http://" + host);
    if (
      url.pathname !== "/v1/worker/audio-ws" &&
      url.pathname !== "/v1/app/audio-ws"
    ) {
      return false;
    }

    const profile = normalizeProfile(url.searchParams.get("profile") || "");
    if (!profile) {
      rejectUpgrade(socket, 400, "Bad Request");
      return true;
    }

    const isWorker = url.pathname === "/v1/worker/audio-ws";
    if (isWorker) this.counters.workerAttempts += 1;
    else this.counters.appAttempts += 1;

    if (isWorker) {
      void this.upgradeWorker(request, socket, head, profile);
      return true;
    }
    const allowed = this.options.authenticateApp(profile, url, request);

    if (!allowed) {
      this.counters.appRejected += 1;
      rejectUpgrade(socket, 403, "Forbidden");
      return true;
    }

    this.wss.handleUpgrade(request, socket, head, (ws) => {
      this.counters.appAccepted += 1;
      this.acceptApp(profile, ws);
    });
    return true;
  }

  private async upgradeWorker(request: http.IncomingMessage, socket: Duplex, head: Buffer, profile: string): Promise<void> {
    let authority: WorkerTransportAuthority | null = null;
    let current = false;
    try {
      authority = await this.options.authenticateWorker(request);
      current = authority === true || !!authority && await authority.isCurrent();
    } catch {}
    if (!authority || !current || socket.destroyed) {
      this.counters.workerRejected += 1;
      if (!socket.destroyed) rejectUpgrade(socket, 403, "Forbidden");
      return;
    }
    try {
      this.wss.handleUpgrade(request, socket, head, (ws) => {
        ws.pause();
        void (async () => {
          if (!await admitWorkerSocket(authority, ws)) { ws.terminate(); return; }
          this.counters.workerAccepted += 1;
          this.acceptWorker(profile, ws, authority);
          ws.resume();
        })().catch(() => ws.terminate());
      });
    } catch { socket.destroy(); }
  }

  stats(): Record<string, unknown> {
    return {
      ...this.counters,
      workerProfiles: this.workers.size,
      appProfiles: this.apps.size,
      appPlaybackStatus: Object.fromEntries(this.appPlaybackStatus),
      profiles: [...new Set([
        ...this.workers.keys(),
        ...this.apps.keys(),
      ])].sort(),
    };
  }

  appProfiles(): string[] {
    return [...this.apps.keys()];
  }

  appSubscribers(profile?: string): number {
    if (profile) return this.apps.has(profile) ? 1 : 0;
    return this.apps.size;
  }

  workerConnected(profile: string): boolean {
    return this.workers.get(profile)?.readyState === WebSocket.OPEN;
  }

  workerLastChunkAgeMs(profile: string, now = Date.now()): number | null {
    const at = this.workerLastChunkAt.get(profile);
    if (!at) return null;
    return Math.max(0, now - at);
  }

  close(): void {
    for (const ws of this.workers.values()) {
      try { ws.close(1001, "server shutdown"); } catch {}
    }
    for (const ws of this.apps.values()) {
      try { ws.close(1001, "server shutdown"); } catch {}
    }
    this.workers.clear();
    this.apps.clear();
    this.workerLastChunkAt.clear();
    this.appCredits.clear();
    this.appPlaybackStatus.clear();
    this.appPcmBatches.clear();
    for (const state of this.opusDecoders.values()) {
      try { state.decoder.delete(); } catch {}
    }
    this.opusDecoders.clear();
    this.wss.close();
  }

  private acceptWorker(profile: string, ws: WebSocket, authority: WorkerTransportAuthority = true): void {
    const existing = this.workers.get(profile);
    if (existing && existing !== ws) {
      try { existing.close(1012, "replaced"); } catch {}
    }
    this.workers.set(profile, ws);
    this.options.onWorkerPresence?.(profile, true);

    ws.on("message", async (data, isBinary) => {
      if (this.workers.get(profile) !== ws || !await workerSocketCurrent(authority, ws) || this.workers.get(profile) !== ws) return;
      if (!isBinary) return;
      const inbound = normalizeBuffer(data);
      let appPacket = inbound;
      let chunk = parseAudioWsPacket(inbound);

      if (!chunk) {
        const opus = parseOpusWorkerAudioPacket(inbound);
        if (!opus) {
          try { ws.close(1003, "invalid audio packet"); } catch {}
          return;
        }

        try {
          const decoder = this.getOpusDecoder(
            profile,
            opus.sampleRate,
            opus.channels,
          );
          const pcm = decoder.decode(opus.buffer);
          if (pcm.length !== opus.frames * opus.channels * 2) {
            this.counters.opusDecodeErrors += 1;
            return;
          }
          appPacket = encodeAudioWsPacket({
            buffer: pcm,
            sequence: opus.sequence,
            sampleRate: opus.sampleRate,
            channels: opus.channels,
            frames: opus.frames,
            capturedAt: opus.capturedAt,
          });
          chunk = parseAudioWsPacket(appPacket);
          if (!chunk) {
            this.counters.opusDecodeErrors += 1;
            return;
          }
          this.counters.opusWorkerChunks += 1;
          this.counters.opusWorkerBytes += opus.bytes;
          this.counters.decodedPcmBytes += pcm.length;
        } catch {
          this.counters.opusDecodeErrors += 1;
          return;
        }
      }

      this.counters.chunksAccepted += 1;
      this.counters.lastProfile = profile;
      this.counters.lastSequence = chunk.sequence;
      this.counters.lastBytes = chunk.bytes;
      this.counters.lastAt = new Date().toISOString();
      this.workerLastChunkAt.set(profile, Date.now());
      this.options.onChunk?.(profile, chunk);

      const app = this.apps.get(profile);
      if (!app || app.readyState !== WebSocket.OPEN) {
        this.counters.chunksDroppedNoViewer += 1;
        this.appPcmBatches.delete(profile);
        return;
      }

      this.queueAppPcmChunk(profile, app, chunk);
    });

    ws.on("close", (code, reason) => {
      this.counters.workerCloses += 1;
      this.counters.lastWorkerCloseCode = Number(code) || 0;
      this.counters.lastWorkerCloseReason =
        reason?.toString("utf8").slice(0, 160) ?? "";
      if (this.workers.get(profile) === ws) {
        this.workers.delete(profile);
        this.workerLastChunkAt.delete(profile);
        this.appPcmBatches.delete(profile);
        const opus = this.opusDecoders.get(profile);
        if (opus) {
          try { opus.decoder.delete(); } catch {}
          this.opusDecoders.delete(profile);
        }
        this.options.onWorkerPresence?.(profile, false);
      }
    });

    ws.on("error", () => {});
  }

  private queueAppPcmChunk(
    profile: string,
    app: WebSocket,
    chunk: AudioWsChunk,
  ): void {
    const targetFrames = Math.max(
      1,
      Math.round(chunk.sampleRate * 0.1),
    );
    let batch = this.appPcmBatches.get(profile);

    if (
      !batch ||
      batch.sampleRate !== chunk.sampleRate ||
      batch.channels !== chunk.channels
    ) {
      const appSequence = batch?.appSequence ?? 0;
      batch = {
        sampleRate: chunk.sampleRate,
        channels: chunk.channels,
        frames: 0,
        capturedAt: chunk.capturedAt,
        buffers: [],
        appSequence,
      };
      this.appPcmBatches.set(profile, batch);
    }

    if (batch.frames === 0) {
      batch.capturedAt = chunk.capturedAt;
    }
    batch.buffers.push(Buffer.from(
      chunk.packet.subarray(HEADER_BYTES),
    ));
    batch.frames += chunk.frames;

    if (batch.frames < targetFrames) return;

    const pcm = Buffer.concat(batch.buffers);
    batch.appSequence += 1;
    const packet = encodeAudioWsPacket({
      buffer: pcm,
      sequence: batch.appSequence,
      sampleRate: batch.sampleRate,
      channels: batch.channels,
      frames: batch.frames,
      capturedAt: batch.capturedAt,
    });
    batch.frames = 0;
    batch.buffers = [];

    if ((this.appCredits.get(app) ?? 0) <= 0) {
      this.counters.chunksDroppedBackpressure += 1;
      return;
    }
    if (app.bufferedAmount > 256_000) {
      this.counters.chunksDroppedBackpressure += 1;
      return;
    }

    this.appCredits.set(
      app,
      Math.max(0, (this.appCredits.get(app) ?? 0) - 1),
    );
    app.send(packet, { binary: true }, (error) => {
      if (!error) this.counters.chunksSent += 1;
    });
  }

  private getOpusDecoder(
    profile: string,
    sampleRate: number,
    channels: number,
  ): OpusScript {
    const current = this.opusDecoders.get(profile);
    if (
      current &&
      current.sampleRate === sampleRate &&
      current.channels === channels
    ) {
      return current.decoder;
    }
    if (current) {
      try { current.decoder.delete(); } catch {}
      this.opusDecoders.delete(profile);
    }
    const decoder = new OpusScript(
      sampleRate as 8000 | 12000 | 16000 | 24000 | 48000,
      channels,
      OpusScript.Application.AUDIO,
    );
    this.opusDecoders.set(profile, {
      sampleRate,
      channels,
      decoder,
    });
    return decoder;
  }

  private acceptApp(profile: string, ws: WebSocket): void {
    const existing = this.apps.get(profile);
    if (existing && existing !== ws) {
      try { existing.close(1012, "newer audio viewer"); } catch {}
    }

    const hadViewer = this.apps.has(profile);
    this.apps.set(profile, ws);
    this.appCredits.set(ws, MAX_APP_CREDITS);
    if (!hadViewer) this.options.onAppPresence?.(profile, true);

    ws.on("message", (data, isBinary) => {
      if (isBinary) return;
      const text = normalizeBuffer(data).toString("utf8");
      if (text.length > 4_000) return;
      try {
        const message = JSON.parse(text);
        if (
          message &&
          typeof message === "object" &&
          message.type === "audio_ready"
        ) {
          const current = this.appCredits.get(ws) ?? 0;
          this.appCredits.set(ws, Math.min(MAX_APP_CREDITS, current + 1));
          return;
        }

        if (
          message &&
          typeof message === "object" &&
          message.type === "audio_status"
        ) {
          const contextState =
            typeof message.contextState === "string"
              ? message.contextState.slice(0, 40)
              : "";
          const packetsReceived = Number(message.packetsReceived);
          const scheduledAheadMs = Number(message.scheduledAheadMs);
          const pcmRms = Number(message.pcmRms);
          const gain = Number(message.gain);
          const liveRenderedCapturedAt = Number(message.liveRenderedCapturedAt);
          const liveFrameAgeMs = Number(message.liveFrameAgeMs);
          const audioCapturedAt = Number(message.audioCapturedAt);
          const syncErrorMs = Number(message.syncErrorMs);
          if (
            Number.isFinite(packetsReceived) &&
            packetsReceived >= 0 &&
            Number.isFinite(scheduledAheadMs) &&
            scheduledAheadMs >= -10_000 &&
            scheduledAheadMs <= 60_000 &&
            Number.isFinite(pcmRms) &&
            pcmRms >= 0 &&
            pcmRms <= 1 &&
            Number.isFinite(gain) &&
            gain >= 0 &&
            gain <= 4
          ) {
            this.counters.appStatusReports += 1;
            this.appPlaybackStatus.set(profile, {
              at: new Date().toISOString(),
              enabled: message.enabled === true,
              contextState,
              packetsReceived: Math.floor(packetsReceived),
              scheduledAheadMs: Math.round(scheduledAheadMs),
              pcmRms: Math.round(pcmRms * 1_000_000) / 1_000_000,
              gain: Math.round(gain * 1_000) / 1_000,
              presentationClock: message.presentationClock === true,
              liveRenderedCapturedAt:
                Number.isSafeInteger(liveRenderedCapturedAt) &&
                liveRenderedCapturedAt > 0
                  ? liveRenderedCapturedAt
                  : 0,
              liveFrameAgeMs:
                Number.isFinite(liveFrameAgeMs)
                  ? Math.round(liveFrameAgeMs)
                  : -1,
              audioCapturedAt:
                Number.isSafeInteger(audioCapturedAt) && audioCapturedAt > 0
                  ? audioCapturedAt
                  : 0,
              syncErrorMs:
                Number.isFinite(syncErrorMs)
                  ? Math.max(-5000, Math.min(5000, Math.round(syncErrorMs)))
                  : 0,
            });
          }
        }
      } catch {}
    });

    ws.on("close", (code, reason) => {
      this.counters.appCloses += 1;
      this.counters.lastAppCloseCode = Number(code) || 0;
      this.counters.lastAppCloseReason =
        reason?.toString("utf8").slice(0, 160) ?? "";
      this.appCredits.delete(ws);
      if (this.apps.get(profile) === ws) {
        this.apps.delete(profile);
        this.appPcmBatches.delete(profile);
        this.appPlaybackStatus.delete(profile);
        this.options.onAppPresence?.(profile, false);
      }
    });

    ws.on("error", () => {});
  }
}

function normalizeBuffer(data: unknown): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (Array.isArray(data)) {
    return Buffer.concat(
      data.map((item) =>
        Buffer.isBuffer(item) ? item : Buffer.from(item as ArrayBuffer),
      ),
    );
  }
  return Buffer.from(data as ArrayBuffer);
}

function normalizeProfile(value: string): string {
  const trimmed = value.trim();
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(trimmed)) return "";
  return trimmed;
}

function rejectUpgrade(
  socket: Duplex,
  status: number,
  reason: string,
): void {
  try {
    socket.write(
      "HTTP/1.1 " + status + " " + reason + "\r\n" +
      "Connection: close\r\n" +
      "Content-Length: 0\r\n\r\n",
    );
  } catch {}
  try { socket.destroy(); } catch {}
}
