import dotenv from "dotenv";

dotenv.config();

const nodeEnv = process.env.NODE_ENV ?? "development";
const isDevelopment = nodeEnv !== "production";

export interface SpotifyConfig {
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
}

export interface GeminiConfig {
  apiKey?: string;
  defaultModel: string;
}

export const spotifyConfig: SpotifyConfig = {
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  redirectUri: process.env.SPOTIFY_REDIRECT_URI,
};

export const geminiConfig: GeminiConfig = {
  apiKey: process.env.GEMINI_API_KEY,
  defaultModel: process.env.GEMINI_DEFAULT_MODEL ?? "gemini-1.5-flash",
};

export const appConfig = {
  nodeEnv,
  isDevelopment,
  port: Number(process.env.PORT ?? 3000),
  sessionSecret: process.env.SESSION_SECRET,
};

export function assertEnv(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`${name} environment variable is not set.`);
  }
  return value;
}
