import type { ChatMessage } from '../types';

const LS_LAST_READ_KEY = 'sfera5_chat_last_read_id';

/**
 * Return the highest chat message ID marked as read by the user.
 */
export function getLastReadMessageId(city?: string): number {
  try {
    const scopedKey = city ? `${LS_LAST_READ_KEY}_${city}` : LS_LAST_READ_KEY;
    const val = localStorage.getItem(scopedKey) || localStorage.getItem(LS_LAST_READ_KEY);
    return val ? parseInt(val, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

/**
 * Mark all messages up to `lastId` as read in localStorage and broadcast to active screens.
 */
export function setLastReadMessageId(lastId: number, city?: string): void {
  try {
    if (!lastId || lastId <= 0) return;
    const str = String(lastId);
    if (city) {
      localStorage.setItem(`${LS_LAST_READ_KEY}_${city}`, str);
    }
    localStorage.setItem(LS_LAST_READ_KEY, str);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('chat_read_updated', { detail: { lastId, city } }));
    }
  } catch {
    // Ignore storage quota / private browsing errors
  }
}

/**
 * Check whether a message has already been read.
 */
export function isMessageRead(messageId: number, city?: string): boolean {
  if (messageId <= 0) return true; // optimistic temporary local messages
  const lastReadId = getLastReadMessageId(city);
  return messageId <= lastReadId;
}

/**
 * Calculate the number of unread messages from a list of chat messages.
 * On the very first visit (when no read pointer exists yet in localStorage),
 * marks existing historical messages as read so the user is not flooded with old badges.
 */
export function calculateUnreadCount(
  messages: ChatMessage[],
  city?: string,
  currentTelegramId?: number
): number {
  if (!messages || messages.length === 0) return 0;

  const scopedKey = city ? `${LS_LAST_READ_KEY}_${city}` : LS_LAST_READ_KEY;
  let hasEverRecordedRead = false;
  try {
    hasEverRecordedRead =
      localStorage.getItem(scopedKey) !== null || localStorage.getItem(LS_LAST_READ_KEY) !== null;
  } catch {
    hasEverRecordedRead = false;
  }

  // If the user has never stored a read pointer on this device,
  // initialize it to the current latest message so old history doesn't trigger unread badges.
  if (!hasEverRecordedRead) {
    const validIds = messages.filter((m) => m.id > 0).map((m) => m.id);
    const maxId = validIds.length > 0 ? Math.max(...validIds) : 0;
    if (maxId > 0) {
      setLastReadMessageId(maxId, city);
    }
    return 0;
  }

  const lastReadId = getLastReadMessageId(city);

  return messages.filter((m) => {
    if (!m.id || m.id <= 0) return false;
    if (m.id <= lastReadId) return false;
    // Don't count user's own sent messages as unread
    if (currentTelegramId && m.telegram_id === currentTelegramId) return false;
    return true;
  }).length;
}

/**
 * Mark all messages in the provided array as read.
 */
export function markMessagesAsRead(messages: ChatMessage[], city?: string): void {
  if (!messages || messages.length === 0) return;
  const validIds = messages.filter((m) => m.id > 0).map((m) => m.id);
  if (validIds.length === 0) return;
  const maxId = Math.max(...validIds);
  const currentLastRead = getLastReadMessageId(city);
  if (maxId > currentLastRead) {
    setLastReadMessageId(maxId, city);
  }
}
