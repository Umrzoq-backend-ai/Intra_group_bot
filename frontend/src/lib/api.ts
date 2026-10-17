import { API_URL, RADIO_URL } from './config';
import { authHeaders } from './auth';
import type {
  User, RadioStatus, ChatMessage, Announcements, AudioSegment,
  News, PointsRequest, PointPackage, PointsTransaction, PaymentSettings, AdminPackage, ChatRoom,
  ManualPayment, ManualPaymentMethod,
} from '../types';

// ============ Users / Profile ============
export async function getMe(): Promise<User> {
  // cache: 'no-store' — ba'zi mobil WebView'lar (jumladan Telegram Mini App)
  // GET so'rovlarni eskirgan holda keshlab qo'yishi mumkin, natijada balans
  // yangilanmaganday ko'rinadi.
  const resp = await fetch(`${API_URL}/users/me`, { headers: authHeaders(), cache: 'no-store' });
  if (!resp.ok) throw new Error('Failed to fetch user');
  return resp.json();
}

// Display name va username tahrirlash (v3: PUT /users/me)
export async function updateProfile(data: {
  display_name?: string;
  username?: string;
}) {
  const resp = await fetch(`${API_URL}/users/me`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(data),
  });
  if (!resp.ok) throw new Error('Failed to update profile');
  return resp.json();
}

// Til tanlash (v3: /auth/select-language)
export async function updateLanguage(language: string) {
  const resp = await fetch(`${API_URL}/auth/select-language`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ language }),
  });
  if (!resp.ok) throw new Error('Failed to select language');
  return resp.json();
}

// Eski chaqiruv — moslik uchun (broadcast lang = interfeys tili)
export async function updateBroadcastLang(language: string) {
  return updateLanguage(language);
}

// ============ News (til bo'yicha) ============
export async function getNews(language: string): Promise<News[]> {
  const resp = await fetch(`${API_URL}/news/${language}`);
  if (!resp.ok) throw new Error('Failed to fetch news');
  return resp.json();
}

// Eski "announcements" — endi news'dan banner sifatida (dizayn saqlanadi)
export async function getAnnouncements(): Promise<Announcements> {
  const lang = localStorage.getItem('sfera5_lang') || 'ru';
  try {
    const news = await getNews(lang);
    const toBanner = (n?: News) =>
      n ? { emoji: '📻', title: n.title, text: n.body, image_url: n.image_url || null } : null;
    return { banner1: toBanner(news[0]), banner2: toBanner(news[1]) };
  } catch {
    return { banner1: null, banner2: null };
  }
}

// ============ Points ============
export async function getPointsBalance() {
  const resp = await fetch(`${API_URL}/users/me/points`, { headers: authHeaders(), cache: 'no-store' });
  if (!resp.ok) throw new Error('Failed to fetch balance');
  return resp.json();
}

// Point berish (ID bo'yicha)
export async function transferPoints(to_user_id: number, amount: number) {
  const resp = await fetch(`${API_URL}/users/me/points/transfer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ to_user_id, amount }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.detail || 'Transfer failed');
  }
  return resp.json();
}

// Point so'rash (from_user_id = kimdan so'ralyapti)
export async function requestPoints(from_user_id: number, amount: number, message = '') {
  const resp = await fetch(`${API_URL}/users/me/points/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ from_user_id, amount, message }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.detail || 'Request failed');
  }
  return resp.json();
}

export async function getMyRequests(): Promise<PointsRequest[]> {
  const resp = await fetch(`${API_URL}/users/me/points/requests`, { headers: authHeaders() });
  if (!resp.ok) throw new Error('Failed to fetch requests');
  return resp.json();
}

export async function decideRequest(request_id: number, approve: boolean) {
  const resp = await fetch(`${API_URL}/users/me/points/requests/${request_id}/decide`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ approve }),
  });
  if (!resp.ok) throw new Error('Failed to decide request');
  return resp.json();
}

export async function getPointsHistory(): Promise<PointsTransaction[]> {
  const resp = await fetch(`${API_URL}/users/me/points/history`, { headers: authHeaders(), cache: 'no-store' });
  if (!resp.ok) throw new Error('Failed to fetch points history');
  return resp.json();
}

