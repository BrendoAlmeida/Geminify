declare module "spotify-preview-finder" {
  interface SpotifyPreviewFinderTrack {
    name?: string;
    spotifyUrl?: string;
    previewUrls?: string[];
    trackId?: string;
    albumName?: string;
    releaseDate?: string;
    popularity?: number;
    durationMs?: number;
  }

  interface SpotifyPreviewFinderResult {
    success: boolean;
    searchQuery?: string;
    error?: string;
    results: SpotifyPreviewFinderTrack[];
  }

  function spotifyPreviewFinder(
    songName: string,
    artistOrLimit?: string | number,
    limit?: number
  ): Promise<SpotifyPreviewFinderResult>;

  export default spotifyPreviewFinder;
  export type { SpotifyPreviewFinderTrack, SpotifyPreviewFinderResult };
}
