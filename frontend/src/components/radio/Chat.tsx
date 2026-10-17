import { useRef, useEffect } from 'react';
import { ChatMessage as ChatMessageComponent } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { RoomsButton } from './RoomsScreen';
import { markMessagesAsRead } from '../../lib/chatUnread';
import { useTranslation } from '../../hooks/useTranslation';
import type { ChatMessage as ChatMessageType, User } from '../../types';

interface ChatProps {
  messages: ChatMessageType[];
  currentUser: User | null;
  onSendMessage: (message: string, destination: 'chat' | 'studio') => void;
  onSendVoice: (blob: Blob) => void;
  onToast: (message: string) => void;
  city: string;
  // Berilsa — sarlavha yonida chiqish tugmasi ko'rsatiladi (asosiy "Живой
  // чат" ekranida BottomNav o'rniga shu orqali oldingi ekranga qaytiladi).
  onExit?: () => void;
  isLive?: boolean;
}

export function Chat({
  messages,
  currentUser,
  onSendMessage,
  onSendVoice,
  onToast,
  city,
  onExit,
  isLive,
}: ChatProps) {
  const { t } = useTranslation('radio');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollToBottom();
    if (messages.length > 0) {
      markMessagesAsRead(messages, city);
    }
  }, [messages, city]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="bg-[#060a14] text-[#dfe2f1] px-3 pt-1 pb-2 flex flex-col flex-1 min-h-0 select-none">
      {/* Sleek chat header with back button, brand title, user ID, and rooms button */}
      <div
        className="flex items-center justify-between pb-2.5 mb-2 border-b border-[rgba(39,217,247,0.14)]"
        style={{
          paddingTop: 'calc(max(env(safe-area-inset-top, 0px), var(--tg-content-safe-area-inset-top, 0px), var(--tg-safe-area-inset-top, 0px), var(--tg-safe-top, 0px), 16px) + 12px)',
        }}
      >
        <div className="flex items-center gap-2.5">
          {onExit && (
            <button
              onClick={onExit}
              aria-label="Назад"
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-[rgba(15,19,30,0.85)] border border-[rgba(39,217,247,0.25)] text-[#dfe2f1] hover:text-[#27d9f7] hover:border-[#27d9f7]/50 active:scale-90 transition-all shadow-[0_2px_10px_rgba(0,0,0,0.4)]"
            >
              <svg className="w-5 h-5 text-[#27d9f7]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <div className="flex flex-col">
            <span className="text-[13px] font-extrabold uppercase tracking-[1.5px] bg-gradient-to-r from-[#c2f3ff] via-[#27d9f7] to-[#059af0] bg-clip-text text-transparent font-['Sora']">
              {t('chat_title') || 'ФИДБЭК & ЧАТ'}
            </span>
            <span className="text-[10px] text-[#859397] font-mono tracking-wider">INTRA GROUP</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {currentUser?.telegram_id ? (
            <div
              className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[rgba(15,19,30,0.85)] border border-[rgba(39,217,247,0.25)] shadow-[0_0_12px_rgba(39,217,247,0.1)]"
            >
              <span className="text-[9px] font-extrabold text-[#859397] uppercase font-['Sora']">ID</span>
              <span className="font-mono text-xs font-bold text-[#27d9f7] tabular-nums">
                {currentUser.telegram_id}
              </span>
            </div>
          ) : null}
          <RoomsButton user={currentUser} isLive={isLive} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto flex flex-col gap-2.5 px-0.5 py-1 min-h-[60px] scroll-smooth"
           style={{ WebkitOverflowScrolling: 'touch' }}>
        {messages.map((msg) => (
          <ChatMessageComponent
            key={msg.id}
            message={msg}
            currentUser={currentUser}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      <ChatInput
        onSendMessage={onSendMessage}
        onSendVoice={onSendVoice}
        onToast={onToast}
        city={city}
        micDisabled={isLive}
      />
    </div>
  );
}
