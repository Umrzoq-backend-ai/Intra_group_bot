import { useState, useRef, useEffect } from 'react';
import { Mic, Paperclip, Smile, X, Trash2 } from 'lucide-react';
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

// Telegram-style massive, comprehensive emoji collection by category
const EMOJI_CATEGORIES = {
  smileys: {
    icon: '😊',
    title: 'Смайлики & Эмоции',
    emojis: [
      '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃',
      '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙',
      '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔',
      '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥',
      '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮',
      '🤧', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '🥸', '😎',
      '🤓', '🧐', '😕', '😟', '🙁', '😮', '😯', '😲', '😳', '🥺',
      '😦', '😧', '😨', '😰', '😥', '😢', '😭', '😱', '😖', '😣',
      '😞', '😓', '😩', '😫', '🥱', '😤', '😡', '😠', '🤬', '💀',
      '☠️', '💩', '🤡', '👹', '👺', '👻', '👽', '👾', '🤖',
    ],
  },
  gestures: {
    icon: '👍',
    title: 'Жесты & Люди',
    emojis: [
      '👍', '👎', '👏', '🙌', '👐', '🤲', '🤝', '👊', '✊', '🤛',
      '🤜', '🤞', '✌️', '🤟', '🤘', '👌', '🤌', '🤏', '👈', '👉',
      '👆', '👇', '☝️', '✋', '🤚', '🖐', '🖖', '👋', '🤙', '💪',
      '🦾', '🖕', '✍️', '🙏', '🦶', '🦵', '👂', '👃', '🧠', '🫀',
      '🫁', '🦷', '👅', '👄', '💋', '🫂', '🗣️', '👤', '👥', '👶',
      '🧒', '👦', '👧', '🧑', '👱', '👨', '🧔', '👩', '🧓', '👴',
      '👵', '👮', '🕵️', '👷', '💂', '🥷', '🦸', '🦹', '🧙', '🧚',
      '🧛', '🧜', '🧝', '🧞', '🧟', '💃', '🕺', '🏃', '🚶',
    ],
  },
  hearts: {
    icon: '❤️',
    title: 'Сердца & Огонь',
    emojis: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔',
      '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '⚡',
      '🔥', '💥', '✨', '🌟', '💫', '⭐', '🏆', '🎯', '🥇', '🥈',
      '🥉', '👑', '💎', '💍', '💯', '🔮', '🧿', '🪄', '🎖️', '🏅',
    ],
  },
  animals: {
    icon: '🐱',
    title: 'Животные & Природа',
    emojis: [
      '🐱', '🐶', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯',
      '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🐤', '🦆',
      '🦅', '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋',
      '🐌', '🐞', '🐜', '🐢', '🐍', '🦎', '🐙', '🦑', '🦐', '🦞',
      '🦀', '🐡', '🐠', '🐟', '🐬', '🐳', '🦈', '🐊', '🐅', '🐆',
      '🦓', '🦍', '🦧', '🐘', '🦛', '🦏', '🐪', '🐫', '🦒', '🦘',
      '🌸', '🌹', '🌺', '🌻', '🌼', '🌷', '🌲', '🌳', '🌴', '🍀',
      '🍁', '🍂', '🍄', '🌍', '🌕', '☀️', '⭐', '🌈', '⚡', '❄️',
    ],
  },
  food: {
    icon: '🍕',
    title: 'Еда & Напитки',
    emojis: [
      '🍏', '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐',
      '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🥑', '🥦', '🌽',
      '🌶️', '🥒', '🥕', '🥔', '🍞', '🥐', '🥖', '🥨', '🧀', '🍳',
      '🥞', '🧇', '🥓', '🥩', '🍗', '🍖', '🌭', '🍔', '🍟', '🍕',
      '🥪', '🥙', '🌮', '🌯', '🥗', '🍿', '🍣', '🍱', '🥟', '🍜',
      '🍲', '🍨', '🍦', '🍰', '🎂', '🧁', '🍫', '🍬', '🍭', '🍩',
      '🍪', '☕', '🍵', '🧃', '🥤', '🍺', '🍻', '🥂', '🍷', '🥃',
      '🍸', '🍹', '🍾',
    ],
  },
  radio: {
    icon: '🎧',
    title: 'Музыка & Радио',
    emojis: [
      '🎧', '🎙️', '📻', '🎵', '🎶', '🔊', '📢', '🔔', '🎤', '🎹',
      '🎷', '🎺', '🎸', '🪕', '🎻', '🥁', '🎮', '🕹️', '🎲', '🧩',
      '🎭', '🎨', '🎬', '📱', '💻', '🖥️', '📺', '📷', '📸', '📹',
      '📼', '📽️', '📡', '🚀', '🛸', '🚁', '✈️', '🏎️', '🏍️', '🚲',
      '💬', '💭', '🗯️', '📣', '📯', '🎼', '🔈', '🔉', '🔊',
    ],
  },
};

