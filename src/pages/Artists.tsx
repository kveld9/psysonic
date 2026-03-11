import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getArtists, SubsonicArtist, buildCoverArtUrl } from '../api/subsonic';
import { Users, LayoutGrid, List } from 'lucide-react';
import { usePlayerStore } from '../store/playerStore';
import { useTranslation } from 'react-i18next';

const ALL_SENTINEL = 'ALL';
const ALPHABET = [ALL_SENTINEL, '#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')];

export default function Artists() {
  const { t } = useTranslation();
  const [artists, setArtists] = useState<SubsonicArtist[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [letterFilter, setLetterFilter] = useState(ALL_SENTINEL);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const [visibleCount, setVisibleCount] = useState(50);
  const navigate = useNavigate();
  const openContextMenu = usePlayerStore(state => state.openContextMenu);

  useEffect(() => {
    getArtists().then(data => { setArtists(data); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const loadMore = useCallback(() => {
    setVisibleCount(prev => prev + 50);
  }, []);

  // Reset infinite scroll when filters change
  useEffect(() => {
    setVisibleCount(50);
  }, [filter, letterFilter, viewMode]);

  // Filter pipeline
  let filtered = artists;

  if (letterFilter !== ALL_SENTINEL) {
    filtered = filtered.filter(a => {
      const first = a.name[0]?.toUpperCase() ?? '#';
      const isAlpha = /^[A-Z]$/.test(first);
      if (letterFilter === '#') return !isAlpha;
      return first === letterFilter;
    });
  }

  if (filter) {
    filtered = filtered.filter(a => a.name.toLowerCase().includes(filter.toLowerCase()));
  }

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  // Group by first letter (for list view)
  const groups: Record<string, SubsonicArtist[]> = {};
  visible.forEach(a => {
    const letter = a.name[0]?.toUpperCase() ?? '#';
    const key = /^[A-Z]$/.test(letter) ? letter : '#';
    if (!groups[key]) groups[key] = [];
    groups[key].push(a);
  });
  const letters = Object.keys(groups).sort();

  return (
    <div className="content-body animate-fade-in">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <h1 className="page-title" style={{ marginBottom: 0 }}>{t('artists.title')}</h1>
          <input
            className="input"
            style={{ maxWidth: 220 }}
            placeholder={t('artists.search')}
            value={filter}
            onChange={e => setFilter(e.target.value)}
            id="artist-filter-input"
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            className={`btn btn-surface ${viewMode === 'grid' ? 'btn-sort-active' : ''}`}
            onClick={() => setViewMode('grid')}
            style={viewMode === 'grid' ? { background: 'var(--accent)', color: 'var(--ctp-crust)', padding: '0.5rem' } : { padding: '0.5rem' }}
            data-tooltip={t('artists.gridView')}
          >
            <LayoutGrid size={20} />
          </button>
          <button
            className={`btn btn-surface ${viewMode === 'list' ? 'btn-sort-active' : ''}`}
            onClick={() => setViewMode('list')}
            style={viewMode === 'list' ? { background: 'var(--accent)', color: 'var(--ctp-crust)', padding: '0.5rem' } : { padding: '0.5rem' }}
            data-tooltip={t('artists.listView')}
          >
            <List size={20} />
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginBottom: '2rem' }}>
        {ALPHABET.map(l => (
          <button
            key={l}
            onClick={() => setLetterFilter(l)}
            style={{
              padding: '0.25rem 0.5rem',
              borderRadius: 'var(--radius-sm)',
              background: letterFilter === l ? 'var(--accent)' : 'var(--bg-card)',
              color: letterFilter === l ? 'var(--ctp-crust)' : 'var(--text-secondary)',
              border: '1px solid var(--border-subtle)',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            {l === ALL_SENTINEL ? t('artists.all') : l}
          </button>
        ))}
      </div>

      {loading && <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><div className="spinner" /></div>}

      {!loading && viewMode === 'grid' && (
        <div className="album-grid-wrap">
          {visible.map(artist => {
            const coverId = artist.coverArt || artist.id;
            return (
              <div
                key={artist.id}
                className="artist-card"
                onClick={() => navigate(`/artist/${artist.id}`)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  openContextMenu(e.clientX, e.clientY, artist, 'artist');
                }}
              >
                <div className="artist-card-avatar" style={{ position: 'relative', overflow: 'hidden' }}>
                  {coverId ? (
                    <img
                      src={buildCoverArtUrl(coverId, 200)}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        e.currentTarget.parentElement?.classList.add('fallback-visible');
                      }}
                    />
                  ) : (
                    <Users size={32} />
                  )}
                  <Users size={32} className="fallback-icon" style={{ display: coverId ? 'none' : 'block', position: 'absolute' }} />
                </div>
                <div>
                  <div className="artist-card-name">{artist.name}</div>
                  {artist.albumCount != null && (
                    <div className="artist-card-meta">{t('artists.albumCount', { count: artist.albumCount })}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && viewMode === 'list' && (
        <>
          {letters.map(letter => (
            <div key={letter} style={{ marginBottom: '1.5rem' }}>
              <h3 className="letter-heading">{letter}</h3>
              <div className="artist-list">
                {groups[letter].map(artist => {
                  const coverId = artist.coverArt || artist.id;
                  return (
                    <button
                      key={artist.id}
                      className="artist-row"
                      onClick={() => navigate(`/artist/${artist.id}`)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        openContextMenu(e.clientX, e.clientY, artist, 'artist');
                      }}
                      id={`artist-${artist.id}`}
                    >
                      <div className="artist-avatar" style={{ position: 'relative', overflow: 'hidden' }}>
                        {coverId ? (
                          <img
                            src={buildCoverArtUrl(coverId, 100)}
                            alt=""
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              e.currentTarget.parentElement?.classList.add('fallback-visible');
                            }}
                          />
                        ) : (
                          <Users size={18} />
                        )}
                        <Users size={18} className="fallback-icon" style={{ display: coverId ? 'none' : 'block', position: 'absolute' }} />
                      </div>
                      <div style={{ textAlign: 'left' }}>
                        <div className="artist-name">{artist.name}</div>
                        {artist.albumCount != null && (
                          <div className="artist-meta">{t('artists.albumCount', { count: artist.albumCount })}</div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </>
      )}

      {!loading && hasMore && (
        <div style={{ margin: '2rem 0', display: 'flex', justifyContent: 'center' }}>
          <button className="btn btn-ghost" onClick={loadMore}>
            {t('artists.loadMore')}
          </button>
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          {t('artists.notFound')}
        </div>
      )}
    </div>
  );
}
