import { useState, useEffect, useCallback, useRef, type Dispatch, type SetStateAction } from 'react';
import { Send, X, Loader, MessageSquare, Activity, Users, Sparkles, Square, Check, Mic, Link2 } from 'lucide-react';
import { ChatMessage as ChatMessageComponent } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { RoomsButton } from './RoomsScreen';
import { Visualizer } from './Visualizer';
import { GoLiveButton, type SlotHint } from './GoLiveButton';
import { GlitchText } from '../ui/GlitchText';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useAudioPlayer } from '../../hooks/useAudioPlayer';
import { useToast } from '../../hooks/useToast';
import { useTelegramBackButton } from '../../hooks/useTelegramBackButton';
import { Toast } from '../ui/Toast';
import { FullScreenModal } from '../ui/FullScreenModal';
import {
  getRadioStatus, getChatHistory, getMySlots, sendOpinionVoice, sendChatMessage, sendVoiceMessage,
  requestLiveMic, getLiveMicRequests, approveLiveMicRequest, rejectLiveMicRequest, getMyMicRequest,
  type BroadcastSlot, type LiveMicRequest,
} from '../../lib/api';
import { DEFAULT_CITY, LS_CITY } from '../../lib/config';
import { hapticImpact } from '../../lib/telegram';
import { useTranslation } from '../../hooks/useTranslation';
import type { User, RadioStatus, ChatMessage, Screen } from '../../types';

interface PendingChatSend {
  tempId: number;
  kind: 'text' | 'voice';
  content: string;
  blobUrl?: string;
}

interface EfirScreenProps {
  user: User | null;
  onPointsUpdate: (points: number) => void;
  onNavigate?: (screen: Screen) => void;
  // Efir holati Radio.tsx darajasida saqlanadi (useLiveBroadcast) —
  // shu ekran boshqasiga almashtirilib qaytilganda ham efir uzilmaydi.
  isLive: boolean;
  liveRemainingSec: number | null;
  // Efirga chiqqandan beri o'tgan vaqt (slot bo'lmagan holatda — masalan
  // admin — countdown yo'q, shu son o'rniga hisoblanadi).
  liveElapsedSec?: number;
  onToggleLive: () => void;
  // Efirni vaqtincha to'xtatish (mikrofon jim, sessiya ochiq qoladi).
  isLivePaused?: boolean;
  onToggleLivePause?: () => void;
  // Shu jonli efir sessiyasi uchun bir martalik ulashiladigan link
  // (broadcast/start javobidan) — faqat isLive paytida bor.
  liveShareUrl?: string | null;
  // Tinglash (audio pleer) holati ham Radio.tsx darajasida — boshqa tabga
  // o'tilganda ham <audio> elementi uzilmasligi uchun. Shu ekran faqat
  // ko'rsatadi/boshqaradi, lekin o'zi yaratmaydi.
  radioStatus: RadioStatus | null;
  setRadioStatus: Dispatch<SetStateAction<RadioStatus | null>>;
  audioPlayer: ReturnType<typeof useAudioPlayer>;
}

