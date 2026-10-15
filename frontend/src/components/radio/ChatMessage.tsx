import { useState, useRef } from 'react';
import { Check, CheckCheck, Clock, Play, Pause, AlertTriangle, Music2, Download, Paperclip } from 'lucide-react';
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
      return <VoicePlayer url={message.voice_url} duration={message.duration_sec ?? null} voiceLabel={t('voice_label')} isMine={isMine} />;
    }
    if (message.file_url) {
      return <FileAttachment url={message.file_url} name={message.file_name || 'файл'} isMine={isMine} />;
    }
    return <div className="break-words text-sm leading-relaxed">{message.message}</div>;
  };

  const senderId = message.telegram_id || (isMine ? currentUser?.telegram_id : null);
  const senderName = isMine ? 'Вы' : (message.display_name || message.username || t('guest'));

  return (
    <div className={`flex w-full ${isAI ? 'justify-center' : isMine ? 'justify-end' : 'justify-start'} my-1`}>
      <div
        className={`relative transition-all duration-200 ${
          isAI
            ? 'max-w-[92%] px-4 py-3 rounded-2xl bg-[rgba(139,92,246,0.12)] border border-[rgba(139,92,246,0.35)] shadow-[0_4px_20px_rgba(139,92,246,0.15)] backdrop-blur-md text-[#e9d5ff]'
            : isMine
            ? 'max-w-[82%] px-3.5 py-2.5 rounded-2xl rounded-tr-sm bg-gradient-to-br from-[#059af0]/25 via-[#27d9f7]/20 to-[#059af0]/30 border border-[rgba(39,217,247,0.35)] shadow-[0_4px_20px_rgba(0,0,0,0.4),0_0_15px_rgba(39,217,247,0.12)] backdrop-blur-md text-[#dfe2f1]'
            : 'max-w-[82%] px-3.5 py-2.5 rounded-2xl rounded-tl-sm bg-[rgba(15,19,30,0.75)] border border-[rgba(39,217,247,0.18)] shadow-[0_4px_20px_rgba(0,0,0,0.35)] backdrop-blur-md text-[#dfe2f1]'
        }`}
      >
        {/* Header with Sender Name + Prominent User ID Badge */}
        {!isAI && (
          <div className="flex items-center gap-1.5 mb-1 text-[11px] select-none">
            <span className={`font-bold ${isMine ? 'text-[#27d9f7]' : 'text-[#c2f3ff]'}`}>
              {senderName}
            </span>
            {senderId && (
              <span className="font-mono text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-[rgba(39,217,247,0.12)] text-[#27d9f7] border border-[rgba(39,217,247,0.25)]">
                ID: {senderId}
              </span>
            )}
            {message.kind === 'studio' && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30">
                В ЭФИР
              </span>
            )}
          </div>
        )}

        {/* Message body */}
        {renderContent()}

        {/* Footer timestamp & delivery status */}
        <div className={`flex items-center justify-end gap-1 text-[10px] font-mono mt-1 ${isMine ? 'text-[#27d9f7]/80' : 'text-[#859397]'}`}>
          <span>{time}</span>
          {isMine && message.status && <StatusTicks status={message.status} />}
        </div>
      </div>
    </div>
  );
}

function StatusTicks({ status }: { status: 'sending' | 'sent' | 'delivered' }) {
  if (status === 'sending') return <Clock className="w-3 h-3 text-[#859397] shrink-0" />;
  if (status === 'delivered') return <CheckCheck className="w-3.5 h-3.5 text-[#27d9f7] shrink-0" />;
  return <Check className="w-3.5 h-3.5 text-[#27d9f7]/70 shrink-0" />;
}

function VoicePlayer({ url, duration, voiceLabel, isMine }: { url: string; duration: number | null; voiceLabel: string; isMine: boolean }) {
  const fullUrl = url.startsWith('http') || url.startsWith('blob:') ? url : `${API_URL}${url}`;
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handlePlay = () => {
    if (!audioRef.current) {
      const audio = new Audio(fullUrl);
      audio.onended = () => setPlaying(false);
      audio.onerror = () => {
        setFailed(true);
        setPlaying(false);
      };
      audioRef.current = audio;
    }
    const audio = audioRef.current;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.play()
        .then(() => setPlaying(true))
        .catch(() => setFailed(true));
    }
  };

  return (
    <div className="flex items-center gap-2.5 min-w-[140px] my-1">
      <button
        onClick={handlePlay}
        className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
          failed
            ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
            : isMine
            ? 'bg-[#27d9f7] text-[#060a14] shadow-[0_0_12px_rgba(39,217,247,0.4)] active:scale-95'
            : 'bg-[rgba(39,217,247,0.15)] text-[#27d9f7] border border-[rgba(39,217,247,0.3)] active:scale-95'
        }`}
      >
        {failed ? <AlertTriangle className="w-3.5 h-3.5" /> : playing ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 ml-0.5 fill-current" />}
      </button>
      <span className="text-xs text-[#dfe2f1] font-mono flex items-center gap-1">
        <Music2 className="w-3 h-3 text-[#27d9f7]" /> {duration ? `${duration}ʺ` : voiceLabel}
      </span>
      {failed && (
        <a href={fullUrl} target="_blank" rel="noopener noreferrer" className="text-rose-400 hover:text-rose-300">
          <Download className="w-3.5 h-3.5" />
        </a>
      )}
    </div>
  );
}

function FileAttachment({ url, name, isMine }: { url: string; name: string; isMine: boolean }) {
  const fullUrl = url.startsWith('http') ? url : `${API_URL}${url}`;
  const fileName = name.replace(/^📎\s*/, '');

  return (
    <a
      href={fullUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 min-w-[130px] my-1 no-underline group"
    >
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-all ${
        isMine
          ? 'bg-[#27d9f7] text-[#060a14]'
          : 'bg-[rgba(39,217,247,0.15)] text-[#27d9f7] border border-[rgba(39,217,247,0.3)]'
      }`}>
        <Paperclip className="w-3.5 h-3.5" />
      </div>
      <span className="text-xs text-[#dfe2f1] group-hover:text-[#27d9f7] underline break-all transition-colors">{fileName}</span>
    </a>
  );
}
