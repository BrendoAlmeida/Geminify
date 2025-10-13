import { NextFunction, Request, Response } from "express";
import {
  MissingTokenError,
  refreshTokenIfNeeded,
  refreshUserToken,
} from "../services/spotifyAuthService";
import { formatSpotifyError } from "../utils/errors";
import { log } from "../utils/logger";

// Estender o tipo Request para incluir user na sessão
declare module "express-session" {
  interface SessionData {
    user?: {
      id: string;
      email?: string;
      display_name?: string;
      access_token: string;
      refresh_token: string;
      expires_at?: number;
    };
  }
}

export async function ensureSpotifyAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    // Verificar se existe usuário na sessão
    if (!req.session.user) {
      return res
        .status(401)
        .json({ error: "Authentication required. Please log in at /login." });
    }

    // Verificar se o token ainda é válido (se temos expires_at)
    if (req.session.user.expires_at && Date.now() >= req.session.user.expires_at) {
      try {
        // Tentar renovar o token
        const newTokens = await refreshUserToken(req.session.user.refresh_token);
        req.session.user.access_token = newTokens.access_token;
        if (newTokens.refresh_token) {
          req.session.user.refresh_token = newTokens.refresh_token;
        }
        req.session.user.expires_at = Date.now() + (newTokens.expires_in * 1000);
      } catch (refreshError) {
        // Se falhar ao renovar, remover usuário da sessão
        req.session.user = undefined;
        return res
          .status(401)
          .json({ error: "Token expired and refresh failed. Please log in again." });
      }
    }

    next();
  } catch (error) {
    if (error instanceof MissingTokenError) {
      return res
        .status(401)
        .json({ error: "Authentication required. Please log in at /login." });
    }

    log(`Token validation failed for ${req.path}: ${error}`);
    const message = formatSpotifyError(error);
    res.status(401).json({ error: message });
  }
}

// Middleware para verificar apenas se o usuário está logado (sem validar token)
export function requireLogin(req: Request, res: Response, next: NextFunction) {
  if (!req.session.user) {
    return res
      .status(401)
      .json({ error: "Login required" });
  }
  next();
}
