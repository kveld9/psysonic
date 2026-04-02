import React, { useState, useEffect, useMemo } from 'react';
import { Play, Heart, ListPlus, X } from 'lucide-react';
import { SubsonicSong } from '../api/subsonic';
import { Track, usePlayerStore, songToTrack } from '../store/playerStore';
import { useTranslation } from 'react-i18next';
import { useDragDrop } from '../contexts/DragDropContext';
import { AddToPlaylistSubmenu } from './ContextMenu';

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function codecLabel(song: { suffix?: string; bitRate?: number }): string {
  const parts: string[] = [];
  if (song.suffix) parts.push(song.suffix.toUpperCase());
  if (song.bitRate) parts.push(`${song.bitRate} kbps`);
  return parts.join(' · ');
}

function StarRating({ value, onChange }: { value: number; onChange: (r: number) => void }) {
  const { t } = useTranslation();
  const [hover, setHover] = React.useState(0);
  return (
    <div className="star-rating" role="radiogroup" aria-label={t('albumDetail.ratingLabel')}>
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          className={`star ${(hover || value) >= n ? 'filled' : ''}`}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(n)}
          aria-label={`${n}`}
          role="radio"
          aria-checked={(hover || value) >= n}
        >
          ★
        </button>
      ))}
    </div>
  );
}

interface AlbumTrackListProps {
  songs: SubsonicSong[];
  hasVariousArtists: boolean;
  currentTrack: Track | null;
  isPlaying: boolean;
  ratings: Record<string, number>;
  starredSongs: Set<string>;
  onPlaySong: (song: SubsonicSong) => void;
  onRate: (songId: string, rating: number) => void;
  onToggleSongStar: (song: SubsonicSong, e: React.MouseEvent) => void;
  onContextMenu: (x: number, y: number, track: Track, type: 'song' | 'album' | 'artist' | 'queue-item' | 'album-song') => void;
}

