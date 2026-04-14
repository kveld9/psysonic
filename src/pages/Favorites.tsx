import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTracklistColumns, type ColDef } from '../utils/useTracklistColumns';
import AlbumRow from '../components/AlbumRow';
import ArtistRow from '../components/ArtistRow';
import CachedImage from '../components/CachedImage';
import {
  getStarred, getInternetRadioStations, setRating,
  SubsonicAlbum, SubsonicArtist, SubsonicSong, InternetRadioStation,
  buildCoverArtUrl, coverArtCacheKey,
} from '../api/subsonic';
import { usePlayerStore, songToTrack } from '../store/playerStore';
import StarRating from '../components/StarRating';
import { Cast, ChevronDown, ChevronLeft, ChevronRight, Check, Heart, ListPlus, Play, Star, X, SlidersHorizontal, MoreHorizontal, Shuffle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { unstar } from '../api/subsonic';
import { useDragDrop } from '../contexts/DragDropContext';
import { useAuthStore } from '../store/authStore';
import { useSelectionStore } from '../store/selectionStore';
import { useThemeStore } from '../store/themeStore';
import { AddToPlaylistSubmenu } from '../components/ContextMenu';
import GenreFilterBar from '../components/GenreFilterBar';

const CURRENT_YEAR = new Date().getFullYear();

const FAV_COLUMNS: readonly ColDef[] = [
  { key: 'num',      i18nKey: null,            minWidth: 60,  defaultWidth: 60,  required: true  },
  { key: 'title',    i18nKey: 'trackTitle',    minWidth: 150, defaultWidth: 0,   required: true,  flex: true },
  { key: 'artist',   i18nKey: 'trackArtist',   minWidth: 80,  defaultWidth: 180, required: false },
  { key: 'album',    i18nKey: 'trackAlbum',    minWidth: 80,  defaultWidth: 180, required: false },
  { key: 'rating',   i18nKey: 'trackRating',   minWidth: 80,  defaultWidth: 120, required: false },
  { key: 'duration', i18nKey: 'trackDuration', minWidth: 72,  defaultWidth: 92,  required: false },
  { key: 'format',   i18nKey: 'trackFormat',   minWidth: 60,  defaultWidth: 90,  required: false },
  { key: 'remove',   i18nKey: null,            minWidth: 36,  defaultWidth: 36,  required: true  },
];

const FAV_CENTERED = new Set(['rating', 'duration']);

export default function Favorites() {
  const { t } = useTranslation();
  const [albums, setAlbums] = useState<SubsonicAlbum[]>([]);
  const [artists, setArtists] = useState<SubsonicArtist[]>([]);
  const [songs, setSongs] = useState<SubsonicSong[]>([]);
  const [radioStations, setRadioStations] = useState<InternetRadioStation[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Column picker portal dropdown state ────────────────────────────────────
  const [pickerPos, setPickerPos] = useState<{ top: number; right: number } | null>(null);
  const pickerBtnRef = useRef<HTMLButtonElement>(null);
  const pickerMenuRef = useRef<HTMLDivElement>(null);

  // ── Column resize/visibility (must be before early return) ───────────────
  const {
    colVisible, visibleCols, gridStyle,
    startResize, toggleColumn,
    pickerOpen, setPickerOpen, pickerRef, tracklistRef,
  } = useTracklistColumns(FAV_COLUMNS, 'psysonic_favorites_columns', pickerMenuRef);

  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [showPlPicker, setShowPlPicker] = useState(false);
  const [sortKey, setSortKey] = useState<'natural' | 'title' | 'artist' | 'album' | 'favorite' | 'rating' | 'duration' | 'format'>('natural');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [sortClickCount, setSortClickCount] = useState(0);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedArtist, setSelectedArtist] = useState<string | null>(null);
  const [showAllArtists, setShowAllArtists] = useState(false);
  
  // ── Advanced filters ─────────────────────────────────────────────────────
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [yearRange, setYearRange] = useState<[number, number]>([1950, CURRENT_YEAR]);

  const selectedCount = useSelectionStore(s => s.selectedIds.size);
  const selectedIds = useSelectionStore(s => s.selectedIds);
  const inSelectMode = selectedCount > 0;
  const lastSelectedIdxRef = useRef<number | null>(null);

  const playTrack = usePlayerStore(s => s.playTrack);
  const enqueue = usePlayerStore(s => s.enqueue);
  const playRadio = usePlayerStore(s => s.playRadio);
  const stop = usePlayerStore(s => s.stop);
  const currentTrack = usePlayerStore(s => s.currentTrack);
  const currentRadio = usePlayerStore(s => s.currentRadio);
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const starredOverrides = usePlayerStore(s => s.starredOverrides);
  const setStarredOverride = usePlayerStore(s => s.setStarredOverride);
  const userRatingOverrides = usePlayerStore(s => s.userRatingOverrides);
  const psyDrag = useDragDrop();
  const { showBitrate } = useThemeStore();

  const handleRate = (songId: string, rating: number) => {
    setRatings(r => ({ ...r, [songId]: rating }));
    usePlayerStore.getState().setUserRatingOverride(songId, rating);
    setRating(songId, rating).catch(() => {});
  };

  function removeSong(id: string) {
    unstar(id, 'song').catch(() => {});
    setStarredOverride(id, false);
    setSongs(prev => prev.filter(s => s.id !== id));
  }

  function unfavoriteStation(id: string) {
    setRadioStations(prev => prev.filter(s => s.id !== id));
    try {
      const next = new Set<string>(JSON.parse(localStorage.getItem('psysonic_radio_favorites') ?? '[]'));
      next.delete(id);
      localStorage.setItem('psysonic_radio_favorites', JSON.stringify([...next]));
    } catch { /* ignore */ }
  }

  const openContextMenu = usePlayerStore(s => s.openContextMenu);
  const navigate = useNavigate();
  const musicLibraryFilterVersion = useAuthStore(s => s.musicLibraryFilterVersion);

  // Clear selection when song list changes
  useEffect(() => {
    useSelectionStore.getState().clearAll();
    lastSelectedIdxRef.current = null;
  }, [songs]);

  // Clear selection on click outside tracklist
  useEffect(() => {
    if (!inSelectMode) return;
    const handler = (e: MouseEvent) => {
      if (tracklistRef.current && !tracklistRef.current.contains(e.target as Node)) {
        useSelectionStore.getState().clearAll();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [inSelectMode]);

  const toggleSelect = useCallback((id: string, idx: number, shift: boolean) => {
    useSelectionStore.getState().setSelectedIds(prev => {
      const next = new Set(prev);
      if (shift && lastSelectedIdxRef.current !== null) {
        const from = Math.min(lastSelectedIdxRef.current, idx);
        const to = Math.max(lastSelectedIdxRef.current, idx);
        // we need visibleSongs here — read from latest closure via ref trick
        // Instead, just toggle range based on idx into songs array
        for (let j = from; j <= to; j++) {
          const sid = songs[j]?.id;
          if (sid) next.add(sid);
        }
      } else {
        if (next.has(id)) { next.delete(id); }
        else { next.add(id); lastSelectedIdxRef.current = idx; }
      }
      return next;
    });
  }, [songs]);

  // Click-outside handler for column picker portal dropdown
  useEffect(() => {
    if (!pickerOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        pickerBtnRef.current?.contains(target) ||
        pickerRef.current?.contains(target) ||
        pickerMenuRef.current?.contains(target)
      ) {
        return;
      }
      setPickerOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [pickerOpen, setPickerOpen]);

  // Update picker position on resize/scroll while open
  useEffect(() => {
    if (!pickerOpen) return;
    const updatePos = () => {
      if (pickerBtnRef.current) {
        const rect = pickerBtnRef.current.getBoundingClientRect();
        setPickerPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
      }
    };
    window.addEventListener('resize', updatePos);
    window.addEventListener('scroll', updatePos, true);
    return () => {
      window.removeEventListener('resize', updatePos);
      window.removeEventListener('scroll', updatePos, true);
    };
  }, [pickerOpen]);

  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);

      // Timeout wrapper to prevent hanging if API never responds
      const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T | 'timeout'> => {
        return Promise.race([
          promise,
          new Promise<'timeout'>((resolve) =>
            setTimeout(() => resolve('timeout'), ms)
        )
        ]);
      };

      try {
        const [starredResult] = await Promise.allSettled([
          withTimeout(getStarred(), 30000),
        ]);
        if (starredResult.status === 'fulfilled' && starredResult.value !== 'timeout') {
          setAlbums(starredResult.value.albums);
          setArtists(starredResult.value.artists);
          setSongs(starredResult.value.songs);
        }

        // Radio favorites: read IDs from localStorage, fetch all stations, filter
        try {
          const favIds = new Set<string>(JSON.parse(localStorage.getItem('psysonic_radio_favorites') ?? '[]'));
          if (favIds.size > 0) {
            const all = await withTimeout(getInternetRadioStations(), 30000);
            if (all !== 'timeout') {
              setRadioStations(all.filter(s => favIds.has(s.id)));
            }
          }
        } catch { /* ignore */ }
      } finally {
        setLoading(false);
      }
    };
    loadAll();
  }, [musicLibraryFilterVersion]);

  // ── Derived state (must be before any conditional returns to preserve hook order) ──
  const visibleSongs = useMemo(() => {
    let result = songs.filter(s => starredOverrides[s.id] !== false);
    if (selectedGenres.length > 0) {
      result = result.filter(s => s.genre && selectedGenres.includes(s.genre));
    }
    // Year range filter
    if (yearRange[0] > 1950 || yearRange[1] < CURRENT_YEAR) {
      result = result.filter(s => {
        if (!s.year) return false;
        return s.year >= yearRange[0] && s.year <= yearRange[1];
      });
    }
    // Artist filter from stats selection
    if (selectedArtist) {
      result = result.filter(s => s.artistId === selectedArtist || s.artist === selectedArtist);
    }
    if (sortKey !== 'natural') {
      result = [...result].sort((a, b) => {
        let av: string | number;
        let bv: string | number;
        const effectiveRating = (s: SubsonicSong) => ratings[s.id] ?? userRatingOverrides[s.id] ?? s.userRating ?? 0;
        const effectiveStarred = (s: SubsonicSong) => (s.id in starredOverrides ? starredOverrides[s.id] : true) ? 1 : 0;
        switch (sortKey) {
          case 'title': av = a.title; bv = b.title; break;
          case 'artist': av = a.artist ?? ''; bv = b.artist ?? ''; break;
          case 'album': av = a.album ?? ''; bv = b.album ?? ''; break;
          case 'rating': av = effectiveRating(a); bv = effectiveRating(b); break;
          case 'duration': av = a.duration ?? 0; bv = b.duration ?? 0; break;
          case 'format': av = a.suffix ?? ''; bv = b.suffix ?? ''; break;
          default: av = a.title; bv = b.title;
        }
        if (typeof av === 'number' && typeof bv === 'number') {
          return sortDir === 'asc' ? av - bv : bv - av;
        }
        return sortDir === 'asc' ? (av as string).localeCompare(bv as string) : (bv as string).localeCompare(av as string);
      });
    }
    return result;
  }, [songs, sortKey, sortDir, ratings, userRatingOverrides, starredOverrides, yearRange, selectedGenres, selectedArtist]);

  // ── Filtered albums by year ────────────────────────────────────────────────
  const visibleAlbums = useMemo(() => {
    if (yearRange[0] === 1950 && yearRange[1] === CURRENT_YEAR) return albums;
    return albums.filter(a => {
      if (!a.year) return false;
      return a.year >= yearRange[0] && a.year <= yearRange[1];
    });
  }, [albums, yearRange]);

  // ── Stats: artist song counts ──────────────────────────────────────────────
  const artistStats = useMemo(() => {
    const counts = new Map<string, { artist: SubsonicArtist; count: number }>();
    visibleSongs.forEach(song => {
      const artistId = song.artistId || song.artist || 'unknown';
      const existing = counts.get(artistId);
      if (existing) {
        existing.count++;
      } else {
        const artistObj = artists.find(a => a.id === artistId) || { id: artistId, name: song.artist || 'Unknown', albumCount: 0, coverArt: undefined };
        counts.set(artistId, { artist: artistObj, count: 1 });
      }
    });
    return Array.from(counts.values()).sort((a, b) => b.count - a.count);
  }, [visibleSongs, artists]);

  const activeYearFilter = yearRange[0] > 1950 || yearRange[1] < CURRENT_YEAR;
  const clearYearFilter = () => setYearRange([1950, CURRENT_YEAR]);

  const hasAnyFavorites = albums.length > 0 || artists.length > 0 || songs.length > 0 || radioStations.length > 0;
  const hasActiveFilters = selectedGenres.length > 0 || activeYearFilter;
  const hasVisibleContent = artistStats.length > 0 || artists.length > 0 || visibleAlbums.length > 0 || radioStations.length > 0 || visibleSongs.length > 0;

  // ── Early return for loading state (after all hooks) ──
  if (loading) {
    return (
      <div className="content-body" style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="content-body animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '3rem' }}>
      <div style={{ marginBottom: '-1.5rem' }}>
        <h1 className="page-title">{t('favorites.title')}</h1>
      </div>

      {!hasAnyFavorites ? (
        <div className="empty-state">{t('favorites.empty')}</div>
      ) : (
        <>
          {/* ── Stats Section ───────────────────────────────────────────────── */}
          {artistStats.length > 0 && (
            <section style={{ marginBottom: '1.5rem', marginLeft: 0, paddingLeft: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
                  {/* Left fade overlay */}
                  <div
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: '30px',
                      background: 'linear-gradient(to right, var(--bg-app) 0%, transparent 100%)',
                      pointerEvents: 'none',
                      zIndex: 2,
                    }}
                  />
                  {/* Right fade overlay */}
                  <div
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: 0,
                      bottom: 0,
                      width: '30px',
                      background: 'linear-gradient(to left, var(--bg-app) 0%, transparent 100%)',
                      pointerEvents: 'none',
                      zIndex: 2,
                    }}
                  />
                  <div
                    style={{
                      display: 'flex',
                      gap: '0.5rem',
                      alignItems: 'center',
                      overflowX: 'auto',
                      scrollbarWidth: 'none',
                      msOverflowStyle: 'none',
                      padding: '0.25rem 30px',
                    }}
                  >
                  <style>{`
                    .artist-pills-scroll::-webkit-scrollbar {
                      display: none;
                    }
                  `}</style>
                  {artistStats.slice(0, 10).map(({ artist, count }) => {
                    const isSelected = selectedArtist === artist.id || selectedArtist === artist.name;
                    return (
                      <div
                        key={artist.id}
                        className="artist-pills-scroll"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          padding: '0.35rem 0.6rem 0.35rem 0.8rem',
                          background: isSelected ? 'var(--accent)' : 'var(--bg-card)',
                          borderRadius: '9999px',
                          fontSize: '0.9rem',
                          cursor: artist.id !== 'unknown' ? 'pointer' : 'default',
                          border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border-subtle)'}`,
                          transition: 'all 0.15s ease',
                          maxWidth: '200px',
                          flexShrink: 0,
                        }}
                        onClick={() => {
                          if (artist.id !== 'unknown') {
                            setSelectedArtist(isSelected ? null : artist.id);
                          }
                        }}
                        onMouseEnter={(e) => {
                          if (artist.id !== 'unknown' && !isSelected) {
                            e.currentTarget.style.background = 'var(--bg-hover)';
                            e.currentTarget.style.borderColor = 'var(--border)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.background = 'var(--bg-card)';
                            e.currentTarget.style.borderColor = 'var(--border-subtle)';
                          }
                        }}
                      >
                        <span
                          style={{
                            fontWeight: 500,
                            color: isSelected ? '#000' : 'var(--text-primary)',
                            maxWidth: '140px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={artist.name}
                        >
                          {artist.name}
                        </span>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            minWidth: '1.25rem',
                            height: '1.25rem',
                            padding: '0 0.4rem',
                            background: isSelected ? 'rgba(0,0,0,0.3)' : 'var(--accent)',
                            color: isSelected ? '#fff' : '#000',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            borderRadius: '9999px',
                          }}
                        >
                          {count}
                        </span>
                      </div>
                    );
                  })}
                  {selectedArtist && (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setSelectedArtist(null)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '28px',
                        height: '28px',
                        padding: 0,
                        borderRadius: '50%',
                        color: 'var(--text-muted)',
                        opacity: 0.7,
                        transition: 'all 0.15s ease',
                        flexShrink: 0,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = 'var(--danger)';
                        e.currentTarget.style.opacity = '1';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = 'var(--text-muted)';
                        e.currentTarget.style.opacity = '0.7';
                      }}
                      title="Clear filter"
                    >
                      <X size={14} />
                    </button>
                  )}
                  </div>
                </div>
                {artistStats.length > 10 && (
                  <button
                    className="btn btn-surface btn-sm"
                    onClick={() => setShowAllArtists(true)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '36px',
                      height: '36px',
                      padding: 0,
                      borderRadius: '50%',
                      flexShrink: 0,
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-primary)',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--bg-hover)';
                      e.currentTarget.style.borderColor = 'var(--accent)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'var(--bg-card)';
                      e.currentTarget.style.borderColor = 'var(--border)';
                    }}
                    title={`${artistStats.length - 10} more artists`}
                  >
                    <MoreHorizontal size={20} />
                  </button>
                )}
              </div>
            </section>
          )}

          {/* ── All Artists Modal ─────────────────────────────────────────────── */}
          {showAllArtists && createPortal(
            <div
              style={{
                position: 'fixed',
                inset: 0,
                width: '100vw',
                height: '100vh',
                background: 'rgba(0, 0, 0, 0.7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000,
              }}
              onClick={() => setShowAllArtists(false)}
            >
              <div
                style={{
                  background: 'var(--bg-app)',
                  borderRadius: '12px',
                  padding: '1.5rem',
                  maxWidth: '600px',
                  width: '90vw',
                  maxHeight: '80vh',
                  overflow: 'auto',
                  border: '1px solid var(--border)',
                  margin: 'auto',
                }}
                onClick={e => e.stopPropagation()}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                  <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>{t('favorites.allArtists')}</h3>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setShowAllArtists(false)}
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <X size={18} />
                  </button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {artistStats.map(({ artist, count }) => {
                    const isSelected = selectedArtist === artist.id || selectedArtist === artist.name;
                    return (
                      <div
                        key={artist.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          padding: '0.35rem 0.6rem 0.35rem 0.8rem',
                          background: isSelected ? 'var(--accent)' : 'var(--bg-card)',
                          borderRadius: '9999px',
                          fontSize: '0.9rem',
                          cursor: artist.id !== 'unknown' ? 'pointer' : 'default',
                          border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border-subtle)'}`,
                          transition: 'all 0.15s ease',
                        }}
                        onClick={() => {
                          if (artist.id !== 'unknown') {
                            setSelectedArtist(isSelected ? null : artist.id);
                            setShowAllArtists(false);
                          }
                        }}
                      >
                        <span
                          style={{
                            fontWeight: 500,
                            color: isSelected ? '#000' : 'var(--text-primary)',
                          }}
                        >
                          {artist.name}
                        </span>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            minWidth: '1.25rem',
                            height: '1.25rem',
                            padding: '0 0.4rem',
                            background: isSelected ? 'rgba(0,0,0,0.3)' : 'var(--accent)',
                            color: isSelected ? '#fff' : '#000',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            borderRadius: '9999px',
                          }}
                        >
                          {count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>,
            document.body
          )}

          {artists.length > 0 && (
            <ArtistRow title={t('favorites.artists')} artists={artists} />
          )}

          {visibleAlbums.length > 0 && (
            <AlbumRow title={t('favorites.albums')} albums={visibleAlbums} />
          )}

          {radioStations.length > 0 && (
            <RadioStationRow
              title={t('favorites.stations')}
              stations={radioStations}
              currentRadio={currentRadio}
              isPlaying={isPlaying}
              onPlay={s => {
                if (currentRadio?.id === s.id && isPlaying) stop();
                else playRadio(s);
              }}
              onUnfavorite={unfavoriteStation}
            />
          )}

          {songs.length > 0 && (
            <section className="album-row-section">
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                <h2 className="section-title" style={{ margin: 0 }}>{t('favorites.songs')}</h2>
                <span style={{ fontSize: '0.8rem', color: '#888', fontStyle: 'italic' }}>
                  {t('favorites.showingCount', { filtered: visibleSongs.length, total: songs.length })}
                </span>
                {visibleSongs.length > 0 && (
                  <>
                    <button
                      className="btn-play-glass"
                      onClick={() => {
                        const tracks = visibleSongs.map(songToTrack);
                        playTrack(tracks[0], tracks);
                      }}
                    >
                      <span className="glass-base-glow" />
                      <Play size={15} fill="currentColor" />
                      {t('common.play', 'Reproducir')}
                    </button>
                    <button
                      className="btn btn-ghost"
                      onClick={() => {
                        const tracks = visibleSongs.map(songToTrack);
                        const shuffled = [...tracks];
                        for (let i = shuffled.length - 1; i > 0; i--) {
                          const j = Math.floor(Math.random() * (i + 1));
                          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
                        }
                        playTrack(shuffled[0], shuffled);
                      }}
                      data-tooltip={t('playlists.shuffle', 'Shuffle')}
                    >
                      <Shuffle size={15} />
                    </button>
                    <button
                      className="btn btn-ghost"
                      onClick={() => {
                        const tracks = visibleSongs.map(songToTrack);
                        enqueue(tracks);
                      }}
                      data-tooltip={t('favorites.enqueueAll')}
                    >
                      <ListPlus size={15} />
                    </button>
                  </>
                )}
                <GenreFilterBar selected={selectedGenres} onSelectionChange={setSelectedGenres} />
                <button
                  className={`btn btn-surface${advancedOpen ? ' btn-sort-active' : ''}`}
                  onClick={() => setAdvancedOpen(o => !o)}
                  style={activeYearFilter ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : {}}
                >
                  <SlidersHorizontal size={15} />
                  {t('favorites.advanced')}
                  {activeYearFilter && <span style={{ marginLeft: 4, fontSize: 11, opacity: 0.8 }}>•</span>}
                  <ChevronDown size={14} style={{ transform: advancedOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', marginLeft: 4 }} />
                </button>
              </div>

              {/* ─── Advanced Filters Panel ──────────────────────────────────────────── */}
              {advancedOpen && (
                <div style={{ marginBottom: '1rem', padding: '1rem', background: 'var(--surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {/* Year Range Slider */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>{t('favorites.yearRange')}</span>
                        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{yearRange[0]} – {yearRange[1]}</span>
                      </div>
                      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                        <input
                          type="range"
                          min={1950}
                          max={CURRENT_YEAR}
                          value={yearRange[0]}
                          onChange={e => {
                            const val = parseInt(e.target.value);
                            setYearRange(prev => [Math.min(val, prev[1] - 1), prev[1]]);
                          }}
                          style={{ flex: 1 }}
                        />
                        <input
                          type="range"
                          min={1950}
                          max={CURRENT_YEAR}
                          value={yearRange[1]}
                          onChange={e => {
                            const val = parseInt(e.target.value);
                            setYearRange(prev => [prev[0], Math.max(val, prev[0] + 1)]);
                          }}
                          style={{ flex: 1 }}
                        />
                      </div>
                    </div>

                    {/* Clear button */}
                    {activeYearFilter && (
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button className="btn btn-ghost btn-sm" onClick={clearYearFilter}>
                          <X size={14} />
                          {t('favorites.clearYear')}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {visibleSongs.length > 0 && (
                <div className="tracklist" style={{ padding: 0 }} ref={tracklistRef} onClick={e => {
                  if (inSelectMode && e.target === e.currentTarget) useSelectionStore.getState().clearAll();
                }}>

                {/* ── Bulk action bar ── */}
                {inSelectMode && (
                  <div className="bulk-action-bar">
                    <span className="bulk-action-count">
                      {t('common.bulkSelected', { count: selectedCount })}
                    </span>
                    <div className="bulk-pl-picker-wrap">
                      <button
                        className="btn btn-surface btn-sm"
                        onClick={() => setShowPlPicker(v => !v)}
                      >
                        <ListPlus size={14} />
                        {t('common.bulkAddToPlaylist')}
                      </button>
                      {showPlPicker && (
                        <AddToPlaylistSubmenu
                          songIds={[...useSelectionStore.getState().selectedIds]}
                          onDone={() => { setShowPlPicker(false); useSelectionStore.getState().clearAll(); }}
                          dropDown
                        />
                      )}
                    </div>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => useSelectionStore.getState().clearAll()}
                    >
                      <X size={13} />
                      {t('common.bulkClear')}
                    </button>
                  </div>
                )}

                <div style={{ position: 'relative' }}>
                  <div className="tracklist-header tracklist-va" style={gridStyle}>
                    {visibleCols.map((colDef, colIndex) => {
                      const key = colDef.key;
                      const isLastCol = colIndex === visibleCols.length - 1;
                      const isCentered = FAV_CENTERED.has(key);
                      const label = colDef.i18nKey ? t(`albumDetail.${colDef.i18nKey}`) : '';
                      const sortableCols = new Set(['title', 'artist', 'album', 'rating', 'duration']);
                      const canSort = sortableCols.has(key);
                      const isSortActive = canSort && sortKey === key;

                      const handleSortClick = () => {
                        if (!canSort) return;
                        if (sortKey === key) {
                          const nextCount = sortClickCount + 1;
                          if (nextCount >= 3) {
                            setSortKey('natural');
                            setSortDir('asc');
                            setSortClickCount(0);
                          } else {
                            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
                            setSortClickCount(nextCount);
                          }
                        } else {
                          setSortKey(key as typeof sortKey);
                          setSortDir('asc');
                          setSortClickCount(1);
                        }
                      };

                      const renderSortIndicator = () => {
                        if (!isSortActive) return null;
                        return (
                          <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.7 }}>
                            {sortDir === 'asc' ? '▲' : '▼'}
                          </span>
                        );
                      };

                      if (key === 'num') {
                        const allSelected = selectedCount === visibleSongs.length && visibleSongs.length > 0;
                        return (
                          <div key="num" className="track-num">
                            <span
                              className={`bulk-check${allSelected ? ' checked' : ''}${inSelectMode ? ' bulk-check-visible' : ''}`}
                              style={{ cursor: 'pointer' }}
                              onClick={e => {
                                e.stopPropagation();
                                if (allSelected) {
                                  useSelectionStore.getState().clearAll();
                                } else {
                                  useSelectionStore.getState().setSelectedIds(() => new Set(visibleSongs.map(s => s.id)));
                                }
                              }}
                            />
                            <span className="track-num-number">#</span>
                          </div>
                        );
                      }
                      if (key === 'title') {
                        const hasNextCol = colIndex + 1 < visibleCols.length;
                        return (
                          <div
                            key="title"
                            onClick={handleSortClick}
                            style={{
                              position: 'relative',
                              padding: 0,
                              margin: 0,
                              minWidth: 0,
                              overflow: 'hidden',
                              cursor: canSort ? 'pointer' : 'default',
                              userSelect: 'none',
                            }}
                            className={isSortActive ? 'tracklist-header-cell-active' : ''}
                          >
                            <div style={{ display: 'flex', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'flex-start', paddingLeft: 12 }}>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: isSortActive ? 600 : 400 }}>{label}</span>
                              {canSort && renderSortIndicator()}
                            </div>
                            {hasNextCol && <div className="col-resize-handle" onMouseDown={e => startResize(e, colIndex + 1, -1)} />}
                          </div>
                        );
                      }
                      if (key === 'remove') return <div key="remove" />;
                      return (
                        <div
                          key={key}
                          onClick={handleSortClick}
                          style={{
                            position: 'relative',
                            padding: 0,
                            margin: 0,
                            minWidth: 0,
                            overflow: 'hidden',
                            cursor: canSort ? 'pointer' : 'default',
                            userSelect: 'none',
                          }}
                          className={isSortActive ? 'tracklist-header-cell-active' : ''}
                        >
                          <div
                            style={{
                              display: 'flex',
                              width: '100%',
                              height: '100%',
                              alignItems: 'center',
                              justifyContent: isCentered ? 'center' : 'flex-start',
                              paddingLeft: isCentered ? 0 : 12,
                            }}
                          >
                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: isSortActive ? 600 : 400 }}>{label}</span>
                            {canSort && renderSortIndicator()}
                          </div>
                          {!isLastCol && <div className="col-resize-handle" onMouseDown={e => startResize(e, colIndex, 1)} />}
                        </div>
                      );
                    })}
                  </div>
                  <div className="tracklist-col-picker" ref={pickerRef}>
                    <button
                      ref={pickerBtnRef}
                      className="tracklist-col-picker-btn"
                      onClick={e => {
                        e.stopPropagation();
                        if (!pickerOpen && pickerBtnRef.current) {
                          const rect = pickerBtnRef.current.getBoundingClientRect();
                          setPickerPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
                        }
                        setPickerOpen(v => !v);
                      }}
                      data-tooltip={t('albumDetail.columns')}
                    >
                      <ChevronDown size={14} />
                    </button>
                    {pickerOpen && pickerPos && createPortal(
                      <div
                        ref={pickerMenuRef}
                        className="tracklist-col-picker-menu"
                        style={{ position: 'fixed', top: pickerPos.top, right: pickerPos.right, zIndex: 9999 }}
                      >
                        <div className="tracklist-col-picker-label">{t('albumDetail.columns')}</div>
                        {FAV_COLUMNS.filter(c => !c.required).map(c => {
                          const label = c.i18nKey ? t(`albumDetail.${c.i18nKey}`) : c.key;
                          const isOn = colVisible.has(c.key);
                          return (
                            <button key={c.key} className={`tracklist-col-picker-item${isOn ? ' active' : ''}`} onClick={() => toggleColumn(c.key)}>
                              <span className="tracklist-col-picker-check">{isOn && <Check size={13} />}</span>
                              {label}
                            </button>
                          );
                        })}
                      </div>,
                      document.body
                    )}
                  </div>
                </div>
                {visibleSongs.map((song, i) => {
                  const track = songToTrack(song);
                  const isSelected = selectedIds.has(song.id);
                  return (
                    <div
                      key={song.id}
                      className={`track-row track-row-va${currentTrack?.id === song.id ? ' active' : ''}${isSelected ? ' bulk-selected' : ''}`}
                      style={gridStyle}
                      onClick={e => {
                        if ((e.target as HTMLElement).closest('button, a, input')) return;
                        if (e.ctrlKey || e.metaKey) {
                          toggleSelect(song.id, i, false);
                        } else if (inSelectMode) {
                          toggleSelect(song.id, i, e.shiftKey);
                        } else {
                          playTrack(track, visibleSongs.map(songToTrack));
                        }
                      }}
                      onContextMenu={e => { e.preventDefault(); openContextMenu(e.clientX, e.clientY, track, 'song'); }}
                      role="row"
                      onMouseDown={e => {
                        if (e.button !== 0) return;
                        e.preventDefault();
                        const sx = e.clientX, sy = e.clientY;
                        const onMove = (me: MouseEvent) => {
                          if (Math.abs(me.clientX - sx) > 5 || Math.abs(me.clientY - sy) > 5) {
                            document.removeEventListener('mousemove', onMove);
                            document.removeEventListener('mouseup', onUp);
                            const { selectedIds: selIds } = useSelectionStore.getState();
                            if (selIds.has(song.id) && selIds.size > 1) {
                              const bulkTracks = visibleSongs.filter(s => selIds.has(s.id)).map(songToTrack);
                              psyDrag.startDrag({ data: JSON.stringify({ type: 'songs', tracks: bulkTracks }), label: `${bulkTracks.length} Songs` }, me.clientX, me.clientY);
                            } else {
                              psyDrag.startDrag({ data: JSON.stringify({ type: 'song', track }), label: song.title }, me.clientX, me.clientY);
                            }
                          }
                        };
                        const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
                        document.addEventListener('mousemove', onMove);
                        document.addEventListener('mouseup', onUp);
                      }}
                    >
                      {visibleCols.map(colDef => {
                        switch (colDef.key) {
                          case 'num': return (
                            <div key="num" className={`track-num${currentTrack?.id === song.id ? ' track-num-active' : ''}${currentTrack?.id === song.id && !isPlaying ? ' track-num-paused' : ''}`} style={{ cursor: 'pointer' }} onClick={e => { e.stopPropagation(); playTrack(track, visibleSongs.map(songToTrack)); }}>
                              <span className={`bulk-check${isSelected ? ' checked' : ''}${inSelectMode ? ' bulk-check-visible' : ''}`} onClick={e => { e.stopPropagation(); toggleSelect(song.id, i, e.shiftKey); }} />
                              {currentTrack?.id === song.id && isPlaying && <span className="track-num-eq"><div className="eq-bars"><span className="eq-bar" /><span className="eq-bar" /><span className="eq-bar" /></div></span>}
                              <span className="track-num-play"><Play size={13} fill="currentColor" /></span>
                              <span className="track-num-number">{i + 1}</span>
                            </div>
                          );
                          case 'title': return <div key="title" className="track-info"><span className="track-title">{song.title}</span></div>;
                          case 'artist': return (
                            <div key="artist" className="track-artist-cell">
                              <span className={`track-artist${song.artistId ? ' track-artist-link' : ''}`} style={{ cursor: song.artistId ? 'pointer' : 'default' }} onClick={e => { e.stopPropagation(); song.artistId && navigate(`/artist/${song.artistId}`); }}>{song.artist}</span>
                            </div>
                          );
                          case 'album': return (
                            <div key="album" className="track-album-cell">
                              <span className={`track-album${song.albumId ? ' track-album-link' : ''}`} style={{ cursor: song.albumId ? 'pointer' : 'default' }} onClick={e => { e.stopPropagation(); song.albumId && navigate(`/album/${song.albumId}`); }}>{song.album}</span>
                            </div>
                          );
                          case 'format': return (
                            <div key="format" className="track-format">
                              {(song.suffix || (showBitrate && song.bitRate)) ? (
                                <span className="track-codec">
                                  {song.suffix?.toUpperCase()}
                                  {song.suffix && showBitrate && song.bitRate ? ' • ' : ''}
                                  {showBitrate && song.bitRate ? `${song.bitRate} kbps` : ''}
                                </span>
                              ) : '-'}
                            </div>
                          );
                          case 'rating': return (
                            <StarRating
                              key="rating"
                              value={ratings[song.id] ?? userRatingOverrides[song.id] ?? song.userRating ?? 0}
                              onChange={r => handleRate(song.id, r)}
                            />
                          );
                          case 'duration': return (
                            <div key="duration" className="track-duration">
                              {Math.floor(song.duration / 60)}:{(song.duration % 60).toString().padStart(2, '0')}
                            </div>
                          );
                          case 'remove': return (
                            <div key="remove" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <button className="btn-icon fav-remove-btn" data-tooltip={t('favorites.removeSong')} onClick={e => { e.stopPropagation(); removeSong(song.id); }} aria-label={t('favorites.removeSong')}>
                                <X size={14} />
                              </button>
                            </div>
                          );
                          default: return null;
                        }
                      })}
                    </div>
                  );
                })}
              </div>
              )}

              {/* ── No results message when filters are active but no songs visible ─ */}
              {hasActiveFilters && visibleSongs.length === 0 && (
                <div className="empty-state" style={{ padding: '2rem 0' }}>
                  {t('favorites.noFilterResults')}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}

// ── Radio Station Row ─────────────────────────────────────────────────────────

interface RadioStationRowProps {
  title: string;
  stations: InternetRadioStation[];
  currentRadio: InternetRadioStation | null;
  isPlaying: boolean;
  onPlay: (s: InternetRadioStation) => void;
  onUnfavorite: (id: string) => void;
}

function RadioStationRow({ title, stations, currentRadio, isPlaying, onPlay, onUnfavorite }: RadioStationRowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeft, setShowLeft] = useState(false);
  const [showRight, setShowRight] = useState(true);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    setShowLeft(scrollLeft > 0);
    setShowRight(scrollLeft < scrollWidth - clientWidth - 5);
  };

  const scroll = (dir: 'left' | 'right') => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({ left: dir === 'left' ? -scrollRef.current.clientWidth * 0.75 : scrollRef.current.clientWidth * 0.75, behavior: 'smooth' });
  };

  return (
    <section className="album-row-section">
      <div className="album-row-header">
        <h2 className="section-title" style={{ marginBottom: 0 }}>{title}</h2>
        <div className="album-row-nav">
          <button className={`nav-btn${!showLeft ? ' disabled' : ''}`} onClick={() => scroll('left')} disabled={!showLeft}>
            <ChevronLeft size={20} />
          </button>
          <button className={`nav-btn${!showRight ? ' disabled' : ''}`} onClick={() => scroll('right')} disabled={!showRight}>
            <ChevronRight size={20} />
          </button>
        </div>
      </div>
      <div className="album-grid-wrapper">
        <div className="album-grid" ref={scrollRef} onScroll={handleScroll}>
          {stations.map(s => (
            <RadioFavCard
              key={s.id}
              station={s}
              isActive={currentRadio?.id === s.id}
              isPlaying={isPlaying}
              onPlay={() => onPlay(s)}
              onUnfavorite={() => onUnfavorite(s.id)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Radio Favorite Card ───────────────────────────────────────────────────────

interface RadioFavCardProps {
  station: InternetRadioStation;
  isActive: boolean;
  isPlaying: boolean;
  onPlay: () => void;
  onUnfavorite: () => void;
}

function RadioFavCard({ station: s, isActive, isPlaying, onPlay, onUnfavorite }: RadioFavCardProps) {
  const { t } = useTranslation();
  return (
    <div className={`album-card${isActive ? ' radio-card-active' : ''}`}>
      <div className="album-card-cover">
        {s.coverArt ? (
          <CachedImage
            src={buildCoverArtUrl(`ra-${s.id}`, 256)}
            cacheKey={coverArtCacheKey(`ra-${s.id}`, 256)}
            alt={s.name}
            className="album-card-cover-img"
          />
        ) : (
          <div className="album-card-cover-placeholder playlist-card-icon">
            <Cast size={48} strokeWidth={1.2} />
          </div>
        )}
        {isActive && isPlaying && (
          <div className="radio-live-overlay">
            <span className="radio-live-badge">{t('radio.live')}</span>
          </div>
        )}
        <div className="album-card-play-overlay">
          <button className="album-card-details-btn" onClick={onPlay}>
            {isActive && isPlaying ? <X size={15} /> : <Cast size={14} />}
          </button>
        </div>
      </div>
      <div className="album-card-info">
        <div className="album-card-title">{s.name}</div>
        <div className="album-card-artist" style={{ display: 'flex', alignItems: 'center' }}>
          <button
            className="radio-favorite-btn active"
            style={{ background: 'none', border: 'none', padding: '2px', cursor: 'pointer', display: 'flex' }}
            onClick={onUnfavorite}
            data-tooltip={t('radio.unfavorite')}
          >
            <Heart size={12} fill="currentColor" />
          </button>
        </div>
      </div>
    </div>
  );
}
