import { useState, useEffect, useRef, useCallback } from 'react';
import Hls from 'hls.js';
import { getStreamUrl, getPlaylist } from '../lib/api';
import type { AudioSegment, Language } from '../types';

interface UseAudioPlayerOptions {
  city: string;
  language: Language;
  useHls: boolean;
  useIcecast: boolean;
  isLive?: boolean;
  streamUrl?: string | null;
  onError?: (message: string) => void;
}

export function useAudioPlayer({ city, language, useHls, useIcecast, isLive, streamUrl, onError }: UseAudioPlayerOptions) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [volume, setVolume] = useState(80);
  const [playlist, setPlaylist] = useState<AudioSegment[]>([]);
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(-1);

  const wantPlayingRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resumeRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const streamUrlRef = useRef(streamUrl);
  const languageRef = useRef(language);
  const onErrorRef = useRef(onError);
  const useIcecastRef = useRef(useIcecast);
  streamUrlRef.current = streamUrl;
  languageRef.current = language;
  onErrorRef.current = onError;
  useIcecastRef.current = useIcecast;

  const hlsRef = useRef<Hls | null>(null);
  const connectRef = useRef<() => void>(() => {});

  const clearLoadingTimeout = () => {
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
      loadingTimeoutRef.current = null;
    }
  };

  // AbortError — play() so'rovi keyingi load()/pause() bilan bekor qilinganda
  // tashlanadi (masalan tugma tez-tez bosilganda) — haqiqiy xato emas, tost
  // ko'rsatib foydalanuvchini qo'rqitmaymiz.
  const reportPlayError = (err: any) => {
    clearLoadingTimeout();
    setIsLoading(false);
    if (err?.name !== 'AbortError') {
      onErrorRef.current?.(`Audio play xatosi: ${err?.name || err}`);
    }
  };

  const disconnectHls = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (audioRef.current) audioRef.current.src = '';
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (!wantPlayingRef.current) return;
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = setTimeout(() => {
      if (!wantPlayingRef.current) return;
      connectRef.current();
    }, 2000);
  }, []);

  // ── Icecast: uzluksiz MP3 oqim, oddiy <audio src> (past kechikish) ──
  const buildIcecastUrl = useCallback(() => {
    const base = getStreamUrl(languageRef.current, streamUrlRef.current);
    if (!base) return '';
    // ?t= cache bypass (har ulanishда yangi — CDN/brauzer eski oqimni bermasin)
    return `${base}${base.includes('?') ? '&' : '?'}t=${Date.now()}`;
  }, []);

  const connectIcecast = useCallback(() => {
    const audio = audioRef.current;
    const url = buildIcecastUrl();
    if (!audio || !url) {
      clearLoadingTimeout();
      setIsLoading(false);
      if (!url) onErrorRef.current?.('Stream URL topilmadi (radio holati yuklanmagan)');
      return;
    }
    audio.src = url;
    audio.load();
    audio.play().catch(reportPlayError);
  }, [buildIcecastUrl]);

  // ── HLS (MediaMTX) ──
  const connectHls = useCallback(() => {
    const audio = audioRef.current;
    const hlsUrl = getStreamUrl(languageRef.current, streamUrlRef.current);
    if (!audio || !hlsUrl) {
      clearLoadingTimeout();
      setIsLoading(false);
      if (!hlsUrl) onErrorRef.current?.('Stream URL topilmadi (radio holati yuklanmagan)');
      return;
    }

    disconnectHls();

    // Safari/iOS — native HLS qo'llab-quvvatlaydi, hls.js shart emas
    if (audio.canPlayType('application/vnd.apple.mpegurl')) {
      audio.src = hlsUrl;
      audio.play().catch(reportPlayError);
      return;
    }

    if (!Hls.isSupported()) {
      clearLoadingTimeout();
      setIsLoading(false);
      onErrorRef.current?.('Bu brauzer/WebView HLS audio\'ni qo\'llab-quvvatlamaydi (MediaSource yo\'q)');
      return;
    }

    const hls = new Hls();
    hlsRef.current = hls;
    hls.loadSource(hlsUrl);
    hls.attachMedia(audio);

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      audio.play().catch(reportPlayError);
    });

    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (!data.fatal) return;
      setIsPlaying(false);
      onErrorRef.current?.(`HLS xatosi: ${data.type}/${data.details}`);
      scheduleReconnect();
    });
  }, [disconnectHls, scheduleReconnect]);

  const connect = useCallback(() => {
    if (useIcecast) connectIcecast();
    else connectHls();
  }, [useIcecast, connectIcecast, connectHls]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  // Audio element bir marta yaratiladi (playlist/HLS/Icecast bir xil element)
  useEffect(() => {
    const audio = new Audio();
    audio.volume = volume / 100;
    audio.preload = 'none';
    (audio as any).playsInline = true;
    audio.setAttribute('playsinline', 'true');
    audioRef.current = audio;

    const onPlaying = () => {
      clearLoadingTimeout();
      setIsLoading(false);
      setIsPlaying(true);
      // OS'ga bu "haqiqiy" media ekanini bildiradi — lock screen'da boshqaruv
      // ko'rsatadi va ba'zi platformalarda fon rejimida davom etishga
      // ko'proq imkon beradi (odatiy background <audio> ko'pincha tezroq
      // to'xtatiladi, media session'li oqim ancha ishonchli).
      if ('mediaSession' in navigator) {
        try {
          navigator.mediaSession.metadata = new MediaMetadata({
            title: 'Прямой эфир',
            artist: 'INTRA GROUP',
          });
          navigator.mediaSession.playbackState = 'playing';
        } catch { /* eski brauzer — jim o'tkazamiz */ }
      }
    };
    const onPause = () => {
      setIsPlaying(false);
      if ('mediaSession' in navigator) {
        try { navigator.mediaSession.playbackState = 'paused'; } catch {}
      }
      // Tashqi sabab bilan to'xtagan bo'lishi mumkin — masalan chat/studiyaga
      // ovozli xabar yozish uchun getUserMedia() chaqirilganda ba'zi
      // WebView'lar (ayniqsa iOS) butun audio session'ni pauza qiladi va
      // mikrofon bo'shagach o'zi qayta ulanmaydi. Foydalanuvchi hali
      // tinglashni xohlasa (wantPlayingRef hali true — haqiqiy STOP tugmasi
      // buni pauzadan OLDIN false qiladi), mikrofon bo'shagandan keyin
      // jimgina (xatosiz) qayta urinamiz: avval yengil audio.play(),
      // bir necha marta o'tmasa — to'liq qayta ulanish (stream uzilgan
      // bo'lishi ham mumkin).
      if (resumeRetryTimerRef.current) {
        clearTimeout(resumeRetryTimerRef.current);
        resumeRetryTimerRef.current = null;
      }
      if (!wantPlayingRef.current) return;
      let attempts = 0;
      const tryResume = () => {
        resumeRetryTimerRef.current = null;
        if (!wantPlayingRef.current || !audio.paused) return;
        attempts += 1;
        if (attempts <= 3) {
          audio.play().catch(() => {
            resumeRetryTimerRef.current = setTimeout(tryResume, 1200);
          });
        } else {
          connectRef.current();
        }
      };
      resumeRetryTimerRef.current = setTimeout(tryResume, 500);
    };
    const onCanPlay = () => {
      if (wantPlayingRef.current && audio.paused) {
        audio.play().catch(() => {
          clearLoadingTimeout();
          setIsLoading(false);
        });
      }
    };
    const onStreamError = () => {
      clearLoadingTimeout();
      setIsLoading(false);
      setIsPlaying(false);
      // Icecast — oddiy <audio> oqimi, uzilsa hls.js kabi o'z-o'zidan qayta
      // urinmaydi — shu sabab bu yerda qo'lda qayta ulaymiz.
      if (useIcecastRef.current && wantPlayingRef.current) scheduleReconnect();
    };

    audio.addEventListener('playing', onPlaying);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('canplay', onCanPlay);
    audio.addEventListener('error', onStreamError);
    audio.addEventListener('stalled', onStreamError);

    return () => {
      wantPlayingRef.current = false;
      if (resumeRetryTimerRef.current) {
        clearTimeout(resumeRetryTimerRef.current);
        resumeRetryTimerRef.current = null;
      }
      audio.pause();
      audio.src = '';
      clearLoadingTimeout();
      audio.removeEventListener('playing', onPlaying);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('canplay', onCanPlay);
      audio.removeEventListener('error', onStreamError);
      audio.removeEventListener('stalled', onStreamError);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // bir marta yaratiladi

  // Unmount bo'lganda ulanishni yopamiz
  useEffect(() => {
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      disconnectHls();
    };
  }, [disconnectHls]);

  // Playlist yuklash (Icecast/HLS ishlamaganда, segment fallback)
  useEffect(() => {
    if (!useHls && !useIcecast) {
      getPlaylist(city).then(setPlaylist).catch(console.error);
    }
  }, [city, useHls, useIcecast]);

  // Til o'zgarganda — agar playing bo'lsa, yangi til oqimiga o'tamiz
  useEffect(() => {
    if ((!useHls && !useIcecast) || !wantPlayingRef.current) return;
    connect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  // Jonli efir boshlanganda — eski bufer/keshni tashlab, darhol live edge'ga ulanamiz
  const prevIsLiveRef = useRef<boolean | undefined>(isLive);
  useEffect(() => {
    if (prevIsLiveRef.current === false && isLive === true && wantPlayingRef.current) {
      connect();
    }
    prevIsLiveRef.current = isLive;
  }, [isLive, connect]);

  // Volume
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume / 100;
  }, [volume]);

  // Foreground qaytganда tiklash
  useEffect(() => {
    if (!useHls && !useIcecast) return;
    const onVisible = () => {
      if (
        document.visibilityState === 'visible' &&
        wantPlayingRef.current &&
        audioRef.current?.paused
      ) {
        connect();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useHls, useIcecast]);

  const playNextSegment = useCallback(() => {
    if (playlist.length === 0) return;
    const nextIndex = (currentSegmentIndex + 1) % playlist.length;
    const segment = playlist[nextIndex];
    if (audioRef.current && segment) {
      audioRef.current.src = segment.url.startsWith('http')
        ? segment.url
        : `${location.origin}${segment.url}`;
      audioRef.current.play().catch(console.error);
      setCurrentSegmentIndex(nextIndex);
    }
  }, [playlist, currentSegmentIndex]);

  const togglePlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;

    // STOP — wantPlayingRef bilan (React state'dan farqli, sinxron) tekshiramiz:
    // tugma tez-tez bosilganda isPlaying/isLoading hali render bo'lmagan bo'lishi
    // mumkin, shu sabab ikkinchi bosish ham START shoxobchasiga tushib qolib,
    // ikkinchi audio.load() birinchi play() va'dasini bekor qilardi (AbortError).
    if (wantPlayingRef.current || isPlaying || isLoading) {
      wantPlayingRef.current = false;
      clearLoadingTimeout();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (useHls) {
        disconnectHls();
      } else if (useIcecast) {
        audio.pause();
        audio.src = '';
      } else {
        audio.pause();
      }
      setIsLoading(false);
      setIsPlaying(false);
      return;
    }

    // START
    wantPlayingRef.current = true;
    setIsLoading(true);

    // AudioContext resume — Telegram WebView ba'zan audio context'ni bloklaydi.
    // Ba'zi Android WebView'larda resume() promise umuman hal bo'lmasligi mumkin —
    // shu sabab timeout bilan "race" qilamiz, aks holda butun funksiya osilib qoladi.
    try {
      const ctx = new ((window as any).AudioContext || (window as any).webkitAudioContext)();
      if (ctx.state === 'suspended') {
        await Promise.race([
          ctx.resume(),
          new Promise((resolve) => setTimeout(resolve, 1500)),
        ]);
      }
    } catch (_) { /* baribir davom etamiz */ }

    // Volume ishonchli
    audio.muted = false;
    audio.volume = volume / 100;

    // Loading timeout — 12 sekundda ulanmasa, spinner'ni o'chiramiz
    clearLoadingTimeout();
    loadingTimeoutRef.current = setTimeout(() => {
      if (!isPlaying) {
        console.warn('Audio loading timeout');
        setIsLoading(false);
        wantPlayingRef.current = false;
        onErrorRef.current?.('Efirga ulanib bo\'lmadi, qayta urinib ko\'ring');
      }
    }, 12000);

    try {
      if (useIcecast) {
        connectIcecast();
      } else if (useHls) {
        connectHls();
      } else {
        if (!audio.src && playlist.length > 0) {
          playNextSegment();
        } else if (audio.src) {
          await audio.play();
        }
      }
    } catch (e) {
      console.error('togglePlay error:', e);
      clearLoadingTimeout();
      setIsLoading(false);
      wantPlayingRef.current = false;
    }
  }, [isPlaying, isLoading, useHls, useIcecast, connectHls, connectIcecast, disconnectHls, volume, playlist, playNextSegment]);

  const addSegment = useCallback((segment: AudioSegment) => {
    setPlaylist((prev) => [...prev, segment]);
    if (!isPlaying && audioRef.current && (audioRef.current.paused || audioRef.current.ended)) {
      playNextSegment();
    }
  }, [isPlaying, playNextSegment]);

  // Lock screen / bildirishnoma boshqaruvidagi play/pause tugmalari —
  // shu orqali foydalanuvchi ilovani ochmasdan ham eshitishni
  // to'xtatishi/davom ettirishi mumkin.
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.setActionHandler('play', () => { if (!isPlaying) togglePlay(); });
      navigator.mediaSession.setActionHandler('pause', () => { if (isPlaying) togglePlay(); });
    } catch { /* eski brauzer — jim o'tkazamiz */ }
    return () => {
      try {
        navigator.mediaSession.setActionHandler('play', null);
        navigator.mediaSession.setActionHandler('pause', null);
      } catch {}
    };
  }, [togglePlay, isPlaying]);

  return {
    isPlaying,
    isLoading,
    volume,
    setVolume,
    togglePlay,
    addSegment,
    audioRef,
  };
}
