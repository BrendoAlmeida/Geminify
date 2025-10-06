import { promises as fs } from "fs";
import { spotifyApi } from "./spotifyClient";
import { tokenPath } from "../config/paths";
import { TokenData } from "../interfaces";
import { log } from "../utils/logger";

export class MissingTokenError extends Error {
  constructor(message = "Spotify authentication required.") {
    super(message);
    this.name = "MissingTokenError";
  }
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

export async function exchangeCodeForTokens(code: string): Promise<TokenData> {
  const data = await spotifyApi.authorizationCodeGrant(code);
  const { access_token, refresh_token, expires_in } = data.body;

  const payload: TokenData = {
    access_token,
    refresh_token,
    expires_at: Date.now() + expires_in * 1000,
  };

  await writeToken(payload);
  spotifyApi.setAccessToken(access_token);
  spotifyApi.setRefreshToken(refresh_token);
  return payload;
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
