import React, { useEffect, useState, useCallback, useRef } from 'react';
import AlbumCard from '../components/AlbumCard';
import GenreFilterBar from '../components/GenreFilterBar';
import { getAlbumList, getAlbumsByGenre, getAlbum, SubsonicAlbum, buildDownloadUrl } from '../api/subsonic';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/authStore';
import { useOfflineStore } from '../store/offlineStore';
import { useDownloadModalStore } from '../store/downloadModalStore';
import { usePlayerStore } from '../store/playerStore';
import { invoke } from '@tauri-apps/api/core';
import { join } from '@tauri-apps/api/path';
import { showToast } from '../utils/toast';
import { useZipDownloadStore } from '../store/zipDownloadStore';
import { X, CheckSquare2, Download, HardDriveDownload, ChevronDown, SlidersHorizontal } from 'lucide-react';

type SortDirection = 'asc';
interface SortState {
  field: 'name' | 'artist';
  direction: SortDirection;
}

const PAGE_SIZE = 30;
const CURRENT_YEAR = new Date().getFullYear();

function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim() || 'download';
}

async function fetchByGenres(genres: string[]): Promise<SubsonicAlbum[]> {
  const results = await Promise.all(genres.map(g => getAlbumsByGenre(g, 500, 0)));
  const seen = new Set<string>();
  return results.flat().filter(a => { if (seen.has(a.id)) return false; seen.add(a.id); return true; });
}