export default function AlbumTrackList({
  songs,
  hasVariousArtists,
  currentTrack,
  isPlaying,
  ratings,
  starredSongs,
  onPlaySong,
  onRate,
  onToggleSongStar,
  onContextMenu,
}: AlbumTrackListProps) {
  const { t } = useTranslation();
  const [hoveredSongId, setHoveredSongId] = useState<string | null>(null);
  const [contextMenuSongId, setContextMenuSongId] = useState<string | null>(null);
  const contextMenuOpen = usePlayerStore(s => s.contextMenu.isOpen);
  const psyDrag = useDragDrop();

  // ── Bulk select ───────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedIdx, setLastSelectedIdx] = useState<number | null>(null);
  const [showPlPicker, setShowPlPicker] = useState(false);

  const toggleSelect = (id: string, globalIdx: number, shift: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (shift && lastSelectedIdx !== null) {
        const from = Math.min(lastSelectedIdx, globalIdx);
        const to = Math.max(lastSelectedIdx, globalIdx);
        songs.slice(from, to + 1).forEach(s => next.add(s.id));
      } else {
        next.has(id) ? next.delete(id) : next.add(id);
      }
      return next;
    });
    setLastSelectedIdx(globalIdx);
  };

  const allSelected = selectedIds.size === songs.length && songs.length > 0;
  const toggleAll = () => setSelectedIds(allSelected ? new Set() : new Set(songs.map(s => s.id)));

  useEffect(() => {
    if (!contextMenuOpen) setContextMenuSongId(null);
  }, [contextMenuOpen]);

  // Close playlist picker on outside click
  useEffect(() => {
    if (!showPlPicker) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.bulk-pl-picker-wrap')) setShowPlPicker(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPlPicker]);

  const totalDuration = songs.reduce((acc, s) => acc + s.duration, 0);

  const discs = new Map<number, SubsonicSong[]>();
  songs.forEach(song => {
    const disc = song.discNumber ?? 1;
    if (!discs.has(disc)) discs.set(disc, []);
    discs.get(disc)!.push(song);
  });
  const discNums = Array.from(discs.keys()).sort((a, b) => a - b);
  const isMultiDisc = discNums.length > 1;

  const inSelectMode = selectedIds.size > 0;

  return (
    <div className="tracklist">

      {/* ── Bulk action bar ── */}
      {inSelectMode && (
        <div className="bulk-action-bar">
          <span className="bulk-action-count">
            {t('common.bulkSelected', { count: selectedIds.size })}
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
                songIds={[...selectedIds]}
                onDone={() => { setShowPlPicker(false); setSelectedIds(new Set()); }}
                dropDown
              />
            )}
          </div>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setSelectedIds(new Set())}
          >
            <X size={13} />
            {t('common.bulkClear')}
          </button>
        </div>
      )}

      <div className={`tracklist-header${' tracklist-va'}`}>
        <div className="col-center">
          {inSelectMode
            ? <span className={`bulk-check${allSelected ? ' checked' : ''}`} onClick={toggleAll} style={{ cursor: 'pointer' }} />
            : '#'}
        </div>
        <div>{t('albumDetail.trackTitle')}</div>
        <div>{t('albumDetail.trackArtist')}</div>
        <div className="col-center">{t('albumDetail.trackFavorite')}</div>
        <div className="col-center">{t('albumDetail.trackRating')}</div>
        <div className="col-center">{t('albumDetail.trackDuration')}</div>
        <div>{t('albumDetail.trackFormat')}</div>
      </div>

      {discNums.map(discNum => (
        <div key={discNum}>
          {isMultiDisc && (
            <div className="disc-header">
              <span className="disc-icon">💿</span>
              CD {discNum}
            </div>
          )}
          {discs.get(discNum)!.map((song) => {
            const globalIdx = songs.indexOf(song);
            return (
              <div
                key={song.id}
                className={`track-row track-row-va${currentTrack?.id === song.id ? ' active' : ''}${contextMenuSongId === song.id ? ' context-active' : ''}${selectedIds.has(song.id) ? ' bulk-selected' : ''}`}
                onMouseEnter={() => setHoveredSongId(song.id)}
                onMouseLeave={() => setHoveredSongId(null)}
                onDoubleClick={() => onPlaySong(song)}
                onClick={e => {
                  if (inSelectMode && !(e.target as HTMLElement).closest('button, input')) {
                    toggleSelect(song.id, globalIdx, e.shiftKey);
                  }
                }}
                onContextMenu={e => {
                  e.preventDefault();
                  setContextMenuSongId(song.id);
                  onContextMenu(e.clientX, e.clientY, songToTrack(song), 'album-song');
                }}
                role="row"
                onMouseDown={e => {
                  if (e.button !== 0) return;
                  e.preventDefault();
                  const sx = e.clientX, sy = e.clientY;
                  const onMove = (me: MouseEvent) => {
                    if (Math.abs(me.clientX - sx) > 5 || Math.abs(me.clientY - sy) > 5) {
                      document.removeEventListener('mousemove', onMove);
                      document.removeEventListener('mouseup', onUp);
                      psyDrag.startDrag({ data: JSON.stringify({ type: 'song', track: songToTrack(song) }), label: song.title }, me.clientX, me.clientY);
                    }
                  };
                  const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
                  document.addEventListener('mousemove', onMove);
                  document.addEventListener('mouseup', onUp);
                }}
              >
                <div
                  className="track-num"
                  style={{ cursor: 'pointer' }}
                  onClick={e => {
                    e.stopPropagation();
                    if (inSelectMode || hoveredSongId === song.id) {
                      toggleSelect(song.id, globalIdx, e.shiftKey);
                    } else {
                      onPlaySong(song);
                    }
                  }}
                >
                  <span
                    className={`bulk-check${selectedIds.has(song.id) ? ' checked' : ''}${(inSelectMode || hoveredSongId === song.id) ? ' bulk-check-visible' : ''}`}
                    onClick={e => { e.stopPropagation(); toggleSelect(song.id, globalIdx, e.shiftKey); }}
                  />
                  <span style={{ color: (hoveredSongId === song.id || currentTrack?.id === song.id) ? 'var(--accent)' : 'var(--text-muted)' }}>
                    {hoveredSongId === song.id && currentTrack?.id !== song.id && !inSelectMode
                      ? <Play size={13} fill="currentColor" />
                      : currentTrack?.id === song.id && isPlaying
                        ? <div className="eq-bars"><span className="eq-bar" /><span className="eq-bar" /><span className="eq-bar" /></div>
                        : currentTrack?.id === song.id
                          ? <Play size={13} fill="currentColor" />
                          : (song.track ?? globalIdx + 1)}
                  </span>
                </div>
                <div className="track-info">
                  <span className="track-title">{song.title}</span>
                </div>
                <div className="track-artist-cell">
                  <span className="track-artist">{song.artist}</span>
                </div>
                <div className="track-star-cell">
                  <button
                    className="btn btn-ghost track-star-btn"
                    onClick={e => onToggleSongStar(song, e)}
                    data-tooltip={starredSongs.has(song.id) ? t('albumDetail.favoriteRemove') : t('albumDetail.favoriteAdd')}
                    style={{ color: starredSongs.has(song.id) ? 'var(--color-star-active, var(--accent))' : 'var(--color-star-inactive, var(--text-muted))' }}
                  >
                    <Heart size={14} fill={starredSongs.has(song.id) ? 'currentColor' : 'none'} />
                  </button>
                </div>
                <StarRating
                  value={ratings[song.id] ?? song.userRating ?? 0}
                  onChange={r => onRate(song.id, r)}
                />
                <div className="track-duration">
                  {formatDuration(song.duration)}
                </div>
                <div className="track-meta">
                  {(song.suffix || song.bitRate) && (
                    <span className="track-codec">{codecLabel(song)}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}

      <div className={`tracklist-total${' tracklist-va'}`}>
        <span className="tracklist-total-label">{t('albumDetail.trackTotal')}</span>
        <span className="tracklist-total-value">{formatDuration(totalDuration)}</span>
      </div>
    </div>
  );
}