export async function getPackages(): Promise<PointPackage[]> {
  const resp = await fetch(`${API_URL}/users/me/points/packages`, { headers: authHeaders() });
  if (!resp.ok) throw new Error('Failed to fetch packages');
  return resp.json();
}

export async function getPaymentMethod(): Promise<PaymentSettings> {
  const resp = await fetch(`${API_URL}/users/me/points/payment-method`, { headers: authHeaders() });
  if (!resp.ok) throw new Error('Failed to fetch payment method');
  return resp.json();
}

export async function purchasePackage(package_id: number) {
  const resp = await fetch(`${API_URL}/users/me/points/purchase`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ package_id }),
  });
  if (!resp.ok) throw new Error('Purchase failed');
  return resp.json();
}

// ============ Qo'lda to'lov (manual payment) ============
// Foydalanuvchi bank/karta orqali to'laydi → ariza yuboradi → admin tasdiqlaydi

export async function createManualPayment(data: {
  package_id: number;
  payment_method: ManualPaymentMethod;
  payment_note: string;
}) {
  const resp = await fetch(`${API_URL}/users/me/points/manual-payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(data),
  });
  if (!resp.ok) {
    const e = await resp.json().catch(() => ({}));
    throw new Error(typeof e.detail === 'string' ? e.detail : 'Не удалось отправить заявку');
  }
  return resp.json();
}

export async function getMyManualPayments(): Promise<ManualPayment[]> {
  const resp = await fetch(`${API_URL}/users/me/points/manual-payments`, {
    headers: authHeaders(), cache: 'no-store',
  });
  if (!resp.ok) return [];
  return resp.json();
}

export async function cancelManualPayment(paymentId: number) {
  const resp = await fetch(`${API_URL}/users/me/points/manual-payment/${paymentId}`, {
    method: 'DELETE', headers: authHeaders(),
  });
  if (!resp.ok) {
    const e = await resp.json().catch(() => ({}));
    throw new Error(typeof e.detail === 'string' ? e.detail : 'Не удалось отменить');
  }
  return resp.json();
}

// ── Admin: qo'lda to'lov arizalarini boshqarish ──
export async function adminListManualPayments(
  status: 'pending' | 'approved' | 'rejected' | 'all' = 'pending'
): Promise<ManualPayment[]> {
  const resp = await fetch(`${API_URL}/admin/manual-payments?status=${status}`, {
    headers: authHeaders(), cache: 'no-store',
  });
  if (!resp.ok) return [];
  return resp.json();
}

export async function adminApproveManualPayment(paymentId: number, adminNote = '') {
  const resp = await fetch(`${API_URL}/admin/manual-payments/${paymentId}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ admin_note: adminNote }),
  });
  if (!resp.ok) {
    const e = await resp.json().catch(() => ({}));
    throw new Error(typeof e.detail === 'string' ? e.detail : 'Не удалось подтвердить');
  }
  return resp.json();
}

export async function adminRejectManualPayment(paymentId: number, adminNote = '') {
  const resp = await fetch(`${API_URL}/admin/manual-payments/${paymentId}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ admin_note: adminNote }),
  });
  if (!resp.ok) {
    const e = await resp.json().catch(() => ({}));
    throw new Error(typeof e.detail === 'string' ? e.detail : 'Не удалось отклонить');
  }
  return resp.json();
}

export async function adminGetManualPaymentsPendingCount(): Promise<number> {
  const resp = await fetch(`${API_URL}/admin/manual-payments/pending-count`, {
    headers: authHeaders(), cache: 'no-store',
  });
  if (!resp.ok) return 0;
  const data = await resp.json().catch(() => ({ count: 0 }));
  return data.count || 0;
}

// ============ Radio ============
export async function getRadioStatus(city?: string): Promise<RadioStatus> {
  try {
    const c = city || 'global';
    const resp = await fetch(`${API_URL}/radio/status?city=${c}`);
    if (resp.ok) return resp.json();
  } catch (_) {}
  // fallback — Icecast yoqilgan holat (backend ishlamasa ham pleyer urinib ko'radi)
  return {
    is_live: true,
    broadcaster_type: 'ai',
    broadcaster_name: 'AI Host',
    use_icecast: true,
    stream_url: null,
    listeners_count: 0,
  };
}

export async function getPlaylist(_city?: string): Promise<AudioSegment[]> {
  return [];
}

export function getStreamUrl(lang?: string, streamUrlFromStatus?: string | null): string {
  const target = streamUrlFromStatus || `/radio/live/${lang || 'ru'}`;
  if (target.startsWith('http://') || target.startsWith('https://')) {
    return target;
  }
  const base = RADIO_URL || API_URL || '';
  if (!base) return target;
  return `${base.replace(/\/+$/, '')}/${target.replace(/^\/+/, '')}`;
}

// ============ Chat ============
export async function getChatHistory(_city?: string): Promise<ChatMessage[]> {
  const resp = await fetch(`${API_URL}/chat/history?limit=50`);
  if (!resp.ok) throw new Error('Failed to fetch chat history');
  return resp.json();
}

export async function sendChatMessage(_city: string, message: string) {
  const resp = await fetch(`${API_URL}/chat/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ message }),
  });
  if (!resp.ok) {
    const error: any = new Error('Failed to send message');
    error.status = resp.status;
    error.response = resp;
    throw error;
  }
  return resp.json();
}

