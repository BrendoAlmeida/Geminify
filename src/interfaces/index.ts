export interface TokenData {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

export interface LikedSong {
  name: string;
  artist: string;
  id: string;
  artistId?: string;
  artistIds?: string[];
}

export interface Song {
  title: string;
  artist: string;
  country?: string;
}

export interface Playlist {
  name: string;
  description: string;
  songs: Song[];
}

export interface PlaylistPreview {
  id: string;
  name: string;
  description: string;
  embedUrl: string;
  spotifyUrl: string;
  songs: Song[];
}

export interface GenrePlaylist {
  key: string;
  genre: string;
  name: string;
  description: string;
  count: number;
  songs: Song[];
}

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface GeminiChatResponse {
  reply?: string;
  themeTags?: string[];
  tags?: string[];
  songExamples?: string[];
  songTags?: string[];
}

export interface ChatPlaylistContext {
  id: string;
  name: string;
  description?: string;
  songs: Song[];
}

export interface ChatSongSuggestion {
  id: string;
  title: string;
  artist: string;
  album?: string;
  previewUrl?: string | null;
  uri?: string | null;
  spotifyUrl?: string;
  imageUrl?: string;
}

export interface TrackSearchCandidate {
  uri: string;
  title: string;
  artist: string;
  album?: string;
  popularity?: number;
  previewUrl?: string | null;
  explicit?: boolean;
  durationMs?: number;
  releaseYear?: number;
}

export interface UnresolvedTrackSelection {
  index: number;
  requested: Song;
  searchQuery: string;
  candidates: TrackSearchCandidate[];
}

export interface TrackResolutionChoice {
  index: number;
  selectedUri?: string | null;
}

export interface GeminiTrackResolutionResponse {
  choices?: TrackResolutionChoice[];
}

export interface GenerateChatSuggestionResult {
  reply: string;
  themeTags: string[];
  songExamples: string[];
  songSuggestions: ChatSongSuggestion[];
}
