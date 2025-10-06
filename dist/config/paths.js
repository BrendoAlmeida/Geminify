import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..", "..");
export const rootDir = projectRoot;
export const publicDir = path.join(projectRoot, "public");
export const savedPlaylistsPath = path.join(projectRoot, "saved_playlists.json");
export const tokenPath = path.join(projectRoot, "token.json");