// Ovozli xabar (v3: POST /chat/voice — 0.005 point)
export async function sendVoiceMessage(
  _city: string,
  audioBlob: Blob,
  _destination: 'chat' | 'studio',
  _lang: string
) {
  // Blob MIME turiga qarab to'g'ri kengaytma tanlash (backend shu bo'yicha saqlaydi)
  const typeExtMap: Record<string, string> = {
    'audio/mp4': 'm4a',
    'audio/mpeg': 'mp3',
    'audio/ogg': 'ogg',
    'audio/webm': 'webm',
    'audio/wav': 'wav',
  };
  const baseType = (audioBlob.type || 'audio/webm').split(';')[0];
  const ext = typeExtMap[baseType] || 'webm';

  const fd = new FormData();
  fd.append('audio_file', audioBlob, `voice.${ext}`);

  const resp = await fetch(`${API_URL}/chat/voice`, {
    method: 'POST',
    headers: authHeaders(),
    body: fd,
  });

  if (!resp.ok) {
    const error: any = new Error('Failed to send voice');
    error.status = resp.status;
    error.response = resp;
    throw error;
  }
  const data = await resp.json();
  // detail.points ni yuqori darajaga chiqaramiz (moslik uchun)
  return { ...data, points: data?.detail?.points };
}

export async function sendTextMessage(_city: string, text: string, _lang: string) {
  return sendChatMessage(_city, text);
}

// ============ Casting (ведущий отбори) ============
export interface CastingStatus {
  applied: boolean;
  status?: 'pending' | 'approved' | 'rejected';
  admin_note?: string;
  created_at?: string;
  already_doverenniy?: boolean;
}

export async function getCastingStatus(): Promise<CastingStatus> {
  const resp = await fetch(`${API_URL}/casting/status`, { headers: authHeaders() });
  if (!resp.ok) throw new Error('Failed to fetch casting status');
  return resp.json();
}

export async function applyCasting(audioBlob: Blob, note: string): Promise<any> {
  const typeExtMap: Record<string, string> = {
    'audio/mp4': 'm4a',
    'audio/mpeg': 'mp3',
    'audio/ogg': 'ogg',
    'audio/webm': 'webm',
    'audio/wav': 'wav',
  };
  const baseType = (audioBlob.type || 'audio/webm').split(';')[0];
  const ext = typeExtMap[baseType] || 'webm';

  const fd = new FormData();
  fd.append('audio_file', audioBlob, `audition.${ext}`);
  fd.append('note', note);

  const resp = await fetch(`${API_URL}/casting/apply`, {
    method: 'POST',
    headers: authHeaders(),
    body: fd,
  });
  if (!resp.ok) {
    const err: any = await resp.json().catch(() => ({}));
    const error: any = new Error(err?.detail || 'Failed to submit casting application');
    error.status = resp.status;
    throw error;
  }
  return resp.json();
}

export async function uploadFile(city: string, file: File) {
  const formData = new FormData();
  formData.append('file', file);
  const resp = await fetch(`${API_URL}/chat/file?city=${encodeURIComponent(city || 'global')}`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw Object.assign(new Error(err.detail || 'File upload failed'), { status: resp.status });
  }
  return resp.json();
}

