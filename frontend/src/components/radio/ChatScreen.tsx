import { useState, useEffect, useCallback, useRef } from 'react';
import { Chat } from './Chat';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useToast } from '../../hooks/useToast';
import { useTranslation } from '../../hooks/useTranslation';
import { Toast } from '../ui/Toast';
import { getChatHistory, sendChatMessage, sendVoiceMessage } from '../../lib/api';
import { DEFAULT_CITY, LS_CITY } from '../../lib/config';
import { markMessagesAsRead } from '../../lib/chatUnread';
import type { User, ChatMessage } from '../../types';

interface ChatScreenProps {
  user: User | null;
  onPointsUpdate: (points: number) => void;
  onExit?: () => void;
  // O'zi hozir prямой эфирda bo'lsa — ovozli xabar yozib bo'lmaydi
  // (mikrofon band). Berilmasa — default false (masalan oddiy
  // tinglovchi hech qachon эфирда bo'lmaydi).
  isLive?: boolean;
}

interface PendingSend {
  tempId: number;
  kind: 'text' | 'voice';
  content: string;
  blobUrl?: string;
}

export function ChatScreen({ user, onPointsUpdate, onExit, isLive }: ChatScreenProps) {
  const { t, lang } = useTranslation();
  const { message, variant: toastVariant, showToast } = useToast();
  const [city] = useState(localStorage.getItem(LS_CITY) || DEFAULT_CITY);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // O'zimiz optimistik qo'shgan (hali serverdan tasdiqlanmagan) xabarlar —
  // WS orqali xuddi shu xabar qaytib kelganda ular bilan almashtiriladi
  // (Telegram uslubidagi 1/2 galochka uchun kerak).
  const pendingRef = useRef<PendingSend[]>([]);

  const dedupe = (msgs: ChatMessage[]) =>
    msgs.filter((m, i, arr) => arr.findIndex((x) => x.id === m.id) === i);

  const loadHistory = useCallback(() => {
    getChatHistory(city).then((msgs) => {
      const unique = dedupe(msgs);
      setMessages(unique);
      markMessagesAsRead(unique, city);
    }).catch(() => {});
  }, [city]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  function handleWSMessage(wsMessage: { type: string; data?: any }) {
    if (!wsMessage.data) return;
    switch (wsMessage.type) {
      case 'chat': {
        const newMsg = wsMessage.data;
        setMessages((prev) => {
          if (newMsg?.id && prev.some((m) => m.id === newMsg.id)) return prev;

          // Shu xabarni kutayotgan optimistik yozuv bo'lsa — o'shani asl
          // xabar bilan almashtiramiz (dublikat qo'shmaymiz, 2-galochka).
          // Ovozli xabarlar matn bo'yicha farqlanmaydi (hammasi bo'sh) —
          // shuning uchun turi bo'yicha FIFO moslashtiramiz.
          const kind = newMsg.message_type === 'voice' ? 'voice' : 'text';
          const pendingIdx = pendingRef.current.findIndex(
            (p) => p.kind === kind && (kind === 'voice' || p.content === (newMsg.message || ''))
          );
          if (pendingIdx !== -1) {
            const { tempId, blobUrl } = pendingRef.current[pendingIdx];
            pendingRef.current.splice(pendingIdx, 1);
            if (blobUrl) URL.revokeObjectURL(blobUrl);
            return prev.map((m) => (m.id === tempId ? { ...newMsg, status: 'delivered' as const } : m));
          }
          return [...prev, newMsg];
        });
        if (newMsg?.id) {
          markMessagesAsRead([newMsg], city);
        }
        break;
      }
      case 'balance':
        onPointsUpdate(wsMessage.data.points);
        break;
      case 'limit_exceeded':
        onPointsUpdate(wsMessage.data.points);
        showToast(t('toast_limit'), 'error');
        break;
      case 'studio_ack':
        onPointsUpdate(wsMessage.data.points);
        break;
      case 'studio_denied':
        showToast(t('studio_denied_role'), 'error');
        break;
    }
  }

  const { send: wsSend } = useWebSocket({ city, onMessage: handleWSMessage });

  const handleSendMessage = useCallback(
    async (msg: string, destination: 'chat' | 'studio') => {
      // Faqat "chat" uchun darhol ko'rsatamiz — Telegram kabi bosilgan
      // zahoti xabar chatda ko'rinadi (server javobini kutmasdan).
      let tempId: number | null = null;
      if (destination === 'chat') {
        tempId = -(Date.now() * 1000 + Math.floor(Math.random() * 1000));
        pendingRef.current.push({ tempId, kind: 'text', content: msg });
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
        pendingRef.current = pendingRef.current.filter((p) => p.tempId !== id);
        setMessages((prev) => prev.filter((m) => m.id !== id));
      };

      const sentViaWs = wsSend({ type: destination, message: msg, lang });
      if (sentViaWs) {
        markSent();
        return;
      }

      try {
        const res: any = await sendChatMessage(city, msg);
        if (res?.points !== undefined) onPointsUpdate(Number(res.points));
        // WS ulanmagan bo'lsa echo kelmaydi — tarixni qayta yuklab, optimistik
        // yozuvni asl (server) versiyasi bilan almashtiramiz.
        loadHistory();
      } catch (e: any) {
        rollback();
        if (e?.status === 402) showToast(t('toast_limit'), 'error');
        else showToast(t('send_error'), 'error');
      }
    },
    [wsSend, lang, onPointsUpdate, showToast, t, city, loadHistory, user]
  );

  const handleSendVoice = useCallback(
    async (blob: Blob) => {
      // Xuddi matn kabi — darhol, mahalliy blob URL orqali ijro etsa
      // bo'ladigan holda ko'rsatamiz, keyin serverga yuklaymiz.
      const tempId = -(Date.now() * 1000 + Math.floor(Math.random() * 1000));
      const blobUrl = URL.createObjectURL(blob);
      pendingRef.current.push({ tempId, kind: 'voice', content: '', blobUrl });
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
        pendingRef.current = pendingRef.current.filter((p) => p.tempId !== tempId);
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
    },
    [city, lang, onPointsUpdate, showToast, t, user]
  );

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <Chat
        messages={messages}
        currentUser={user}
        onSendMessage={handleSendMessage}
        onSendVoice={handleSendVoice}
        onToast={showToast}
        city={city}
        onExit={onExit}
        isLive={isLive}
      />
      <Toast message={message} variant={toastVariant} />
    </div>
  );
}
