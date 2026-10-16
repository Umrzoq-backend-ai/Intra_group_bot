import { useEffect, useRef, useState, useCallback } from 'react';
import { API_URL } from '../lib/config';
import { authHeaders } from '../lib/auth';
import { useTranslation } from './useTranslation';
import { getDefaultMusic } from '../lib/api';

// Bu hook ilgari GoLiveButton komponenti ichida edi — u yerda holat
// (isLive, MediaRecorder, stream) komponentga bog'liq bo'lgani uchun,
// foydalanuvchi efirdan boshqa bo'limga (masalan chatga) o'tib qaytganda
// EfirScreen qayta mount bo'lardi, isLive qaytadan false'ga tushardi va
// MediaRecorder/stream refsiz qolib ovoz yuborishni to'xtatardi — serverda
// esa broadcast hali ham "band" hisoblanardi. Natijada qaytib kelgan
// vediushiy na "Завершить", na qaytadan "Начать" bosa olmasdi ("busy" xatosi).
//
// Yechim: bu holatni Radio.tsx darajasida ushlab turamiz (u hech qachon
// qayta mount bo'lmaydi), shuning uchun ekranlar orasida almashish
// broadcast'ga umuman ta'sir qilmaydi.
const fmtDuration = (sec: number) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = m.toString().padStart(2, '0');
  const ss = s.toString().padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