// ============ Opinions / Topics (yangi konsepsiya) ============
export interface CurrentTopic {
  id: number;
  title: string;
  description: string;
  opinion_count: number;
}

export async function getCurrentTopic(): Promise<CurrentTopic | null> {
  const resp = await fetch(`${API_URL}/opinions/current-topic`, { headers: authHeaders() });
  if (!resp.ok) return null;
  const data = await resp.json();
  return data.topic || null;
}

export async function sendOpinionText(text: string) {
  const resp = await fetch(`${API_URL}/opinions/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ kind: 'text', text, tg_message_id: 0 }),
  });
  if (!resp.ok) {
    const err: any = new Error('Failed to send opinion');
    err.status = resp.status;
    throw err;
  }
  return resp.json();
}

export async function sendOpinionVoice(audioBlob: Blob) {
  // Ovoz mini-app orqali — backendga yuklaymiz (Telegram emas, lekin file saqlanmaydi-zarur emas MVP)
  const fd = new FormData();
  fd.append('audio_file', audioBlob, 'opinion.webm');
  const resp = await fetch(`${API_URL}/opinions/voice`, {
    method: 'POST',
    headers: authHeaders(),
    body: fd,
  });
  if (!resp.ok) {
    const err: any = new Error('Failed to send voice opinion');
    err.status = resp.status;
    throw err;
  }
  return resp.json();
}

// Admin: topics
export async function adminCreateTopic(title: string, description = '') {
  const resp = await fetch(`${API_URL}/admin/topics`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ title, description }),
  });
  if (!resp.ok) throw new Error('Failed to create topic');
  return resp.json();
}

export async function adminGetTopics() {
  const resp = await fetch(`${API_URL}/admin/topics`, { headers: authHeaders() });
  if (!resp.ok) throw new Error('Failed to fetch topics');
  return resp.json();
}

export async function adminCloseTopic(topicId: number) {
  const resp = await fetch(`${API_URL}/admin/topics/${topicId}/close`, {
    method: 'POST', headers: authHeaders(),
  });
  if (!resp.ok) throw new Error('Failed to close topic');
  return resp.json();
}

// ============ Announcements (admin — v3'da yo'q, stub) ============
export async function updateAnnouncement(_slot: number, _data: any) {
  return { ok: true };
}

// ============ Admin (v3) ============
export async function getUsers() {
  const resp = await fetch(`${API_URL}/admin/users`, { headers: authHeaders() });
  if (!resp.ok) throw new Error('Failed to fetch users');
  return resp.json();
}

// Faqat sonini olish uchun yengil chaqiruv — BottomNav'dagi Profil
// значоки va Admin panelning "Кастинг" tab значoki shu bilan ishlaydi.
export async function adminGetCastingPendingCount(): Promise<number> {
  const resp = await fetch(`${API_URL}/casting/admin/list?status=pending`, { headers: authHeaders() });
  if (!resp.ok) return 0;
  const data = await resp.json().catch(() => []);
  return Array.isArray(data) ? data.length : 0;
}

export async function adminSetLevel(user_id: number, level: number) {
  const resp = await fetch(`${API_URL}/admin/users/set-level`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ user_id, level }),
  });
  if (!resp.ok) throw new Error('Failed to set level');
  return resp.json();
}

// Admin yoki moderator huquqi berish/qaytarib olish — level 1/2/3
// zinapoyasidan alohida, faqat mavjud admin bera oladi (moderator emas).
export type StaffRole = 'admin' | 'moderator' | 'none';
export async function adminSetStaffRole(user_id: number, role: StaffRole) {
  const resp = await fetch(`${API_URL}/admin/users/set-admin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ user_id, role }),
  });
  if (!resp.ok) {
    const e = await resp.json().catch(() => ({}));
    throw new Error(typeof e.detail === 'string' ? e.detail : 'Failed to set role');
  }
  return resp.json();
}

