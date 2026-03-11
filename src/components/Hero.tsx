import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, ListPlus } from 'lucide-react';
import { getRandomAlbums, SubsonicAlbum, buildCoverArtUrl, getAlbum } from '../api/subsonic';
import { usePlayerStore } from '../store/playerStore';
import { useTranslation } from 'react-i18next';

export default function Hero() {
  const { t } = useTranslation();
  const [album, setAlbum] = useState<SubsonicAlbum | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    getRandomAlbums(1).then(albums => {
      if (!cancelled && albums[0]) setAlbum(albums[0]);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (!album) return <div className="hero-placeholder" />;

  const coverUrl = album.coverArt ? buildCoverArtUrl(album.coverArt, 800) : '';

  return (
    <div
      className="hero"
      role="banner"
      aria-label={t('hero.eyebrow')}
      onClick={() => navigate(`/album/${album.id}`)}
      style={{ cursor: 'pointer' }}
    >
      {coverUrl && (
        <div
          className="hero-bg"
          style={{ backgroundImage: `url(${coverUrl})` }}
          aria-hidden="true"
        />
      )}
      <div className="hero-overlay" aria-hidden="true" />
      <div className="hero-content animate-fade-in">
        {coverUrl && (
          <img className="hero-cover" src={coverUrl} alt={`${album.name} Cover`} />
        )}
        <div className="hero-text">
          <span className="hero-eyebrow">{t('hero.eyebrow')}</span>
          <h2 className="hero-title">{album.name}</h2>
          <p className="hero-artist">{album.artist}</p>
          <div className="hero-meta">
            {album.year && <span className="badge">{album.year}</span>}
            {album.genre && <span className="badge">{album.genre}</span>}
            {album.songCount && <span className="badge">{album.songCount} Tracks</span>}
          </div>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <button
              className="hero-play-btn"
              id="hero-play-btn"
              onClick={e => { e.stopPropagation(); navigate(`/album/${album.id}`); }}
              aria-label={`${t('hero.playAlbum')} ${album.name}`}
            >
              <Play size={18} fill="currentColor" />
              {t('hero.playAlbum')}
            </button>
            <button
              className="btn btn-surface"
              onClick={async (e) => {
                e.stopPropagation();
                try {
                  const albumData = await getAlbum(album.id);
                  const tracks = albumData.songs.map(s => ({
                    id: s.id, title: s.title, artist: s.artist, album: s.album,
                    albumId: s.albumId, duration: s.duration, coverArt: s.coverArt, track: s.track,
                    year: s.year, bitRate: s.bitRate, suffix: s.suffix, userRating: s.userRating,
                  }));
                  usePlayerStore.getState().enqueue(tracks);
                } catch (err) { }
              }}
              style={{ padding: '0 1.5rem', fontWeight: 600, fontSize: '0.95rem' }}
              data-tooltip={t('hero.enqueueTooltip')}
            >
              <ListPlus size={18} />
              {t('hero.enqueue')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