export function useLiveBroadcast(city: string, onToast: (message: string) => void) {
  const { t } = useTranslation();
  const [isLive, setIsLive] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [remainingSec, setRemainingSec] = useState<number | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // Pauza payti jimlik o'rniga chaladigan default musiqa — mikrofon oqimi
  // va musiqa faylini bitta Web Audio graph orqali bitta uzluksiz
  // MediaStream'ga aralashtiramiz (gain'lar bilan almashtiramiz), MediaRecorder
  // esa doim shu ARALASH oqimni yozadi. Shu sabab recorder hech qachon
  // qayta ishga tushirilmaydi (yuqoridagi izohdagi cheklov saqlanadi) —
  // faqat qaysi manba eshitilishini gain 0/1 bilan boshqaramiz.
  const audioCtxRef = useRef<AudioContext | null>(null);
  const micGainRef = useRef<GainNode | null>(null);
  const musicGainRef = useRef<GainNode | null>(null);
  const musicElRef = useRef<HTMLAudioElement | null>(null);
  const defaultMusicUrlRef = useRef<string | null>(null);
  const sendChainRef = useRef<Promise<void>>(Promise.resolve());
  const liveRef = useRef(false);
  // Pauza — MediaRecorder'ning o'zini pause()/resume() qilish O'RNIGA shu
  // ref orqali chunk yuborishni gate qilamiz (pastda batafsil izoh bor).
  const isPausedRef = useRef(false);
  const expiresAtRef = useRef<number | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedStartRef = useRef<number | null>(null);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onToastRef = useRef(onToast);
  onToastRef.current = onToast;
  // Screen Wake Lock — efir vaqtida ekran avtomatik o'chib/qulflanib
  // qolmasin (bu ko'pincha getUserMedia oqimini WebView darajasida
  // to'xtatib qo'yadi). Chinakam background'ga (boshqa ilovaga) o'tishni
  // bu API oldini ololmaydi — faqat ekran taймaut/qulflanishidan saqlaydi.
  const wakeLockRef = useRef<any>(null);

  const releaseWakeLock = () => {
    try { wakeLockRef.current?.release?.(); } catch {}
    wakeLockRef.current = null;
  };

  const acquireWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
      }
    } catch {
      // Qo'llab-quvvatlanmasa yoki ruxsat bo'lmasa — efirning o'ziga
      // ta'sir qilmasligi kerak, jim o'tkazamiz.
    }
  };

  const stopCountdown = () => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setRemainingSec(null);
    expiresAtRef.current = null;
  };

  // Umumiy efirda bo'lgan vaqt — slot muddatidan mustaqil, faqat
  // "chiqdi → tugatdi" oralig'ini sanaydi. Slot bo'lmagan (masalan admin)
  // holatda ekranda shu son ko'rsatiladi (aks holda hamisha "00:00" statik
  // turardi), efir tugaganda esa umumiy davomiylik toast orqali ko'rsatiladi.
  const stopElapsedTimer = () => {
    if (elapsedTimerRef.current) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
  };

  const startElapsedTimer = () => {
    elapsedStartRef.current = Date.now();
    setElapsedSec(0);
    stopElapsedTimer();
    elapsedTimerRef.current = setInterval(() => {
      if (elapsedStartRef.current) {
        setElapsedSec(Math.floor((Date.now() - elapsedStartRef.current) / 1000));
      }
    }, 1000);
  };

  // Pauza-musiqa Web Audio graph'ini butunlay tozalaydi — efir tugaganda
  // chaqiriladi (mikrofon stream'i esa alohida, pastda o'zicha to'xtatiladi).
  const teardownPauseMusic = () => {
    try { musicElRef.current?.pause(); } catch {}
    musicElRef.current = null;
    try { audioCtxRef.current?.close(); } catch {}
    audioCtxRef.current = null;
    micGainRef.current = null;
    musicGainRef.current = null;
  };

  const stopBroadcast = useCallback(async () => {
    const finalElapsed = elapsedStartRef.current
      ? Math.floor((Date.now() - elapsedStartRef.current) / 1000)
      : 0;
    liveRef.current = false;
    isPausedRef.current = false;
    setIsLive(false);
    setIsPaused(false);
    setShareUrl(null);
    stopCountdown();
    stopElapsedTimer();
    elapsedStartRef.current = null;
    setElapsedSec(0);
    releaseWakeLock();
    teardownPauseMusic();
    try { recorderRef.current?.state !== 'inactive' && recorderRef.current?.stop(); } catch {}
    try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
    recorderRef.current = null;
    streamRef.current = null;
    try {
      await fetch(`${API_URL}/radio/${city}/broadcast/stop`, {
        method: 'POST',
        headers: authHeaders(),
      });
    } catch {}
    if (finalElapsed > 0) {
      onToastRef.current(t('live_duration_toast').replace('{time}', fmtDuration(finalElapsed)));
    }
  }, [city, t]);

  const startCountdown = (expiresAtIso: string) => {
    expiresAtRef.current = new Date(expiresAtIso).getTime();
    const tick = () => {
      if (!expiresAtRef.current) return;
      const left = Math.max(0, Math.round((expiresAtRef.current - Date.now()) / 1000));
      setRemainingSec(left);
      if (left <= 0) {
        onToastRef.current('⏱ ' + t('slot_time_over'));
        stopBroadcast();
      }
    };
    tick();
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    countdownTimerRef.current = setInterval(tick, 1000);
  };

  // Radio.tsx umuman qayta mount bo'lmaydi, lekin sahifa to'liq yopilsa
  // (tab yopish/ilova tark etish) — brauzer resurslarni o'zi tozalaydi.
  useEffect(() => () => { stopCountdown(); stopElapsedTimer(); releaseWakeLock(); }, []);

  // Wake Lock spetsifikatsiya bo'yicha hujjat "hidden" bo'lganda o'zi
  // bekor qilinadi (masalan qisqa vaqtga boshqa oynaga qaralganda) — efir
  // hali davom etayotgan bo'lsa, qaytib kelganda qayta so'raymiz.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && liveRef.current) acquireWakeLock();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  const sendChunk = (blob: Blob) => {
    sendChainRef.current = sendChainRef.current
      .then(async () => {
        if (!liveRef.current) return;
        const buf = await blob.arrayBuffer();
        const resp = await fetch(`${API_URL}/radio/${city}/broadcast/chunk`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream', ...authHeaders() },
          body: buf,
        });
        if (!resp.ok && liveRef.current) {
          onToastRef.current(t('send_error'));
          await stopBroadcast();
        }
      })
      .catch(async () => {
        if (liveRef.current) {
          onToastRef.current(t('send_error'));
          await stopBroadcast();
        }
      });
  };

function getSupportedAudioMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) {
    return undefined;
  }
  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
    'audio/aac',
  ];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return undefined;
}

  const startRecorder = (stream: MediaStream) => {
    // MUAMMO (topilgan): MediaRecorder.pause()/resume() ba'zi Telegram
    // WebView'larda (ayniqsa iOS) resume()dan keyin yangi WebM
    // init-segment/klaster bilan boshlaydi — bu serverda ffmpeg'ga uzatilib
    // turgan UZLUKSIZ webm oqimini buzadi, ffmpeg pipe o'ladi va keyingi
    // chunk'lar "Feed failed" bilan rad etiladi → sendChunk xato ko'rib
    // avtomatik stopBroadcast() chaqiradi. Foydalanuvchiga bu "pauzadan
    // keyin efir tugab qoladi, va pauzani faqat bir marta bosish mumkin"
    // bo'lib ko'rinadi. Yechim: recorder'ni HECH QACHON pause/resume
    // qilmaymiz — u butun efir davomida uzluksiz "recording" holatda
    // qoladi (ffmpeg oqimi hech qachon uzilmaydi), pauza esa faqat
    // isPausedRef orqali — shu payt kelgan chunk'larni serverga
    // YUBORMASDAN tashlab yuboramiz (mikrofon "jim" bo'lish effekti xuddi
    // shunday saqlanadi, lekin cheksiz marta ishonchli ishlaydi).
    const onData = (e: BlobEvent) => {
      if (e.data.size > 0 && !isPausedRef.current) sendChunk(e.data);
    };
    const mimeType = getSupportedAudioMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    } catch {
      recorder = new MediaRecorder(stream);
    }
    recorderRef.current = recorder;
    recorder.ondataavailable = onData;
    recorder.start(500);
  };


  // Efirni vaqtincha to'xtatish — masalan vediushiy bir necha daqiqaga
  // chetlashishi kerak bo'lsa. Recorder o'zi hech qachon to'xtamaydi —
  // faqat chunk yuborish to'xtaydi/davom etadi (yuqoridagi izohga qarang),
  // /broadcast/stop chaqirilmaydi (sessiya, slot va countdown butunlay
  // ochiq qoladi). Cheksiz marta, istalgan vaqt oralig'ida bosish mumkin.
  //
  // Jimlik o'rniga: agar default musiqa o'rnatilgan bo'lsa (getDefaultMusic),
  // gain'larni almashtiramiz — mikrofon 0, musiqa 1 (va aksincha resume'da).
  // Recorder shu bilan doim BITTA (aralash) stream'ni yozishda davom etadi.
  const togglePause = useCallback(() => {
    if (!liveRef.current) return;
    isPausedRef.current = !isPausedRef.current;
    setIsPaused(isPausedRef.current);
    const ctx = audioCtxRef.current;
    const micGain = micGainRef.current;
    const musicGain = musicGainRef.current;
    const musicEl = musicElRef.current;
    if (isPausedRef.current) {
      if (micGain && ctx) micGain.gain.setValueAtTime(0, ctx.currentTime);
      if (musicGain && musicEl && defaultMusicUrlRef.current) {
        musicGain.gain.setValueAtTime(1, ctx!.currentTime);
        musicEl.currentTime = 0;
        musicEl.play().catch(() => {});
      }
    } else {
      if (micGain && ctx) micGain.gain.setValueAtTime(1, ctx.currentTime);
      if (musicGain && ctx) musicGain.gain.setValueAtTime(0, ctx.currentTime);
      musicEl?.pause();
    }
  }, []);

  const toggleLive = useCallback(async () => {
    if (liveRef.current) {
      await stopBroadcast();
      return;
    }

    try {
      const tgApp = (window as any).Telegram?.WebApp;
      if (tgApp?.requestMicrophoneAccess) {
        const granted: boolean = await Promise.race([
          new Promise<boolean>(resolve => {
            tgApp.requestMicrophoneAccess((ok: boolean) => resolve(ok));
          }),
          new Promise<boolean>(resolve => setTimeout(() => resolve(true), 5000)),
        ]);
        if (!granted) {
          onToastRef.current(t('toast_mic_denied'));
          return;
        }
      }

      const resp = await fetch(`${API_URL}/radio/${city}/broadcast/start`, {
        method: 'POST',
        headers: authHeaders(),
      });
      if (!resp.ok) {
        onToastRef.current(t('send_error'));
        return;
      }
      const data = await resp.json();
      if (data.status === 'busy') {
        onToastRef.current('⚠️ Broadcast busy');
        return;
      }
      if (data.status === 'unavailable') {
        onToastRef.current('🔇 MediaMTX required');
        return;
      }
      if (data.status === 'no_slot') {
        onToastRef.current('🚫 ' + t('no_active_slot'));
        return;
      }

      // Bu yerga yetganda server sessiyasi ALLAQACHON ochilgan
      // (broadcast.open_session — shahar "band" deb belgilangan). Agar
      // brauzer mikrofon ruxsatini rad etsa, shu sessiyani albatta
      // yopishimiz kerak — aks holda keyingi urinish stale-timeout
      // (15s) tugaguncha "Broadcast busy" bilan ishlamay qolardi.
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (micErr) {
        fetch(`${API_URL}/radio/${city}/broadcast/stop`, {
          method: 'POST',
          headers: authHeaders(),
        }).catch(() => {});
        console.error('[GoLive] mic denied after session opened:', micErr);
        onToastRef.current(t('toast_mic_denied'));
        return;
      }
      streamRef.current = stream;
      liveRef.current = true;
      isPausedRef.current = false;
      setIsLive(true);
      setIsPaused(false);
      setShareUrl(data.share_url || null);
      onToastRef.current('🔴 LIVE!');

      // Pauza-musiqa uchun default trek bo'lsa — mikrofon va musiqani bitta
      // Web Audio graph orqali aralashtirib, ARALASH oqimni yozamiz (pastda
      // togglePause shu gain'larni almashtiradi). Bo'lmasa — xom mikrofon
      // oqimini to'g'ridan-to'g'ri yozamiz, xuddi avvalgidek (pauza jim bo'ladi).
      let recordStream = stream;
      try {
        const music = await getDefaultMusic();
        if (music.url) {
          defaultMusicUrlRef.current = music.url;
          const ctx = new AudioContext();
          ctx.resume().catch(() => {});
          const musicEl = new Audio(music.url);
          musicEl.loop = true;
          musicEl.crossOrigin = 'anonymous';
          const micSource = ctx.createMediaStreamSource(stream);
          const micGain = ctx.createGain();
          micGain.gain.value = 1;
          micSource.connect(micGain);
          const musicSource = ctx.createMediaElementSource(musicEl);
          const musicGain = ctx.createGain();
          musicGain.gain.value = 0;
          musicSource.connect(musicGain);
          const dest = ctx.createMediaStreamDestination();
          micGain.connect(dest);
          musicGain.connect(dest);
          audioCtxRef.current = ctx;
          micGainRef.current = micGain;
          musicGainRef.current = musicGain;
          musicElRef.current = musicEl;
          recordStream = dest.stream;
        } else {
          defaultMusicUrlRef.current = null;
        }
      } catch (musicErr) {
        // Pauza-musiqa ixtiyoriy — sozlanmasa/yuklanmasa ham efirning
        // o'ziga ta'sir qilmasligi kerak, xom mikrofon bilan davom etamiz.
        console.warn('[GoLive] pause-music setup failed:', musicErr);
        defaultMusicUrlRef.current = null;
      }

      startRecorder(recordStream);
      startElapsedTimer();
      if (data.expires_at) startCountdown(data.expires_at);
      acquireWakeLock();
    } catch (err: any) {
      console.error('[GoLive] setup error:', err?.name, err?.message);
      onToastRef.current(t('toast_mic_denied'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, stopBroadcast]);

  return { isLive, remainingSec, elapsedSec, toggleLive, isPaused, togglePause, shareUrl };
}
