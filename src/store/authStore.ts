import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';
import type { EntityRatingSupportLevel } from '../api/subsonic';
import { usePlayerStore } from './playerStore';

export interface ServerProfile {
  id: string;
  name: string;
  url: string;
  username: string;
  password: string;
}

interface AuthState {
  // Multi-server
  servers: ServerProfile[];
  activeServerId: string | null;

  // Last.fm (global)
  lastfmApiKey: string;
  lastfmApiSecret: string;
  lastfmSessionKey: string;
  lastfmUsername: string;

  // Settings (global)
  scrobblingEnabled: boolean;
  maxCacheMb: number;
  downloadFolder: string;
  offlineDownloadDir: string;
  excludeAudiobooks: boolean;
  customGenreBlacklist: string[];
  replayGainEnabled: boolean;
  replayGainMode: 'track' | 'album';
  crossfadeEnabled: boolean;
  crossfadeSecs: number;
  gaplessEnabled: boolean;
  preloadMode: 'balanced' | 'early' | 'custom';
  preloadCustomSeconds: number;
  infiniteQueueEnabled: boolean;
  showArtistImages: boolean;
  showTrayIcon: boolean;
  minimizeToTray: boolean;
  discordRichPresence: boolean;
  enableAppleMusicCoversDiscord: boolean;
  useCustomTitlebar: boolean;
  nowPlayingEnabled: boolean;
  lyricsServerFirst: boolean;
  showFullscreenLyrics: boolean;
  showChangelogOnUpdate: boolean;
  lastSeenChangelogVersion: string;

  /** Alpha: native hi-res sample rate output (disabled = safe 44.1 kHz mode) */
  enableHiRes: boolean;

  /** Alpha: ephemeral queue prefetch cache on disk */
  hotCacheEnabled: boolean;
  hotCacheMaxMb: number;
  hotCacheDebounceSec: number;
  /** Parent directory; actual cache is `<dir>/psysonic-hot-cache/`. Empty = app data. */
  hotCacheDownloadDir: string;

  /** After this many manual skips of the same track, set track rating to 1 if still unrated (below 1 star). */
  skipStarOnManualSkipsEnabled: boolean;
  /** Manual skips per track before applying rating 1 (when enabled). */
  skipStarManualSkipThreshold: number;

  /** Planned / active filter: random mixes (and later album flows) by min stars per axis. */
  mixMinRatingFilterEnabled: boolean;
  /** 0 = off; 1–3 = require at least that many stars on the song (UI capped at 3). */
  mixMinRatingSong: number;
  /** 0–3; uses `albumUserRating` on song payload when present (OpenSubsonic). */
  mixMinRatingAlbum: number;
  mixMinRatingArtist: number;

  /** Subsonic music folders for the active server (not persisted; refetched on login / server change). */
  musicFolders: Array<{ id: string; name: string }>;
  /**
   * Per server: `all` = no musicFolderId param; otherwise a single folder id.
   * Only one library or all — no multi-folder merge.
   */
  musicLibraryFilterByServer: Record<string, 'all' | string>;
  /** Bumps when `setMusicLibraryFilter` runs so pages refetch catalog data. */
  musicLibraryFilterVersion: number;

  /**
   * Per server: whether `setRating` is assumed to work for album/artist ids (OpenSubsonic-style).
   * Absent key = not probed yet (`unknown` in UI).
   */
  entityRatingSupportByServer: Record<string, EntityRatingSupportLevel>;
  setEntityRatingSupport: (serverId: string, level: EntityRatingSupportLevel) => void;

  // Status
  isLoggedIn: boolean;
  isConnecting: boolean;
  connectionError: string | null;
  lastfmSessionError: boolean;

