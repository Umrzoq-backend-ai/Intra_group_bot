import { useState, useRef } from 'react';
import { Mic, Paperclip, Smile, X } from 'lucide-react';
import { uploadFile } from '../../lib/api';
import { useTranslation } from '../../hooks/useTranslation';
import { hapticImpact } from '../../lib/telegram';

interface ChatInputProps {
  onSendMessage: (message: string, destination: 'chat' | 'studio') => void;
  onSendVoice: (blob: Blob) => void;
  onToast: (message: string) => void;
  city: string;
  micDisabled?: boolean;
}

const QUICK_EMOJIS = ['👍', '🔥', '❤️', '👏', '🎧', '😂', '🎉', '✨', '😎', '🙌', '🚀', '💯'];

export function ChatInput({ onSendMessage, onSendVoice, onToast, city, micDisabled }: ChatInputProps) {
  const { t } = useTranslation('radio');
  const [text, setText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [showEmojis, setShowEmojis] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSendText = () => {
    const message = text.trim();
    if (!message) return;
    onSendMessage(message, 'chat');
    setText('');
    setShowEmojis(false);
    hapticImpact('light');
  };

  const handleAddEmoji = (emoji: string) => {
    setText((prev) => prev + emoji);
    hapticImpact('light');
  };

  const toggleRecording = async () => {
    if (isRecording) {
      hapticImpact('medium');
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      return;
    }

    if (micDisabled) {
      onToast(t('toast_mic_live'));
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredTypes = [
        'audio/mp4',
        'audio/mpeg',
        'audio/ogg',
        'audio/webm',
      ];
      const mimeType = preferredTypes.find((t) => MediaRecorder.isTypeSupported(t)) || '';
      const mediaRecorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const actualType = mediaRecorder.mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: actualType });
        if (blob.size < 1000) {
          onToast(t('toast_short'));
          return;
        }
        onSendVoice(blob);
      };

      mediaRecorder.start();
      setIsRecording(true);
      hapticImpact('light');
    } catch (e) {
      console.error('Mic error:', e);
      onToast(t('toast_mic_denied'));
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      onToast('⚠️ Max 20MB');
      return;
    }
    try {
      hapticImpact('light');
      await uploadFile(city, file);
      hapticImpact('medium');
    } catch (error: any) {
      if (error.status === 402) {
        onToast(t('toast_limit'));
      } else {
        onToast(error.message || t('send_error'));
      }
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const hasText = text.trim().length > 0;

  return (
    <div className="flex flex-col pt-1 pb-1">
      {/* Quick emoji drawer popup */}
      {showEmojis && (
        <div
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl mb-1.5 overflow-x-auto select-none transition-all duration-200"
          style={{
            background: 'rgba(15, 19, 30, 0.95)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(39, 217, 247, 0.25)',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5), 0 0 15px rgba(39, 217, 247, 0.1)',
            scrollbarWidth: 'none',
          }}
        >
          <div className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            {QUICK_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => handleAddEmoji(emoji)}
                className="text-base sm:text-lg p-1 hover:scale-125 active:scale-95 transition-transform shrink-0"
              >
                {emoji}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setShowEmojis(false)}
            className="p-1 text-[#859397] hover:text-[#dfe2f1] ml-1 shrink-0"
            aria-label="Закрыть"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main input row matching mockup */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Sleek Dark Obsidian Glass Pill containing Attachment, Text, Mic, Emoji */}
        <div
          className="flex-1 rounded-2xl px-2.5 py-1.5 flex items-center gap-1.5 sm:gap-2 min-w-0 transition-all duration-200 focus-within:border-[#27d9f7] focus-within:shadow-[0_0_15px_rgba(39,217,247,0.25)]"
          style={{
            background: 'rgba(15, 19, 30, 0.85)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(39, 217, 247, 0.22)',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.35)',
          }}
        >
          {/* Skrepka / Attachment button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-7 h-7 sm:w-8 sm:h-8 shrink-0 rounded-xl flex items-center justify-center text-[#859397] hover:text-[#27d9f7] hover:bg-[rgba(39,217,247,0.1)] active:scale-90 transition-all"
            aria-label="Прикрепить файл"
          >
            <Paperclip className="w-4 h-4" strokeWidth={2.2} />
          </button>
          <input ref={fileInputRef} type="file" accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.txt" onChange={handleFileSelect} className="hidden" />

          {/* Text input */}
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendText()}
            placeholder={t('chat_placeholder') || 'Ваше сообщение...'}
            disabled={isRecording}
            className="flex-1 min-w-0 bg-transparent text-[13px] sm:text-[14px] text-[#dfe2f1] placeholder-[#859397] outline-none disabled:opacity-50 font-normal selection:bg-[#27d9f7]/30 py-0.5"
          />

          {/* Voice / Mic button with Red Outline & ГОЛОСОВЫЕ label (Mockup style) */}
          <div className="relative shrink-0 flex items-center">
            <button
              type="button"
              onClick={toggleRecording}
              title={t('voice_btn') || 'ГОЛОСОВЫЕ'}
              className={`w-7 h-7 sm:w-8 sm:h-8 rounded-xl flex items-center justify-center transition-all duration-200 active:scale-90 ${
                isRecording
                  ? 'bg-rose-500 text-white shadow-[0_0_15px_rgba(239,68,68,0.7)] animate-pulse'
                  : 'border border-rose-500/80 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 hover:border-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.2)]'
              }`}
              aria-label={isRecording ? 'Остановить запись' : 'Записать голосовое'}
            >
              <Mic className="w-3.5 h-3.5 sm:w-4 sm:h-4" strokeWidth={2.2} />
            </button>
          </div>

          {/* Smile / Emoji button */}
          <button
            type="button"
            onClick={() => setShowEmojis((v) => !v)}
            className={`w-7 h-7 sm:w-8 sm:h-8 shrink-0 rounded-xl flex items-center justify-center transition-all active:scale-90 ${
              showEmojis
                ? 'text-[#27d9f7] bg-[rgba(39,217,247,0.15)] border border-[rgba(39,217,247,0.3)]'
                : 'text-[#859397] hover:text-[#27d9f7] hover:bg-[rgba(39,217,247,0.1)]'
            }`}
            aria-label="Смайлики"
          >
            <Smile className="w-4 h-4" strokeWidth={2.2} />
          </button>
        </div>

        {/* Send button "ОТПРАВИТЬ" (Mockup style) */}
        <button
          type="button"
          onClick={handleSendText}
          disabled={!hasText || isRecording}
          className={`h-[38px] sm:h-[42px] px-3 sm:px-4 rounded-2xl flex items-center justify-center font-['Sora'] font-extrabold text-[11px] sm:text-xs uppercase tracking-wider transition-all duration-200 active:scale-95 shrink-0 ${
            hasText && !isRecording
              ? 'bg-gradient-to-r from-[#27d9f7] to-[#059af0] text-[#060a14] shadow-[0_0_16px_rgba(39,217,247,0.45)] cursor-pointer hover:brightness-110'
              : 'bg-[rgba(39,217,247,0.12)] text-[#27d9f7]/40 border border-[rgba(39,217,247,0.18)] cursor-not-allowed'
          }`}
        >
          {t('send_btn') || 'ОТПРАВИТЬ'}
        </button>
      </div>
    </div>
  );
}