// Efir bo'sh paytida (AI navbat) va jonli efir pauzasida jimlik o'rniga
// chaladigan musiqa — Music tab (Admin) va MusicScreen (admin/ведущий) uchun.
export async function getDefaultMusic(): Promise<{ name: string | null; url: string | null }> {
  const resp = await fetch(`${API_URL}/admin/music/default`, { headers: authHeaders() });
  if (!resp.ok) return { name: null, url: null };
  return resp.json();
}

export async function uploadDefaultMusic(file: File) {
  const form = new FormData();
  form.append('audio_file', file);
  const resp = await fetch(`${API_URL}/admin/music/default`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  });
  if (!resp.ok) {
    const e = await resp.json().catch(() => ({}));
    throw new Error(typeof e.detail === 'string' ? e.detail : 'Failed to upload music');
  }
  return resp.json();
}

export async function deleteDefaultMusic() {
  const resp = await fetch(`${API_URL}/admin/music/default`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!resp.ok) throw new Error('Failed to delete music');
  return resp.json();
}

export async function adminAddPoints(user_id: number, amount: number) {
  const resp = await fetch(`${API_URL}/admin/users/add-points`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ user_id, amount }),
  });
  if (!resp.ok) throw new Error('Failed to add points');
  return resp.json();
}

// ============ Admin: to'lov sozlamalari va paketlar ============
export async function adminGetPaymentSettings(): Promise<PaymentSettings> {
  const resp = await fetch(`${API_URL}/admin/settings/payment`, { headers: authHeaders() });
  if (!resp.ok) throw new Error('Failed to fetch payment settings');
  return resp.json();
}

// Admin: foydalanuvchini butunlay o'chirish (CASCADE — barcha bog'liq ma'lumot bilan)
export async function adminDeleteUser(userId: number): Promise<void> {
  const resp = await fetch(`${API_URL}/admin/users/${userId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!resp.ok) {
    const e = await resp.json().catch(() => ({}));
    throw new Error(typeof e.detail === 'string' ? e.detail : 'Delete failed');
  }
}

export async function adminUpdatePaymentSettings(
  method: 'stars' | 'manual' | 'both',
  instructions: string,
  manualDetails = '',
  manualEnabled = true,
): Promise<PaymentSettings> {
  const resp = await fetch(`${API_URL}/admin/settings/payment`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({
      method,
      instructions,
      manual_details: manualDetails,
      manual_enabled: manualEnabled,
    }),
  });
  if (!resp.ok) throw new Error('Failed to update payment settings');
  return resp.json();
}

export async function adminListPackages(): Promise<AdminPackage[]> {
  const resp = await fetch(`${API_URL}/admin/packages`, { headers: authHeaders() });
  if (!resp.ok) throw new Error('Failed to fetch packages');
  return resp.json();
}

export async function adminCreatePackage(data: { points_amount: number; price_eur: number; price_stars: number; label: string }): Promise<AdminPackage> {
  const resp = await fetch(`${API_URL}/admin/packages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(data),
  });
  if (!resp.ok) throw new Error('Failed to create package');
  return resp.json();
}