  // Actions
  addServer: (profile: Omit<ServerProfile, 'id'>) => string;
  updateServer: (id: string, data: Partial<Omit<ServerProfile, 'id'>>) => void;
  removeServer: (id: string) => void;
  setActiveServer: (id: string) => void;
  setLoggedIn: (v: boolean) => void;
  setConnecting: (v: boolean) => void;
  setConnectionError: (e: string | null) => void;
  setLastfm: (apiKey: string, apiSecret: string, sessionKey: string, username: string) => void;
  connectLastfm: (sessionKey: string, username: string) => void;
  disconnectLastfm: () => void;
  setLastfmSessionError: (v: boolean) => void;
  setScrobblingEnabled: (v: boolean) => void;
  setMaxCacheMb: (v: number) => void;
  setDownloadFolder: (v: string) => void;
  setOfflineDownloadDir: (v: string) => void;
  setExcludeAudiobooks: (v: boolean) => void;
  setCustomGenreBlacklist: (v: string[]) => void;
  setReplayGainEnabled: (v: boolean) => void;
  setReplayGainMode: (v: 'track' | 'album') => void;
  setCrossfadeEnabled: (v: boolean) => void;
  setCrossfadeSecs: (v: number) => void;
  setGaplessEnabled: (v: boolean) => void;
  setPreloadMode: (v: 'balanced' | 'early' | 'custom') => void;
  setPreloadCustomSeconds: (v: number) => void;
  setInfiniteQueueEnabled: (v: boolean) => void;
  setShowArtistImages: (v: boolean) => void;
  setShowTrayIcon: (v: boolean) => void;
  setMinimizeToTray: (v: boolean) => void;
  setDiscordRichPresence: (v: boolean) => void;
  setEnableAppleMusicCoversDiscord: (v: boolean) => void;
  setUseCustomTitlebar: (v: boolean) => void;
  setNowPlayingEnabled: (v: boolean) => void;
  setLyricsServerFirst: (v: boolean) => void;
  setShowFullscreenLyrics: (v: boolean) => void;
  setShowChangelogOnUpdate: (v: boolean) => void;
  setLastSeenChangelogVersion: (v: string) => void;
  setEnableHiRes: (v: boolean) => void;
  setHotCacheEnabled: (v: boolean) => void;
  setHotCacheMaxMb: (v: number) => void;
  setHotCacheDebounceSec: (v: number) => void;
  setHotCacheDownloadDir: (v: string) => void;
  setSkipStarOnManualSkipsEnabled: (v: boolean) => void;
  setSkipStarManualSkipThreshold: (v: number) => void;
  setMixMinRatingFilterEnabled: (v: boolean) => void;
  setMixMinRatingSong: (v: number) => void;
  setMixMinRatingAlbum: (v: number) => void;
  setMixMinRatingArtist: (v: number) => void;
  setMusicFolders: (folders: Array<{ id: string; name: string }>) => void;
  setMusicLibraryFilter: (folderId: 'all' | string) => void;
  logout: () => void;

  // Derived
  getBaseUrl: () => string;
  getActiveServer: () => ServerProfile | undefined;
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

/** Upper bound for mix min-rating thresholds (UI shows five stars, only 1…this many are selectable). */
export const MIX_MIN_RATING_FILTER_MAX_STARS = 3;

function clampMixFilterMinStars(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(MIX_MIN_RATING_FILTER_MAX_STARS, Math.round(v)));
}

