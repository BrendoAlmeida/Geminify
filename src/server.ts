import { createApp } from "./app";
import { appConfig, assertEnv, geminiConfig, spotifyConfig } from "./config/env";
import { log } from "./utils/logger";

function ensureEnvironment() {
	assertEnv(spotifyConfig.clientId, "SPOTIFY_CLIENT_ID");
	assertEnv(spotifyConfig.clientSecret, "SPOTIFY_CLIENT_SECRET");
	assertEnv(spotifyConfig.redirectUri, "SPOTIFY_REDIRECT_URI");
	assertEnv(geminiConfig.apiKey, "GEMINI_API_KEY");
}

ensureEnvironment();

const app = createApp();
const { port } = appConfig;

app.listen(port, () => {
	log(`Server listening on port ${port}`);
});