type CategoryKey = keyof typeof EMOJI_CATEGORIES;

export function ChatInput({ onSendMessage, onSendVoice, onToast, city, micDisabled }: ChatInputProps) {
  const { t } = useTranslation('radio');
  const [text, setText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [showEmojis, setShowEmojis] = useState(false);
  const [activeCategory, setActiveCategory] = useState<CategoryKey>('smileys');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const shouldSendVoiceRef = useRef<boolean>(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

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

  const startRecording = async () => {
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
      const mimeType = preferredTypes.find((typ) => MediaRecorder.isTypeSupported(typ)) || '';
      const mediaRecorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      shouldSendVoiceRef.current = true;
      setRecordingDuration(0);
      setIsRecording(true);
      hapticImpact('medium');

      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current);
          recordingTimerRef.current = null;
        }
        stream.getTracks().forEach((track) => track.stop());

        if (!shouldSendVoiceRef.current) {
          // User canceled recording
          return;
        }

        const actualType = mediaRecorder.mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: actualType });
        if (blob.size < 1000) {
          onToast(t('toast_short') || 'Слишком короткая запись');
          return;
        }
        onSendVoice(blob);
      };

      mediaRecorder.start(100);
    } catch (e) {
      console.error('Mic error:', e);
      setIsRecording(false);
      onToast(t('toast_mic_denied'));
    }
  };

  const stopAndSendRecording = () => {
    if (!isRecording) return;
    shouldSendVoiceRef.current = true;
    hapticImpact('medium');
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  const cancelRecording = () => {
    if (!isRecording) return;
    shouldSendVoiceRef.current = false;
    hapticImpact('light');
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
    onToast('Запись отменена');
  };

  const handleActionSend = () => {
    if (isRecording) {
      // If currently recording voice, pressing "ОТПРАВИТЬ" stops & sends the voice note!
      stopAndSendRecording();
    } else if (text.trim().length > 0) {
      // If text typed, sends the text!
      handleSendText();
    } else {
      // If empty and not recording, focus the input
      textInputRef.current?.focus();
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
      onToast('Загрузка файла...');
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

  const fmtRecordSec = (secVal: number) => {
    const m = Math.floor(secVal / 60);
    const s = secVal % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const hasText = text.trim().length > 0;
  const canSend = isRecording || hasText;

  return (
    <div className="flex flex-col pt-1 pb-1 relative">
      {/* ════════════════════════════════════════════════════════════
          TELEGRAM-STYLE RICH CATEGORIZED EMOJI DRAWER
      ════════════════════════════════════════════════════════════ */}
      {showEmojis && (
        <div
          className="flex flex-col rounded-2xl mb-2 overflow-hidden select-none transition-all duration-200 animate-[fadeIn_0.15s_ease-out]"
          style={{
            background: 'rgba(15, 19, 30, 0.96)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            border: '1px solid rgba(39, 217, 247, 0.28)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.7), 0 0 20px rgba(39, 217, 247, 0.15)',
          }}
        >
          {/* Header with Title and Close Button */}
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-[rgba(39,217,247,0.12)]">
            <span className="text-[11px] font-bold text-[#c2f3ff] font-mono tracking-wide">
              {EMOJI_CATEGORIES[activeCategory].title}
            </span>
            <button
              type="button"
              onClick={() => setShowEmojis(false)}
              className="w-6 h-6 rounded-lg flex items-center justify-center text-[#859397] hover:text-[#dfe2f1] hover:bg-white/5 active:scale-90 transition-all"
              aria-label="Закрыть"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Emoji Grid (Scrollable, Telegram-style) */}
          <div
            className="p-2 max-h-[170px] sm:max-h-[210px] overflow-y-auto grid grid-cols-7 sm:grid-cols-9 gap-1.5 scroll-smooth"
            style={{
              scrollbarWidth: 'thin',
              scrollbarColor: 'rgba(39,217,247,0.3) transparent',
            }}
          >
            {EMOJI_CATEGORIES[activeCategory].emojis.map((emoji, index) => (
              <button
                key={`${emoji}-${index}`}
                type="button"
                onClick={() => handleAddEmoji(emoji)}
                className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center text-lg sm:text-xl rounded-xl hover:bg-[rgba(39,217,247,0.15)] active:scale-125 transition-all duration-100"
              >
                {emoji}
              </button>
            ))}
          </div>

          {/* Category Switcher Tabs at Bottom */}
          <div className="flex items-center justify-around px-1 py-1.5 bg-[rgba(6,10,20,0.85)] border-t border-[rgba(39,217,247,0.12)]">
            {(Object.keys(EMOJI_CATEGORIES) as CategoryKey[]).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => {
                  setActiveCategory(cat);
                  hapticImpact('light');
                }}
                className={`flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-xl text-base transition-all ${
                  activeCategory === cat
                    ? 'bg-[rgba(39,217,247,0.2)] border border-[rgba(39,217,247,0.4)] shadow-[0_0_8px_rgba(39,217,247,0.3)] scale-110'
                    : 'opacity-60 hover:opacity-100 hover:bg-white/5'
                }`}
                title={EMOJI_CATEGORIES[cat].title}
              >
                {EMOJI_CATEGORIES[cat].icon}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          MAIN UNIFIED INPUT CAPSULE (Matching Mockup Perfectly)
      ════════════════════════════════════════════════════════════ */}
      <div
        className="w-full rounded-2xl p-1.5 flex items-center gap-1.5 min-w-0 transition-all duration-200 focus-within:border-[#27d9f7] focus-within:shadow-[0_0_16px_rgba(39,217,247,0.25)]"
        style={{
          background: 'rgba(15, 19, 30, 0.92)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: isRecording ? '1px solid rgba(244, 63, 94, 0.7)' : '1px solid rgba(39, 217, 247, 0.24)',
          boxShadow: isRecording
            ? '0 0 24px rgba(244, 63, 94, 0.3), 0 4px 20px rgba(0, 0, 0, 0.5)'
            : '0 4px 20px rgba(0, 0, 0, 0.4)',
        }}
      >
        {/* If Recording: Display Telegram-style Recording Status with Timer, Soundwaves, Cancel, and Mic-to-Send */}
        {isRecording ? (
          <div className="flex-1 flex items-center gap-2 px-1.5 min-w-0 animate-[fadeIn_0.15s_ease-out]">
            {/* Pulsing Red Dot and Live Timer */}
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping shrink-0" />
              <span className="font-mono text-xs font-bold text-rose-400 tabular-nums">
                {fmtRecordSec(recordingDuration)}
              </span>
            </div>

            {/* Dancing sound wave bars */}
            <div className="flex-1 flex items-center justify-center gap-1 h-5 overflow-hidden">
              {[40, 75, 55, 90, 65, 80, 45, 95, 60, 85].map((h, i) => (
                <div
                  key={i}
                  className="w-[2.5px] rounded-full bg-gradient-to-t from-rose-500 to-[#27d9f7] animate-pulse"
                  style={{
                    height: `${Math.max(4, (h / 100) * 18)}px`,
                    animationDuration: `${0.4 + (i % 4) * 0.15}s`,
                  }}
                />
              ))}
            </div>

            {/* Cancel Button (Trash icon + text) */}
            <button
              type="button"
              onClick={cancelRecording}
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-500/15 text-rose-400 hover:bg-rose-500/25 border border-rose-500/30 text-[11px] font-medium transition-all active:scale-95 shrink-0"
              title="Отменить запись"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Отмена</span>
            </button>

            {/* Active Voice / Mic Button (Pulsing Red) - Clicking AGAIN stops & sends! */}
            <button
              type="button"
              onClick={stopAndSendRecording}
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl flex items-center justify-center bg-rose-500 text-white shadow-[0_0_15px_rgba(239,68,68,0.7)] animate-pulse active:scale-90 transition-all shrink-0"
              title="Нажмите еще раз, чтобы отправить голосовое"
              aria-label="Отправить голосовое"
            >
              <Mic className="w-3.5 h-3.5 sm:w-4 sm:h-4" strokeWidth={2.2} />
            </button>
          </div>
        ) : (
          /* Normal Typing Mode */
          <>
            {/* Skrepka / Attachment button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-7 h-7 sm:w-8 sm:h-8 shrink-0 rounded-xl flex items-center justify-center text-[#859397] hover:text-[#27d9f7] hover:bg-[rgba(39,217,247,0.12)] active:scale-90 transition-all"
              aria-label="Прикрепить файл"
              title="Прикрепить файл или фото"
            >
              <Paperclip className="w-4 h-4" strokeWidth={2.2} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.txt"
              onChange={handleFileSelect}
              className="hidden"
            />

            {/* Text Input */}
            <input
              ref={textInputRef}
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendText()}
              placeholder={t('chat_placeholder') || 'Ваше сообщение...'}
              className="flex-1 min-w-[90px] bg-transparent text-[13px] sm:text-[14px] text-[#dfe2f1] placeholder-[#859397] outline-none font-normal selection:bg-[#27d9f7]/30 py-1 px-1"
            />

            {/* Voice / Mic button with red border (Mockup style) */}
            <div className="relative shrink-0 flex items-center">
              <button
                type="button"
                onClick={startRecording}
                title={t('voice_btn') || 'ГОЛОСОВЫЕ'}
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl flex items-center justify-center border border-rose-500/80 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 hover:border-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.2)] active:scale-90 transition-all"
                aria-label="Записать голосовое"
              >
                <Mic className="w-3.5 h-3.5 sm:w-4 sm:h-4" strokeWidth={2.2} />
              </button>
            </div>

            {/* Smile / Emoji Button */}
            <button
              type="button"
              onClick={() => setShowEmojis((v) => !v)}
              className={`w-7 h-7 sm:w-8 sm:h-8 shrink-0 rounded-xl flex items-center justify-center transition-all active:scale-90 ${
                showEmojis
                  ? 'text-[#27d9f7] bg-[rgba(39,217,247,0.18)] border border-[rgba(39,217,247,0.35)]'
                  : 'text-[#859397] hover:text-[#27d9f7] hover:bg-[rgba(39,217,247,0.12)]'
              }`}
              aria-label="Смайлики"
              title="Эмодзи"
            >
              <Smile className="w-4 h-4" strokeWidth={2.2} />
            </button>
          </>
        )}

        {/* ════════════════════════════════════════════════════════════
            "ОТПРАВИТЬ" SEND BUTTON (Integrated in Capsule, Mockup Style)
            - When recording: Stops and sends voice message!
            - When typing: Sends the text!
            - When idle: Prompts focus with clean cyan outline!
        ════════════════════════════════════════════════════════════ */}
        <button
          type="button"
          onClick={handleActionSend}
          className={`h-7 sm:h-8 px-3 sm:px-3.5 rounded-xl flex items-center justify-center font-['Sora'] font-black text-[11px] sm:text-xs uppercase tracking-wider transition-all duration-200 active:scale-95 shrink-0 ${
            canSend
              ? 'bg-gradient-to-r from-[#27d9f7] via-[#38e1ff] to-[#059af0] text-[#060a14] shadow-[0_0_16px_rgba(39,217,247,0.55)] cursor-pointer hover:brightness-110'
              : 'bg-[rgba(39,217,247,0.14)] text-[#27d9f7] border border-[rgba(39,217,247,0.3)] hover:bg-[rgba(39,217,247,0.22)] shadow-[0_0_8px_rgba(39,217,247,0.12)] cursor-pointer'
          }`}
          title={isRecording ? 'Отправить голосовое' : 'Отправить сообщение'}
        >
          {t('send_btn') || 'ОТПРАВИТЬ'}
        </button>
      </div>
    </div>
  );
}
