import { NextFunction, Request, Response } from "express";
import { log } from "../utils/logger";

export function errorHandler(
  error: any,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  log(`Unhandled error: ${error instanceof Error ? error.stack ?? error.message : error}`);
  if (res.headersSent) {
    return;
  }

  res.status(500).json({ error: "Internal server error" });
}