export default function Albums() {
  const { t } = useTranslation();
  const musicLibraryFilterVersion = useAuthStore(s => s.musicLibraryFilterVersion);
  const auth = useAuthStore();
  const serverId = useAuthStore(s => s.activeServerId ?? '');
  const downloadAlbum = useOfflineStore(s => s.downloadAlbum);
  const requestDownloadFolder = useDownloadModalStore(s => s.requestFolder);

  const [albums, setAlbums] = useState<SubsonicAlbum[]>([]);
  const [sort, setSort] = useState<SortState>({ field: 'name', direction: 'asc' });
  // Note: Only ascending order is supported to ensure proper pagination
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);

  // ── Advanced filters ─────────────────────────────────────────────────────
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [trackCountFilter, setTrackCountFilter] = useState<'all' | 'ep' | 'album' | 'double'>('all');
  const [yearRange, setYearRange] = useState<[number, number]>([1950, CURRENT_YEAR]);
  const observerTarget = useRef<HTMLDivElement>(null);

  // ── Multi-selection ──────────────────────────────────────────────────────
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelectionMode = () => {
    setSelectionMode(v => !v);
    setSelectedIds(new Set());
  };

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const selectedAlbums = albums.filter(a => selectedIds.has(a.id));
  const openContextMenu = usePlayerStore(state => state.openContextMenu);

  // ── Data loading ─────────────────────────────────────────────────────────
  const genreFiltered = selectedGenres.length > 0;

  const load = useCallback(async (
    sortState: SortState,
    offset: number,
    append = false,
  ) => {
    setLoading(true);
    try {
      // Use alphabetical sorting
      const type: Parameters<typeof getAlbumList>[0] = sortState.field === 'name' ? 'alphabeticalByName' : 'alphabeticalByArtist';

      const data = await getAlbumList(type, PAGE_SIZE, offset);

      if (append) setAlbums(prev => [...prev, ...data]);
      else setAlbums(data);
      setHasMore(data.length === PAGE_SIZE);
    } finally {
      setLoading(false);
    }
  }, [sort.field, musicLibraryFilterVersion]);

  const loadFiltered = useCallback(async (genres: string[], sortState: SortState) => {
    setLoading(true);
    try {
      const data = await fetchByGenres(genres);
      const sorted = [...data].sort((a, b) => {
        return sortState.field === 'artist'
          ? a.artist.localeCompare(b.artist)
          : a.name.localeCompare(b.name);
      });
      setAlbums(sorted);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [musicLibraryFilterVersion]);

  const handleDownloadZips = async () => {
    if (selectedAlbums.length === 0) return;
    const folder = auth.downloadFolder || await requestDownloadFolder();
    if (!folder) return;
    const { start, complete, fail } = useZipDownloadStore.getState();
    clearSelection();
    for (const album of selectedAlbums) {
      const downloadId = crypto.randomUUID();
      const filename = `${sanitizeFilename(album.name)}.zip`;
      const destPath = await join(folder, filename);
      const url = buildDownloadUrl(album.id);
      start(downloadId, filename);
      try {
        await invoke('download_zip', { id: downloadId, url, destPath });
        complete(downloadId);
      } catch (e) {
        fail(downloadId);
        console.error('ZIP download failed for', album.name, e);
        showToast(t('albums.downloadZipFailed', { name: album.name }), 4000, 'error');
      }
    }
  };

  const handleAddOffline = async () => {
    if (selectedAlbums.length === 0) return;
    let queued = 0;
    for (const album of selectedAlbums) {
      try {
        const detail = await getAlbum(album.id);
        downloadAlbum(album.id, album.name, album.artist, album.coverArt, album.year, detail.songs, serverId);
        queued++;
      } catch {
        showToast(t('albums.offlineFailed', { name: album.name }), 3000, 'error');
      }
    }
    if (queued > 0) showToast(t('albums.offlineQueuing', { count: queued }), 3000, 'info');
    clearSelection();
  };

  useEffect(() => {
    setPage(0);
    if (genreFiltered) {
      loadFiltered(selectedGenres, sort);
    } else {
      load(sort, 0);
    }
  }, [sort, genreFiltered, selectedGenres, load, loadFiltered]);

  const handleSortClick = (field: 'name' | 'artist') => {
    setSort({ field, direction: 'asc' });
  };

  const loadMore = useCallback(() => {
    if (loading || !hasMore || genreFiltered) return;
    const next = page + 1;
    setPage(next);
    load(sort, next * PAGE_SIZE, true);
  }, [loading, hasMore, page, sort, load, genreFiltered]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => { if (entries[0].isIntersecting) loadMore(); },
      { rootMargin: '200px' }
    );
    if (observerTarget.current) observer.observe(observerTarget.current);
    return () => observer.disconnect();
  }, [loadMore]);

  // ── Client-side advanced filtering ───────────────────────────────────────
  const filteredAlbums = React.useMemo(() => {
    let result = [...albums];
    
    // Year range filter (client-side, works with any data source)
    if (yearRange[0] > 1950 || yearRange[1] < CURRENT_YEAR) {
      result = result.filter(a => {
        if (!a.year) return false;
        return a.year >= yearRange[0] && a.year <= yearRange[1];
      });
    }
    
    // Track count filter
    if (trackCountFilter !== 'all') {
      result = result.filter(a => {
        const count = a.songCount ?? 0;
        switch (trackCountFilter) {
          case 'ep': return count <= 4;
          case 'album': return count >= 5 && count <= 11;
          case 'double': return count >= 12;
          default: return true;
        }
      });
    }
    
    return result;
  }, [albums, yearRange, trackCountFilter]);

  const activeAdvancedFilters = (yearRange[0] > 1950 || yearRange[1] < CURRENT_YEAR || trackCountFilter !== 'all');
  const clearAdvancedFilters = () => {
    setYearRange([1950, CURRENT_YEAR]);
    setTrackCountFilter('all');
  };

  return (
    <div className="content-body animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <h1 className="page-title" style={{ marginBottom: 0 }}>
          {selectionMode && selectedIds.size > 0
            ? t('albums.selectionCount', { count: selectedIds.size })
            : t('albums.title')}
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {selectionMode && selectedIds.size > 0 ? (
            <>
              <button className="btn btn-surface albums-selection-action-btn" onClick={handleAddOffline}>
                <HardDriveDownload size={15} />
                {t('albums.addOffline')}
              </button>
              <button className="btn btn-surface albums-selection-action-btn" onClick={handleDownloadZips}>
                <Download size={15} />
                {t('albums.downloadZips')}
              </button>
            </>
          ) : (
            <>
              <button
                className={`btn btn-surface ${sort.field === 'name' ? 'btn-sort-active' : ''}`}
                onClick={() => handleSortClick('name')}
                style={sort.field === 'name' ? { background: 'var(--accent)', color: 'var(--ctp-crust)' } : {}}
              >
                {t('albums.sortByName')}
              </button>
              <button
                className={`btn btn-surface ${sort.field === 'artist' ? 'btn-sort-active' : ''}`}
                onClick={() => handleSortClick('artist')}
                style={sort.field === 'artist' ? { background: 'var(--accent)', color: 'var(--ctp-crust)' } : {}}
              >
                {t('albums.sortByArtist')}
              </button>

              <GenreFilterBar selected={selectedGenres} onSelectionChange={setSelectedGenres} />
              
              <button
                className={`btn btn-surface${advancedOpen ? ' btn-sort-active' : ''}`}
                onClick={() => setAdvancedOpen((o: boolean) => !o)}
                style={activeAdvancedFilters ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : {}}
              >
                <SlidersHorizontal size={15} />
                {t('albums.advanced')}
                {activeAdvancedFilters && <span style={{ marginLeft: 4, fontSize: 11, opacity: 0.8 }}>•</span>}
                <ChevronDown size={14} style={{ transform: advancedOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', marginLeft: 4 }} />
              </button>
            </>
          )}

          <button
            className={`btn btn-surface${selectionMode ? ' btn-sort-active' : ''}`}
            onClick={toggleSelectionMode}
            data-tooltip={selectionMode ? t('albums.cancelSelect') : t('albums.startSelect')}
            data-tooltip-pos="bottom"
            style={selectionMode ? { background: 'var(--accent)', color: 'var(--ctp-crust)' } : {}}
          >
            <CheckSquare2 size={15} />
            {selectionMode ? t('albums.cancelSelect') : t('albums.select')}
          </button>
        </div>
      </div>

      {/* ─── Advanced Filters Panel ──────────────────────────────────────────── */}
      {advancedOpen && (
        <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'var(--surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Year Range Slider */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>{t('albums.yearRange')}</span>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{yearRange[0]} – {yearRange[1]}</span>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <input
                  type="range"
                  min={1950}
                  max={CURRENT_YEAR}
                  value={yearRange[0]}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    const val = parseInt(e.target.value);
                    setYearRange((prev: [number, number]) => [Math.min(val, prev[1] - 1), prev[1]]);
                  }}
                  style={{ flex: 1 }}
                />
                <input
                  type="range"
                  min={1950}
                  max={CURRENT_YEAR}
                  value={yearRange[1]}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    const val = parseInt(e.target.value);
                    setYearRange((prev: [number, number]) => [prev[0], Math.max(val, prev[0] + 1)]);
                  }}
                  style={{ flex: 1 }}
                />
              </div>
            </div>

            {/* Track Count Filter */}
            <div>
              <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', marginBottom: '0.5rem', display: 'block' }}>{t('albums.trackCount')}</span>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {[
                  { id: 'all', label: t('albums.trackCountAll'), count: null },
                  { id: 'ep', label: 'EP', count: '≤ 4' },
                  { id: 'album', label: t('albums.trackCountAlbum'), count: '5–11' },
                  { id: 'double', label: t('albums.trackCountDouble'), count: '≥ 12' },
                ].map(opt => (
                  <button
                    key={opt.id}
                    className={`btn btn-sm ${trackCountFilter === opt.id ? 'btn-primary' : 'btn-surface'}`}
                    onClick={() => setTrackCountFilter(opt.id as typeof trackCountFilter)}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                  >
                    {opt.label}
                    {opt.count && <span style={{ opacity: 0.6, fontSize: 11 }}>({opt.count})</span>}
                  </button>
                ))}
              </div>
            </div>

            {/* Clear button */}
            {activeAdvancedFilters && (
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost btn-sm" onClick={clearAdvancedFilters}>
                  <X size={14} />
                  {t('albums.clearAdvanced')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {loading && albums.length === 0 ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
          <div className="spinner" />
        </div>
      ) : (
        <>
          <div className="album-grid-wrap">
            {filteredAlbums.map((a: SubsonicAlbum) => (
              <AlbumCard
                key={a.id}
                album={a}
                selectionMode={selectionMode}
                selected={selectedIds.has(a.id)}
                onToggleSelect={toggleSelect}
                selectedAlbums={selectedAlbums}
              />
            ))}
          </div>
          {!genreFiltered && (
            <div ref={observerTarget} style={{ height: '20px', margin: '2rem 0', display: 'flex', justifyContent: 'center' }}>
              {loading && hasMore && <div className="spinner" style={{ width: 20, height: 20 }} />}
            </div>
          )}
        </>
      )}

    </div>
  );
}
