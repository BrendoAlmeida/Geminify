import { log } from "../utils/logger.js";
export function errorHandler(error, _req, res, _next) {
    log(`Unhandled error: ${error instanceof Error ? error.stack ?? error.message : error}`);
    if (res.headersSent) {
        return;
    }
    res.status(500).json({ error: "Internal server error" });
}