function clampSkipStarThreshold(v: number): number {
  if (!Number.isFinite(v)) return 3;
  return Math.max(1, Math.min(99, Math.round(v)));
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      servers: [],
      activeServerId: null,
      lastfmApiKey: '',
      lastfmApiSecret: '',
      lastfmSessionKey: '',
      lastfmUsername: '',
      scrobblingEnabled: true,
      maxCacheMb: 500,
      downloadFolder: '',
      offlineDownloadDir: '',
      excludeAudiobooks: false,
      customGenreBlacklist: [],
      replayGainEnabled: false,
      replayGainMode: 'track',
      crossfadeEnabled: false,
      crossfadeSecs: 3,
      gaplessEnabled: false,
      preloadMode: 'balanced',
      preloadCustomSeconds: 30,
      infiniteQueueEnabled: false,
      showArtistImages: false,
      showTrayIcon: true,
      minimizeToTray: false,
      discordRichPresence: false,
      enableAppleMusicCoversDiscord: false,
      useCustomTitlebar: true,
      nowPlayingEnabled: false,
      lyricsServerFirst: true,
      showFullscreenLyrics: true,
      showChangelogOnUpdate: true,
      lastSeenChangelogVersion: '',
      enableHiRes: false,
      hotCacheEnabled: false,
      hotCacheMaxMb: 256,
      hotCacheDebounceSec: 30,
      hotCacheDownloadDir: '',
      skipStarOnManualSkipsEnabled: false,
      skipStarManualSkipThreshold: 3,
      mixMinRatingFilterEnabled: false,
      mixMinRatingSong: 0,
      mixMinRatingAlbum: 0,
      mixMinRatingArtist: 0,
      musicFolders: [],
      musicLibraryFilterByServer: {},
      musicLibraryFilterVersion: 0,
      entityRatingSupportByServer: {},
      isLoggedIn: false,
      isConnecting: false,
      connectionError: null,
      lastfmSessionError: false,

      addServer: (profile) => {
        const id = generateId();
        set(s => ({ servers: [...s.servers, { ...profile, id }] }));
        return id;
      },

      updateServer: (id, data) => {
        set(s => ({
          servers: s.servers.map(srv => srv.id === id ? { ...srv, ...data } : srv),
        }));
      },

      removeServer: (id) => {
        set(s => {
          const newServers = s.servers.filter(srv => srv.id !== id);
          const switchedAway = s.activeServerId === id;
          const { [id]: _r, ...entityRatingRest } = s.entityRatingSupportByServer;
          return {
            servers: newServers,
            activeServerId: switchedAway ? (newServers[0]?.id ?? null) : s.activeServerId,
            isLoggedIn: switchedAway ? false : s.isLoggedIn,
            entityRatingSupportByServer: entityRatingRest,
          };
        });
      },

      setActiveServer: (id) => set({ activeServerId: id, musicFolders: [] }),

      setLoggedIn: (v) => set({ isLoggedIn: v }),
      setConnecting: (v) => set({ isConnecting: v }),
      setConnectionError: (e) => set({ connectionError: e }),

      setLastfm: (apiKey, apiSecret, sessionKey, username) =>
        set({ lastfmApiKey: apiKey, lastfmApiSecret: apiSecret, lastfmSessionKey: sessionKey, lastfmUsername: username }),

      connectLastfm: (sessionKey, username) =>
        set({ lastfmSessionKey: sessionKey, lastfmUsername: username }),

      disconnectLastfm: () =>
        set({ lastfmSessionKey: '', lastfmUsername: '', lastfmSessionError: false }),

      setLastfmSessionError: (v) => set({ lastfmSessionError: v }),

      setScrobblingEnabled: (v) => set({ scrobblingEnabled: v }),
      setMaxCacheMb: (v) => set({ maxCacheMb: v }),
      setDownloadFolder: (v) => set({ downloadFolder: v }),
      setOfflineDownloadDir: (v) => set({ offlineDownloadDir: v }),
      setExcludeAudiobooks: (v) => set({ excludeAudiobooks: v }),
      setCustomGenreBlacklist: (v) => set({ customGenreBlacklist: v }),
      setReplayGainEnabled: (v) => {
        set({ replayGainEnabled: v });
        usePlayerStore.getState().updateReplayGainForCurrentTrack();
      },
      setReplayGainMode: (v) => {
        set({ replayGainMode: v });
        usePlayerStore.getState().updateReplayGainForCurrentTrack();
      },
      setCrossfadeEnabled: (v) => set({ crossfadeEnabled: v }),
      setCrossfadeSecs: (v) => set({ crossfadeSecs: v }),
      setGaplessEnabled: (v) => set({ gaplessEnabled: v }),
      setPreloadMode: (v: 'balanced' | 'early' | 'custom') => set({ preloadMode: v }),
      setPreloadCustomSeconds: (v: number) => set({ preloadCustomSeconds: v }),
      setInfiniteQueueEnabled: (v) => set({ infiniteQueueEnabled: v }),
      setShowArtistImages: (v) => set({ showArtistImages: v }),
      setShowTrayIcon: (v) => set({ showTrayIcon: v }),
      setMinimizeToTray: (v) => set({ minimizeToTray: v }),
      setDiscordRichPresence: (v) => set({ discordRichPresence: v }),
      setEnableAppleMusicCoversDiscord: (v) => set({ enableAppleMusicCoversDiscord: v }),
      setUseCustomTitlebar: (v) => set({ useCustomTitlebar: v }),
      setNowPlayingEnabled: (v) => set({ nowPlayingEnabled: v }),
      setLyricsServerFirst: (v: boolean) => set({ lyricsServerFirst: v }),
      setShowFullscreenLyrics: (v: boolean) => set({ showFullscreenLyrics: v }),
      setShowChangelogOnUpdate: (v) => set({ showChangelogOnUpdate: v }),
      setLastSeenChangelogVersion: (v) => set({ lastSeenChangelogVersion: v }),

      setEnableHiRes: (v) => set({ enableHiRes: v }),
      setHotCacheEnabled: (v) => set({ hotCacheEnabled: v }),
      setHotCacheMaxMb: (v) => set({ hotCacheMaxMb: v }),
      setHotCacheDebounceSec: (v) => set({ hotCacheDebounceSec: v }),
      setHotCacheDownloadDir: (v) => set({ hotCacheDownloadDir: v }),

      setSkipStarOnManualSkipsEnabled: (v) => set({ skipStarOnManualSkipsEnabled: v }),
      setSkipStarManualSkipThreshold: (v) => set({ skipStarManualSkipThreshold: clampSkipStarThreshold(v) }),
      setMixMinRatingFilterEnabled: (v) => set({ mixMinRatingFilterEnabled: v }),
      setMixMinRatingSong: (v) => set({ mixMinRatingSong: clampMixFilterMinStars(v) }),
      setMixMinRatingAlbum: (v) => set({ mixMinRatingAlbum: clampMixFilterMinStars(v) }),
      setMixMinRatingArtist: (v) => set({ mixMinRatingArtist: clampMixFilterMinStars(v) }),

      setMusicFolders: (folders) => {
        const sid = get().activeServerId;
        set(s => {
          const f = sid ? s.musicLibraryFilterByServer[sid] : undefined;
          const invalidFilter = f && f !== 'all' && !folders.some(x => x.id === f);
          return {
            musicFolders: folders,
            ...(sid && invalidFilter
              ? { musicLibraryFilterByServer: { ...s.musicLibraryFilterByServer, [sid]: 'all' } }
              : {}),
          };
        });
      },

      setMusicLibraryFilter: (folderId) => {
        const sid = get().activeServerId;
        if (!sid) return;
        set(s => ({
          musicLibraryFilterByServer: { ...s.musicLibraryFilterByServer, [sid]: folderId },
          musicLibraryFilterVersion: s.musicLibraryFilterVersion + 1,
        }));
      },

      setEntityRatingSupport: (serverId, level) =>
        set(s => ({
          entityRatingSupportByServer: { ...s.entityRatingSupportByServer, [serverId]: level },
        })),

      logout: () => set({ isLoggedIn: false, musicFolders: [] }),

      getBaseUrl: () => {
        const s = get();
        const server = s.servers.find(srv => srv.id === s.activeServerId);
        if (!server?.url) return '';
        return server.url.startsWith('http') ? server.url : `http://${server.url}`;
      },

      getActiveServer: () => {
        const s = get();
        return s.servers.find(srv => srv.id === s.activeServerId);
      },
    }),
    {
      name: 'psysonic-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: state => {
        const { musicFolders: _mf, musicLibraryFilterVersion: _fv, ...rest } = state;
        return rest;
      },
      onRehydrateStorage: () => (state, error) => {
        if (error || !state) return;
        useAuthStore.setState({
          mixMinRatingSong: clampMixFilterMinStars(state.mixMinRatingSong as number),
          mixMinRatingAlbum: clampMixFilterMinStars(state.mixMinRatingAlbum as number),
          mixMinRatingArtist: clampMixFilterMinStars(state.mixMinRatingArtist as number),
        });
      },
    }
  )
);
