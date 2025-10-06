import dotenv from "dotenv";
dotenv.config();
const nodeEnv = process.env.NODE_ENV ?? "development";
const isDevelopment = nodeEnv !== "production";
export const spotifyConfig = {
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    redirectUri: process.env.SPOTIFY_REDIRECT_URI,
};
export const geminiConfig = {
    apiKey: process.env.GEMINI_API_KEY,
    defaultModel: process.env.GEMINI_DEFAULT_MODEL ?? "gemini-1.5-flash",
};
export const appConfig = {
    nodeEnv,
    isDevelopment,
    port: Number(process.env.PORT ?? 3000),
};
export function assertEnv(value, name) {
    if (!value) {
        throw new Error(`${name} environment variable is not set.`);
    }
    return value;
}
