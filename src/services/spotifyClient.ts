import SpotifyWebApi from "spotify-web-api-node";
import { spotifyConfig } from "../config/env";

export const spotifyApi = new SpotifyWebApi({
  clientId: spotifyConfig.clientId,
  clientSecret: spotifyConfig.clientSecret,
  redirectUri: spotifyConfig.redirectUri,
});