export async function adminUpdatePackage(id: number, data: { points_amount: number; price_eur: number; price_stars: number; label: string; is_active: boolean }): Promise<AdminPackage> {
  const resp = await fetch(`${API_URL}/admin/packages/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(data),
  });
  if (!resp.ok) throw new Error('Failed to update package');
  return resp.json();
}

export async function adminDeletePackage(id: number) {
  const resp = await fetch(`${API_URL}/admin/packages/${id}`, {
    method: 'DELETE', headers: authHeaders(),
  });
  if (!resp.ok) throw new Error('Failed to delete package');
  return resp.json();
}

// ============ Admin: xizmat narxlari (FAQAT haqiqiy admin) ============
export interface Pricing {
  price_text_message: string;
  price_voice_message: string;
  price_slot_per_hour: string;
}

export async function adminGetPricing(): Promise<Pricing> {
  const resp = await fetch(`${API_URL}/admin/pricing`, { headers: authHeaders() });
  if (!resp.ok) throw new Error('Failed to fetch pricing');
  return resp.json();
}

export async function adminUpdatePricing(data: {
  price_text_message: number; price_voice_message: number; price_slot_per_hour: number;
}): Promise<Pricing> {
  const resp = await fetch(`${API_URL}/admin/pricing`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(data),
  });
  if (!resp.ok) {
    const e = await resp.json().catch(() => ({}));
    throw new Error(typeof e.detail === 'string' ? e.detail : 'Failed to update pricing');
  }
  return resp.json();
}

// Eski drafts API — v3'da yo'q (stub, Admin sahifa buzilmasligi uchun)
export async function getDrafts(_status = 'pending'): Promise<any[]> {
  return [];
}
export async function editDraft(_id: number, _script: string) { return { ok: true }; }
export async function approveDraft(_id: number) { return { ok: true }; }
export async function rejectDraft(_id: number) { return { ok: true }; }

// ============ Stats ============
export interface UserStats {
  total_messages: number;
  chat_messages: number;
  voice_messages: number;
  studio_messages: number;
  file_uploads: number;
  points_earned: number;
  points_spent: number;
  current_points: number;
  days_active: number;
  broadcasts_count: number;
  favorite_count: number;
  level: number;
}

export async function getUserStats(): Promise<UserStats> {
  const resp = await fetch(`${API_URL}/users/stats`, { headers: authHeaders() });
  if (!resp.ok) throw new Error('Failed to fetch stats');
  return resp.json();
}

// ============ Voice Chat Status ============
export interface VoiceChatStatus {
  configured: boolean;
  in_call: boolean;
}

export async function getVoiceChatStatus(): Promise<VoiceChatStatus> {
  try {
    const resp = await fetch(`${API_URL}/voice/status`, { headers: authHeaders() });
    if (resp.ok) return resp.json();
  } catch {}
  return { configured: false, in_call: false };
}

// ============ Music Voting ============
export interface MusicNomination {
  id: number;
  title: string;
  artist: string;
  vote_count: number;
  username: string | null;
  display_name: string | null;
  user_voted: boolean;
  created_at: string;
}

export interface MusicCurrentResult {
  topic: { id: number; title: string } | null;
  nominations: MusicNomination[];
}

export async function getMusicCurrent(): Promise<MusicCurrentResult> {
  const resp = await fetch(`${API_URL}/music/current`, { headers: authHeaders() });
  if (!resp.ok) return { topic: null, nominations: [] };
  return resp.json();
}

export async function getMusicNominations(topicId: number): Promise<MusicNomination[]> {
  const resp = await fetch(`${API_URL}/music/nominations/${topicId}`, { headers: authHeaders() });
  if (!resp.ok) throw new Error('Failed');
  return resp.json();
}

export async function addMusicNomination(topicId: number, title: string, artist = '') {
  const resp = await fetch(`${API_URL}/music/nominations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ topic_id: topicId, title, artist }),
  });
  if (!resp.ok) {
    const e = await resp.json().catch(() => ({}));
    throw new Error(e.detail || 'Failed');
  }
  return resp.json();
}

export async function voteMusicNomination(nominationId: number) {
  const resp = await fetch(`${API_URL}/music/vote/${nominationId}`, {
    method: 'POST', headers: authHeaders(),
  });
  if (!resp.ok) {
    const e = await resp.json().catch(() => ({}));
    throw new Error(e.detail || 'Failed');
  }
  return resp.json();
}

export async function getMusicWinner(topicId: number) {
  const resp = await fetch(`${API_URL}/music/winner/${topicId}`, { headers: authHeaders() });
  if (!resp.ok) return { winner: null };
  return resp.json();
}

// ============ Broadcast Slots (Efir jadvali) ============
export interface BroadcastSlot {
  id: number;
  title: string;
  description: string;
  scheduled_at: string;
  duration_min: number;
  status: string;
  share_url: string;
  username: string | null;
  display_name: string | null;
  host_telegram_id: number | null;
  countdown_sec: number;
  is_soon: boolean;
  is_live_now: boolean;
}

export async function getUpcomingSlots(): Promise<BroadcastSlot[]> {
  const resp = await fetch(`${API_URL}/slots/upcoming`, { headers: authHeaders() });
  if (!resp.ok) return [];
  return resp.json();
}

// Vediushiyning o'z slotlari — GoLiveButton'da "bron qilinganmi?" holatini
// ko'rsatish uchun (backend GET /slots/my — host_user_id = joriy user).
export async function getMySlots(): Promise<BroadcastSlot[]> {
  const resp = await fetch(`${API_URL}/slots/my`, { headers: authHeaders() });
  if (!resp.ok) return [];
  return resp.json();
}