export function EfirScreen({ user, onPointsUpdate, onNavigate, isLive, liveRemainingSec, liveElapsedSec, onToggleLive, isLivePaused, onToggleLivePause, liveShareUrl, radioStatus, setRadioStatus, audioPlayer }: EfirScreenProps) {
  const { t, lang } = useTranslation();
  const { message, variant: toastVariant, showToast } = useToast();
  const [city] = useState(localStorage.getItem(LS_CITY) || DEFAULT_CITY);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // O'zimiz optimistik qo'shgan (hali serverdan tasdiqlanmagan) chat
  // xabarlari — asosiy chat ekranidagi bilan bir xil 1/2 galochka mexanizmi.
  const pendingChatRef = useRef<PendingChatSend[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(true);
  const [showChatModal, setShowChatModal] = useState(false);
  const [showStreamModal, setShowStreamModal] = useState(false);
  const [showStudioModal, setShowStudioModal] = useState(false);
  const [studioText, setStudioText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [pendingVoice, setPendingVoice] = useState<Blob | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Vediushiyning eng dolzarb bron qilingan sloti — "ЗАПИСАЛСЯ Я ИЛИ НЕТ"
  // savoliga tugma rangi/podsказka orqali javob berish uchun (faqat
  // doverenniy/admin uchun kerak — ular efirga chiqa oladi).
  const canGoLive = user?.role === 'admin' || user?.role === 'moderator' || user?.role === 'doverenniy';
  const [mySlot, setMySlot] = useState<BroadcastSlot | null>(null);
  const [, forceTick] = useState(0);

  // Jonli efirda so'z olish (Live Mic request / Hand raise) holatlari
  const [myMicStatus, setMyMicStatus] = useState<'none' | 'pending' | 'approved' | 'rejected'>('none');
  const [submittingMicRequest, setSubmittingMicRequest] = useState(false);
  const [pendingMicRequests, setPendingMicRequests] = useState<LiveMicRequest[]>([]);
  const [showCallersModal, setShowCallersModal] = useState(false);

  useEffect(() => {
    if (canGoLive) {
      getLiveMicRequests(city).then(setPendingMicRequests).catch(() => {});
    } else {
      getMyMicRequest(city).then((res) => setMyMicStatus(res.status)).catch(() => {});
    }
  }, [city, canGoLive]);

  const handleRequestMic = async () => {
    setSubmittingMicRequest(true);
    try {
      await requestLiveMic(city);
      setMyMicStatus('pending');
      showToast('✋ Запрос отправлен ведущему эфира!');
    } catch (e: any) {
      showToast(e.message || 'Ошибка запроса', 'error');
    } finally {
      setSubmittingMicRequest(false);
    }
  };

  const handleApproveCaller = async (requestId: number) => {
    try {
      await approveLiveMicRequest(city, requestId);
      setPendingMicRequests((prev) => prev.filter((r) => r.id !== requestId));
      showToast('✅ Участник допущен в эфир!');
    } catch (e: any) {
      showToast(e.message || 'Ошибка', 'error');
    }
  };

  const handleRejectCaller = async (requestId: number) => {
    try {
      await rejectLiveMicRequest(city, requestId);
      setPendingMicRequests((prev) => prev.filter((r) => r.id !== requestId));
      showToast('Запрос отклонён');
    } catch (e: any) {
      showToast(e.message || 'Ошибка', 'error');
    }
  };

  // O'zi efirga chiqqanda — agar oldin tinglab turgan bo'lsa, pleer
  // avtomatik to'xtaydi (aks holda o'z ovozini eshitib qoladi). Efirda
  // ekan pastdagi play tugmasi ham butunlay o'chirilgan (pastroqda).
  useEffect(() => {
    if (isLive && audioPlayer.isPlaying) {
      audioPlayer.togglePlay();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLive]);

  useEffect(() => {
    if (!canGoLive) return;
    let cancelled = false;
    const load = () => {
      getMySlots().then((slots) => {
        if (cancelled) return;
        const now = Date.now();
        let best: BroadcastSlot | null = null;
        let bestDiff = Infinity;
        for (const s of slots) {
          if (s.status !== 'scheduled' && s.status !== 'live') continue;
          const start = new Date(s.scheduled_at).getTime();
          const end = start + s.duration_min * 60000;
          if (now < end) {
            const diff = Math.abs(start - now);
            // Hozir faol (start<=now<end) bo'lgan slot doim ustuvor;
            // aks holda eng yaqin kelajakdagisini tanlaymiz.
            const active = now >= start && now < end;
            if (active) { best = s; bestDiff = -1; break; }
            if (diff < bestDiff) { best = s; bestDiff = diff; }
          }
        }
        setMySlot(best);
      }).catch(() => {});
    };
    load();
    const interval = setInterval(load, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [canGoLive]);

  // Podsказka har soniyada yangilanib tursin (countdown/"hozir mumkin" o'tishi).
  useEffect(() => {
    if (!canGoLive) return;
    const t = setInterval(() => forceTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [canGoLive]);

  const slotHint: SlotHint | null = (() => {
    if (!mySlot) return null;
    const start = new Date(mySlot.scheduled_at).getTime();
    const end = start + mySlot.duration_min * 60000;
    const now = Date.now();
    const ready = now >= start && now < end;
    if (ready) return { ready: true, text: t('slot_ready_now') };
    const time = new Date(mySlot.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return { ready: false, text: t('slot_starts_at').replace('{title}', mySlot.title).replace('{time}', time) };
  })();

  const { send: wsSend } = useWebSocket({ city, onMessage: handleWSMessage });

  // Telegram'ning tabiiy "orqaga" tugmasi — DOM ichidagi tugmalardan farqli
  // o'laroq, uni Telegram'ning o'zi chizadi va boshqaradi, shuning uchun
  // ilova tepasidagi native "Закрыть"/menyu paneli bilan hech qachon
  // to'qnashmaydi (eski klientlarda mavjud bo'lmasa — jim o'tkazib
  // yuboriladi, pastdagi DOM tugmasi fallback bo'ladi).
  useTelegramBackButton(showChatModal, () => setShowChatModal(false));
  useTelegramBackButton(showStreamModal, () => setShowStreamModal(false));

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        await Promise.all([
          getRadioStatus(city).then(setRadioStatus).catch(console.error),
          getChatHistory(city).then(msgs => {
            // id bo'yicha dedup (bir xil xabarlar bo'lmasin)
            const unique = msgs.filter((m, i, arr) => arr.findIndex(x => x.id === m.id) === i);
            setMessages(unique);
          }).catch(console.error),
        ]);
      } finally {
        setLoading(false);
      }
    }
    loadData();
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [city]);

  function handleWSMessage(wsMessage: { type: string; data?: any }) {
    if (!wsMessage.data) return;
    switch (wsMessage.type) {
      case 'chat':
        setMessages(prev => {
          // Bir xil id li xabar allaqachon bor bo'lsa qo'shmaymiz (WS reconnect duplikatlari)
          const newMsg = wsMessage.data;
          if (newMsg?.id && prev.some(m => m.id === newMsg.id)) return prev;

          // O'zimiz optimistik qo'shgan yozuv bo'lsa — o'sha bilan almashtiramiz
          // (dublikat qo'shmaymiz, 2-galochka).
          const kind = newMsg.message_type === 'voice' ? 'voice' : 'text';
          const pendingIdx = pendingChatRef.current.findIndex(
            (p) => p.kind === kind && (kind === 'voice' || p.content === (newMsg.message || ''))
          );
          if (pendingIdx !== -1) {
            const { tempId, blobUrl } = pendingChatRef.current[pendingIdx];
            pendingChatRef.current.splice(pendingIdx, 1);
            if (blobUrl) URL.revokeObjectURL(blobUrl);
            return prev.map((m) => (m.id === tempId ? { ...newMsg, status: 'delivered' as const } : m));
          }
          return [...prev, newMsg];
        });
        break;
      case 'radio_status':
      case 'presence':
        setRadioStatus(wsMessage.data.radio || wsMessage.data);
        break;
      case 'new_segment':
        if (wsMessage.data.url) audioPlayer.addSegment(wsMessage.data);
        if (wsMessage.data.is_live !== undefined)
          setRadioStatus(prev => prev ? { ...prev, ...wsMessage.data } : null);
        break;
      case 'studio_ack':
        onPointsUpdate(wsMessage.data.points);
        break;
      case 'limit_exceeded':
        onPointsUpdate(wsMessage.data.points);
        showToast(t('toast_limit'), 'error');
        break;
      case 'studio_denied':
        showToast(t('studio_denied_role'), 'error');
        break;
      case 'balance':
        onPointsUpdate(wsMessage.data.points);
        break;
      case 'mic_request':
        if (canGoLive) {
          setPendingMicRequests((prev) => {
            if (prev.some((r) => r.id === wsMessage.data.id)) return prev;
            return [...prev, wsMessage.data];
          });
          showToast(`✋ ${wsMessage.data.display_name} просит микрофон!`);
        }
        break;
      case 'mic_approved':
        if (user && (wsMessage.data.user_id === user.id || wsMessage.data.telegram_id === user.telegram_id)) {
          setMyMicStatus('approved');
          showToast('🎉 Вам дали слово в эфире! Включите микрофон');
        }
        setPendingMicRequests((prev) => prev.filter((r) => r.id !== wsMessage.data.request_id));
        break;
      case 'mic_rejected':
        if (user && wsMessage.data.user_id === user.id) {
          setMyMicStatus('rejected');
          showToast('Запрос в эфир отклонён', 'error');
        }
        setPendingMicRequests((prev) => prev.filter((r) => r.id !== wsMessage.data.request_id));
        break;
    }
  }

  const handleSendMessage = useCallback(async (msg: string, destination: 'chat' | 'studio') => {
    // Faqat "chat" uchun darhol ko'rsatamiz — asosiy chat ekrani bilan bir xil.
    let tempId: number | null = null;
    if (destination === 'chat') {
      tempId = -(Date.now() * 1000 + Math.floor(Math.random() * 1000));
      pendingChatRef.current.push({ tempId, kind: 'text', content: msg });
      setMessages((prev) => [
        ...prev,
        {
          id: tempId!,
          username: user?.username ?? null,
          display_name: user?.display_name || user?.full_name || null,
          message: msg,
          message_type: 'text',
          voice_url: null,
          created_at: new Date().toISOString(),
          status: 'sending',
        },
      ]);
    }
    const markSent = () => {
      if (tempId === null) return;
      const id = tempId;
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, status: 'sent' as const } : m)));
    };
    const rollback = () => {
      if (tempId === null) return;
      const id = tempId;
      pendingChatRef.current = pendingChatRef.current.filter((p) => p.tempId !== id);
      setMessages((prev) => prev.filter((m) => m.id !== id));
    };

    // 1-urinish: WebSocket (real-time). Ulanmagan bo'lsa — HTTP fallback.
    const sentViaWs = wsSend({ type: destination, message: msg, lang });
    if (sentViaWs) {
      markSent();
      return;
    }

    // WS yopiq — HTTP orqali yuboramiz (xabar yo'qolmasin)
    try {
      const res: any = await sendChatMessage('global', msg);
      if (res?.points !== undefined) onPointsUpdate(Number(res.points));
      // Tarixni yangilash (WS yo'q, shuning uchun qo'lda qo'shamiz)
      getChatHistory(city).then(msgs => {
        const unique = msgs.filter((m, i, arr) => arr.findIndex(x => x.id === m.id) === i);
        setMessages(unique);
      }).catch(() => {});
    } catch (e: any) {
      rollback();
      if (e?.status === 402) showToast(t('toast_limit'), 'error');
      else showToast(t('send_error'), 'error');
    }
  }, [wsSend, lang, onPointsUpdate, showToast, t, city, user]);

  const handleSendVoiceToChat = useCallback(async (blob: Blob) => {
    const tempId = -(Date.now() * 1000 + Math.floor(Math.random() * 1000));
    const blobUrl = URL.createObjectURL(blob);
    pendingChatRef.current.push({ tempId, kind: 'voice', content: '', blobUrl });
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        username: user?.username ?? null,
        display_name: user?.display_name || user?.full_name || null,
        message: '',
        message_type: 'voice',
        voice_url: blobUrl,
        created_at: new Date().toISOString(),
        status: 'sending',
      },
    ]);

    try {
      const res: any = await sendVoiceMessage(city, blob, 'chat', lang);
      if (res?.points !== undefined) onPointsUpdate(Number(res.points));
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: 'sent' as const } : m)));
    } catch (e: any) {
      pendingChatRef.current = pendingChatRef.current.filter((p) => p.tempId !== tempId);
      URL.revokeObjectURL(blobUrl);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      if (e?.status === 402) {
        const data = await e.response?.json().catch(() => ({}));
        if (data?.detail?.points !== undefined) onPointsUpdate(Number(data.detail.points));
        showToast(t('toast_limit'), 'error');
      } else {
        showToast(t('send_error'), 'error');
      }
    }
  }, [city, lang, onPointsUpdate, showToast, t, user]);

  // Golosovoe mikrofon tugmasi — bosilsa yozib boshlaydi, yana bosilsa
  // to'xtatadi. Darhol yubormaydi: yozilgan ovoz "ОТПРАВИТЬ" tugmasi
  // bosilguncha kutib turadi (pendingVoice).
  const handleVoiceMessage = async () => {
    if (isRecording && mediaRecorderRef.current) {
      hapticImpact('medium');
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      return;
    }
    if (isLive) {
      showToast(t('toast_mic_live'));
      return;
    }
    try {
      // Telegram WebApp mikrofon ruxsati
      const tgApp = (window as any).Telegram?.WebApp;
      if (tgApp?.requestMicrophoneAccess) {
        const granted: boolean = await new Promise(resolve => {
          tgApp.requestMicrophoneAccess((ok: boolean) => resolve(ok));
        });
        if (!granted) {
          showToast('Микрофон рұқсаты берілмеді', 'error');
          return;
        }
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      mediaRecorderRef.current = rec;
      audioChunksRef.current = [];
      rec.ondataavailable = (e) => audioChunksRef.current.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        if (blob.size < 800) { showToast(t('toast_short'), 'error'); return; }
        setPendingVoice(blob);
        showToast(t('voice_ready'));
      };
      rec.start();
      setIsRecording(true);
      hapticImpact('light');
    } catch (err: any) {
      console.error('Mic error:', err);
      if (err?.name === 'NotAllowedError') {
        showToast('Микрофон рұқсаты жоқ', 'error');
      } else {
        showToast(t('toast_mic_denied'), 'error');
      }
    }
  };

  const discardPendingVoice = () => setPendingVoice(null);

  const handleCopyLiveLink = async () => {
    if (!liveShareUrl) return;
    try {
      await navigator.clipboard.writeText(liveShareUrl);
      hapticImpact('light');
      showToast('🔗 Ссылка скопирована');
    } catch {
      showToast('❌ Не удалось скопировать', 'error');
    }
  };

  // "ОТПРАВИТЬ" tugmasi: yozilgan (hali yuborilmagan) ovoz bo'lsa — studiyaga
  // shuni yuboradi; bo'lmasa — matn kiritish modalini ochadi (eski xatti-harakat).
  const handleSendToStudio = async () => {
    if (pendingVoice) {
      const blob = pendingVoice;
      setPendingVoice(null);
      try {
        const res = await sendOpinionVoice(blob);
        if (res?.points !== undefined) onPointsUpdate(Number(res.points));
      } catch (err: any) {
        if (err.status === 403) showToast(t('studio_denied_role'), 'error');
        else if (err.status === 402) showToast(t('toast_limit'), 'error');
        else showToast('⚠️', 'error');
      }
      return;
    }
    setStudioText('');
    setShowStudioModal(true);
  };

  // Chat modalni ochish — har ochilganda tarixni yangilaymiz
  const openChat = useCallback(() => {
    setShowChatModal(true);
    getChatHistory(city).then(msgs => {
      const unique = msgs.filter((m, i, arr) => arr.findIndex(x => x.id === m.id) === i);
      setMessages(unique);
    }).catch(() => {});
  }, [city]);

  const submitStudioMessage = () => {
    const msg = studioText.trim();
    if (msg) handleSendMessage(msg, 'studio');
    setShowStudioModal(false);
    setStudioText('');
  };

  const level = user?.level || 1;
  const broadcasterName = radioStatus?.is_live
    ? radioStatus.broadcaster_type === 'doverenniy'
      ? radioStatus.broadcaster_name || '🔴 LIVE'
      : t('ai_host')
    : t('activation');

  const formatTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  // Waveform for stream modal
  const waveformBars = [3,5,8,12,17,22,28,32,35,32,28,22,17,12,8,5,3];

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader className="w-10 h-10 text-[#27d9f7] animate-spin" />
        <p className="text-xs text-[#859397] font-mono tracking-widest uppercase">Загрузка эфира...</p>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col relative select-none">

      {canGoLive && isLive && !isLivePaused && (
        <div className="absolute top-2 right-4 z-20 flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#ef4444]/20 border border-[#ef4444]/50 shadow-[0_0_15px_rgba(239,68,68,0.4)]">
          <span className="w-2 h-2 rounded-full bg-[#ef4444] animate-ping" />
          <span className="text-[10px] font-extrabold tracking-wider text-[#ef4444] uppercase font-['Sora']">В ЭФИРЕ</span>
        </div>
      )}

      {/* ── УРОВЕНЬ / ПОТОК REAL TIME ── */}
      <div className="text-center pt-1 pb-1.5 flex flex-col items-center gap-1">
        <div className="inline-flex items-center gap-2 px-3 py-0.5 rounded-full bg-[rgba(39,217,247,0.08)] border border-[rgba(39,217,247,0.2)]">
          <span className="text-[10px] font-bold tracking-[2px] text-[#859397] uppercase">УРОВЕНЬ {level}</span>
          <span className="w-1 h-1 rounded-full bg-[#27d9f7]" />
          <span className="text-[10px] font-extrabold tracking-[2px] text-[#27d9f7] uppercase font-['Sora']">ПОТОК REAL TIME</span>
        </div>
        {/* Listeners pill */}
        <div className="flex items-center gap-1.5 text-[#859397] text-[11px] font-medium">
          <Users className="w-3.5 h-3.5 text-[#27d9f7]" />
          <span className="font-mono font-bold text-[#dfe2f1]">{radioStatus?.listeners_count || 0}</span>
          <span>слушателей</span>
        </div>
      </div>

      {/* ── КОЛЬЦО + VISUALIZER (кнопка play) ── */}
      <div className="flex items-center justify-center py-1">
        <button
          onClick={isLive ? undefined : audioPlayer.togglePlay}
          disabled={isLive}
          className="relative flex items-center justify-center active:scale-95 transition-transform duration-200 disabled:active:scale-100 disabled:cursor-default"
          aria-label={isLive ? 'own-broadcast' : (audioPlayer.isPlaying ? 'pause' : 'play')}
        >
          <Visualizer isPlaying={audioPlayer.isPlaying && !isLive} size={190} />
          {isLive ? (
            <span
              className="absolute z-10 w-11 h-11 rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(39,217,247,0.5)]"
              style={{ background: 'rgba(15, 19, 30, 0.85)', backdropFilter: 'blur(8px)', border: '1.5px solid rgba(39, 217, 247, 0.5)' }}
            >
              <Mic className="w-5 h-5 text-[#27d9f7]" />
            </span>
          ) : audioPlayer.isLoading ? (
            <span
              className="absolute z-10 w-11 h-11 rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(39,217,247,0.5)]"
              style={{ background: 'rgba(15, 19, 30, 0.85)', backdropFilter: 'blur(8px)', border: '1.5px solid rgba(39, 217, 247, 0.5)' }}
            >
              <Loader className="w-5 h-5 text-[#27d9f7] animate-spin" />
            </span>
          ) : !audioPlayer.isPlaying ? (
            <span
              className="absolute z-10 w-11 h-11 rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(39,217,247,0.5)]"
              style={{ background: 'rgba(15, 19, 30, 0.85)', backdropFilter: 'blur(8px)', border: '1.5px solid rgba(39, 217, 247, 0.5)' }}
            >
              <svg className="w-5 h-5 text-[#27d9f7] ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
          ) : (
            <span
              className="absolute z-10 w-11 h-11 rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(39,217,247,0.5)]"
              style={{ background: 'rgba(15, 19, 30, 0.85)', backdropFilter: 'blur(8px)', border: '1.5px solid rgba(39, 217, 247, 0.5)' }}
            >
              <Square className="w-4 h-4 text-[#27d9f7]" fill="currentColor" />
            </span>
          )}
        </button>
      </div>

      {/* ── ID + ЗАГОЛОВОК ── */}
      <div className="text-center px-4 mt-1 mb-3">
        <div className="text-[10px] text-[#859397] font-mono tracking-widest mb-1 opacity-80">
          ID: {user?.telegram_id || '-----'}
        </div>
        <h2 className="text-[18px] sm:text-[20px] font-extrabold tracking-wide uppercase bg-gradient-to-r from-[#c2f3ff] via-[#27d9f7] to-[#98cbff] bg-clip-text text-transparent font-['Sora'] drop-shadow-[0_0_12px_rgba(39,217,247,0.3)]">
          {radioStatus?.is_live ? 'Активация переосмысления' : 'Ожидание потока'}
        </h2>
        <div className="text-[11px] font-semibold text-[#859397] mt-1 tracking-wider uppercase font-mono">
          {broadcasterName}
        </div>
      </div>

      {/* ── TIMER (для ведущих во время эфира) ── */}
      {canGoLive && isLive && (
        <div className="text-center mb-4">
          <div
            className="text-[32px] font-black text-[#27d9f7] tabular-nums tracking-widest font-mono"
            style={{ textShadow: '0 0 20px rgba(39, 217, 247, 0.6)' }}
          >
            {formatTime(liveRemainingSec ?? liveElapsedSec ?? 0)}
          </div>
          <div className="text-[10px] tracking-[3px] text-[#859397] uppercase mt-0.5">
            {isLivePaused ? 'Пауза' : 'Поток активен'}
          </div>
        </div>
      )}

      {/* ── Копировать ссылку эфира + Группы ── */}
      <div className="px-4 mb-3 flex items-center justify-between gap-2">
        {isLive && liveShareUrl ? (
          <button
            onClick={handleCopyLiveLink}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold transition-all active:scale-95"
            style={{
              background: 'rgba(39, 217, 247, 0.12)',
              border: '1px solid rgba(39, 217, 247, 0.35)',
              color: '#27d9f7',
              boxShadow: '0 0 15px rgba(39, 217, 247, 0.15)',
            }}
          >
            <Link2 className="w-3.5 h-3.5" />
            Копировать ссылку
          </button>
        ) : <span />}
        <RoomsButton user={user} isLive={isLive} />
      </div>

      {/* Голос записан — ожидает отправки */}
      {pendingVoice && (
        <div className="mx-4 mb-3 px-4 py-2.5 rounded-2xl flex items-center justify-between border border-[#27d9f7]/40 bg-[rgba(39,217,247,0.12)] shadow-[0_0_15px_rgba(39,217,247,0.2)]">
          <span className="text-xs text-[#27d9f7] font-semibold flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5" /> {t('voice_ready')}
          </span>
          <button onClick={discardPendingVoice} className="text-[#859397] hover:text-[#dfe2f1] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── 3 КНОПКИ (Чат эфира / Голосовое / Отправить) ── */}
      <div className="flex items-center justify-around px-4 pb-4 gap-3">

        {/* Чат эфира — левая */}
        <button
          onClick={openChat}
          className="flex flex-col items-center gap-1.5 group flex-1"
        >
          <div
            className="w-full h-[62px] rounded-2xl flex flex-col items-center justify-center gap-1 relative transition-all duration-200 active:scale-95 group-hover:border-[#27d9f7]/40"
            style={{
              background: 'rgba(21, 26, 38, 0.65)',
              backdropFilter: 'blur(16px)',
              border: '1px solid rgba(39, 217, 247, 0.2)',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.35)',
            }}
          >
            <MessageSquare className="w-5 h-5 text-[#859397] group-hover:text-[#27d9f7] transition-colors" strokeWidth={1.8} />
            {messages.length > 0 && (
              <div className="absolute -top-1.5 -right-1.5 min-w-[18px] h-4.5 px-1 rounded-full flex items-center justify-center text-[10px] font-bold text-[#060a14] bg-[#27d9f7] shadow-[0_0_10px_rgba(39,217,247,0.6)]">
                {messages.length > 9 ? '9+' : messages.length}
              </div>
            )}
          </div>
          <span className="text-[10px] font-semibold text-[#859397] group-hover:text-[#dfe2f1] tracking-wide text-center leading-tight transition-colors">
            Чат эфира
          </span>
        </button>

        {/* Голосовое сообщение — центр */}
        <button
          onClick={handleVoiceMessage}
          className="flex flex-col items-center gap-1.5 group flex-1"
          style={isLive && !isRecording ? { opacity: 0.45 } : undefined}
        >
          <div
            className="w-full h-[62px] rounded-2xl flex flex-col items-center justify-center gap-1 relative transition-all duration-200 active:scale-95"
            style={{
              background: isRecording
                ? 'rgba(236, 72, 153, 0.2)'
                : pendingVoice
                ? 'rgba(39, 217, 247, 0.18)'
                : 'rgba(21, 26, 38, 0.65)',
              backdropFilter: 'blur(16px)',
              border: isRecording
                ? '1px solid rgba(236, 72, 153, 0.6)'
                : pendingVoice
                ? '1px solid rgba(39, 217, 247, 0.5)'
                : '1px solid rgba(39, 217, 247, 0.2)',
              boxShadow: isRecording
                ? '0 0 20px rgba(236, 72, 153, 0.4)'
                : pendingVoice
                ? '0 0 15px rgba(39, 217, 247, 0.3)'
                : '0 4px 20px rgba(0, 0, 0, 0.35)',
            }}
          >
            {isRecording ? (
              <Square className="w-5 h-5 text-[#ec4899]" fill="currentColor" />
            ) : pendingVoice ? (
              <Check className="w-5 h-5 text-[#27d9f7]" strokeWidth={2.5} />
            ) : (
              <Mic className="w-5 h-5 text-[#859397] group-hover:text-[#27d9f7] transition-colors" strokeWidth={1.8} />
            )}
            {isRecording && (
              <div className="relative w-1.5 h-1.5">
                <span className="animate-ping absolute inset-0 rounded-full bg-[#ec4899]" />
                <div className="absolute inset-0 rounded-full bg-[#ec4899]" />
              </div>
            )}
          </div>
          <span
            className="text-[10px] font-semibold tracking-wide text-center leading-tight transition-colors"
            style={{ color: isRecording ? '#ec4899' : pendingVoice ? '#27d9f7' : '#859397' }}
          >
            Голосовое
          </span>
        </button>

        {/* Отправить — правая */}
        <button
          onClick={handleSendToStudio}
          className="flex flex-col items-center gap-1.5 group flex-1"
        >
          <div
            className="w-full h-[62px] rounded-2xl flex flex-col items-center justify-center gap-1 transition-all duration-200 active:scale-95 group-hover:border-[#27d9f7]/40"
            style={{
              background: pendingVoice ? 'rgba(39, 217, 247, 0.22)' : 'rgba(21, 26, 38, 0.65)',
              backdropFilter: 'blur(16px)',
              border: pendingVoice ? '1px solid rgba(39, 217, 247, 0.6)' : '1px solid rgba(39, 217, 247, 0.2)',
              boxShadow: pendingVoice
                ? '0 0 20px rgba(39, 217, 247, 0.4)'
                : '0 4px 20px rgba(0, 0, 0, 0.35)',
            }}
          >
            <Send
              className={`w-5 h-5 transition-colors ${
                pendingVoice ? 'text-[#27d9f7]' : 'text-[#859397] group-hover:text-[#27d9f7]'
              }`}
              strokeWidth={1.8}
            />
          </div>
          <span
            className="text-[10px] font-semibold tracking-wide text-center leading-tight transition-colors"
            style={{ color: pendingVoice ? '#27d9f7' : '#859397' }}
          >
            Отправить
          </span>
        </button>
      </div>

      {/* ── КНОПКИ ДЕЙСТВИЙ (Кастинг / Подключение к эфиру / LIVE) ── */}
      <div className="px-4 pb-2">
        {/* Host/Admin/Doverenniy Section */}
        {canGoLive ? (
          <div className="mb-2.5 flex flex-col gap-2">
            {/* Caller Requests Banner for Host */}
            {pendingMicRequests.length > 0 && (
              <button
                onClick={() => setShowCallersModal(true)}
                className="w-full py-3 px-4 rounded-2xl font-bold text-xs tracking-wide flex items-center justify-between bg-gradient-to-r from-[rgba(39,217,247,0.22)] to-[rgba(5,154,240,0.18)] border border-[rgba(39,217,247,0.45)] text-[#c2f3ff] shadow-[0_0_20px_rgba(39,217,247,0.3)] active:scale-[0.98] transition-all"
              >
                <span className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#27d9f7] animate-ping" />
                  <span className="font-['Sora']">✋ Запросы в эфир: {pendingMicRequests.length} чел.</span>
                </span>
                <span className="text-[11px] font-mono font-bold text-[#27d9f7] underline">Посмотреть</span>
              </button>
            )}

            <GoLiveButton
              isLive={isLive}
              remainingSec={liveRemainingSec}
              onToggle={onToggleLive}
              isPaused={isLivePaused}
              onTogglePause={onToggleLivePause}
              slot={slotHint}
            />
          </div>
        ) : (
          /* Listener Section — Join Live Broadcast! */
          <div className="mb-2.5 flex flex-col gap-2">
            {myMicStatus === 'approved' ? (
              <button
                onClick={onToggleLive}
                className="w-full py-3.5 px-4 rounded-2xl font-extrabold text-sm tracking-wider flex items-center justify-center gap-2.5 bg-gradient-to-r from-emerald-400 via-[#27d9f7] to-[#059af0] text-[#060a14] shadow-[0_0_25px_rgba(39,217,247,0.6)] animate-pulse active:scale-[0.98] transition-all font-['Sora']"
              >
                <Mic className="w-5 h-5 text-[#060a14]" />
                {isLive ? '🔴 ВЫ В ЭФИРЕ — ЗАВЕРШИТЬ' : '🎙️ ВЫХОД В ЭФИР — ВКЛЮЧИТЬ МИКРОФОН'}
              </button>
            ) : myMicStatus === 'pending' ? (
              <div className="w-full py-3.5 px-4 rounded-2xl font-bold text-xs tracking-wide flex items-center justify-center gap-2.5 bg-[rgba(39,217,247,0.12)] border border-[rgba(39,217,247,0.4)] text-[#c2f3ff] shadow-[0_0_15px_rgba(39,217,247,0.2)]">
                <Loader className="w-4 h-4 text-[#27d9f7] animate-spin" />
                <span>Запрос отправлен... Ожидание ведущего</span>
              </div>
            ) : radioStatus?.is_live ? (
              <button
                onClick={handleRequestMic}
                disabled={submittingMicRequest}
                className="w-full py-3.5 px-4 rounded-2xl font-extrabold text-sm tracking-wider flex items-center justify-center gap-2.5 bg-gradient-to-r from-[#059af0] via-[#27d9f7] to-[#98cbff] text-[#060a14] shadow-[0_0_20px_rgba(39,217,247,0.4)] hover:shadow-[0_0_30px_rgba(39,217,247,0.6)] active:scale-[0.98] transition-all font-['Sora']"
              >
                <Mic className="w-4.5 h-4.5 text-[#060a14]" />
                {submittingMicRequest ? 'Отправка...' : '🎙️ Подключиться к эфиру (Запросить слово)'}
              </button>
            ) : null}

            {/* Casting / Permanent Host Button */}
            <button
              onClick={() => onNavigate?.('casting')}
              className="w-full py-3 rounded-2xl font-semibold text-xs tracking-wide flex items-center justify-center gap-2 bg-[rgba(15,19,30,0.6)] border border-[rgba(39,217,247,0.22)] text-[#dfe2f1] hover:text-[#27d9f7] hover:border-[rgba(39,217,247,0.4)] active:scale-[0.98] transition-all"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#27d9f7]" strokeWidth={2} />
              ⭐ Пройти кастинг — стать постоянным ведущим
            </button>
          </div>
        )}
        <button
          onClick={() => setShowStreamModal(true)}
          className="w-full rounded-2xl px-4 py-3.5 flex items-center justify-between active:scale-[0.98] transition-transform"
          style={{
            background: 'rgba(15, 19, 30, 0.65)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(39, 217, 247, 0.18)',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)',
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(39, 217, 247, 0.12)', border: '1px solid rgba(39, 217, 247, 0.25)' }}
            >
              <Activity className="w-4 h-4 text-[#27d9f7]" strokeWidth={2} />
            </div>
            <div className="text-left">
              <div className="text-[11px] font-bold tracking-[2px] text-[#dfe2f1] uppercase font-['Sora']">
                Поток Real Time
              </div>
              <div className="text-[10px] text-[#859397]">Статистика потока</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Users className="w-3.5 h-3.5 text-[#27d9f7]" />
            <span className="text-xs font-mono font-bold text-[#dfe2f1]">{radioStatus?.listeners_count || 0}</span>
            <svg className="w-4 h-4 text-[#859397]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </button>
      </div>

      {/* ── OFFLINE ── */}
      {!isOnline && (
        <div
          className="mx-4 rounded-xl p-2.5 mb-2 flex items-center justify-center gap-2 text-xs text-[#ef4444]"
          style={{ background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)' }}
        >
          <div className="w-2 h-2 rounded-full bg-[#ef4444] animate-ping" />
          <span>Нет соединения с сервером</span>
        </div>
      )}

      {/* ══════════════════════════════════════════════════
          MODAL: ПОТОК REAL TIME
      ══════════════════════════════════════════════════ */}
      {showStreamModal && (
        <FullScreenModal>

          {/* Header — Telegram'ning tepadagi native paneli bilan to'qnashmasin */}
          <div className="flex items-center px-4 pb-3 border-b"
            style={{ borderColor: 'rgba(200,255,203,0.12)', paddingTop: 'calc(76px + env(safe-area-inset-top))' }}>
            <button onClick={() => setShowStreamModal(false)}
              className="w-8 h-8 rounded-lg flex items-center justify-center mr-3"
              style={{ background: 'rgba(200,255,203,0.1)' }}>
              <svg className="w-4 h-4 text-[#C8FFCB]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
              </svg>
            </button>
            <div>
              <span className="text-sm font-bold text-[#6f9c72]">Поток </span>
              <span className="text-sm font-bold text-[#39FF6A]">Real Time</span>
            </div>
            <div className="ml-auto w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(200,255,203,0.1)' }}>
              <svg className="w-4 h-4 text-[#6f9c72]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
              </svg>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 pb-6">
            {/* Points + Level */}
            <div className="flex items-start gap-4 py-4">
              <div>
                <div className="text-[10px] text-[#6f9c72] uppercase tracking-wide mb-1">POINT</div>
                <div className="text-3xl font-black text-[#C8FFCB]">
                  {Number(user?.points || 0).toFixed(0)}
                </div>
              </div>
              <div className="flex-1">
                <div className="text-[10px] text-[#6f9c72] uppercase tracking-wide mb-1">УРОВЕНЬ</div>
                <div className="text-3xl font-black text-[#C8FFCB] mb-2">{level}</div>
                {/* Progress bar */}
                <div className="h-2 rounded-full overflow-hidden mt-1"
                  style={{ background: 'rgba(57,255,106,0.12)' }}>
                  <div className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.max(2, Math.min(Number(user?.points || 0) / 500 * 100, 100))}%`,
                      background: 'linear-gradient(90deg, #7dffa0, #39FF6A)',
                      boxShadow: '0 0 8px rgba(57,255,106,0.7)',
                      minWidth: '6px',
                    }} />
                </div>
                <div className="flex justify-between text-[9px] text-[#6f9c72] mt-1">
                  <span>{Number(user?.points || 0).toFixed(4)} pts</span>
                  <span>500 → next level</span>
                </div>
              </div>
            </div>

            {/* ID + Title */}
            <div className="mb-4">
              <div className="text-[10px] text-[#6f9c72] mb-0.5">
                ID: {user?.telegram_id || '-----'}
              </div>
              <GlitchText
                tag="div"
                text={radioStatus?.is_live ? 'Активация переосмысления' : 'Ожидание потока'}
                className="text-[16px] font-bold text-[#C8FFCB] tracking-wide font-display"
              />
              <div className="text-[11px] text-[#6f9c72] mt-0.5">
                {broadcasterName}
              </div>
            </div>

            {/* Waveform */}
            <div className="glass rift-halftone rift-torn-a px-4 py-4 mb-4" style={{ transform: 'rotate(-1.5deg)' }}>
              <div className="flex items-center justify-center gap-[4px]" style={{ height: '50px' }}>
                {waveformBars.map((h, i) => (
                  <div key={i}
                    style={{
                      width: '5px',
                      height: `${h * 1.3}px`,
                      background: 'linear-gradient(180deg, #fff 0%, #39FF6A 50%, #7dffa0 100%)',
                      borderRadius: '3px',
                      boxShadow: '0 0 4px rgba(57,255,106,0.4)',
                      animation: audioPlayer.isPlaying
                        ? `wave ${0.7+(i%3)*0.15}s ease-in-out ${i*0.07}s infinite`
                        : 'none',
                      opacity: audioPlayer.isPlaying ? 1 : 0.4,
                    }}
                  />
                ))}
              </div>
            </div>

            {/* 3 buttons */}
            <div className="flex items-center justify-around gap-3 mb-5">
              <button onClick={() => { setShowStreamModal(false); openChat(); }}
                className="flex flex-col items-center gap-1.5 flex-1 group">
                <div className="w-full h-[58px] rounded-2xl flex items-center justify-center transition-all duration-200 active:scale-95"
                  style={{ background: 'rgba(21, 26, 38, 0.7)', border: '1px solid rgba(39, 217, 247, 0.2)' }}>
                  <MessageSquare className="w-5 h-5 text-[#859397] group-hover:text-[#27d9f7] transition-colors" strokeWidth={1.8} />
                </div>
                <span className="text-[10px] font-semibold text-[#859397] group-hover:text-[#dfe2f1] tracking-wide text-center leading-tight">
                  Чат эфира
                </span>
              </button>

              <button onClick={() => { setShowStreamModal(false); handleVoiceMessage(); }}
                className="flex flex-col items-center gap-1.5 flex-1 group">
                <div className="w-full h-[58px] rounded-2xl flex items-center justify-center transition-all duration-200 active:scale-95"
                  style={{ background: 'rgba(21, 26, 38, 0.7)', border: '1px solid rgba(39, 217, 247, 0.2)' }}>
                  <Mic className="w-5 h-5 text-[#859397] group-hover:text-[#27d9f7] transition-colors" strokeWidth={1.8} />
                </div>
                <span className="text-[10px] font-semibold text-[#859397] group-hover:text-[#dfe2f1] tracking-wide text-center leading-tight">
                  Голосовое
                </span>
              </button>

              <button onClick={() => { setShowStreamModal(false); handleSendToStudio(); }}
                className="flex flex-col items-center gap-1.5 flex-1 group">
                <div className="w-full h-[58px] rounded-2xl flex items-center justify-center transition-all duration-200 active:scale-95"
                  style={{ background: 'rgba(21, 26, 38, 0.7)', border: '1px solid rgba(39, 217, 247, 0.2)' }}>
                  <Send className="w-5 h-5 text-[#859397] group-hover:text-[#27d9f7] transition-colors" strokeWidth={1.8} />
                </div>
                <span className="text-[10px] font-semibold text-[#859397] group-hover:text-[#dfe2f1] tracking-wide text-center leading-tight">
                  Отправить
                </span>
              </button>
            </div>

            {/* СТАТИСТИКА ПОТОКА */}
            <div className="mb-3">
              <div className="text-[10px] font-bold tracking-[2px] text-[#6f9c72] uppercase mb-3">
                Статистика потока
              </div>
              <div className="grid grid-cols-3 gap-2">
                {/* Активность */}
                <div className="glass rounded-2xl p-3">
                  <div className="text-[9px] text-[#6f9c72] uppercase tracking-wide mb-2">Активность</div>
                  <div className="text-xl font-black text-[#C8FFCB]">
                    {radioStatus?.is_live ? '78%' : '0%'}
                  </div>
                  {/* Mini chart */}
                  <div className="flex items-end gap-[2px] mt-2" style={{ height: '20px' }}>
                    {[4,6,3,8,5,10,7,12,9,14].map((h, i) => (
                      <div key={i} style={{
                        flex: 1, height: `${h}px`,
                        background: 'rgba(200,255,203,0.3)',
                        borderRadius: '1px',
                      }} />
                    ))}
                  </div>
                </div>

                {/* Энергия */}
                <div className="glass rounded-2xl p-3">
                  <div className="text-[9px] text-[#6f9c72] uppercase tracking-wide mb-2">Энергия</div>
                  <div className="text-xl font-black text-[#C8FFCB]">
                    {radioStatus?.is_live ? 'HIGH' : 'LOW'}
                  </div>
                  <div className="mt-2 h-1.5 rounded-full overflow-hidden"
                    style={{ background: 'rgba(200,255,203,0.1)' }}>
                    <div className="h-full rounded-full"
                      style={{
                        width: radioStatus?.is_live ? '80%' : '20%',
                        background: 'linear-gradient(90deg, #7dffa0, #39FF6A)',
                      }} />
                  </div>
                </div>

                {/* Сообщений */}
                <div className="glass rounded-2xl p-3">
                  <div className="text-[9px] text-[#6f9c72] uppercase tracking-wide mb-2">Сообщений</div>
                  <div className="text-xl font-black text-[#C8FFCB]">
                    {messages.length}
                  </div>
                  <div className="flex items-end gap-[2px] mt-2" style={{ height: '20px' }}>
                    {[3,7,5,9,6,11,8,13,10,15].map((h, i) => (
                      <div key={i} style={{
                        flex: 1, height: `${h}px`,
                        background: 'rgba(200,255,203,0.3)',
                        borderRadius: '1px',
                      }} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Pastki "Закрыть" tugmasi — yuqoridagi orqaga tugmasi ba'zi
              Telegram klientlarida ekranning eng tepasidagi native
              "Закрыть" paneli bilan to'qnashib, bosilmay qolishi mumkin
              (native chrome tegishlarni ushlab qolishi). Shu joy — kirish
              maydoni bilan bir xil, kafolatlangan bosiladigan zona. */}
          <div className="px-4 py-3 border-t shrink-0" style={{ borderColor: 'rgba(200,255,203,0.12)' }}>
            <button
              onClick={() => setShowStreamModal(false)}
              className="w-full py-3 rounded-xl text-sm font-semibold text-[#6f9c72] active:scale-[0.98] transition-transform"
              style={{ background: 'rgba(200,255,203,0.06)', border: '1px solid rgba(200,255,203,0.14)' }}
            >
              Закрыть
            </button>
          </div>

          <style>{`
            @keyframes wave {
              0%,100% { transform: scaleY(0.4); }
              50% { transform: scaleY(1.5); }
            }
          `}</style>
        </FullScreenModal>
      )}

      {/* ══════════════════════════════════════════════════
          MODAL: ЧАТ
      ══════════════════════════════════════════════════ */}
      {showChatModal && (
        <FullScreenModal>

          {/* Sarlavhasiz, chegarasiz — toza ko'rinish. Yopish Telegram'ning
              o'z native chrome/BackButton'i orqali. */}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4" ref={(el) => {
            // FAQAT modal birinchi ochilganda pastga scroll (keyinroq foydalanuvchi o'zi scroll qiladi)
            if (el && !el.dataset.scrolled) {
              el.dataset.scrolled = '1';
              setTimeout(() => el.scrollTop = el.scrollHeight, 50);
            }
          }}>
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-16">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                  style={{ background: 'rgba(39,217,247,0.08)', border: '1px solid rgba(39,217,247,0.2)' }}>
                  <MessageSquare className="w-8 h-8 text-[#27d9f7]" strokeWidth={1.5} />
                </div>
                <p className="text-sm font-semibold text-[#dfe2f1]">Чат пуст</p>
                <p className="text-xs text-[#859397] mt-1">Начните диалог в прямом эфире</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {messages.map((m) => (
                  <ChatMessageComponent key={m.id} message={m} currentUser={user} />
                ))}
              </div>
            )}
          </div>

          {/* Input — asosiy "Живой чат" bilan bir xil komponent (Telegram
              uslubidagi doira tugma, darhol ko'rinish, galochka statusi). */}
          <div className="px-4 pb-6 pt-3 border-t" style={{ borderColor: 'rgba(200,255,203,0.12)' }}>
            <ChatInput
              onSendMessage={(msg) => handleSendMessage(msg, 'chat')}
              onSendVoice={handleSendVoiceToChat}
              onToast={showToast}
              city={city}
              micDisabled={isLive}
            />
          </div>
        </FullScreenModal>
      )}

      {/* ══════════════════════════════════════════════════
          MODAL: ОТПРАВИТЬ В ЭФИР (matn yuborish)
      ══════════════════════════════════════════════════ */}
      {showStudioModal && (
        <div
          className="fixed z-[10000] flex items-center justify-center px-6"
          style={{
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(10,15,12,0.75)',
            backdropFilter: 'blur(6px)',
            isolation: 'isolate',
          }}
          onClick={() => setShowStudioModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-5"
            style={{
              background: 'rgba(10,15,12,0.98)',
              border: '1px solid rgba(200,255,203,0.16)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{ background: 'rgba(200,255,203,0.1)' }}>
                <Send className="w-4 h-4 text-[#6f9c72]" strokeWidth={2} />
              </div>
              <div className="text-[13px] font-semibold tracking-wide text-[#C8FFCB]">
                Сообщение для эфира
              </div>
              <button onClick={() => setShowStudioModal(false)}
                className="ml-auto w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background: 'rgba(200,255,203,0.1)' }}>
                <X className="w-4 h-4 text-[#6f9c72]" />
              </button>
            </div>

            {/* Textarea */}
            <textarea
              autoFocus
              value={studioText}
              onChange={(e) => setStudioText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submitStudioMessage();
                }
              }}
              placeholder="Введите сообщение..."
              rows={3}
              className="rift-input-torn w-full px-3 py-2.5 text-sm text-[#C8FFCB] resize-none outline-none placeholder:text-[#6f9c72]"
              style={{ background: 'rgba(10,15,12,0.6)' }}
            />

            {/* Buttons */}
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setShowStudioModal(false)}
                className="flex-1 h-11 rounded-xl text-sm font-semibold text-[#859397] bg-[rgba(21,26,38,0.7)] border border-[rgba(255,255,255,0.08)] hover:text-[#dfe2f1] active:scale-95 transition-transform"
              >
                Отмена
              </button>
              <button
                onClick={submitStudioMessage}
                disabled={!studioText.trim()}
                className="flex-1 h-11 rounded-xl text-sm font-bold text-[#060a14] bg-gradient-to-r from-[#27d9f7] to-[#059af0] active:scale-95 transition-transform disabled:opacity-40 shadow-[0_0_15px_rgba(39,217,247,0.3)]"
              >
                Отправить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Callers Modal (для ведущих: список запросов в эфир) ── */}
      {showCallersModal && (
        <div className="fixed inset-0 z-[300] bg-[#060a14]/80 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setShowCallersModal(false)}>
          <div
            className="w-full max-w-[380px] rounded-3xl p-5 bg-[rgba(15,19,30,0.95)] border border-[rgba(39,217,247,0.25)] shadow-[0_20px_60px_rgba(0,0,0,0.85)] backdrop-blur-2xl text-[#dfe2f1]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-[rgba(39,217,247,0.15)] mb-3">
              <div className="flex items-center gap-2">
                <Mic className="w-4 h-4 text-[#27d9f7]" />
                <h3 className="text-sm font-bold text-[#dfe2f1] font-['Sora'] uppercase tracking-wider">
                  Запросы в эфир ({pendingMicRequests.length})
                </h3>
              </div>
              <button onClick={() => setShowCallersModal(false)} className="p-1 rounded-lg text-[#859397] hover:text-[#dfe2f1]">
                <X className="w-4 h-4" />
              </button>
            </div>

            {pendingMicRequests.length === 0 ? (
              <div className="text-center py-6 text-xs text-[#859397]">
                Нет активных запросов на подключение
              </div>
            ) : (
              <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-1">
                {pendingMicRequests.map((r) => (
                  <div
                    key={r.id}
                    className="p-3 rounded-2xl bg-[rgba(21,26,38,0.7)] border border-[rgba(39,217,247,0.2)] flex items-center justify-between gap-2"
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-bold text-[#dfe2f1] truncate">{r.display_name}</span>
                      {r.telegram_id && (
                        <span className="font-mono text-[10px] text-[#27d9f7]">ID: {r.telegram_id}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => handleApproveCaller(r.id)}
                        className="px-3 py-1.5 rounded-xl text-xs font-bold bg-gradient-to-r from-emerald-500 to-[#27d9f7] text-[#060a14] active:scale-95 transition-all shadow-[0_0_10px_rgba(39,217,247,0.3)]"
                      >
                        В эфир
                      </button>
                      <button
                        onClick={() => handleRejectCaller(r.id)}
                        className="p-1.5 rounded-xl text-xs bg-rose-500/15 border border-rose-500/30 text-rose-400 hover:bg-rose-500/25 active:scale-95 transition-all"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <Toast message={message} variant={toastVariant} />
    </div>
  );
}
