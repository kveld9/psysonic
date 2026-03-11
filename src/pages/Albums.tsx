import React, { useEffect, useState, useCallback, useRef } from 'react';
import AlbumCard from '../components/AlbumCard';
import { getAlbumList, SubsonicAlbum } from '../api/subsonic';
import { useTranslation } from 'react-i18next';

type SortType = 'alphabeticalByName' | 'alphabeticalByArtist' | 'newest' | 'random';

export default function Albums() {
  const { t } = useTranslation();
  const [albums, setAlbums] = useState<SubsonicAlbum[]>([]);
  const [sort, setSort] = useState<SortType>('alphabeticalByName');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const PAGE_SIZE = 30;

  const observerTarget = useRef<HTMLDivElement>(null);

  const load = useCallback(async (sortType: SortType, offset: number, append = false) => {
    setLoading(true);
    try {
      const data = await getAlbumList(sortType, PAGE_SIZE, offset);
      if (append) setAlbums(prev => [...prev, ...data]);
      else setAlbums(data);
      setHasMore(data.length === PAGE_SIZE);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { setPage(0); load(sort, 0); }, [sort, load]);

  const loadMore = useCallback(() => {
    if (loading || !hasMore) return;
    const next = page + 1;
    setPage(next);
    load(sort, next * PAGE_SIZE, true);
  }, [loading, hasMore, page, sort, load]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) {
          loadMore();
        }
      },
      { rootMargin: '200px' }
    );
    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }
    return () => observer.disconnect();
  }, [loadMore]);

  const sortOptions: { value: SortType; label: string }[] = [
    { value: 'alphabeticalByName', label: t('albums.sortByName') },
    { value: 'alphabeticalByArtist', label: t('albums.sortByArtist') },
    { value: 'newest', label: t('albums.sortNewest') },
    { value: 'random', label: t('albums.sortRandom') },
  ];

  return (
    <div className="content-body animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 className="page-title">{t('albums.title')}</h1>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {sortOptions.map(o => (
            <button
              key={o.value}
              className={`btn btn-surface ${sort === o.value ? 'btn-sort-active' : ''}`}
              onClick={() => setSort(o.value)}
              style={sort === o.value ? { background: 'var(--accent)', color: 'var(--ctp-crust)' } : {}}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {loading && albums.length === 0 ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
          <div className="spinner" />
        </div>
      ) : (
        <>
          <div className="album-grid-wrap">
            {albums.map(a => <AlbumCard key={a.id} album={a} />)}
          </div>

          <div ref={observerTarget} style={{ height: '20px', margin: '2rem 0', display: 'flex', justifyContent: 'center' }}>
            {loading && hasMore && <div className="spinner" style={{ width: 20, height: 20 }} />}
          </div>
        </>
      )}
    </div>
  );
}
