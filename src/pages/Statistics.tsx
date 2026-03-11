import React, { useEffect, useState } from 'react';
import { getAlbumList, getGenres, SubsonicAlbum, SubsonicGenre } from '../api/subsonic';
import AlbumRow from '../components/AlbumRow';
import { BarChart3 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function Statistics() {
  const { t } = useTranslation();
  const [frequent, setFrequent] = useState<SubsonicAlbum[]>([]);
  const [highest, setHighest] = useState<SubsonicAlbum[]>([]);
  const [genres, setGenres] = useState<SubsonicGenre[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getAlbumList('frequent', 12).catch(() => []),
      getAlbumList('highest', 12).catch(() => []),
      getGenres().catch(() => [])
    ]).then(([f, h, g]) => {
      setFrequent(f);
      setHighest(h);
      // Sort genres by album count or song count
      setGenres(g.sort((a, b) => b.songCount - a.songCount).slice(0, 20)); // Top 20 genres
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const loadMore = async (
    type: 'frequent' | 'highest',
    currentList: SubsonicAlbum[],
    setter: React.Dispatch<React.SetStateAction<SubsonicAlbum[]>>
  ) => {
    try {
      const more = await getAlbumList(type, 12, currentList.length);
      const newItems = more.filter(m => !currentList.find(c => c.id === m.id));
      if (newItems.length > 0) {
        setter(prev => [...prev, ...newItems]);
      }
    } catch (e) {
      console.error('Failed to load more', e);
    }
  };

  const maxGenreCount = Math.max(...genres.map(g => g.songCount), 1);

  return (
    <div className="content-body animate-fade-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <BarChart3 size={32} style={{ color: 'var(--accent)' }} />
        <h1 className="page-title" style={{ margin: 0 }}>{t('statistics.title')}</h1>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
          <div className="spinner" />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3rem' }}>

          <AlbumRow
            title={t('statistics.mostPlayed')}
            albums={frequent}
            onLoadMore={() => loadMore('frequent', frequent, setFrequent)}
            moreText={t('statistics.loadMore')}
          />

          <AlbumRow
            title={t('statistics.highestRated')}
            albums={highest}
            onLoadMore={() => loadMore('highest', highest, setHighest)}
            moreText={t('statistics.loadMore')}
          />

          {genres.length > 0 && (
            <div>
              <div className="section-title">
                <h2>{t('statistics.genreDistribution')}</h2>
              </div>

              <div style={{ display: 'grid', gap: '1rem', background: 'var(--surface0)', padding: '1.5rem', borderRadius: '12px' }}>
                {genres.map(genre => {
                  const percentage = (genre.songCount / maxGenreCount) * 100;
                  return (
                    <div key={genre.value} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: 'var(--text)' }}>
                        <span>{genre.value}</span>
                        <span style={{ color: 'var(--subtext0)' }}>{genre.songCount} Songs</span>
                      </div>
                      <div style={{ width: '100%', height: '8px', background: 'var(--surface2)', borderRadius: '4px', overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${percentage}%`,
                            height: '100%',
                            background: 'var(--accent)',
                            borderRadius: '4px',
                            transition: 'width 1s ease-out'
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
