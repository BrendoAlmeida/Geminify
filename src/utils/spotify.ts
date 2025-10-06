const playlistPatterns = [
  /playlist\/([A-Za-z0-9]{16,})/i,
  /spotify:playlist:([A-Za-z0-9]{16,})/i,
];

export function extractSpotifyPlaylistId(reference?: string | null): string | null {
  if (!reference) {
    return null;
  }

  const value = reference.trim();
  if (!value) {
    return null;
  }

  for (const pattern of playlistPatterns) {
    const match = value.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  if (/^[A-Za-z0-9]{16,}$/i.test(value)) {
    return value;
  }

  return null;
}

export function normalizeForMatch(value: string | undefined | null): string {
  if (!value) {
    return "";
  }

  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function extractArtistTokens(artist: string | undefined | null): string[] {
  if (!artist) {
    return [];
  }

  const cleaned = artist
    .replace(/\(.*?\)/g, " ")
    .replace(/feat\.?|ft\.?|featuring|with|and|&|×|\//gi, ",")
    .replace(/\s+x\s+/gi, ",")
    .replace(/\s+e\s+/gi, ",");

  return cleaned
    .split(/[,;]+/)
    .map((part) => normalizeForMatch(part))
    .filter(Boolean);
}