export async function getAllSlots(): Promise<BroadcastSlot[]> {
  const resp = await fetch(`${API_URL}/slots/`, { headers: authHeaders() });
  if (!resp.ok) return [];
  return resp.json();
}

export async function adminCreateSlot(data: {
  host_user_id: number;
  title: string;
  description?: string;
  scheduled_at: string;
  duration_min?: number;
}) {
  const resp = await fetch(`${API_URL}/slots/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(data),
  });
  if (!resp.ok) {
    const e = await resp.json().catch(() => ({}));
    if (typeof e.detail === 'string') throw new Error(e.detail);
    if (e.detail?.error === 'insufficient_points') {
      throw new Error(`У ведущего недостаточно поинтов для слота (нужно ${e.detail.required}, есть ${e.detail.points})`);
    }
    throw new Error('Failed to create slot');
  }
  return resp.json();
}

export async function adminUpdateSlotStatus(slotId: number, status: string) {
  const resp = await fetch(`${API_URL}/slots/${slotId}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ status }),
  });
  if (!resp.ok) throw new Error('Failed');
  return resp.json();
}

export async function adminDeleteSlot(slotId: number) {
  const resp = await fetch(`${API_URL}/slots/${slotId}`, {
    method: 'DELETE', headers: authHeaders(),
  });
  if (!resp.ok) throw new Error('Failed');
  return resp.json();
}

// ============ Guruhlar (ведущий yaratadi) ============
export async function getRooms(): Promise<ChatRoom[]> {
  const resp = await fetch(`${API_URL}/rooms`, { headers: authHeaders(), cache: 'no-store' });
  if (!resp.ok) throw new Error('Failed to fetch rooms');
  return resp.json();
}

export async function createRoom(title: string, description: string): Promise<ChatRoom> {
  const resp = await fetch(`${API_URL}/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ title, description }),
  });
  if (!resp.ok) {
    const e = await resp.json().catch(() => ({}));
    throw new Error(e.detail || 'Failed to create room');
  }
  return resp.json();
}

export async function closeRoom(roomId: number) {
  const resp = await fetch(`${API_URL}/rooms/${roomId}/close`, {
    method: 'POST', headers: authHeaders(),
  });
  if (!resp.ok) throw new Error('Failed to close room');
  return resp.json();
}

// To'liq o'chirish — qaytarib bo'lmaydi, closeRoom'dan farqli (u faqat
// yashiradi). Xabarlar tarixi ham CASCADE bilan ketadi.
export async function deleteRoom(roomId: number) {
  const resp = await fetch(`${API_URL}/rooms/${roomId}`, {
    method: 'DELETE', headers: authHeaders(),
  });
  if (!resp.ok) throw new Error('Failed to delete room');
  return resp.json();
}

export async function getRoomMessages(roomId: number): Promise<ChatMessage[]> {
  const resp = await fetch(`${API_URL}/rooms/${roomId}/messages`, { headers: authHeaders(), cache: 'no-store' });
  if (!resp.ok) {
    // status prikrepiladi — RoomChatModal buni ishlatib, guruhdan chetlatilgan
    // (403) foydalanuvchini avtomatik chiqarib yuboradi (kutilmagan xato emas).
    const err: any = new Error('Failed to fetch room messages');
    err.status = resp.status;
    throw err;
  }
  return resp.json();
}

export interface RoomMember {
  user_id: number;
  telegram_id: number;
  username: string | null;
  display_name: string | null;
  is_host: boolean;
}

export async function getRoomMembers(roomId: number): Promise<RoomMember[]> {
  const resp = await fetch(`${API_URL}/rooms/${roomId}/members`, { headers: authHeaders(), cache: 'no-store' });
  if (!resp.ok) throw new Error('Failed to fetch room members');
  return resp.json();
}

// identifier — Telegram ID (raqam) yoki @username, ikkalasi ham mumkin.
export async function inviteToRoom(roomId: number, identifier: string) {
  const resp = await fetch(`${API_URL}/rooms/${roomId}/invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ identifier }),
  });
  if (!resp.ok) {
    const e = await resp.json().catch(() => ({}));
    throw new Error(typeof e.detail === 'string' ? e.detail : 'Failed to invite user');
  }
  return resp.json();
}

