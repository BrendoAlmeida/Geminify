import { NextFunction, Request, Response } from "express";
import {
  MissingTokenError,
  refreshTokenIfNeeded,
} from "../services/spotifyAuthService";
import { formatSpotifyError } from "../utils/errors";
import { log } from "../utils/logger";

export async function ensureSpotifyAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    await refreshTokenIfNeeded();
    next();
  } catch (error) {
    if (error instanceof MissingTokenError) {
      return res
        .status(401)
        .json({ error: "Authentication required. Please log in at /login." });
    }

    log(`Token refresh failed for ${req.path}: ${error}`);
    const message = formatSpotifyError(error);
    res.status(401).json({ error: message });
  }
}
