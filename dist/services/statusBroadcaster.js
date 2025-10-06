import { randomUUID } from "crypto";
class StatusBroadcaster {
    constructor() {
        this.clients = new Set();
    }
    handleConnection(req, res) {
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
    createContext(operation) {
        return {
            requestId: randomUUID(),
            operation,
        };
    }
    hasSubscribers() {
        return this.clients.size > 0;
    }
    likedStart(context, payload = {}) {
        this.send("liked-start", context, payload);
    }
    likedSong(context, payload = {}) {
        this.send("liked-song", context, payload);
    }
    likedComplete(context, payload = {}) {
        this.send("liked-complete", context, payload);
    }
    geminiStart(context, payload = {}) {
        this.send("gemini-start", context, payload);
    }
    geminiSong(context, payload = {}) {
        this.send("gemini-song", context, payload);
    }
    geminiComplete(context, payload = {}) {
        this.send("gemini-complete", context, payload);
    }
    genreStart(context, payload = {}) {
        this.send("genre-start", context, payload);
    }
    genreProgress(context, payload = {}) {
        this.send("genre-progress", context, payload);
    }
    genreComplete(context, payload = {}) {
        this.send("genre-complete", context, payload);
    }
    statusMessage(context, payload = {}) {
        this.send("status-message", context, payload);
    }
    statusError(context, payload = {}) {
        this.send("status-error", context, payload);
    }
    send(event, context, payload = {}) {
        if (!this.clients.size)
            return;
        const enriched = { ...payload };
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
    ensureHeartbeat() {
        if (this.clients.size > 0) {
            if (!this.heartbeatTimer) {
                this.heartbeatTimer = setInterval(() => this.ping(), 25000);
            }
        }
        else if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = undefined;
        }
    }
    ping() {
        if (!this.clients.size)
            return;
        const frame = "event: ping\ndata: {}\n\n";
        for (const client of this.clients) {
            client.write(frame);
        }
    }
}
const statusBroadcaster = new StatusBroadcaster();
export default statusBroadcaster;
