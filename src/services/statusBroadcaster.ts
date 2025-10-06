import { Request, Response } from "express";
import { randomUUID } from "crypto";

export interface StatusContext {
  requestId: string;
  operation: string;
}

type EventPayload = Record<string, unknown>;

class StatusBroadcaster {
  private clients = new Set<Response>();

  private heartbeatTimer?: NodeJS.Timeout;

  handleConnection(req: Request, res: Response) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    res.flushHeaders?.();

    if (typeof req.socket.setKeepAlive === "function") {
      req.socket.setKeepAlive(true);
    }

    this.clients.add(res);
    this.ensureHeartbeat();

    res.write("event: connected\ndata: {}\n\n");

    req.on("close", () => {
      this.clients.delete(res);
      this.ensureHeartbeat();
    });
  }

  createContext(operation: string): StatusContext {
    return {
      requestId: randomUUID(),
      operation,
    };
  }

  hasSubscribers(): boolean {
    return this.clients.size > 0;
  }

  likedStart(context: StatusContext, payload: EventPayload = {}) {
    this.send("liked-start", context, payload);
  }

  likedSong(context: StatusContext, payload: EventPayload = {}) {
    this.send("liked-song", context, payload);
  }

  likedComplete(context: StatusContext, payload: EventPayload = {}) {
    this.send("liked-complete", context, payload);
  }

  geminiStart(context: StatusContext, payload: EventPayload = {}) {
    this.send("gemini-start", context, payload);
  }

  geminiSong(context: StatusContext, payload: EventPayload = {}) {
    this.send("gemini-song", context, payload);
  }

  geminiComplete(context: StatusContext, payload: EventPayload = {}) {
    this.send("gemini-complete", context, payload);
  }

  genreStart(context: StatusContext, payload: EventPayload = {}) {
    this.send("genre-start", context, payload);
  }

  genreProgress(context: StatusContext, payload: EventPayload = {}) {
    this.send("genre-progress", context, payload);
  }

  genreComplete(context: StatusContext, payload: EventPayload = {}) {
    this.send("genre-complete", context, payload);
  }

  statusMessage(context: StatusContext, payload: EventPayload = {}) {
    this.send("status-message", context, payload);
  }

  statusError(context: StatusContext, payload: EventPayload = {}) {
    this.send("status-error", context, payload);
  }

  send(event: string, context?: StatusContext, payload: EventPayload = {}) {
    if (!this.clients.size) return;

    const enriched: EventPayload = { ...payload };

    if (context) {
      if (!("requestId" in enriched)) {
        enriched.requestId = context.requestId;
      }
      if (!("operation" in enriched)) {
        enriched.operation = context.operation;
      }
    }

    const frame = `event: ${event}\ndata: ${JSON.stringify(enriched)}\n\n`;
    for (const client of this.clients) {
      client.write(frame);
    }
  }

  private ensureHeartbeat() {
    if (this.clients.size > 0) {
      if (!this.heartbeatTimer) {
        this.heartbeatTimer = setInterval(() => this.ping(), 25000);
      }
    } else if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  private ping() {
    if (!this.clients.size) return;
    const frame = "event: ping\ndata: {}\n\n";
    for (const client of this.clients) {
      client.write(frame);
    }
  }
}

const statusBroadcaster = new StatusBroadcaster();

export default statusBroadcaster;
