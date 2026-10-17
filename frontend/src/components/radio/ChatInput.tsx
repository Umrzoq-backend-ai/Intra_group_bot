import { useState, useRef } from 'react';
import { Mic, Send, Paperclip } from 'lucide-react';
import { uploadFile } from '../../lib/api';
import { useTranslation } from '../../hooks/useTranslation';
import { hapticImpact } from '../../lib/telegram';

interface ChatInputProps {
  onSendMessage: (message: string, destination: 'chat' | 'studio') => void;
  // Yozib bo'lingan ovoz shu callback'ga uzatiladi — yuborish, optimistik
  // ko'rsatish va status (bitta/ikkita galochka) hammasi chaqiruvchi
  // ekranda (ChatScreen/RoomChatModal) boshqariladi, xuddi matn kabi.
  onSendVoice: (blob: Blob) => void;
  onToast: (message: string) => void;
  city: string;
  // O'zi hozir prямой эфирда bo'lsa — mikrofon band (broadcast uchun
  // ishlatilyapti), shuning uchun ovozli xabar yozib bo'lmaydi. Matn
  // yuborish esa bunga bog'liq emas, davom etaveradi.
  micDisabled?: boolean;
}

// Bu input faqat CHAT'ga yuborish uchun — studiyaga yuborish Efir ekranida
// alohida joylashgan. Tugma Telegram uslubida: matn bo'lsa yuborish
// belgisi, bo'lmasa mikrofon — bitta doira tugma, matn maydonidan tashqarida.
export function ChatInput({ onSendMessage, onSendVoice, onToast, city, micDisabled }: ChatInputProps) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSendText = () => {
    const message = text.trim();
    if (!message) return;
    onSendMessage(message, 'chat');
    setText('');
  };

  const toggleRecording = async () => {
    if (isRecording) {
      // To'xtatish — ovoz darhol yuboriladi (Telegram kabi, oraliq
      // tasdiqlashsiz: mediaRecorder.onstop ichida onSendVoice chaqiriladi).
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
      // Telegram WebView (iOS) webm'ni ijro eta olmaydi — mp4/mpeg ni afzal ko'ramiz
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

  const handleActionClick = () => {
    if (isRecording || hasText) {
      isRecording ? toggleRecording() : handleSendText();
    } else {
      toggleRecording();
    }
  };

  return (
    <div className="flex items-center gap-2 pt-2 pb-1">
      {/* Text input row — Sleek Dark Obsidian Glass Pill */}
      <div
        className="flex-1 rounded-2xl px-3.5 py-2.5 flex items-center gap-2.5 min-w-0 transition-all duration-200 focus-within:border-[#27d9f7] focus-within:shadow-[0_0_15px_rgba(39,217,247,0.25)]"
        style={{
          background: 'rgba(15, 19, 30, 0.85)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(39, 217, 247, 0.22)',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.35)',
        }}
      >
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-8 h-8 shrink-0 rounded-xl flex items-center justify-center text-[#859397] hover:text-[#27d9f7] hover:bg-[rgba(39,217,247,0.1)] active:scale-90 transition-all"
          aria-label="Прикрепить файл"
        >
          <Paperclip className="w-4.5 h-4.5" strokeWidth={2} />
        </button>
        <input ref={fileInputRef} type="file" accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.txt" onChange={handleFileSelect} className="hidden" />

        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSendText()}
          placeholder={t('chat_placeholder') || 'Сообщение...'}
          disabled={isRecording}
          className="flex-1 min-w-0 bg-transparent text-[14px] text-[#dfe2f1] placeholder-[#859397] outline-none disabled:opacity-50 font-normal selection:bg-[#27d9f7]/30"
        />
      </div>

      {/* Action button — Send or Mic with Dark Obsidian & Cyan theme */}
      <div className="relative shrink-0">
        {isRecording && (
          <span className="rift-rec-pulse absolute inset-0 rounded-2xl bg-red-500 opacity-60" />
        )}
        <button
          onClick={handleActionClick}
          aria-label={isRecording ? 'Остановить и отправить' : hasText ? 'Отправить' : 'Записать голосовое'}
          className="relative w-11 h-11 rounded-2xl flex items-center justify-center transition-all duration-200 active:scale-90 shrink-0"
          style={{
            background: isRecording
              ? '#ef4444'
              : hasText
                ? 'linear-gradient(135deg, #27d9f7 0%, #059af0 100%)'
                : 'linear-gradient(135deg, rgba(39,217,247,0.18) 0%, rgba(5,154,240,0.22) 100%)',
            border: isRecording
              ? '1px solid #ef4444'
              : hasText
                ? '1px solid rgba(39,217,247,0.6)'
                : '1px solid rgba(39,217,247,0.3)',
            boxShadow: isRecording
              ? '0 0 20px rgba(239,68,68,0.7)'
              : hasText
                ? '0 0 18px rgba(39,217,247,0.5)'
                : '0 0 12px rgba(39,217,247,0.15)',
          }}
        >
          {hasText && !isRecording ? (
            <Send className="w-5 h-5 text-[#060a14] ml-[-1px]" strokeWidth={2.4} fill="#060a14" />
          ) : (
            <Mic className={`w-5 h-5 ${isRecording ? 'text-white' : micDisabled ? 'text-[#859397]' : 'text-[#27d9f7]'}`} strokeWidth={2.2} />
          )}
        </button>
      </div>
    </div>
  );
}
