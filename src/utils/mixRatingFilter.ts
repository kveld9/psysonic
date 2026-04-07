import type { SubsonicSong } from '../api/subsonic';

export interface MixMinRatingsConfig {
  enabled: boolean;
  minSong: number;
  minAlbum: number;
  minArtist: number;
}

/**
 * Random (and future album) flows: drop songs that are below per-axis thresholds when enabled.
 * Song axis uses `userRating` (missing = 0). Album/artist use optional OpenSubsonic-style
 * fields on the song payload; if a threshold is positive but the value is absent, the song is kept.
 */
export function passesMixMinRatings(song: SubsonicSong, c: MixMinRatingsConfig): boolean {
  if (!c.enabled) return true;
  if (c.minSong > 0 && (song.userRating ?? 0) < c.minSong) return false;
  if (c.minAlbum > 0) {
    const r = song.albumUserRating;
    if (r !== undefined && r < c.minAlbum) return false;
  }
  if (c.minArtist > 0) {
    const r = song.artistUserRating;
    if (r !== undefined && r < c.minArtist) return false;
  }
  return true;
}