export async function kickFromRoom(roomId: number, userId: number) {
  const resp = await fetch(`${API_URL}/rooms/${roomId}/kick`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ user_id: userId }),
  });
  if (!resp.ok) {
    const e = await resp.json().catch(() => ({}));
    throw new Error(typeof e.detail === 'string' ? e.detail : 'Failed to remove user');
  }
  return resp.json();
}

export async function sendRoomMessage(roomId: number, message: string) {
  const resp = await fetch(`${API_URL}/rooms/${roomId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ message }),
  });
  if (!resp.ok) {
    const err: any = new Error('Failed to send room message');
    err.status = resp.status;
    throw err;
  }
  return resp.json();
}

export async function sendRoomVoice(roomId: number, audioBlob: Blob) {
  const typeExtMap: Record<string, string> = {
    'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/webm': 'webm', 'audio/wav': 'wav',
  };
  const baseType = (audioBlob.type || 'audio/webm').split(';')[0];
  const ext = typeExtMap[baseType] || 'webm';
  const fd = new FormData();
  fd.append('audio_file', audioBlob, `voice.${ext}`);
  const resp = await fetch(`${API_URL}/rooms/${roomId}/voice`, {
    method: 'POST', headers: authHeaders(), body: fd,
  });
  if (!resp.ok) {
    const err: any = new Error('Failed to send room voice');
    err.status = resp.status;
    err.response = resp;
    throw err;
  }
  return resp.json();
}

// ============ Music: admin moderation ============
export async function adminDeleteNomination(nominationId: number) {
  const resp = await fetch(`${API_URL}/music/nominations/${nominationId}`, {
    method: 'DELETE', headers: authHeaders(),
  });
  if (!resp.ok) throw new Error('Failed to delete nomination');
  return resp.json();
}

// ============ Jonli efirga ulanish / Live Mic Request (Hand-raise) ============
export interface LiveMicRequest {
  id: number;
  user_id: number;
  telegram_id: number | null;
  username: string | null;
  display_name: string | null;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string | null;
}

export async function requestLiveMic(city: string) {
  const resp = await fetch(`${API_URL}/radio/${encodeURIComponent(city)}/mic-requests`, {
    method: 'POST',
    headers: authHeaders(),
  });
  if (!resp.ok) {
    const e = await resp.json().catch(() => ({}));
    throw new Error(e.detail || 'Не удалось отправить запрос в эфир');
  }
  return resp.json();
}

export async function getLiveMicRequests(city: string): Promise<LiveMicRequest[]> {
  const resp = await fetch(`${API_URL}/radio/${encodeURIComponent(city)}/mic-requests`, {
    headers: authHeaders(),
  });
  if (!resp.ok) return [];
  return resp.json();
}

export async function approveLiveMicRequest(city: string, requestId: number) {
  const resp = await fetch(`${API_URL}/radio/${encodeURIComponent(city)}/mic-requests/${requestId}/approve`, {
    method: 'POST',
    headers: authHeaders(),
  });
  if (!resp.ok) {
    const e = await resp.json().catch(() => ({}));
    throw new Error(e.detail || 'Ошибка одобрения');
  }
  return resp.json();
}

export async function rejectLiveMicRequest(city: string, requestId: number) {
  const resp = await fetch(`${API_URL}/radio/${encodeURIComponent(city)}/mic-requests/${requestId}/reject`, {
    method: 'POST',
    headers: authHeaders(),
  });
  if (!resp.ok) {
    const e = await resp.json().catch(() => ({}));
    throw new Error(e.detail || 'Ошибка отклонения');
  }
  return resp.json();
}

export async function getMyMicRequest(city: string): Promise<{ status: 'none' | 'pending' | 'approved' | 'rejected'; request_id: number | null }> {
  const resp = await fetch(`${API_URL}/radio/${encodeURIComponent(city)}/mic-requests/me`, {
    headers: authHeaders(),
  });
  if (!resp.ok) return { status: 'none', request_id: null };
  return resp.json();
}
