import React, { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { usePlayerStore } from '../store/playerStore';

function fmt(s: number): string {
  if (!s || isNaN(s)) return '0:00';
  return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
}

const BAR_COUNT = 500;

// ── Pseudo-random fallback (shown while real waveform loads) ──────────────────

function hashStr(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h = (h ^ str.charCodeAt(i)) >>> 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

function makeFallbackHeights(trackId: string): Float32Array {
  let s = hashStr(trackId);
  const h = new Float32Array(BAR_COUNT);
  for (let i = 0; i < BAR_COUNT; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    h[i] = s / 0xffffffff;
  }
  for (let pass = 0; pass < 5; pass++) {
    for (let i = 1; i < BAR_COUNT - 1; i++) {
      h[i] = h[i - 1] * 0.25 + h[i] * 0.5 + h[i + 1] * 0.25;
    }
  }
  let max = 0;
  for (let i = 0; i < BAR_COUNT; i++) if (h[i] > max) max = h[i];
  if (max > 0) {
    for (let i = 0; i < BAR_COUNT; i++) h[i] = 0.12 + (h[i] / max) * 0.88;
  }
  return h;
}

// ── Real waveform cache (module-level, persists across re-renders) ────────────
const waveformCache = new Map<string, Float32Array>();

// ── Canvas drawing ────────────────────────────────────────────────────────────

function drawWaveform(
  canvas: HTMLCanvasElement,
  heights: Float32Array | null,
  progress: number,
  buffered: number,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const rect = canvas.getBoundingClientRect();
  const w = rect.width || canvas.clientWidth;
  const h = rect.height || canvas.clientHeight;
  if (w === 0 || h === 0) return;

  const dpr = window.devicePixelRatio || 1;
  const pw = Math.round(w * dpr);
  const ph = Math.round(h * dpr);
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw;
    canvas.height = ph;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const style = getComputedStyle(document.documentElement);
  const colorAccent   = style.getPropertyValue('--waveform-played').trim()   || style.getPropertyValue('--accent').trim()       || '#cba6f7';
  const colorBuffered = style.getPropertyValue('--waveform-buffered').trim() || style.getPropertyValue('--ctp-overlay0').trim() || '#6c7086';
  const colorUnplayed = style.getPropertyValue('--waveform-unplayed').trim() || style.getPropertyValue('--ctp-surface1').trim() || '#313244';

  if (!heights) {
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = colorUnplayed;
    ctx.fillRect(0, (h - 2) / 2, w, 2);
    ctx.globalAlpha = 1;
    return;
  }

  const x1Of = (i: number) => (i / BAR_COUNT) * w;
  const x2Of = (i: number) => ((i + 1) / BAR_COUNT) * w;

  // Pass 1 — unplayed
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = colorUnplayed;
  for (let i = 0; i < BAR_COUNT; i++) {
    if (i / BAR_COUNT < buffered) continue;
    const barH = Math.max(1, heights[i] * h);
    const x = x1Of(i);
    ctx.fillRect(x, (h - barH) / 2, x2Of(i) - x, barH);
  }

  // Pass 2 — buffered
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = colorBuffered;
  for (let i = 0; i < BAR_COUNT; i++) {
    const frac = i / BAR_COUNT;
    if (frac < progress || frac >= buffered) continue;
    const barH = Math.max(1, heights[i] * h);
    const x = x1Of(i);
    ctx.fillRect(x, (h - barH) / 2, x2Of(i) - x, barH);
  }

  // Pass 3 — played
  if (progress > 0) {
    ctx.globalAlpha = 1;
    ctx.fillStyle = colorAccent;
    ctx.shadowColor = colorAccent;
    ctx.shadowBlur = 5;
    for (let i = 0; i < BAR_COUNT; i++) {
      if (i / BAR_COUNT >= progress) break;
      const barH = Math.max(1, heights[i] * h);
      const x = x1Of(i);
      ctx.fillRect(x, (h - barH) / 2, x2Of(i) - x, barH);
    }
    ctx.shadowBlur = 0;
  }

  ctx.globalAlpha = 1;
}

const CROSSFADE_MS = 400;

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  trackId: string | undefined;
  url: string | undefined;
}

export default function WaveformSeek({ trackId, url }: Props) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const heightsRef   = useRef<Float32Array | null>(null);
  const progressRef  = useRef(0);
  const bufferedRef  = useRef(0);
  const isDragging   = useRef(false);
  const computingId  = useRef<string | null>(null);
  const rafRef       = useRef<number | null>(null);

  const [hoverPct, setHoverPct] = useState<number | null>(null);

  const progress = usePlayerStore(s => s.progress);
  const buffered = usePlayerStore(s => s.buffered);
  const seek     = usePlayerStore(s => s.seek);
  const duration = usePlayerStore(s => s.currentTrack?.duration ?? 0);

  progressRef.current = progress;
  bufferedRef.current = buffered;

  const startCrossfade = (from: Float32Array, to: Float32Array) => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    const start = performance.now();
    const blended = new Float32Array(BAR_COUNT);

    const step = (now: number) => {
      const t = easeInOut(Math.min((now - start) / CROSSFADE_MS, 1));
      for (let i = 0; i < BAR_COUNT; i++) blended[i] = from[i] * (1 - t) + to[i] * t;
      heightsRef.current = blended;
      if (canvasRef.current) drawWaveform(canvasRef.current, blended, progressRef.current, bufferedRef.current);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        heightsRef.current = to;
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(step);
  };

  // When track changes: show fallback immediately, then compute real waveform
  useEffect(() => {
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }

    if (!trackId || !url) {
      heightsRef.current = null;
      computingId.current = null;
      return;
    }

    // Check cache first — no transition needed, just draw immediately
    const cached = waveformCache.get(trackId);
    if (cached) {
      heightsRef.current = cached;
      if (canvasRef.current) drawWaveform(canvasRef.current, cached, progressRef.current, bufferedRef.current);
      return;
    }

    // Show pseudo-random while loading
    const fallback = makeFallbackHeights(trackId);
    heightsRef.current = fallback;
    if (canvasRef.current) drawWaveform(canvasRef.current, fallback, progressRef.current, bufferedRef.current);

    // Kick off background computation
    const id = trackId;
    computingId.current = id;

    invoke<number[]>('compute_waveform', { url })
      .then(values => {
        if (computingId.current !== id) return; // track changed while computing
        const real = new Float32Array(values);
        waveformCache.set(id, real);
        // Crossfade from whatever is currently showing to the real waveform
        const current = heightsRef.current ?? fallback;
        startCrossfade(current, real);
      })
      .catch(() => { /* keep pseudo-random on error */ });
  }, [trackId, url]);

  useEffect(() => {
    if (canvasRef.current) {
      drawWaveform(canvasRef.current, heightsRef.current, progress, buffered);
    }
  }, [progress, buffered, trackId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      drawWaveform(canvas, heightsRef.current, progressRef.current, bufferedRef.current);
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  const trackIdRef = useRef(trackId);
  trackIdRef.current = trackId;
  const seekRef = useRef(seek);
  seekRef.current = seek;

  useEffect(() => {
    const seekFromX = (clientX: number) => {
      const canvas = canvasRef.current;
      if (!canvas || !trackIdRef.current) return;
      const rect = canvas.getBoundingClientRect();
      seekRef.current(Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)));
    };
    const onMove = (e: MouseEvent) => { if (isDragging.current) seekFromX(e.clientX); };
    const onUp   = () => { isDragging.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    };
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      {hoverPct !== null && duration > 0 && (
        <span
          className="player-volume-pct"
          style={{ left: `${hoverPct * 100}%` }}
        >
          {fmt(hoverPct * duration)}
        </span>
      )}
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '24px', cursor: trackId ? 'pointer' : 'default', display: 'block' }}
        onMouseDown={e => {
          isDragging.current = true;
          const rect = e.currentTarget.getBoundingClientRect();
          seekRef.current(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
        }}
        onMouseMove={e => {
          if (!trackId) return;
          const rect = e.currentTarget.getBoundingClientRect();
          setHoverPct(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
        }}
        onMouseLeave={() => setHoverPct(null)}
      />
    </div>
  );
}
