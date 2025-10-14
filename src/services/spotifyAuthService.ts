import { spotifyApi } from "./spotifyClient.js";
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

export function getAuthorizeUrl(scopes: string[], state: string): string {
  return spotifyApi.createAuthorizeURL(scopes, state);
}

export async function exchangeCodeForTokens(code: string): Promise<TokenData & { user_data?: any }> {
  log(`Exchanging code with Spotify. ClientId exists: ${!!process.env.SPOTIFY_CLIENT_ID}, ClientSecret exists: ${!!process.env.SPOTIFY_CLIENT_SECRET}, RedirectUri: ${process.env.SPOTIFY_REDIRECT_URI}`);
  
  try {
    // Tentar com fetch manualmente para obter erro mais detalhado
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    const redirectUri = process.env.SPOTIFY_REDIRECT_URI;
    
    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error('Missing Spotify credentials');
    }
    
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    
    log(`Making manual token exchange request...`);
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri,
      }).toString(),
    });
    
    const responseText = await response.text();
    log(`Spotify response status: ${response.status}`);
    log(`Spotify response body: ${responseText}`);
    
    if (!response.ok) {
      throw new Error(`Spotify token exchange failed: ${response.status} - ${responseText}`);
    }
    
    const tokenData = JSON.parse(responseText);
    const { access_token, refresh_token, expires_in } = tokenData;

    // Obter dados do usuário também com fetch manual
    log(`Fetching user data with access token...`);
    const userResponse = await fetch('https://api.spotify.com/v1/me', {
      headers: {
        'Authorization': `Bearer ${access_token}`,
      },
    });
    
    const userResponseText = await userResponse.text();
    log(`User data response status: ${userResponse.status}`);
    log(`User data response body: ${userResponseText.substring(0, 200)}...`);
    
    if (!userResponse.ok) {
      throw new Error(`Failed to fetch user data: ${userResponse.status} - ${userResponseText}`);
    }
    
    const userData = JSON.parse(userResponseText);

    const payload: TokenData = {
      access_token,
      refresh_token,
      expires_at: Date.now() + expires_in * 1000,
    };

    return {
      ...payload,
      user_data: userData
    };
  } catch (error) {
    // Re-lançar o erro para ser capturado pelo controller
    const err = error as any;
    
    // Log completo do erro
    log(`Token exchange failed - Full error details:`);
    log(`  - Name: ${err.name}`);
    log(`  - Message: ${err.message}`);
    log(`  - Status: ${err.statusCode || err.status || 'unknown'}`);
    log(`  - Body: ${JSON.stringify(err.body || {})}`);
    log(`  - Response: ${JSON.stringify(err.response?.body || {})}`);
    
    // Tentar extrair mais informações
    if (err.response) {
      log(`  - Response text: ${err.response.text}`);
      log(`  - Response error: ${JSON.stringify(err.response.error || {})}`);
    }
    
    throw error;
  }
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
      refresh_token: data.body.refresh_token || refreshToken, // Fallback para o antigo se não vier novo
      expires_in: data.body.expires_in
    };
  } catch (error) {
    log(`Failed to refresh user token: ${error}`);
    throw new Error("Failed to refresh token. Please log in again.");
  }
}
