import { promises as fs } from "fs";
import { spotifyApi } from "./spotifyClient.js";
import { tokenPath } from "../config/paths.js";
import { TokenData } from "../interfaces/index.js";
import { log } from "../utils/logger.js";
import SpotifyWebApi from "spotify-web-api-node";

export class MissingTokenError extends Error {
  constructor(message = "Spotify authentication required.") {
    super(message);
    this.name = "MissingTokenError";
  }
}

export interface UserTokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

// Função para criar uma instância do Spotify API para um usuário específico
export function createUserSpotifyApi(accessToken: string, refreshToken?: string): SpotifyWebApi {
  const api = new SpotifyWebApi({
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    redirectUri: process.env.SPOTIFY_REDIRECT_URI
  });
  
  api.setAccessToken(accessToken);
  if (refreshToken) {
    api.setRefreshToken(refreshToken);
  }
  
  return api;
}

async function readToken(): Promise<TokenData> {
  try {
    const raw = await fs.readFile(tokenPath, "utf8");
    return JSON.parse(raw) as TokenData;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") {
      log("Token file not found. User must log in to Spotify.");
      throw new MissingTokenError();
    }

    log(`Failed to read token file: ${error}`);
    throw new Error("Failed to refresh token. Please log in again.");
  }
}

async function writeToken(data: TokenData): Promise<void> {
  await fs.writeFile(tokenPath, JSON.stringify(data));
}

export function getAuthorizeUrl(scopes: string[], state: string): string {
  return spotifyApi.createAuthorizeURL(scopes, state);
}

export async function exchangeCodeForTokens(code: string): Promise<TokenData & { user_data?: any }> {
  const data = await spotifyApi.authorizationCodeGrant(code);
  const { access_token, refresh_token, expires_in } = data.body;

  // Obter dados do usuário
  spotifyApi.setAccessToken(access_token);
  const userData = await spotifyApi.getMe();

  const payload: TokenData = {
    access_token,
    refresh_token,
    expires_at: Date.now() + expires_in * 1000,
  };

  // Manter compatibilidade com sistema antigo (salvar no arquivo)
  await writeToken(payload);
  spotifyApi.setRefreshToken(refresh_token);

  return {
    ...payload,
    user_data: userData.body
  };
}

// Nova função para renovar token de usuário específico
export async function refreshUserToken(refreshToken: string): Promise<UserTokens> {
  const tempApi = new SpotifyWebApi({
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    redirectUri: process.env.SPOTIFY_REDIRECT_URI
  });
  
  tempApi.setRefreshToken(refreshToken);
  
  try {
    const data = await tempApi.refreshAccessToken();
    return {
      access_token: data.body.access_token,
      refresh_token: data.body.refresh_token,
      expires_in: data.body.expires_in
    };
  } catch (error) {
    log(`Failed to refresh user token: ${error}`);
    throw new Error("Failed to refresh token. Please log in again.");
  }
}

export async function refreshTokenIfNeeded(): Promise<void> {
  const tokenData = await readToken();

  try {
    if (Date.now() > tokenData.expires_at - 300000) {
      log("Access token expired or expiring soon, refreshing");
      spotifyApi.setRefreshToken(tokenData.refresh_token);
      const data = await spotifyApi.refreshAccessToken();
      const { access_token, expires_in } = data.body;

      const payload: TokenData = {
        access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: Date.now() + expires_in * 1000,
      };

      await writeToken(payload);
      spotifyApi.setAccessToken(access_token);
      log("Access token refreshed and saved");
    } else {
      log("Access token still valid");
      spotifyApi.setAccessToken(tokenData.access_token);
    }
  } catch (error) {
    log(`Failed to refresh token: ${error}`);
    throw new Error("Failed to refresh token. Please log in again.");
  }
}

export async function clearTokenFile(): Promise<void> {
  await fs.unlink(tokenPath).catch(() => undefined);
}
