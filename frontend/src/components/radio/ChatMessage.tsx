import { useState, useRef, useMemo, useEffect } from 'react';
import { Check, CheckCheck, Clock, Play, Pause, AlertTriangle, Paperclip, User as UserIcon } from 'lucide-react';
import { API_URL } from '../../lib/config';
import { useTranslation } from '../../hooks/useTranslation';
import type { ChatMessage, User } from '../../types';

interface ChatMessageProps {
  message: ChatMessage;
  currentUser: User | null;
}

export function ChatMessage({ message, currentUser }: ChatMessageProps) {
  const { t } = useTranslation('radio');
  const isAI = message.kind === 'ai' || message.username?.includes('ИИ') || message.message_type === 'ai';
  
  // Robust check for own message (by telegram_id or username)
  const isMine = !!(
    currentUser && (
      (message.telegram_id && currentUser.telegram_id && Number(message.telegram_id) === Number(currentUser.telegram_id)) ||
      (message.username && (
        message.username === currentUser.username ||
        message.username === currentUser.full_name ||
        message.username === currentUser.display_name ||
        message.username === `id${currentUser.telegram_id}`
      ))
    )
  );

  const time = new Date(message.created_at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  const renderContent = () => {
    if (message.voice_url) {
      return (
        <VoicePlayer
          url={message.voice_url}
          duration={message.duration_sec ?? null}
          voiceLabel={t('voice_label')}
          isMine={isMine}
          messageId={message.id}
        />
      );
    }
    if (message.file_url) {
      return <FileAttachment url={message.file_url} name={message.file_name || 'файл'} isMine={isMine} />;
    }
    return <div className="break-words text-sm leading-relaxed">{message.message}</div>;
  };

  const senderId = message.telegram_id || (isMine ? currentUser?.telegram_id : null);
  const senderName = isMine ? 'Вы' : (message.display_name || message.username || t('guest'));

  const isAdmin = !isAI && (
    message.username?.toLowerCase().includes('admin') ||
    message.display_name?.toLowerCase().includes('admin') ||
    message.kind === 'studio'
  );

  return (
    <div className={`flex w-full items-start ${isAI ? 'justify-center' : isMine ? 'justify-end' : 'justify-start'} my-1`}>
      {/* Left Avatar for other users (Blue for listeners, Emerald for admins) */}
      {!isMine && !isAI && (
        <div
          className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center shrink-0 mr-2 mt-0.5 shadow-md ${
            isAdmin
              ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-[0_0_8px_rgba(16,185,129,0.35)]'
              : 'bg-gradient-to-br from-[#059af0] to-[#27d9f7] text-[#060a14] shadow-[0_0_8px_rgba(39,217,247,0.25)]'
          }`}
          title={senderName}
        >
          <UserIcon className="w-3.5 h-3.5" />
        </div>
      )}

      <div
        className={`relative transition-all duration-200 ${
          isAI
            ? 'max-w-[92%] px-3.5 py-2 rounded-2xl bg-[rgba(139,92,246,0.12)] border border-[rgba(139,92,246,0.35)] shadow-[0_4px_20px_rgba(139,92,246,0.15)] backdrop-blur-md text-[#e9d5ff]'
            : isMine
            ? 'max-w-[85%] px-3.5 py-2 rounded-2xl rounded-tr-sm bg-gradient-to-br from-[#059af0]/25 via-[#27d9f7]/20 to-[#059af0]/30 border border-[rgba(39,217,247,0.35)] shadow-[0_4px_20px_rgba(0,0,0,0.4),0_0_15px_rgba(39,217,247,0.12)] backdrop-blur-md text-[#dfe2f1]'
            : 'max-w-[85%] px-3.5 py-2 rounded-2xl rounded-tl-sm bg-[rgba(15,19,30,0.85)] border border-[rgba(39,217,247,0.2)] shadow-[0_4px_20px_rgba(0,0,0,0.35)] backdrop-blur-md text-[#dfe2f1]'
        }`}
      >
        {/* Header with Sender Name, Time + User ID Badge matching mockup */}
        {!isAI && (
          <div className="flex items-center flex-wrap gap-x-1.5 gap-y-0.5 mb-1 text-[11px] select-none">
            <span className={`font-bold ${isMine ? 'text-[#27d9f7]' : isAdmin ? 'text-emerald-400' : 'text-[#c2f3ff]'}`}>
              {senderName}
            </span>
            <span className="text-[#859397] font-mono text-[10px] font-normal">
              , {time}
            </span>
            {senderId && (
              <span className="font-mono text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-[rgba(39,217,247,0.12)] text-[#27d9f7] border border-[rgba(39,217,247,0.25)] ml-0.5">
                ID: {senderId}
              </span>
            )}
            {isAdmin && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                ADMIN
              </span>
            )}
            {message.kind === 'studio' && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30">
                В ЭФИР
              </span>
            )}
            {isMine && message.status && (
              <span className="ml-auto inline-flex items-center pl-1">
                <StatusTicks status={message.status} />
              </span>
            )}
          </div>
        )}

        {/* Message body */}
        {renderContent()}
      </div>
    </div>
  );
}

function StatusTicks({ status }: { status: 'sending' | 'sent' | 'delivered' }) {
  if (status === 'sending') return <Clock className="w-3 h-3 text-[#859397] shrink-0" />;
  if (status === 'delivered') return <CheckCheck className="w-3.5 h-3.5 text-[#27d9f7] shrink-0" />;
  return <Check className="w-3.5 h-3.5 text-[#27d9f7]/70 shrink-0" />;
}

interface VoicePlayerProps {
  url: string;
  duration: number | null;
  voiceLabel?: string;
  isMine: boolean;
  messageId?: number;
}

function VoicePlayer({ url, duration, voiceLabel, isMine, messageId }: VoicePlayerProps) {
  const fullUrl = url.startsWith('http') || url.startsWith('blob:') ? url : `${API_URL}${url}`;
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState<number>(duration || 0);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  // Generate a consistent, organic waveform of 28 bars based on messageId / url
  const bars = useMemo(() => {
    const seed = messageId || (url ? url.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) : 42);
    const result: number[] = [];
    const count = 28;
    for (let i = 0; i < count; i++) {
      const sinFactor = Math.sin((i / (count - 1)) * Math.PI);
      const pseudo = ((seed * (i + 7) * 9301 + 49297) % 233280) / 233280;
      const heightPct = Math.max(20, Math.min(100, Math.round(sinFactor * 52 + pseudo * 48)));
      result.push(heightPct);
    }
    return result;
  }, [messageId, url]);

  const effectiveDuration = totalDuration > 0 ? totalDuration : (duration || 0);
  const progress = effectiveDuration > 0 ? Math.min(1, currentTime / effectiveDuration) : 0;
  const activeBarIndex = Math.floor(progress * bars.length);

  const initAudio = () => {
    if (!audioRef.current) {
      const audio = new Audio(fullUrl);
      audio.playbackRate = playbackSpeed;
      audio.preload = 'metadata';

      audio.onloadedmetadata = () => {
        if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
          setTotalDuration(Math.round(audio.duration));
        }
      };

      audio.ontimeupdate = () => {
        setCurrentTime(audio.currentTime);
      };

      audio.onended = () => {
        setPlaying(false);
        setCurrentTime(0);
      };

      audio.onerror = () => {
        setFailed(true);
        setPlaying(false);
      };

      audioRef.current = audio;
    }
    return audioRef.current;
  };

  const handlePlay = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (failed) return;

    const audio = initAudio();
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.play()
        .then(() => setPlaying(true))
        .catch(() => setFailed(true));
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (failed) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const pct = clickX / rect.width;
    const dur = effectiveDuration > 0 ? effectiveDuration : 5;
    const targetTime = pct * dur;

    const audio = initAudio();
    audio.currentTime = targetTime;
    setCurrentTime(targetTime);

    if (!playing) {
      audio.play().then(() => setPlaying(true)).catch(() => {});
    }
  };

  const toggleSpeed = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextSpeed = playbackSpeed === 1 ? 1.5 : playbackSpeed === 1.5 ? 2 : 1;
    setPlaybackSpeed(nextSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextSpeed;
    }
  };

  const fmtSec = (s: number) => {
    const secVal = Math.max(0, Math.floor(s));
    const m = Math.floor(secVal / 60);
    const sec = secVal % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center gap-3 min-w-[210px] max-w-[270px] py-1 select-none">
      {/* Circular Play / Pause Button with Glow */}
      <button
        onClick={handlePlay}
        disabled={failed}
        aria-label={playing ? 'Пауза' : 'Воспроизвести'}
        className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 active:scale-90 shrink-0 ${
          failed
            ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 cursor-not-allowed'
            : isMine
            ? 'bg-gradient-to-r from-[#27d9f7] to-[#059af0] text-[#060a14] shadow-[0_0_14px_rgba(39,217,247,0.45)]'
            : 'bg-[rgba(39,217,247,0.15)] text-[#27d9f7] border border-[rgba(39,217,247,0.35)] shadow-[0_0_10px_rgba(39,217,247,0.15)] hover:bg-[rgba(39,217,247,0.25)]'
        }`}
      >
        {failed ? (
          <AlertTriangle className="w-4 h-4" />
        ) : playing ? (
          <Pause className="w-4 h-4 fill-current" />
        ) : (
          <Play className="w-4 h-4 ml-0.5 fill-current" />
        )}
      </button>

      {/* Waveform & Time Track Column */}
      <div className="flex-1 flex flex-col justify-center gap-1.5 min-w-0">
        {/* Interactive Waveform Bars (Telegram Style) */}
        <div
          onClick={handleSeek}
          className="flex items-center gap-[2.5px] h-6 cursor-pointer py-1 relative group"
          title="Нажмите для перемотки"
        >
          {bars.map((barHeight, idx) => {
            const isPassed = idx <= activeBarIndex && !failed && (currentTime > 0 || playing);
            const isCurrent = idx === activeBarIndex && playing;
            const heightPx = Math.max(4, Math.round((barHeight / 100) * 22));

            return (
              <div
                key={idx}
                className="w-[2.5px] rounded-full transition-all duration-100"
                style={{
                  height: `${isCurrent ? Math.min(24, heightPx + 4) : heightPx}px`,
                  backgroundColor: isPassed
                    ? '#27d9f7'
                    : 'rgba(133, 147, 151, 0.45)',
                  boxShadow: isPassed ? '0 0 6px rgba(39, 217, 247, 0.5)' : 'none',
                  transform: isCurrent ? 'scaleY(1.15)' : 'none',
                }}
              />
            );
          })}
        </div>

        {/* Footer: Elapsed/Duration Time & Speed Button */}
        <div className="flex items-center justify-between text-[11px] font-mono leading-none text-[#859397]">
          <span className={`tabular-nums ${playing ? 'text-[#27d9f7] font-bold' : ''}`}>
            {failed
              ? 'Файл недоступен'
              : effectiveDuration > 0 || playing
              ? fmtSec(playing ? currentTime : effectiveDuration)
              : (voiceLabel || '00:00')}
          </span>

          {!failed && (
            <button
              onClick={toggleSpeed}
              title="Скорость воспроизведения"
              className="px-1.5 py-0.5 rounded text-[9px] font-bold font-mono tracking-tight bg-[rgba(39,217,247,0.12)] text-[#27d9f7] hover:bg-[#27d9f7]/25 transition-all active:scale-95 border border-[rgba(39,217,247,0.2)]"
            >
              {playbackSpeed}X
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function FileAttachment({ url, name, isMine }: { url: string; name: string; isMine: boolean }) {
  const fullUrl = url.startsWith('http') ? url : `${API_URL}${url}`;
  const fileName = name.replace(/^📎\s*/, '');
  const isImage = /\.(jpe?g|png|gif|webp|svg)$/i.test(fileName);

  if (isImage) {
    return (
      <div className="my-1.5 max-w-[260px] rounded-xl overflow-hidden border border-[rgba(39,217,247,0.25)] shadow-md">
        <a href={fullUrl} target="_blank" rel="noopener noreferrer" className="block relative group">
          <img
            src={fullUrl}
            alt={fileName}
            className="w-full max-h-[220px] object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-medium backdrop-blur-[2px]">
            Открыть
          </div>
        </a>
      </div>
    );
  }

  return (
    <a
      href={fullUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2.5 min-w-[150px] max-w-[260px] my-1 p-2 rounded-xl bg-[rgba(255,255,255,0.04)] border border-[rgba(39,217,247,0.2)] hover:border-[#27d9f7]/50 transition-all no-underline group"
    >
      <div
        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all ${
          isMine
            ? 'bg-[#27d9f7] text-[#060a14]'
            : 'bg-[rgba(39,217,247,0.15)] text-[#27d9f7] border border-[rgba(39,217,247,0.3)]'
        }`}
      >
        <Paperclip className="w-4 h-4" />
      </div>
      <span className="text-xs text-[#dfe2f1] group-hover:text-[#27d9f7] underline break-all line-clamp-1 transition-colors">
        {fileName}
      </span>
    </a>
  );
}
