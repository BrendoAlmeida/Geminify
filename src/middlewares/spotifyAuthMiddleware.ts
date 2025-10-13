import { NextFunction, Request, Response } from "express";
import {
  MissingTokenError,
  refreshTokenIfNeeded,
  refreshUserToken,
  createUserSpotifyApi,
} from "../services/spotifyAuthService.js";
import { formatSpotifyError } from "../utils/errors.js";
import { log } from "../utils/logger.js";

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
        .json({ error: "Authentication required. Please log in at /auth/login." });
    }

    // Verificar se o token precisa ser renovado (5 minutos antes de expirar)
    const needsRefresh = req.session.user.expires_at 
      ? Date.now() > (req.session.user.expires_at - 300000)
      : true;

    if (needsRefresh && req.session.user.refresh_token) {
      try {
        log(`Proactively refreshing token for ${req.session.user.display_name}...`);
        const newTokens = await refreshUserToken(req.session.user.refresh_token);
        
        // Atualizar sessão com novos tokens
        req.session.user.access_token = newTokens.access_token;
        if (newTokens.refresh_token) {
          req.session.user.refresh_token = newTokens.refresh_token;
        }
        req.session.user.expires_at = Date.now() + (newTokens.expires_in * 1000);
        
        log(`✅ Token refreshed successfully for ${req.session.user.display_name}`);
      } catch (refreshError) {
        log(`⚠️ Failed to refresh token proactively: ${refreshError}`);
        // Continuar com token atual, será validado abaixo
      }
    }

    // Verificar se o token ainda é válido com uma chamada rápida
    try {
      const userApi = createUserSpotifyApi(
        req.session.user.access_token,
        req.session.user.refresh_token
      );
      await userApi.getMe(); // Testa se o token funciona
      next();
    } catch (tokenError) {
      // Token definitivamente inválido, tentar renovar uma última vez
      if (req.session.user.refresh_token) {
        try {
          log(`Token invalid for ${req.session.user.display_name}, attempting final refresh...`);
          const newTokens = await refreshUserToken(req.session.user.refresh_token);
          
          req.session.user.access_token = newTokens.access_token;
          if (newTokens.refresh_token) {
            req.session.user.refresh_token = newTokens.refresh_token;
          }
          req.session.user.expires_at = Date.now() + (newTokens.expires_in * 1000);
          
          log(`✅ Token recovered for ${req.session.user.display_name}`);
          next();
        } catch (refreshError) {
          // Falhou completamente, limpar sessão
          log(`❌ Failed to recover token for ${req.session.user.display_name}: ${refreshError}`);
          req.session.destroy(() => {});
          return res
            .status(401)
            .json({ error: "Session expired. Please log in again at /auth/login." });
        }
      } else {
        // Não tem refresh token, limpar sessão
        req.session.destroy(() => {});
        return res
          .status(401)
          .json({ error: "Authentication required. Please log in at /auth/login." });
      }
    }
  } catch (error) {
    if (error instanceof MissingTokenError) {
      return res
        .status(401)
        .json({ error: "Authentication required. Please log in at /auth/login." });
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
