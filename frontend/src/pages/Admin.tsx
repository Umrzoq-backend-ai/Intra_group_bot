import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Plus, X, Users, MessageSquare, Lock, Loader, Sparkles, CheckCircle,
  XCircle, Calendar, Music, ArrowLeft, Mic, CreditCard, Trash2, Search,
  Upload, UserPlus, Check, RefreshCw, Radio as RadioIcon
} from 'lucide-react';
import {
  adminCreateTopic, adminGetTopics, adminCloseTopic,
  getUsers, adminSetLevel, adminSetStaffRole, adminAddPoints, getMe,
  adminCreateSlot, getAllSlots, adminUpdateSlotStatus,
  getMusicNominations, adminDeleteNomination,
  adminGetPaymentSettings, adminUpdatePaymentSettings,
  adminListPackages, adminCreatePackage, adminUpdatePackage, adminDeletePackage,
  adminGetPricing, adminUpdatePricing,
  getDefaultMusic, uploadDefaultMusic, deleteDefaultMusic,
  adminListManualPayments, adminApproveManualPayment, adminRejectManualPayment,
  type BroadcastSlot, type MusicNomination, type StaffRole, type Pricing,
  adminDeleteUser,
} from '../lib/api';
import type { User } from '../types';
import { GlitchText } from '../components/ui/GlitchText';
import { authHeaders, getToken } from '../lib/auth';
import { API_URL } from '../lib/config';
import { getLang } from '../lib/i18n';
import { useWebSocket } from '../hooks/useWebSocket';
import type { PaymentSettings, AdminPackage, ManualPayment } from '../types';

// To'lov usuli: stars (avtomatik) | manual (ariza) | both (ikkalasi)
type PayMethod = 'stars' | 'manual' | 'both';

interface Topic {
  id: number; title: string; description: string;
  status: string; opinion_count: number; created_at: string;
}
interface UserRow {
  id: number; telegram_id: number; username: string | null;
  display_name: string | null; level: number; points: string;
  role: string; created_at: string;
}
interface Draft {
  id: number; city: string; main_topic: string;
  source_count: number; status: string; created_at: string;
  script_preview?: string; dialog?: string; meta?: any;
}
interface CastingApp {
  id: number; user_id: number; username: string | null; display_name: string | null;
  audio_url: string; note: string; status: string; admin_note: string;
  created_at: string; decided_at: string | null;
}

const L: Record<string, Record<string, string>> = {
  ru: {
    title: 'ADMIN PANEL', topics_tab: 'Темы', users_tab: 'Доступ', drafts_tab: 'Эфир', slots_tab: 'Слоты', music_tab: 'Музыка', casting_tab: 'Кастинг',
    no_casting: 'Нет заявок', casting_approve: 'Одобрить → Доверенный', casting_reject: 'Отклонить',
    casting_note_placeholder: 'Комментарий (необязательно)...',
    new_topic: 'Новая тема', topic_title: 'Название темы', topic_desc: 'Описание',
    create: 'Создать', close: 'Закрыть', active: 'Активна', closed: 'Закрыта',
    opinions: 'мнений', no_topics: 'Нет тем', no_users: 'Нет пользователей',
    add_pts: 'Поинты', lvl1: '1', lvl2: '2', lvl3: '3',
    level_label: 'Уровень', access_legend_title: 'Уровни доступа',
    lvl1_desc: '1 — слушает эфир и чат', lvl2_desc: '2 — пишет в чат, переводит поинты',
    lvl3_desc: '3 — доступ к микрофону (эфир)',
    make_moderator: 'Сделать модератором', revoke_moderator: 'Убрать модератора',
    moderator_badge: 'Модератор', main_admin_badge: 'Главный админ',
    confirm_grant_admin: 'Сделать этого пользователя модератором? Он получит доступ ко всей админ-панели (темы, эфир, кастинг, слоты, музыка, оплата, поинты), но не сможет менять уровни и роли других пользователей.',
    confirm_revoke_admin: 'Убрать у этого пользователя права модератора?',
    search_users_placeholder: 'Поиск по ID или @username',
    search_no_results: 'Никого не найдено',
    default_music_title: 'Музыка по умолчанию', default_music_none: 'Не задано — играет тишина',
    default_music_upload: 'Загрузить трек', default_music_replace: 'Заменить трек',
    aggregate: 'Создать диалог', no_drafts: 'Нет черновиков эфира',
    pending: 'Ожидает', approved: 'В эфире', rejected: 'Отклонён',
    approve: 'Одобрить → Эфир', reject: 'Отклонить', view: 'Смотреть',
    dialog_title: 'Диалог', positions: 'Позиции слушателей', music: 'Музыка',
    sources: 'источников', words: 'слов',
    no_nominations: 'Нет предложенных треков', votes: 'голосов', winner_label: 'Играет в эфире',
    confirm_delete_nom: 'Удалить этот трек из голосования?',
    payment_tab: 'Оплата', payment_method_title: 'Способ оплаты поинтов',
    payment_stars: '⭐ Telegram Stars', payment_stars_desc: 'Автоматическая покупка через бота (Telegram Payments)',
    payment_manual: '✉️ Вручную', payment_manual_desc: 'Кнопка «Купить» покажет пользователю ваши инструкции/контакт',
    payment_instructions_label: 'Инструкция для пользователя (если «Вручную»)',
    payment_instructions_placeholder: 'Например: напишите @admin_username, чтобы купить поинты картой или переводом',
    payment_both: '⭐+✉️ Оба способа', payment_both_desc: 'Пользователь сам выбирает: Stars или заявка на ручную оплату',
    manual_details_label: 'Реквизиты для оплаты (видит пользователь)',
    manual_details_placeholder: 'IBAN: LT12 3456 7890\nПолучатель: INTRA GROUP UAB\nИли карта: 1234 5678 9012 3456',
    manual_enabled_label: 'Приём заявок на ручную оплату',
    manual_requests_title: 'Заявки на ручную оплату',
    manual_no_requests: 'Нет заявок',
    manual_filter_pending: 'Ожидают', manual_filter_approved: 'Подтверждены',
    manual_filter_rejected: 'Отклонены', manual_filter_all: 'Все',
    manual_approve: 'Подтвердить', manual_reject: 'Отклонить',
    manual_note_label: 'Комментарий администратора (причина отказа)',
    manual_note_ph: 'Например: платёж не найден',
    manual_approve_confirm: 'Подтвердить оплату? Поинты будут начислены пользователю автоматически.',
    manual_reject_confirm: 'Отклонить заявку? Пользователь получит уведомление.',
    manual_user_note: 'Комментарий пользователя',
    mm_bank: 'Банк. перевод', mm_card: 'Карта', mm_cash: 'Наличные', mm_crypto: 'Крипто', mm_other: 'Другое',
    save: 'Сохранить', saved: 'Сохранено', packages_title: 'Пакеты поинтов',
    package_label: 'Название', package_points: 'Поинты', package_price: 'Цена €',
    package_price_stars: 'Цена ⭐',
    package_active: 'Активен', package_add: 'Добавить пакет', package_delete: 'Удалить пакет?',
    no_packages: 'Нет пакетов',
    add_pts_title: 'Управление поинтами', add_pts_to: 'Кому', amount: 'Количество',
    add_pts_submit: 'Начислить', add_pts_hint: 'Баланс админа не меняется — поинты берутся не с вашего счёта',
    mode_add: 'Начислить', mode_deduct: 'Списать', deduct_pts_submit: 'Списать',
    cancel: 'Отмена', confirm: 'Подтвердить', confirm_delete_title: 'Подтверждение',
    pricing_title: 'Стоимость услуг', pricing_hint: 'Сколько поинтов списывается у пользователя за каждое действие. Изменения применяются сразу.',
    pricing_text: 'Текстовое сообщение', pricing_voice: 'Голосовое сообщение', pricing_slot: 'Час эфира (слот)',
    pricing_saved: 'Цены сохранены',
    grant_access: 'Дать права главного админа', grant_access_title: 'Полные права администратора',
    grant_access_pick: 'Выбрать', grant_access_hint: 'Выберите пользователя, чтобы дать ему полные права администратора (или, если они уже есть, — забрать их). Для модератора — вкладка «Доступ».',
    no_candidates: 'Некому давать права',
    make_full_admin: '👑 Сделать администратором', revoke_full_admin: 'Убрать права администратора',
    confirm_grant_full_admin: 'Дать этому пользователю ПОЛНЫЕ права администратора? Он сможет всё, включая изменение ролей и уровней других пользователей, оплату, кастинг и слоты.',
    confirm_revoke_full_admin: 'Забрать полные права администратора у этого пользователя? Он станет доверенным ведущим (модератором, если хотите оставить доступ к панели — назначьте отдельно).',
  },
  en: {
    title: 'ADMIN PANEL', topics_tab: 'Topics', users_tab: 'Access', drafts_tab: 'Broadcast', slots_tab: 'Slots', music_tab: 'Music', casting_tab: 'Casting',
    no_casting: 'No applications', casting_approve: 'Approve → Trusted', casting_reject: 'Reject',
    casting_note_placeholder: 'Note (optional)...',
    new_topic: 'New topic', topic_title: 'Topic title', topic_desc: 'Description',
    create: 'Create', close: 'Close', active: 'Active', closed: 'Closed',
    opinions: 'opinions', no_topics: 'No topics', no_users: 'No users',
    add_pts: 'Points', lvl1: '1', lvl2: '2', lvl3: '3',
    level_label: 'Level', access_legend_title: 'Access levels',
    lvl1_desc: '1 — listens to broadcast and chat', lvl2_desc: '2 — writes in chat, transfers points',
    lvl3_desc: '3 — microphone access (broadcast)',
    make_moderator: 'Make moderator', revoke_moderator: 'Revoke moderator',
    moderator_badge: 'Moderator', main_admin_badge: 'Main admin',
    confirm_grant_admin: 'Make this user a moderator? They will get access to the entire admin panel (topics, broadcast, casting, slots, music, payment, points), but cannot change other users\' levels or roles.',
    confirm_revoke_admin: 'Revoke moderator access from this user?',
    search_users_placeholder: 'Search by ID or @username',
    search_no_results: 'No one found',
    default_music_title: 'Default music', default_music_none: 'Not set — silence plays',
    default_music_upload: 'Upload track', default_music_replace: 'Replace track',
    aggregate: 'Create dialog', no_drafts: 'No broadcast drafts',
    pending: 'Pending', approved: 'On air', rejected: 'Rejected',
    approve: 'Approve → Air', reject: 'Reject', view: 'View',
    dialog_title: 'Dialog', positions: 'Listener positions', music: 'Music',
    sources: 'sources', words: 'words',
    no_nominations: 'No track suggestions', votes: 'votes', winner_label: 'On air',
    confirm_delete_nom: 'Remove this track from voting?',
    payment_tab: 'Payment', payment_method_title: 'Points payment method',
    payment_stars: '⭐ Telegram Stars', payment_stars_desc: 'Automatic purchase via bot (Telegram Payments)',
    payment_manual: '✉️ Manual', payment_manual_desc: 'The "Buy" button will show your instructions/contact to users',
    payment_instructions_label: 'Instructions for users (if "Manual")',
    payment_instructions_placeholder: 'e.g. message @admin_username to buy points by card or transfer',
    payment_both: '⭐+✉️ Both methods', payment_both_desc: 'User chooses: Stars or a manual payment request',
    manual_details_label: 'Payment details (visible to users)',
    manual_details_placeholder: 'IBAN: LT12 3456 7890\nBeneficiary: INTRA GROUP UAB\nOr card: 1234 5678 9012 3456',
    manual_enabled_label: 'Accept manual payment requests',
    manual_requests_title: 'Manual payment requests',
    manual_no_requests: 'No requests',
    manual_filter_pending: 'Pending', manual_filter_approved: 'Approved',
    manual_filter_rejected: 'Rejected', manual_filter_all: 'All',
    manual_approve: 'Approve', manual_reject: 'Reject',
    manual_note_label: 'Admin comment (rejection reason)',
    manual_note_ph: 'e.g. payment not found',
    manual_approve_confirm: 'Approve payment? Points will be credited to the user automatically.',
    manual_reject_confirm: 'Reject request? The user will be notified.',
    manual_user_note: 'User comment',
    mm_bank: 'Bank transfer', mm_card: 'Card', mm_cash: 'Cash', mm_crypto: 'Crypto', mm_other: 'Other',
    save: 'Save', saved: 'Saved', packages_title: 'Point packages',
    package_label: 'Label', package_points: 'Points', package_price: 'Price €',
    package_price_stars: 'Price ⭐',
    package_active: 'Active', package_add: 'Add package', package_delete: 'Delete package?',
    no_packages: 'No packages',
    add_pts_title: 'Manage points', add_pts_to: 'To', amount: 'Amount',
    add_pts_submit: 'Add', add_pts_hint: "Your own balance is untouched — points aren't taken from your account",
    mode_add: 'Add', mode_deduct: 'Deduct', deduct_pts_submit: 'Deduct',
    cancel: 'Cancel', confirm: 'Confirm', confirm_delete_title: 'Confirm',
    pricing_title: 'Service pricing', pricing_hint: 'How many points are deducted from a user for each action. Changes apply immediately.',
    pricing_text: 'Text message', pricing_voice: 'Voice message', pricing_slot: 'Broadcast hour (slot)',
    pricing_saved: 'Prices saved',
    grant_access: 'Grant full admin rights', grant_access_title: 'Full administrator rights',
    grant_access_pick: 'Select', grant_access_hint: 'Pick a user to give them full administrator rights (or remove them, if they already have it). For moderator access, use the Users tab.',
    no_candidates: 'No one to grant rights to',
    make_full_admin: '👑 Make administrator', revoke_full_admin: 'Revoke administrator rights',
    confirm_grant_full_admin: 'Give this user FULL administrator rights? They will be able to do everything, including changing other users\' roles/levels, payment, casting and slots.',
    confirm_revoke_full_admin: 'Revoke full administrator rights from this user? They will become a trusted host (assign moderator separately if you want to keep panel access).',
  },
  lt: {
    title: 'ADMIN PANEL', topics_tab: 'Temos', users_tab: 'Prieiga', drafts_tab: 'Eteris', slots_tab: 'Slotai', music_tab: 'Muzika', casting_tab: 'Atranka',
    no_casting: 'Nėra paraiškų', casting_approve: 'Patvirtinti → Patikimas', casting_reject: 'Atmesti',
    casting_note_placeholder: 'Komentaras (neprivalomas)...',
    new_topic: 'Nauja tema', topic_title: 'Temos pavadinimas', topic_desc: 'Aprašymas',
    create: 'Sukurti', close: 'Uždaryti', active: 'Aktyvi', closed: 'Uždaryta',
    opinions: 'nuomonių', no_topics: 'Nėra temų', no_users: 'Nėra vartotojų',
    add_pts: 'Taškai', lvl1: '1', lvl2: '2', lvl3: '3',
    level_label: 'Lygis', access_legend_title: 'Prieigos lygiai',
    lvl1_desc: '1 — klauso eterio ir pokalbio', lvl2_desc: '2 — rašo pokalbyje, perveda taškus',
    lvl3_desc: '3 — mikrofono prieiga (eteris)',
    make_moderator: 'Suteikti moderatoriaus teises', revoke_moderator: 'Atimti moderatoriaus teises',
    moderator_badge: 'Moderatorius', main_admin_badge: 'Pagrindinis adminas',
    confirm_grant_admin: 'Padaryti šį vartotoją moderatoriumi? Jis gaus prieigą prie visos admin panelės (temos, eteris, atranka, slotai, muzika, mokėjimas, taškai), bet negalės keisti kitų vartotojų lygių ar rolių.',
    confirm_revoke_admin: 'Atimti moderatoriaus teises iš šio vartotojo?',
    search_users_placeholder: 'Ieškoti pagal ID arba @username',
    search_no_results: 'Nieko nerasta',
    default_music_title: 'Numatytoji muzika', default_music_none: 'Nenustatyta — skamba tyla',
    default_music_upload: 'Įkelti dainą', default_music_replace: 'Pakeisti dainą',
    aggregate: 'Sukurti dialogą', no_drafts: 'Nėra eterio juodraščių',
    pending: 'Laukia', approved: 'Eteryje', rejected: 'Atmesta',
    approve: 'Patvirtinti → Eterį', reject: 'Atmesti', view: 'Žiūrėti',
    dialog_title: 'Dialogas', positions: 'Klausytojų pozicijos', music: 'Muzika',
    sources: 'šaltinių', words: 'žodžių',
    no_nominations: 'Nėra pasiūlytų dainų', votes: 'balsų', winner_label: 'Eteryje',
    confirm_delete_nom: 'Pašalinti šią dainą iš balsavimo?',
    payment_tab: 'Mokėjimas', payment_method_title: 'Taškų mokėjimo būdas',
    payment_stars: '⭐ Telegram Stars', payment_stars_desc: 'Automatinis pirkimas per botą (Telegram Payments)',
    payment_manual: '✉️ Rankiniu būdu', payment_manual_desc: 'Mygtukas „Pirkti“ parodys vartotojui jūsų instrukcijas/kontaktą',
    payment_instructions_label: 'Instrukcija vartotojui (jei „Rankiniu būdu“)',
    payment_instructions_placeholder: 'Pvz.: rašykite @admin_username, kad nusipirktumėte taškų kortele ar pervedimu',
    payment_both: '⭐+✉️ Abu būdai', payment_both_desc: 'Vartotojas pasirenka: Stars arba rankinio mokėjimo užklausa',
    manual_details_label: 'Mokėjimo rekvizitai (mato vartotojas)',
    manual_details_placeholder: 'IBAN: LT12 3456 7890\nGavėjas: INTRA GROUP UAB\nArba kortelė: 1234 5678 9012 3456',
    manual_enabled_label: 'Priimti rankinio mokėjimo užklausas',
    manual_requests_title: 'Rankinio mokėjimo užklausos',
    manual_no_requests: 'Užklausų nėra',
    manual_filter_pending: 'Peržiūrimos', manual_filter_approved: 'Patvirtintos',
    manual_filter_rejected: 'Atmestos', manual_filter_all: 'Visos',
    manual_approve: 'Patvirtinti', manual_reject: 'Atmesti',
    manual_note_label: 'Administratoriaus komentaras (atmetimo priežastis)',
    manual_note_ph: 'Pvz.: mokėjimas nerastas',
    manual_approve_confirm: 'Patvirtinti mokėjimą? Taškai bus priskirti vartotojui automatiškai.',
    manual_reject_confirm: 'Atmesti užklausą? Vartotojas gaus pranešimą.',
    manual_user_note: 'Vartotojo komentaras',
    mm_bank: 'Banko pervedimas', mm_card: 'Kortelė', mm_cash: 'Grynais', mm_crypto: 'Krypto', mm_other: 'Kita',
    save: 'Išsaugoti', saved: 'Išsaugota', packages_title: 'Taškų paketai',
    package_label: 'Pavadinimas', package_points: 'Taškai', package_price: 'Kaina €',
    package_price_stars: 'Kaina ⭐',
    package_active: 'Aktyvus', package_add: 'Pridėti paketą', package_delete: 'Ištrinti paketą?',
    no_packages: 'Nėra paketų',
    add_pts_title: 'Taškų valdymas', add_pts_to: 'Kam', amount: 'Kiekis',
    add_pts_submit: 'Pridėti', add_pts_hint: 'Jūsų balansas nekeičiamas — taškai neimami iš jūsų sąskaitos',
    mode_add: 'Pridėti', mode_deduct: 'Nurašyti', deduct_pts_submit: 'Nurašyti',
    cancel: 'Atšaukti', confirm: 'Patvirtinti', confirm_delete_title: 'Patvirtinimas',
    pricing_title: 'Paslaugų kainos', pricing_hint: 'Kiek taškų nurašoma iš vartotojo už kiekvieną veiksmą. Pakeitimai taikomi iš karto.',
    pricing_text: 'Teksto žinutė', pricing_voice: 'Balso žinutė', pricing_slot: 'Eterio valanda (slotas)',
    pricing_saved: 'Kainos išsaugotos',
    grant_access: 'Suteikti pilnas administratoriaus teises', grant_access_title: 'Pilnos administratoriaus teisės',
    grant_access_pick: 'Pasirinkti', grant_access_hint: 'Pasirinkite vartotoją, kad suteiktumėte jam pilnas administratoriaus teises (arba, jei jos jau yra, — jas panaikintumėte). Moderatoriaus teisėms — skirtukas „Доступ“.',
    no_candidates: 'Nėra kam suteikti teisių',
    make_full_admin: '👑 Padaryti administratoriumi', revoke_full_admin: 'Panaikinti administratoriaus teises',
    confirm_grant_full_admin: 'Suteikti šiam vartotojui PILNAS administratoriaus teises? Jis galės viską, įskaitant kitų vartotojų rolių/lygių keitimą, mokėjimus, atranką ir slotus.',
    confirm_revoke_full_admin: 'Panaikinti pilnas administratoriaus teises iš šio vartotojo? Jis taps patikimu vedėju (jei norite palikti prieigą prie panelės, priskirkite moderatorių atskirai).',
  },
};

// API helper funksiyalar (admin endpointlar uchun)
async function adminAggregateTopic(topicId: number) {
  const r = await fetch(`${API_URL}/admin/topics/${topicId}/aggregate`, {
    method: 'POST', headers: authHeaders(),
  });
  if (!r.ok) { const e = await r.json(); throw new Error(e.detail || 'Error'); }
  return r.json();
}
async function adminGetDrafts(): Promise<Draft[]> {
  const r = await fetch(`${API_URL}/admin/drafts`, { headers: authHeaders() });
  if (!r.ok) throw new Error('Failed');
  return r.json();
}
async function adminGetDraft(id: number): Promise<Draft> {
  const r = await fetch(`${API_URL}/admin/drafts/${id}`, { headers: authHeaders() });
  if (!r.ok) throw new Error('Failed');
  return r.json();
}
async function adminApproveDraft(id: number) {
  const r = await fetch(`${API_URL}/admin/drafts/${id}/approve`, {
    method: 'POST', headers: authHeaders(),
  });
  if (!r.ok) throw new Error('Failed');
  return r.json();
}
async function adminRejectDraft(id: number) {
  const r = await fetch(`${API_URL}/admin/drafts/${id}/reject`, {
    method: 'POST', headers: authHeaders(),
  });
  if (!r.ok) throw new Error('Failed');
  return r.json();
}
async function adminGetCasting(status: string): Promise<CastingApp[]> {
  const r = await fetch(`${API_URL}/casting/admin/list?status=${status}`, { headers: authHeaders() });
  if (!r.ok) throw new Error('Failed');
  return r.json();
}
async function adminApproveCasting(id: number, adminNote: string) {
  const r = await fetch(`${API_URL}/casting/admin/${id}/approve`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ admin_note: adminNote }),
  });
  if (!r.ok) throw new Error('Failed');
  return r.json();
}
async function adminRejectCasting(id: number, adminNote: string) {
  const r = await fetch(`${API_URL}/casting/admin/${id}/reject`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ admin_note: adminNote }),
  });
  if (!r.ok) throw new Error('Failed');
  return r.json();
}

export function Admin() {
  const navigate = useNavigate();
  const location = useLocation();
  const lang = getLang();
  const tx = (k: string) => L[lang]?.[k] || L.ru[k] || k;
  const [tab, setTab] = useState<'topics' | 'users' | 'drafts' | 'slots' | 'music' | 'casting' | 'payment'>('topics');
  const [me, setMe] = useState<User | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [slots, setSlots] = useState<BroadcastSlot[]>([]);
  const [castingApps, setCastingApps] = useState<CastingApp[]>([]);
  const [pendingCastingCount, setPendingCastingCount] = useState(0);
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings | null>(null);
  const [packages, setPackages] = useState<AdminPackage[]>([]);
  const [pricing, setPricing] = useState<Pricing | null>(null);
  const [addPointsTarget, setAddPointsTarget] = useState<UserRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState('');
  const [activeDraft, setActiveDraft] = useState<Draft | null>(null);
  const [aggregating, setAggregating] = useState<number | null>(null);
  const [showGrantAccess, setShowGrantAccess] = useState(false);

  useEffect(() => { loadData(); }, [tab]);
  useEffect(() => { getMe().then(setMe).catch(() => {}); }, []);

  useEffect(() => {
    if (me?.role !== 'admin') return;
    let cancelled = false;
    const loadCount = () => {
      adminGetCasting('pending')
        .then((apps) => { if (!cancelled) setPendingCastingCount(apps.length); })
        .catch(() => {});
    };
    loadCount();
    const interval = setInterval(loadCount, 20000);
    const onWake = () => { if (document.visibilityState === 'visible') loadCount(); };
    document.addEventListener('visibilitychange', onWake);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onWake);
    };
  }, [me?.role]);

  useWebSocket({
    city: 'global',
    onMessage: (msg) => {
      if (msg.type === 'casting_updated' && me?.role === 'admin') {
        adminGetCasting('pending').then((apps) => setPendingCastingCount(apps.length)).catch(() => {});
      }
    },
  });

  async function loadData() {
    setLoading(true);
    try {
      if (tab === 'topics') setTopics(await adminGetTopics());
      else if (tab === 'users') setUsers(await getUsers());
      else if (tab === 'slots') {
        setSlots(await getAllSlots());
        setUsers(await getUsers());
        adminGetPricing().then(setPricing).catch(() => {});
      }
      else if (tab === 'music') setTopics(await adminGetTopics());
      else if (tab === 'casting') {
        const apps = await adminGetCasting('pending');
        setCastingApps(apps);
        setPendingCastingCount(apps.length);
      }
      else if (tab === 'payment') {
        setPaymentSettings(await adminGetPaymentSettings());
        setPackages(await adminListPackages());
        setPricing(await adminGetPricing());
      }
      else setDrafts(await adminGetDrafts());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  function flash(msg: string) { setToast(msg); setTimeout(() => setToast(''), 2500); }

  async function handleCreateTopic() {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      await adminCreateTopic(newTitle.trim(), newDesc.trim());
      setNewTitle('');
      setNewDesc('');
      setShowCreate(false);
      flash('✅');
      await loadData();
    } catch { flash('❌'); }
    finally { setCreating(false); }
  }

  async function handleAggregate(topicId: number) {
    setAggregating(topicId);
    try {
      const res = await adminAggregateTopic(topicId);
      flash(`✅ Dialog #${res.draft_id} yaratildi!`);
      setTab('drafts');
    } catch (e: any) { flash(`❌ ${e.message}`); }
    finally { setAggregating(null); }
  }

  async function handleViewDraft(id: number) {
    try { setActiveDraft(await adminGetDraft(id)); } catch { flash('❌'); }
  }

  async function handleApproveDraft(id: number) {
    try { await adminApproveDraft(id); flash('✅ Efirga yuborildi!'); setActiveDraft(null); await loadData(); }
    catch { flash('❌'); }
  }

  async function handleRejectDraft(id: number) {
    try { await adminRejectDraft(id); flash('✅ Rad etildi'); setActiveDraft(null); await loadData(); }
    catch { flash('❌'); }
  }

  function handleBack() {
    const from = (location.state as { from?: string } | null)?.from;
    navigate('/radio', { replace: true, state: { screen: from || 'profile' } });
  }

  const isFullAdmin = me?.role === 'admin';
  type TabDef = readonly [string, typeof MessageSquare, string];
  const tabDefs: TabDef[] = [
    ['topics', MessageSquare, tx('topics_tab')],
    ['drafts', Sparkles, tx('drafts_tab')],
    ...(isFullAdmin ? [['casting', Mic, tx('casting_tab')] as TabDef] : []),
    ['slots', Calendar, tx('slots_tab')],
    ['music', Music, tx('music_tab')],
    ['users', Users, tx('users_tab')],
    ...(isFullAdmin ? [['payment', CreditCard, tx('payment_tab')] as TabDef] : []),
  ];

  return (
    <div
      className="bg-[#060a14] text-[#dfe2f1] relative min-h-screen selection:bg-[rgba(39,217,247,0.2)] selection:text-[#c2f3ff] overflow-y-auto overscroll-contain"
      style={{ height: 'var(--app-vh)', WebkitOverflowScrolling: 'touch' }}
    >
      {/* Background ambient neon glow */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-[radial-gradient(ellipse_at_center,rgba(39,217,247,0.12)_0%,rgba(5,154,240,0.05)_45%,transparent_75%)]" />
        <div className="absolute bottom-[-10%] left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-[radial-gradient(ellipse_at_center,rgba(139,92,246,0.08)_0%,transparent_70%)]" />
      </div>

      <div className="max-w-[520px] mx-auto px-3.5 pb-10 flex flex-col gap-4 relative z-10">
        {/* Header */}
        <header className="flex items-center gap-3" style={{ paddingTop: 'calc(76px + env(safe-area-inset-top))' }}>
          <button
            onClick={handleBack}
            aria-label="Назад"
            className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 bg-[rgba(15,19,30,0.7)] border border-[rgba(39,217,247,0.2)] text-[#dfe2f1] hover:text-[#27d9f7] hover:border-[#27d9f7]/50 active:scale-[0.92] transition-all backdrop-blur-xl"
          >
            <ArrowLeft className="w-4.5 h-4.5" />
          </button>
          <div className="min-w-0 flex-1">
            <GlitchText
              tag="div"
              text="INTRA GROUP"
              className="text-[20px] font-extrabold tracking-[3px] text-transparent bg-clip-text bg-gradient-to-r from-[#27d9f7] via-[#059af0] to-[#c2f3ff] leading-tight truncate font-['Sora']"
            />
            <div className="text-[10px] tracking-[4px] text-[#859397] font-semibold mt-0.5 uppercase font-['Sora']">
              {tx('title')}
            </div>
          </div>
          {isFullAdmin && (
            <button
              onClick={() => setShowGrantAccess(true)}
              aria-label={tx('grant_access')}
              className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 bg-[rgba(15,19,30,0.7)] border border-[rgba(39,217,247,0.2)] text-[#27d9f7] hover:bg-[rgba(39,217,247,0.15)] hover:shadow-[0_0_14px_rgba(39,217,247,0.3)] active:scale-[0.92] transition-all backdrop-blur-xl"
            >
              <UserPlus className="w-4.5 h-4.5" />
            </button>
          )}
        </header>

        {/* Telemetry HUD Bar */}
        <div className="px-4 py-2.5 rounded-2xl flex items-center gap-3.5 overflow-x-auto border border-[rgba(39,217,247,0.18)] bg-[rgba(15,19,30,0.75)] backdrop-blur-xl shadow-[0_4px_20px_rgba(0,0,0,0.4)] scrollbar-none">
          <div className="flex items-center gap-2 shrink-0">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#27d9f7] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#27d9f7]"></span>
            </span>
            <span className="text-[10px] font-['Sora'] font-bold tracking-[2px] text-[#27d9f7]">SYSTEM</span>
          </div>
          <span className="text-[11px] font-mono tracking-wider text-[#859397] shrink-0">TOPICS:<span className="text-[#dfe2f1] font-bold ml-1">{topics.length}</span></span>
          <span className="text-[11px] font-mono tracking-wider text-[#859397] shrink-0">DRAFTS:<span className="text-[#dfe2f1] font-bold ml-1">{drafts.length}</span></span>
          <span className="text-[11px] font-mono tracking-wider text-[#859397] shrink-0">CASTING:<span className="text-[#dfe2f1] font-bold ml-1">{castingApps.length}</span></span>
          <span className="text-[11px] font-mono tracking-wider text-[#859397] shrink-0">USERS:<span className="text-[#dfe2f1] font-bold ml-1">{users.length}</span></span>
        </div>

        {/* Tabs Bar */}
        <div className="flex flex-wrap gap-2">
          {tabDefs.map(([t, Icon, label]) => {
            const active = tab === t;
            return (
              <button
                key={t}
                onClick={() => setTab(t as any)}
                className={`relative flex items-center gap-1.5 py-2 px-3.5 rounded-full border text-[11px] font-bold transition-all duration-200 active:scale-[0.95] ${
                  active
                    ? 'text-[#060a14] border-transparent bg-gradient-to-r from-[#27d9f7] to-[#059af0] shadow-[0_0_16px_rgba(39,217,247,0.4)]'
                    : 'bg-[rgba(15,19,30,0.65)] text-[#859397] border-[rgba(39,217,247,0.18)] hover:text-[#dfe2f1] hover:border-[#27d9f7]/40 backdrop-blur-md'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-[#060a14]' : 'text-[#859397]'}`} />
                <span className="whitespace-nowrap">{label}</span>
                {t === 'casting' && pendingCastingCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center text-[9px] font-extrabold text-[#060a14] bg-[#27d9f7] shadow-[0_0_10px_rgba(39,217,247,0.8)] ring-2 ring-[#060a14]">
                    {pendingCastingCount > 9 ? '9+' : pendingCastingCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader className="w-8 h-8 text-[#27d9f7] animate-spin" />
          </div>
        ) : tab === 'topics' ? (
          <TopicsTab
            topics={topics} tx={tx} showCreate={showCreate} setShowCreate={setShowCreate}
            newTitle={newTitle} setNewTitle={setNewTitle} newDesc={newDesc} setNewDesc={setNewDesc}
            creating={creating} aggregating={aggregating}
            onCreateTopic={handleCreateTopic}
            onCloseTopic={async (id: number) => { try { await adminCloseTopic(id); flash('✅'); await loadData(); } catch { flash('❌'); } }}
            onAggregate={handleAggregate}
          />
        ) : tab === 'drafts' ? (
          <DraftsTab drafts={drafts} tx={tx} onView={handleViewDraft} onApprove={handleApproveDraft} onReject={handleRejectDraft} />
        ) : tab === 'casting' && isFullAdmin ? (
          <CastingTab
            apps={castingApps} tx={tx}
            onApprove={async (id: number, note: string) => { try { await adminApproveCasting(id, note); flash('✅'); await loadData(); } catch { flash('❌'); } }}
            onReject={async (id: number, note: string) => { try { await adminRejectCasting(id, note); flash('✅'); await loadData(); } catch { flash('❌'); } }}
          />
        ) : tab === 'slots' ? (
          <SlotsTab slots={slots} users={users} pricing={pricing} isFullAdmin={isFullAdmin} onReload={loadData} flash={flash} />
        ) : tab === 'music' ? (
          <MusicTab topics={topics} tx={tx} flash={flash} />
        ) : tab === 'payment' && isFullAdmin ? (
          <PaymentTab tx={tx} settings={paymentSettings} packages={packages} pricing={pricing} flash={flash} onReload={loadData} />
        ) : (
          <UsersTab
            users={users} tx={tx} isFullAdmin={isFullAdmin}
            onSetLevel={async (id: number, lvl: number) => { try { await adminSetLevel(id, lvl); flash('✅'); await loadData(); } catch { flash('❌'); } }}
            onSetRole={async (id: number, role: StaffRole) => {
              try { await adminSetStaffRole(id, role); flash('✅'); await loadData(); }
              catch (e: any) { flash('❌ ' + (e.message || '')); }
            }}
            onAddPoints={(u: UserRow) => setAddPointsTarget(u)}
            onDeleteUser={async (id: number) => {
              try {
                await adminDeleteUser(id);
                flash('✅ Удалён');
                await loadData();
              } catch (e: any) { flash('❌ ' + (e.message || '')); }
            }}
          />
        )}
      </div>

      {/* Add Points Modal */}
      {addPointsTarget && (
        <AddPointsModal
          user={addPointsTarget}
          tx={tx}
          onClose={() => setAddPointsTarget(null)}
          onSubmit={async (amount: number) => {
            try {
              await adminAddPoints(addPointsTarget.id, amount);
              flash('✅');
              setAddPointsTarget(null);
              await loadData();
            } catch { flash('❌'); }
          }}
        />
      )}

      {/* Draft Modal */}
      {activeDraft && (
        <DraftModal
          draft={activeDraft} tx={tx} onClose={() => setActiveDraft(null)}
          onApprove={handleApproveDraft} onReject={handleRejectDraft}
        />
      )}

      {/* Grant Access Modal */}
      {showGrantAccess && (
        <GrantAccessModal
          tx={tx}
          meId={me?.id}
          onClose={() => setShowGrantAccess(false)}
          flash={flash}
          onGranted={() => { if (tab === 'users') loadData(); }}
        />
      )}

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-2xl text-sm font-semibold text-[#dfe2f1] bg-[#0f131e]/95 border border-[rgba(39,217,247,0.35)] shadow-[0_8px_30px_rgba(0,0,0,0.7),0_0_20px_rgba(39,217,247,0.2)] backdrop-blur-xl z-[200]">
          {toast}
        </div>
      )}
    </div>
  );
}

// ── TopicsTab ──────────────────────────────────────────────
function TopicsTab({ topics, tx, showCreate, setShowCreate, newTitle, setNewTitle, newDesc, setNewDesc, creating, aggregating, onCreateTopic, onCloseTopic, onAggregate }: any) {
  return (
    <div className="flex flex-col gap-3">
      {!showCreate ? (
        <button
          onClick={() => setShowCreate(true)}
          className="rounded-2xl py-3.5 flex items-center justify-center gap-2 text-sm font-bold text-[#27d9f7] bg-[rgba(39,217,247,0.08)] border border-[rgba(39,217,247,0.25)] hover:bg-[rgba(39,217,247,0.14)] hover:shadow-[0_0_15px_rgba(39,217,247,0.25)] transition-all active:scale-[0.98]"
        >
          <Plus className="w-4 h-4" /> {tx('new_topic')}
        </button>
      ) : (
        <div className="bg-[rgba(15,19,30,0.65)] border border-[rgba(39,217,247,0.22)] rounded-3xl p-4.5 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.35)] flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-[#27d9f7] font-['Sora']">{tx('new_topic')}</span>
            <button onClick={() => setShowCreate(false)} className="text-[#859397] hover:text-[#dfe2f1]">
              <X className="w-4 h-4" />
            </button>
          </div>
          <input
            className="w-full bg-[rgba(10,14,24,0.7)] border border-[rgba(39,217,247,0.2)] rounded-xl px-4 py-3 text-sm text-[#dfe2f1] placeholder:text-[#859397] outline-none focus:border-[#27d9f7] focus:shadow-[0_0_12px_rgba(39,217,247,0.3)] transition-all"
            placeholder={tx('topic_title')}
            value={newTitle}
            onChange={(e: any) => setNewTitle(e.target.value)}
          />
          <input
            className="w-full bg-[rgba(10,14,24,0.7)] border border-[rgba(39,217,247,0.2)] rounded-xl px-4 py-3 text-sm text-[#dfe2f1] placeholder:text-[#859397] outline-none focus:border-[#27d9f7] focus:shadow-[0_0_12px_rgba(39,217,247,0.3)] transition-all"
            placeholder={tx('topic_desc')}
            value={newDesc}
            onChange={(e: any) => setNewDesc(e.target.value)}
          />
          <button
            onClick={onCreateTopic}
            disabled={creating || !newTitle.trim()}
            className="w-full py-3 rounded-xl font-bold text-sm text-[#060a14] bg-gradient-to-r from-[#27d9f7] to-[#059af0] shadow-[0_0_16px_rgba(39,217,247,0.35)] hover:shadow-[0_0_22px_rgba(39,217,247,0.5)] active:scale-[0.98] disabled:opacity-40 transition-all"
          >
            {creating ? <Loader className="w-4 h-4 animate-spin mx-auto text-[#060a14]" /> : tx('create')}
          </button>
        </div>
      )}

      {topics.length === 0 ? (
        <div className="bg-[rgba(15,19,30,0.65)] border border-[rgba(39,217,247,0.18)] rounded-2xl p-8 text-center text-[#859397] text-sm backdrop-blur-xl">
          {tx('no_topics')}
        </div>
      ) : topics.map((t: Topic) => (
        <div key={t.id} className="bg-[rgba(15,19,30,0.65)] border border-[rgba(39,217,247,0.18)] rounded-2xl p-4 backdrop-blur-xl shadow-[0_4px_24px_rgba(0,0,0,0.3)] hover:border-[rgba(39,217,247,0.3)] transition-all">
          <div className="flex items-start justify-between mb-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                  t.status === 'active'
                    ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.25)]'
                    : 'bg-slate-500/15 border border-slate-500/25 text-[#859397]'
                }`}>
                  {tx(t.status === 'active' ? 'active' : 'closed')}
                </span>
                <span className="text-[11px] font-mono text-[#859397]">{t.opinion_count} {tx('opinions')}</span>
              </div>
              <div className="text-sm font-bold text-[#dfe2f1]">{t.title}</div>
              {t.description && <div className="text-xs text-[#859397] mt-1 leading-relaxed">{t.description}</div>}
            </div>
            {t.status === 'active' && (
              <button
                onClick={() => onCloseTopic(t.id)}
                className="ml-2 p-2 rounded-xl bg-rose-500/15 border border-rose-500/25 text-rose-400 hover:bg-rose-500/25 transition-all shrink-0"
                title={tx('close')}
              >
                <Lock className="w-4 h-4" />
              </button>
            )}
          </div>
          {t.opinion_count >= 3 && (
            <button
              onClick={() => onAggregate(t.id)}
              disabled={aggregating === t.id}
              className="w-full mt-2 py-2.5 rounded-xl flex items-center justify-center gap-2 text-xs font-bold text-[#060a14] bg-gradient-to-r from-[#27d9f7] to-[#059af0] shadow-[0_0_14px_rgba(39,217,247,0.3)] hover:shadow-[0_0_20px_rgba(39,217,247,0.45)] active:scale-[0.98] disabled:opacity-50 transition-all"
            >
              {aggregating === t.id ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {tx('aggregate')} ({t.opinion_count} {tx('opinions')})
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// ── DraftsTab ──────────────────────────────────────────────
function DraftsTab({ drafts, tx, onView, onApprove, onReject }: any) {
  if (drafts.length === 0) return (
    <div className="bg-[rgba(15,19,30,0.65)] border border-[rgba(39,217,247,0.18)] rounded-2xl p-8 text-center text-[#859397] text-sm backdrop-blur-xl">
      {tx('no_drafts')}
    </div>
  );
  return (
    <div className="flex flex-col gap-3">
      {drafts.map((d: Draft) => (
        <div key={d.id} className="bg-[rgba(15,19,30,0.65)] border border-[rgba(39,217,247,0.18)] rounded-2xl p-4 backdrop-blur-xl shadow-[0_4px_24px_rgba(0,0,0,0.3)] hover:border-[rgba(39,217,247,0.3)] transition-all">
          <div className="flex items-start justify-between mb-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                  d.status === 'pending'
                    ? 'bg-amber-500/15 border border-amber-500/30 text-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.2)]'
                    : d.status === 'approved'
                    ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.25)]'
                    : 'bg-rose-500/15 border border-rose-500/25 text-rose-400'
                }`}>
                  {tx(d.status)}
                </span>
                <span className="text-[11px] font-mono text-[#859397]">{d.source_count} {tx('sources')}</span>
              </div>
              <div className="text-sm font-bold text-[#dfe2f1]">🎙 {d.main_topic}</div>
              {d.script_preview && (
                <div className="text-[11px] text-[#859397] mt-1.5 line-clamp-2 leading-relaxed">
                  {d.script_preview.replace(/^\[META:.*?\]\n\n/, '')}
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-2 mt-3 flex-wrap">
            <button
              onClick={() => onView(d.id)}
              className="flex-1 py-2 px-3 rounded-xl text-xs font-semibold bg-[rgba(39,217,247,0.08)] border border-[rgba(39,217,247,0.2)] text-[#dfe2f1] hover:text-[#27d9f7] hover:border-[#27d9f7]/40 flex items-center justify-center gap-1.5 transition-all"
            >
              👁 {tx('view')}
            </button>
            {d.status === 'pending' && (
              <>
                <button
                  onClick={() => onApprove(d.id)}
                  className="flex-1 py-2 px-3 rounded-xl text-xs font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25 flex items-center justify-center gap-1.5 transition-all"
                >
                  <CheckCircle className="w-3.5 h-3.5" /> {tx('approve')}
                </button>
                <button
                  onClick={() => onReject(d.id)}
                  className="flex-1 py-2 px-3 rounded-xl text-xs font-semibold bg-rose-500/15 border border-rose-500/30 text-rose-400 hover:bg-rose-500/25 flex items-center justify-center gap-1.5 transition-all"
                >
                  <XCircle className="w-3.5 h-3.5" /> {tx('reject')}
                </button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── DraftModal ─────────────────────────────────────────────
function DraftModal({ draft, tx, onClose, onApprove, onReject }: any) {
  const meta = draft.meta || {};
  const dialog = draft.dialog || draft.script || '';
  const wordCount = dialog.split(/\s+/).filter(Boolean).length;
  return (
    <div className="fixed inset-0 z-[300] bg-[#060a14]/85 backdrop-blur-md flex flex-col" onClick={onClose}>
      <div
        className="flex-1 overflow-y-auto p-4 max-w-[520px] mx-auto w-full"
        style={{ paddingTop: 'calc(76px + env(safe-area-inset-top))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-[rgba(15,19,30,0.95)] border border-[rgba(39,217,247,0.25)] rounded-3xl p-5 flex flex-col gap-4 mb-4 shadow-[0_20px_60px_rgba(0,0,0,0.85)] backdrop-blur-2xl text-[#dfe2f1]">
          <div className="flex items-center justify-between">
            <div className="text-base font-bold text-[#27d9f7] font-['Sora']">🎙 {draft.main_topic}</div>
            <button onClick={onClose} className="text-[#859397] hover:text-[#dfe2f1]">
              <X className="w-5 h-5" />
            </button>
          </div>

          {meta.positions && (
            <div className="flex flex-col gap-2">
              <div className="text-[11px] font-bold text-[#27d9f7] uppercase tracking-wider font-['Sora']">{tx('positions')}</div>
              {[1, 2, 3].map((i) => {
                const p = meta.positions[`p${i}`];
                if (!p) return null;
                return (
                  <div key={i} className="rounded-xl px-3.5 py-3 bg-[rgba(10,14,24,0.6)] border border-[rgba(39,217,247,0.18)]">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-bold text-[#27d9f7]">#{i}</span>
                      <span className="text-[10px] font-mono text-[#859397]">{p.percent}%</span>
                    </div>
                    <div className="text-xs text-[#dfe2f1] leading-relaxed">{p.summary}</div>
                  </div>
                );
              })}
            </div>
          )}

          {meta.music_suggestion && (
            <div className="text-[11px] text-[#859397] flex items-center gap-1.5">
              <Music className="w-3.5 h-3.5 text-[#27d9f7]" /> {tx('music')}: <span className="text-[#dfe2f1]">{meta.music_suggestion}</span>
            </div>
          )}

          <div>
            <div className="text-[11px] font-bold text-[#27d9f7] uppercase tracking-wider mb-2 font-['Sora']">
              {tx('dialog_title')} · {wordCount} {tx('words')}
            </div>
            <div className="text-xs text-[#dfe2f1] leading-relaxed whitespace-pre-line max-h-[40vh] overflow-y-auto rounded-xl p-3.5 bg-[rgba(10,14,24,0.7)] border border-[rgba(39,217,247,0.18)] font-sans">
              {dialog}
            </div>
          </div>

          {draft.status === 'pending' && (
            <div className="flex gap-3 mt-1">
              <button
                onClick={() => onApprove(draft.id)}
                className="flex-1 py-3 rounded-xl font-bold text-sm text-[#060a14] bg-gradient-to-r from-emerald-400 to-teal-500 shadow-[0_0_16px_rgba(16,185,129,0.35)] flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
              >
                <CheckCircle className="w-4 h-4" /> {tx('approve')}
              </button>
              <button
                onClick={() => onReject(draft.id)}
                className="flex-1 py-3 rounded-xl font-bold text-sm text-rose-400 bg-rose-500/15 border border-rose-500/30 hover:bg-rose-500/25 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
              >
                <XCircle className="w-4 h-4" /> {tx('reject')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── CastingTab ─────────────────────────────────────────────
function CastingTab({ apps, tx, onApprove, onReject }: any) {
  const [noteById, setNoteById] = useState<Record<number, string>>({});
  if (apps.length === 0) return (
    <div className="bg-[rgba(15,19,30,0.65)] border border-[rgba(39,217,247,0.18)] rounded-2xl p-8 text-center text-[#859397] text-sm backdrop-blur-xl">
      {tx('no_casting')}
    </div>
  );
  return (
    <div className="flex flex-col gap-3">
      {apps.map((a: CastingApp) => (
        <div key={a.id} className="bg-[rgba(15,19,30,0.65)] border border-[rgba(39,217,247,0.18)] rounded-2xl p-4 backdrop-blur-xl shadow-[0_4px_24px_rgba(0,0,0,0.3)] space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 bg-[rgba(39,217,247,0.12)] border border-[rgba(39,217,247,0.25)] text-[#27d9f7]">
              <Mic className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-[#dfe2f1] truncate">
                {a.display_name || a.username || `id${a.user_id}`}
              </div>
              <div className="text-[10px] font-mono text-[#859397]">{new Date(a.created_at).toLocaleString()}</div>
            </div>
          </div>

          <audio controls src={`${API_URL}${a.audio_url}?token=${getToken()}`} className="w-full h-9 rounded-xl accent-[#27d9f7]" />

          {a.note && (
            <div className="text-xs text-[#dfe2f1] bg-[rgba(10,14,24,0.6)] border border-[rgba(39,217,247,0.14)] rounded-xl p-3 leading-relaxed">
              {a.note}
            </div>
          )}

          <input
            value={noteById[a.id] ?? ''}
            onChange={(e) => setNoteById((prev) => ({ ...prev, [a.id]: e.target.value }))}
            placeholder={tx('casting_note_placeholder')}
            className="w-full bg-[rgba(10,14,24,0.7)] border border-[rgba(39,217,247,0.22)] rounded-xl px-3 py-2 text-xs text-[#dfe2f1] placeholder:text-[#859397] outline-none focus:border-[#27d9f7] focus:shadow-[0_0_10px_rgba(39,217,247,0.25)] transition-all"
          />

          <div className="flex gap-2">
            <button
              onClick={() => onApprove(a.id, noteById[a.id] || '')}
              className="flex-1 py-2 rounded-xl text-xs font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25 flex items-center justify-center gap-1 transition-all"
            >
              <CheckCircle className="w-3.5 h-3.5" /> {tx('casting_approve')}
            </button>
            <button
              onClick={() => onReject(a.id, noteById[a.id] || '')}
              className="flex-1 py-2 rounded-xl text-xs font-semibold bg-rose-500/15 border border-rose-500/30 text-rose-400 hover:bg-rose-500/25 flex items-center justify-center gap-1 transition-all"
            >
              <XCircle className="w-3.5 h-3.5" /> {tx('casting_reject')}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── SlotsTab ───────────────────────────────────────────────
function SlotsTab({ slots, users, pricing, isFullAdmin, onReload, flash }: any) {
  const pricePerHour = pricing ? parseFloat(pricing.price_slot_per_hour) : 200;
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    host_user_id: '',
    title: '',
    description: '',
    scheduled_at: '',
    duration_min: '60',
  });

  const statusPills: Record<string, string> = {
    scheduled: 'bg-amber-500/15 border border-amber-500/30 text-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.2)]',
    live:      'bg-[#27d9f7]/15 border border-[#27d9f7]/30 text-[#27d9f7] shadow-[0_0_10px_rgba(39,217,247,0.3)] animate-pulse',
    done:      'bg-emerald-500/15 border border-emerald-500/25 text-emerald-400',
    cancelled: 'bg-slate-500/15 border border-slate-500/20 text-[#859397]',
  };

  async function handleCreate() {
    if (!form.title.trim() || !form.host_user_id || !form.scheduled_at) return;
    setCreating(true);
    try {
      const res = await adminCreateSlot({
        host_user_id: parseInt(form.host_user_id),
        title: form.title.trim(),
        description: form.description.trim(),
        scheduled_at: new Date(form.scheduled_at).toISOString(),
        duration_min: parseInt(form.duration_min) || 60,
      });
      flash(`✅ Slot #${res.detail?.slot_id} yaratildi`);
      setShowCreate(false);
      setForm({ host_user_id: '', title: '', description: '', scheduled_at: '', duration_min: '60' });
      onReload();
    } catch (e: any) { flash('❌ ' + e.message); }
    finally { setCreating(false); }
  }

  async function handleStatus(id: number, status: string) {
    try { await adminUpdateSlotStatus(id, status); flash('✅'); onReload(); }
    catch { flash('❌'); }
  }

  const trustedUsers = users.filter((u: any) => ['doverenniy', 'moderator', 'admin'].includes(u.role));

  return (
    <div className="flex flex-col gap-3">
      {!isFullAdmin ? null : !showCreate ? (
        <button
          onClick={() => setShowCreate(true)}
          className="rounded-2xl py-3.5 flex items-center justify-center gap-2 text-sm font-bold text-[#27d9f7] bg-[rgba(39,217,247,0.08)] border border-[rgba(39,217,247,0.25)] hover:bg-[rgba(39,217,247,0.14)] hover:shadow-[0_0_15px_rgba(39,217,247,0.25)] transition-all active:scale-[0.98]"
        >
          <Plus className="w-4 h-4" /> Новый слот эфира
        </button>
      ) : (
        <div className="bg-[rgba(15,19,30,0.65)] border border-[rgba(39,217,247,0.22)] rounded-3xl p-4.5 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.35)] flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-[#27d9f7] font-['Sora']">Новый слот</span>
            <button onClick={() => setShowCreate(false)} className="text-[#859397] hover:text-[#dfe2f1]">
              <X className="w-4 h-4" />
            </button>
          </div>
          <select
            className="w-full rounded-xl px-3 py-2.5 text-sm outline-none text-[#dfe2f1] bg-[#0a0e18] border border-[rgba(39,217,247,0.22)] focus:border-[#27d9f7]"
            value={form.host_user_id}
            onChange={e => setForm(f => ({ ...f, host_user_id: e.target.value }))}
          >
            <option value="" className="bg-[#0f131e] text-[#859397]">Выбрать ведущего (уровень 3)...</option>
            {trustedUsers.map((u: any) => (
              <option key={u.id} value={u.id} className="bg-[#0f131e] text-[#dfe2f1]">
                {u.display_name || u.username || `ID ${u.telegram_id}`} — {u.role === 'admin' ? 'ADMIN' : u.role === 'moderator' ? 'MODERATOR' : `Уровень ${u.level}`}
              </option>
            ))}
          </select>
          <input
            className="w-full rounded-xl px-3 py-2.5 text-sm outline-none text-[#dfe2f1] placeholder:text-[#859397] bg-[rgba(10,14,24,0.7)] border border-[rgba(39,217,247,0.22)] focus:border-[#27d9f7]"
            placeholder="Название эфира"
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
          />
          <input
            className="w-full rounded-xl px-3 py-2.5 text-sm outline-none text-[#dfe2f1] placeholder:text-[#859397] bg-[rgba(10,14,24,0.7)] border border-[rgba(39,217,247,0.22)] focus:border-[#27d9f7]"
            placeholder="Описание (необязательно)"
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          />
          <div className="flex gap-2">
            <div className="flex-1">
              <div className="text-[10px] text-[#859397] mb-1 font-['Sora']">Дата и время</div>
              <input
                type="datetime-local"
                className="w-full rounded-xl px-3 py-2.5 text-sm outline-none text-[#dfe2f1] bg-[rgba(10,14,24,0.7)] border border-[rgba(39,217,247,0.22)] focus:border-[#27d9f7]"
                value={form.scheduled_at}
                onChange={e => setForm(f => ({ ...f, scheduled_at: e.target.value }))}
              />
            </div>
            <div className="w-24">
              <div className="text-[10px] text-[#859397] mb-1 font-['Sora']">Длит. (мин)</div>
              <input
                type="number"
                className="w-full rounded-xl px-3 py-2.5 text-sm outline-none text-[#dfe2f1] bg-[rgba(10,14,24,0.7)] border border-[rgba(39,217,247,0.22)] focus:border-[#27d9f7]"
                value={form.duration_min}
                onChange={e => setForm(f => ({ ...f, duration_min: e.target.value }))}
              />
            </div>
          </div>
          <div className="text-[11px] text-[#859397] text-center font-mono">
            Со счёта ведущего спишется ≈ <span className="text-[#27d9f7] font-bold">{((parseInt(form.duration_min) || 60) / 60 * pricePerHour).toFixed(0)}</span> поинтов за слот
          </div>
          <button
            onClick={handleCreate}
            disabled={creating || !form.title.trim() || !form.host_user_id || !form.scheduled_at}
            className="w-full py-3 rounded-xl font-bold text-sm text-[#060a14] bg-gradient-to-r from-[#27d9f7] to-[#059af0] shadow-[0_0_16px_rgba(39,217,247,0.35)] hover:shadow-[0_0_24px_rgba(39,217,247,0.5)] active:scale-[0.98] disabled:opacity-40 transition-all"
          >
            {creating ? <Loader className="w-4 h-4 animate-spin mx-auto text-[#060a14]" /> : 'Создать слот'}
          </button>
        </div>
      )}

      {slots.length === 0 ? (
        <div className="bg-[rgba(15,19,30,0.65)] border border-[rgba(39,217,247,0.18)] rounded-2xl p-8 text-center text-[#859397] text-sm backdrop-blur-xl">
          Нет слотов эфира
        </div>
      ) : slots.map((s: BroadcastSlot) => (
        <div key={s.id} className="bg-[rgba(15,19,30,0.65)] border border-[rgba(39,217,247,0.18)] rounded-2xl p-4 backdrop-blur-xl shadow-[0_4px_24px_rgba(0,0,0,0.3)] hover:border-[rgba(39,217,247,0.3)] transition-all">
          <div className="flex items-start justify-between mb-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${statusPills[s.status] || ''}`}>
                  {s.is_live_now ? '🔴 LIVE' : s.status}
                </span>
                <span className="text-[11px] font-mono text-[#859397]">{s.duration_min} мин</span>
              </div>
              <div className="text-sm font-bold text-[#dfe2f1]">{s.title}</div>
              {s.description && <div className="text-xs text-[#859397] mt-1">{s.description}</div>}
              {s.display_name || s.username ? (
                <div className="text-[11px] text-[#859397] mt-1 flex items-center gap-1.5">
                  <RadioIcon className="w-3.5 h-3.5 text-[#27d9f7]" /> {s.display_name || s.username}
                </div>
              ) : null}
              <div className="text-[10px] font-mono text-[#859397] mt-1">
                🕐 {new Date(s.scheduled_at).toLocaleString()}
              </div>
            </div>
          </div>
          <div className="flex gap-2 mt-3 flex-wrap">
            {s.status === 'scheduled' && (
              <button
                onClick={() => handleStatus(s.id, 'live')}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-[#27d9f7]/15 border border-[#27d9f7]/30 text-[#27d9f7] hover:bg-[#27d9f7]/25 hover:shadow-[0_0_10px_rgba(39,217,247,0.25)] transition-all"
              >
                ▶ Live
              </button>
            )}
            {s.status === 'live' && (
              <button
                onClick={() => handleStatus(s.id, 'done')}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25 transition-all"
              >
                ✓ Завершить
              </button>
            )}
            {['scheduled', 'live'].includes(s.status) && (
              <button
                onClick={() => handleStatus(s.id, 'cancelled')}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-rose-500/15 border border-rose-500/30 text-rose-400 hover:bg-rose-500/25 transition-all"
              >
                ✕ Отменить
              </button>
            )}
            {s.share_url && (
              <a
                href={s.share_url} target="_blank" rel="noreferrer"
                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-[rgba(39,217,247,0.08)] border border-[rgba(39,217,247,0.2)] text-[#dfe2f1] hover:text-[#27d9f7] hover:border-[#27d9f7]/40 transition-all"
              >
                🔗 Ссылка
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── MusicTab ───────────────────────────────────────────────
function MusicTab({ topics, tx, flash }: any) {
  const [topicId, setTopicId] = useState<number | null>(null);
  const [noms, setNoms] = useState<MusicNomination[]>([]);
  const [loading, setLoading] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);
  const [defaultMusicName, setDefaultMusicName] = useState<string | null>(null);
  const [defaultMusicLoading, setDefaultMusicLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    getDefaultMusic().then((r) => setDefaultMusicName(r.name)).finally(() => setDefaultMusicLoading(false));
  }, []);

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const res = await uploadDefaultMusic(file);
      setDefaultMusicName(res.detail?.name ?? file.name);
      flash('✅');
    } catch (e: any) { flash('❌ ' + (e.message || '')); }
    finally { setUploading(false); }
  }

  async function handleDeleteDefault() {
    try { await deleteDefaultMusic(); setDefaultMusicName(null); flash('✅'); }
    catch { flash('❌'); }
  }

  useEffect(() => {
    if (topics.length === 0) return;
    if (topicId && topics.some((t: Topic) => t.id === topicId)) return;
    const active = topics.find((t: Topic) => t.status === 'active');
    setTopicId((active || topics[0]).id);
  }, [topics]);

  useEffect(() => { if (topicId) loadNoms(topicId); }, [topicId]);

  async function loadNoms(id: number) {
    setLoading(true);
    try { setNoms(await getMusicNominations(id)); }
    catch { setNoms([]); }
    finally { setLoading(false); }
  }

  async function confirmDelete() {
    if (pendingDelete === null) return;
    const id = pendingDelete;
    setPendingDelete(null);
    try { await adminDeleteNomination(id); flash('✅'); if (topicId) await loadNoms(topicId); }
    catch { flash('❌'); }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Default Music Container */}
      <div className="bg-[rgba(15,19,30,0.65)] border border-[rgba(39,217,247,0.18)] rounded-2xl p-4 backdrop-blur-xl shadow-[0_4px_24px_rgba(0,0,0,0.3)]">
        <div className="text-[10px] font-bold text-[#27d9f7] font-['Sora'] uppercase tracking-wider mb-2.5">
          {tx('default_music_title')}
        </div>
        {defaultMusicLoading ? (
          <div className="flex justify-center py-2"><Loader className="w-4 h-4 text-[#27d9f7] animate-spin" /></div>
        ) : (
          <>
            <div className="text-sm text-[#dfe2f1] mb-3 flex items-center gap-2">
              {defaultMusicName ? (
                <>
                  <Music className="w-4 h-4 text-[#27d9f7] shrink-0" />
                  <span className="font-medium truncate">{defaultMusicName}</span>
                </>
              ) : (
                <span className="text-[#859397]">{tx('default_music_none')}</span>
              )}
            </div>
            <div className="flex gap-2">
              <label
                className={`flex-1 py-2.5 px-3 rounded-xl flex items-center justify-center gap-2 text-xs font-bold text-[#060a14] cursor-pointer bg-gradient-to-r from-[#27d9f7] to-[#059af0] shadow-[0_0_14px_rgba(39,217,247,0.3)] hover:shadow-[0_0_20px_rgba(39,217,247,0.45)] active:scale-[0.98] transition-all ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
              >
                {uploading ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                {defaultMusicName ? tx('default_music_replace') : tx('default_music_upload')}
                <input
                  type="file" accept="audio/*" className="hidden" disabled={uploading}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ''; }}
                />
              </label>
              {defaultMusicName && (
                <button
                  onClick={handleDeleteDefault}
                  className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 hover:bg-rose-500/25 active:scale-[0.95] transition-all shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {topics.length === 0 ? (
        <div className="bg-[rgba(15,19,30,0.65)] border border-[rgba(39,217,247,0.18)] rounded-2xl p-8 text-center text-[#859397] text-sm backdrop-blur-xl">
          {tx('no_topics')}
        </div>
      ) : (
        <>
          <select
            className="w-full rounded-xl px-3 py-2.5 text-sm outline-none text-[#dfe2f1] bg-[#0a0e18] border border-[rgba(39,217,247,0.22)] focus:border-[#27d9f7]"
            value={topicId ?? ''}
            onChange={e => setTopicId(parseInt(e.target.value))}
          >
            {topics.map((t: Topic) => (
              <option key={t.id} value={t.id} className="bg-[#0f131e] text-[#dfe2f1]">
                {t.status === 'active' ? '🟢' : '⚪️'} {t.title}
              </option>
            ))}
          </select>

          {loading ? (
            <div className="flex justify-center py-8"><Loader className="w-6 h-6 text-[#27d9f7] animate-spin" /></div>
          ) : noms.length === 0 ? (
            <div className="bg-[rgba(15,19,30,0.65)] border border-[rgba(39,217,247,0.18)] rounded-2xl p-8 text-center text-[#859397] text-sm backdrop-blur-xl">
              {tx('no_nominations')}
            </div>
          ) : noms.map((n, i) => (
            <div key={n.id} className="bg-[rgba(15,19,30,0.65)] border border-[rgba(39,217,247,0.18)] rounded-2xl p-4 backdrop-blur-xl shadow-[0_4px_24px_rgba(0,0,0,0.3)] hover:border-[rgba(39,217,247,0.3)] transition-all">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    {i === 0 && n.vote_count > 0 && (
                      <span className="text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider bg-[#27d9f7]/15 border border-[#27d9f7]/30 text-[#27d9f7] shadow-[0_0_10px_rgba(39,217,247,0.3)]">
                        🎧 {tx('winner_label')}
                      </span>
                    )}
                    <span className="text-[11px] font-mono text-[#859397]">{n.vote_count} {tx('votes')}</span>
                  </div>
                  <div className="text-sm font-bold text-[#dfe2f1] truncate">🎵 {n.title}</div>
                  {n.artist && <div className="text-xs text-[#859397] mt-0.5">{n.artist}</div>}
                  <div className="text-[10px] text-[#859397] mt-1 font-mono">{n.display_name || n.username || '—'}</div>
                </div>
                <button
                  onClick={() => setPendingDelete(n.id)}
                  className="p-2 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 hover:bg-rose-500/25 active:scale-[0.95] transition-all shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}

          {pendingDelete !== null && (
            <ConfirmModal
              tx={tx}
              message={tx('confirm_delete_nom')}
              onConfirm={confirmDelete}
              onCancel={() => setPendingDelete(null)}
            />
          )}
        </>
      )}
    </div>
  );
}

// ── UsersTab ───────────────────────────────────────────────
function UsersTab({ users, tx, isFullAdmin, onSetLevel, onSetRole, onAddPoints, onDeleteUser }: any) {
  const [roleTarget, setRoleTarget] = useState<{ id: number; name: string; role: StaffRole; grant: boolean } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const [search, setSearch] = useState('');

  const filtered = (() => {
    const q = search.trim().toLowerCase().replace(/^@/, '');
    if (!q) return users;
    return users.filter((u: any) =>
      String(u.telegram_id).includes(q) ||
      String(u.id) === q ||
      (u.username || '').toLowerCase().includes(q) ||
      (u.display_name || '').toLowerCase().includes(q)
    );
  })();

  if (users.length === 0) return (
    <div className="bg-[rgba(15,19,30,0.65)] border border-[rgba(39,217,247,0.18)] rounded-2xl p-8 text-center text-[#859397] text-sm backdrop-blur-xl">
      {tx('no_users')}
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Legend Card */}
      <div className="bg-[rgba(15,19,30,0.65)] border border-[rgba(39,217,247,0.18)] rounded-2xl p-3.5 backdrop-blur-xl shadow-[0_4px_24px_rgba(0,0,0,0.3)]">
        <div className="text-[10px] font-bold text-[#27d9f7] font-['Sora'] uppercase tracking-wider mb-1.5">{tx('access_legend_title')}</div>
        <div className="flex flex-col gap-0.5 text-[11px] text-[#859397] leading-relaxed">
          <div>{tx('lvl1_desc')}</div>
          <div>{tx('lvl2_desc')}</div>
          <div>{tx('lvl3_desc')}</div>
        </div>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#859397] pointer-events-none" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={tx('search_users_placeholder')}
          className="w-full rounded-2xl pl-10 pr-9 py-3 text-sm text-[#dfe2f1] placeholder:text-[#859397] bg-[rgba(10,14,24,0.7)] border border-[rgba(39,217,247,0.22)] outline-none focus:border-[#27d9f7] focus:shadow-[0_0_14px_rgba(39,217,247,0.3)] transition-all"
        />
        {search && (
          <button
            onClick={() => setSearch('')} aria-label="Очистить"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#859397] hover:text-[#dfe2f1]"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {filtered.length === 0 && (
        <div className="bg-[rgba(15,19,30,0.65)] border border-[rgba(39,217,247,0.18)] rounded-2xl p-6 text-center text-[#859397] text-sm backdrop-blur-xl">
          {tx('search_no_results')}
        </div>
      )}

      {filtered.map((u: any) => (
        <div key={u.id} className="bg-[rgba(15,19,30,0.65)] border border-[rgba(39,217,247,0.18)] rounded-2xl p-3.5 backdrop-blur-xl shadow-[0_4px_24px_rgba(0,0,0,0.3)] hover:border-[rgba(39,217,247,0.3)] transition-all">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-[#dfe2f1] truncate flex items-center gap-1.5 flex-wrap">
                <span>{u.display_name || u.username || `ID ${u.telegram_id}`}</span>
                {u.role === 'admin' && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#27d9f7]/15 border border-[#27d9f7]/30 text-[#27d9f7] shadow-[0_0_8px_rgba(39,217,247,0.25)]">
                    👑 {tx('main_admin_badge')}
                  </span>
                )}
                {u.role === 'moderator' && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#059af0]/15 border border-[#059af0]/30 text-[#059af0]">
                    🛡 {tx('moderator_badge')}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-[#859397] mt-0.5 font-mono">
                <span className="font-semibold text-[#27d9f7] font-sans">{tx('level_label')} {u.level}</span>
                {' · '}<span className="text-[#c2f3ff]">{Number(u.points).toFixed(3)} pts</span>
              </div>
            </div>
            <div className="flex gap-1.5 ml-2 shrink-0">
              <button
                onClick={() => onAddPoints(u)}
                className="px-2.5 py-1.5 rounded-xl text-[10px] font-bold bg-[rgba(39,217,247,0.12)] border border-[rgba(39,217,247,0.25)] text-[#27d9f7] hover:bg-[rgba(39,217,247,0.2)] hover:shadow-[0_0_10px_rgba(39,217,247,0.25)] active:scale-[0.95] transition-all"
              >
                +pts
              </button>
              {isFullAdmin && u.role !== 'admin' && (
                <button
                  onClick={() => setDeleteTarget({ id: u.id, name: u.display_name || u.username || `ID ${u.telegram_id}` })}
                  className="p-1.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 hover:bg-rose-500/25 active:scale-[0.95] transition-all"
                  title="Удалить пользователя"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Level Toggle Buttons */}
          <div className="flex gap-1.5 mb-2">
            {[1, 2, 3].map(lvl => isFullAdmin ? (
              <button
                key={lvl}
                onClick={() => onSetLevel(u.id, lvl)}
                className={`flex-1 py-1.5 rounded-xl text-[12px] font-bold transition-all active:scale-[0.96] ${
                  u.level === lvl
                    ? 'bg-gradient-to-r from-[#27d9f7] to-[#059af0] text-[#060a14] shadow-[0_0_12px_rgba(39,217,247,0.35)]'
                    : 'bg-[rgba(21,26,38,0.6)] border border-[rgba(39,217,247,0.12)] text-[#859397] hover:text-[#dfe2f1] hover:border-[rgba(39,217,247,0.25)]'
                }`}
              >
                {tx(`lvl${lvl}`)}
              </button>
            ) : (
              <div
                key={lvl}
                className={`flex-1 py-1.5 rounded-xl text-[12px] font-bold text-center ${
                  u.level === lvl
                    ? 'bg-gradient-to-r from-[#27d9f7] to-[#059af0] text-[#060a14]'
                    : 'bg-[rgba(21,26,38,0.4)] text-[#859397] opacity-50'
                }`}
              >
                {tx(`lvl${lvl}`)}
              </div>
            ))}
          </div>

          {/* Moderator Role Toggle */}
          {u.role === 'admin' ? null : isFullAdmin ? (
            <button
              onClick={() => setRoleTarget({
                id: u.id,
                name: u.display_name || u.username || `ID ${u.telegram_id}`,
                role: u.role === 'moderator' ? 'none' : 'moderator',
                grant: u.role !== 'moderator',
              })}
              className={`w-full py-1.5 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] ${
                u.role === 'moderator'
                  ? 'bg-rose-500/15 border border-rose-500/30 text-rose-400 hover:bg-rose-500/25'
                  : 'bg-[rgba(39,217,247,0.12)] border border-[rgba(39,217,247,0.25)] text-[#27d9f7] hover:bg-[rgba(39,217,247,0.2)]'
              }`}
            >
              {u.role === 'moderator' ? tx('revoke_moderator') : `🛡 ${tx('make_moderator')}`}
            </button>
          ) : u.role === 'moderator' ? (
            <div className="w-full py-1.5 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 bg-[#059af0]/15 border border-[#059af0]/25 text-[#059af0] opacity-75">
              🛡 {tx('moderator_badge')}
            </div>
          ) : null}
        </div>
      ))}

      {roleTarget && (
        <ConfirmModal
          tx={tx}
          message={tx(roleTarget.grant ? 'confirm_grant_admin' : 'confirm_revoke_admin')}
          onConfirm={() => { onSetRole(roleTarget.id, roleTarget.role); setRoleTarget(null); }}
          onCancel={() => setRoleTarget(null)}
        />
      )}

      {deleteTarget && (
        <ConfirmModal
          tx={tx}
          message={`⚠️ Удалить пользователя «${deleteTarget.name}»? Это действие необратимо — все данные (чат, поинты, история) будут удалены.`}
          onConfirm={() => { onDeleteUser(deleteTarget.id); setDeleteTarget(null); }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

// ── PaymentTab ─────────────────────────────────────────────
function PaymentTab({ tx, settings, packages, pricing, flash, onReload }: {
  tx: any; settings: PaymentSettings | null; packages: AdminPackage[]; pricing: Pricing | null;
  flash: (m: string) => void; onReload: () => Promise<void>;
}) {
  const [method, setMethod] = useState<PayMethod>(settings?.method || 'stars');
  const [instructions, setInstructions] = useState(settings?.instructions || '');
  const [manualDetails, setManualDetails] = useState(settings?.manual_details || '');
  const [manualEnabled, setManualEnabled] = useState(settings?.manual_enabled ?? true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMethod(settings?.method || 'stars');
    setInstructions(settings?.instructions || '');
    setManualDetails(settings?.manual_details || '');
    setManualEnabled(settings?.manual_enabled ?? true);
  }, [settings]);

  async function saveSettings(over: Partial<{ method: PayMethod; manualEnabled: boolean }> = {}) {
    setSaving(true);
    try {
      await adminUpdatePaymentSettings(
        over.method ?? method,
        instructions,
        manualDetails,
        over.manualEnabled ?? manualEnabled,
      );
      flash('✅ ' + tx('saved'));
      await onReload();
    } catch { flash('❌'); }
    finally { setSaving(false); }
  }

  const methodOptions: { key: PayMethod; title: string; desc: string }[] = [
    { key: 'stars', title: tx('payment_stars'), desc: tx('payment_stars_desc') },
    { key: 'manual', title: tx('payment_manual'), desc: tx('payment_manual_desc') },
    { key: 'both', title: tx('payment_both'), desc: tx('payment_both_desc') },
  ];
  const manualVisible = method === 'manual' || method === 'both';

  return (
    <div className="flex flex-col gap-4">
      {/* Settings Card */}
      <div className="bg-[rgba(15,19,30,0.65)] border border-[rgba(39,217,247,0.18)] rounded-2xl p-4 backdrop-blur-xl shadow-[0_4px_24px_rgba(0,0,0,0.3)]">
        <div className="text-[10px] font-bold text-[#27d9f7] font-['Sora'] uppercase tracking-wider mb-3">
          {tx('payment_method_title')}
        </div>
        <div className="flex flex-col gap-2">
          {methodOptions.map((o) => (
            <button
              key={o.key}
              onClick={() => { setMethod(o.key); saveSettings({ method: o.key }); }}
              className={`text-left rounded-xl p-3 border transition-all active:scale-[0.99] ${
                method === o.key
                  ? 'border-[#27d9f7] bg-[rgba(39,217,247,0.12)] shadow-[0_0_12px_rgba(39,217,247,0.25)]'
                  : 'border-[rgba(39,217,247,0.14)] bg-[rgba(21,26,38,0.5)] hover:border-[rgba(39,217,247,0.3)]'
              }`}
            >
              <div className="text-sm font-bold text-[#dfe2f1]">{o.title}</div>
              <div className="text-[11px] text-[#859397] mt-0.5">{o.desc}</div>
            </button>
          ))}
        </div>

        {manualVisible && (
          <div className="mt-3 flex flex-col gap-3">
            <label className="flex items-center justify-between gap-3 rounded-xl px-3.5 py-3 cursor-pointer bg-[rgba(10,14,24,0.6)] border border-[rgba(39,217,247,0.2)]">
              <span className="text-xs font-semibold text-[#dfe2f1]">{tx('manual_enabled_label')}</span>
              <input
                type="checkbox"
                checked={manualEnabled}
                onChange={(e) => { setManualEnabled(e.target.checked); saveSettings({ manualEnabled: e.target.checked }); }}
                className="w-4 h-4 accent-[#27d9f7]"
              />
            </label>

            <div>
              <label className="text-[10px] text-[#859397] uppercase tracking-wide font-['Sora']">{tx('manual_details_label')}</label>
              <textarea
                value={manualDetails}
                onChange={(e) => setManualDetails(e.target.value)}
                placeholder={tx('manual_details_placeholder')}
                rows={4}
                className="w-full mt-1.5 rounded-xl px-3.5 py-2.5 text-sm text-[#dfe2f1] placeholder:text-[#859397] outline-none resize-none bg-[rgba(10,14,24,0.7)] border border-[rgba(39,217,247,0.22)] focus:border-[#27d9f7] focus:shadow-[0_0_12px_rgba(39,217,247,0.25)] transition-all"
              />
            </div>

            <div>
              <label className="text-[10px] text-[#859397] uppercase tracking-wide font-['Sora']">{tx('payment_instructions_label')}</label>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder={tx('payment_instructions_placeholder')}
                rows={3}
                className="w-full mt-1.5 rounded-xl px-3.5 py-2.5 text-sm text-[#dfe2f1] placeholder:text-[#859397] outline-none resize-none bg-[rgba(10,14,24,0.7)] border border-[rgba(39,217,247,0.22)] focus:border-[#27d9f7] focus:shadow-[0_0_12px_rgba(39,217,247,0.25)] transition-all"
              />
            </div>

            <button
              onClick={() => saveSettings()}
              disabled={saving}
              className="w-full py-2.5 rounded-xl text-xs font-bold text-[#060a14] bg-gradient-to-r from-[#27d9f7] to-[#059af0] shadow-[0_0_14px_rgba(39,217,247,0.3)] hover:shadow-[0_0_20px_rgba(39,217,247,0.45)] active:scale-[0.98] disabled:opacity-50 transition-all"
            >
              {saving ? <Loader className="w-3.5 h-3.5 animate-spin mx-auto text-[#060a14]" /> : tx('save')}
            </button>
          </div>
        )}
      </div>

      <ManualPaymentsPanel tx={tx} flash={flash} />
      <PackagesEditor tx={tx} packages={packages} flash={flash} onReload={onReload} />
      <PricingEditor tx={tx} pricing={pricing} flash={flash} onReload={onReload} />
    </div>
  );
}

// ── ManualPaymentsPanel ────────────────────────────────────
function ManualPaymentsPanel({ tx, flash }: { tx: any; flash: (m: string) => void }) {
  type Filter = 'pending' | 'approved' | 'rejected' | 'all';
  const [filter, setFilter] = useState<Filter>('pending');
  const [items, setItems] = useState<ManualPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ id: number; approve: boolean } | null>(null);

  async function load(f: Filter = filter) {
    setLoading(true);
    try { setItems(await adminListManualPayments(f)); }
    catch { setItems([]); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(filter); }, [filter]);

  async function decide(id: number, approve: boolean) {
    setBusyId(id);
    try {
      const note = (notes[id] || '').trim();
      if (approve) await adminApproveManualPayment(id, note);
      else await adminRejectManualPayment(id, note);
      flash('✅ ' + tx('saved'));
      setNotes((n) => { const c = { ...n }; delete c[id]; return c; });
      await load(filter);
    } catch (e: any) { flash('❌ ' + (e?.message || '')); }
    finally { setBusyId(null); }
  }

  const filters: { key: Filter; label: string }[] = [
    { key: 'pending', label: tx('manual_filter_pending') },
    { key: 'approved', label: tx('manual_filter_approved') },
    { key: 'rejected', label: tx('manual_filter_rejected') },
    { key: 'all', label: tx('manual_filter_all') },
  ];
  const pendingCount = filter === 'pending' ? items.length : 0;

  return (
    <div className="bg-[rgba(15,19,30,0.65)] border border-[rgba(39,217,247,0.18)] rounded-2xl p-4 backdrop-blur-xl shadow-[0_4px_24px_rgba(0,0,0,0.3)]">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] font-bold text-[#27d9f7] font-['Sora'] uppercase tracking-wider flex items-center gap-2">
          <span>{tx('manual_requests_title')}</span>
          {pendingCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold text-[#060a14] bg-[#27d9f7] shadow-[0_0_8px_rgba(39,217,247,0.6)]">
              {pendingCount}
            </span>
          )}
        </div>
        <button
          onClick={() => load(filter)}
          className="p-1.5 rounded-xl bg-[rgba(39,217,247,0.1)] border border-[rgba(39,217,247,0.2)] text-[#27d9f7] hover:bg-[rgba(39,217,247,0.2)] active:scale-[0.95] transition-all"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex gap-1.5 mb-3 flex-wrap">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold border transition-all active:scale-[0.96] ${
              filter === f.key
                ? 'border-[#27d9f7] bg-[rgba(39,217,247,0.15)] text-[#c2f3ff] shadow-[0_0_10px_rgba(39,217,247,0.25)]'
                : 'border-[rgba(39,217,247,0.12)] text-[#859397] hover:text-[#dfe2f1] bg-[rgba(21,26,38,0.5)]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-6 text-center"><Loader className="w-4 h-4 animate-spin mx-auto text-[#27d9f7]" /></div>
      ) : items.length === 0 ? (
        <div className="py-6 text-center text-xs text-[#859397]">{tx('manual_no_requests')}</div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((p) => {
            const isPending = p.status === 'pending';
            return (
              <div
                key={p.id}
                className="rounded-2xl p-3.5 bg-[rgba(10,14,24,0.65)] border border-[rgba(39,217,247,0.18)] hover:border-[rgba(39,217,247,0.3)] transition-all"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-[#dfe2f1] truncate">
                      {p.display_name || p.username || `ID ${p.telegram_id}`}
                    </div>
                    <div className="text-[11px] text-[#859397] font-mono">
                      {p.telegram_id}{p.username ? ` · @${p.username}` : ''}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold text-[#27d9f7]">€{Number(p.price_eur).toFixed(2)}</div>
                    <div className="text-[11px] font-mono text-[#c2f3ff]">{Number(p.points_amount).toFixed(0)} pts</div>
                  </div>
                </div>

                <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="px-2 py-0.5 rounded-lg bg-[rgba(21,26,38,0.7)] border border-[rgba(255,255,255,0.08)] text-[#dfe2f1]">
                    {p.package_label}
                  </span>
                  <span className="px-2 py-0.5 rounded-lg bg-[rgba(21,26,38,0.7)] border border-[rgba(255,255,255,0.08)] text-[#dfe2f1]">
                    {tx(`mm_${p.payment_method}`)}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full font-bold uppercase tracking-wider text-[10px] ${
                    isPending
                      ? 'bg-amber-500/15 border border-amber-500/30 text-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.2)]'
                      : p.status === 'approved'
                      ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.2)]'
                      : 'bg-rose-500/15 border border-rose-500/30 text-rose-400'
                  }`}>
                    {tx(`manual_filter_${p.status === 'pending' ? 'pending' : p.status === 'approved' ? 'approved' : 'rejected'}`)}
                  </span>
                  <span className="text-[#859397] font-mono text-[10px]">{new Date(p.created_at).toLocaleString('ru-RU', {
                    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                  })}</span>
                </div>

                {p.payment_note && (
                  <div className="mt-2 text-xs text-[#dfe2f1] whitespace-pre-line rounded-xl px-3 py-2 bg-[rgba(21,26,38,0.7)] border border-[rgba(39,217,247,0.1)] leading-relaxed">
                    <span className="text-[#859397] font-semibold">{tx('manual_user_note')}: </span>{p.payment_note}
                  </div>
                )}

                {!isPending && p.admin_note && (
                  <div className="mt-1.5 text-xs text-[#859397] whitespace-pre-line">💬 {p.admin_note}</div>
                )}

                {isPending && (
                  <>
                    <input
                      value={notes[p.id] || ''}
                      onChange={(e) => setNotes((n) => ({ ...n, [p.id]: e.target.value }))}
                      placeholder={tx('manual_note_ph')}
                      className="w-full mt-2.5 rounded-xl px-3 py-2 text-xs text-[#dfe2f1] bg-[rgba(10,14,24,0.8)] border border-[rgba(39,217,247,0.2)] placeholder:text-[#859397] outline-none focus:border-[#27d9f7] transition-all"
                    />
                    <div className="flex gap-2 mt-2.5">
                      <button
                        onClick={() => setConfirmAction({ id: p.id, approve: true })}
                        disabled={busyId === p.id}
                        className="flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25 hover:shadow-[0_0_10px_rgba(16,185,129,0.3)] active:scale-[0.98] disabled:opacity-50 transition-all"
                      >
                        <Check className="w-3.5 h-3.5" /> {tx('manual_approve')}
                      </button>
                      <button
                        onClick={() => setConfirmAction({ id: p.id, approve: false })}
                        disabled={busyId === p.id}
                        className="flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 bg-rose-500/15 border border-rose-500/30 text-rose-400 hover:bg-rose-500/25 active:scale-[0.98] disabled:opacity-50 transition-all"
                      >
                        <X className="w-3.5 h-3.5" /> {tx('manual_reject')}
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {confirmAction && (
        <ConfirmModal
          tx={tx}
          message={tx(confirmAction.approve ? 'manual_approve_confirm' : 'manual_reject_confirm')}
          onConfirm={() => { const a = confirmAction; setConfirmAction(null); decide(a.id, a.approve); }}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </div>
  );
}

// ── PackagesEditor ─────────────────────────────────────────
function PackagesEditor({ tx, packages, flash, onReload }: {
  tx: any; packages: AdminPackage[]; flash: (m: string) => void; onReload: () => Promise<void>;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ label: '', points_amount: '', price_eur: '', price_stars: '' });
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);

  async function handleAdd() {
    const points = parseFloat(form.points_amount);
    const price = parseFloat(form.price_eur);
    const stars = parseInt(form.price_stars, 10);
    if (!form.label.trim() || !points || !price || !stars) return;
    setCreating(true);
    try {
      await adminCreatePackage({ points_amount: points, price_eur: price, price_stars: stars, label: form.label.trim() });
      setForm({ label: '', points_amount: '', price_eur: '', price_stars: '' });
      setShowAdd(false);
      flash('✅');
      await onReload();
    } catch { flash('❌'); }
    finally { setCreating(false); }
  }

  async function toggleActive(p: AdminPackage) {
    try {
      await adminUpdatePackage(p.id, {
        points_amount: p.points_amount, price_eur: p.price_eur, price_stars: p.price_stars, label: p.label, is_active: !p.is_active,
      });
      await onReload();
    } catch { flash('❌'); }
  }

  async function confirmDelete() {
    if (pendingDelete === null) return;
    const id = pendingDelete;
    setPendingDelete(null);
    try { await adminDeletePackage(id); flash('✅'); await onReload(); }
    catch { flash('❌'); }
  }

  return (
    <div className="bg-[rgba(15,19,30,0.65)] border border-[rgba(39,217,247,0.18)] rounded-2xl p-4 backdrop-blur-xl shadow-[0_4px_24px_rgba(0,0,0,0.3)]">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] font-bold text-[#27d9f7] font-['Sora'] uppercase tracking-wider">{tx('packages_title')}</div>
        <button
          onClick={() => setShowAdd((s) => !s)}
          className="p-1.5 rounded-xl bg-[rgba(39,217,247,0.1)] border border-[rgba(39,217,247,0.2)] text-[#27d9f7] hover:bg-[rgba(39,217,247,0.2)] active:scale-[0.95] transition-all"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {showAdd && (
        <div className="flex flex-col gap-2.5 mb-3 p-3.5 rounded-2xl bg-[rgba(10,14,24,0.65)] border border-[rgba(39,217,247,0.2)]">
          <input
            placeholder={tx('package_label')}
            value={form.label}
            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
            className="rounded-xl px-3 py-2 text-sm text-[#dfe2f1] placeholder:text-[#859397] outline-none bg-[rgba(10,14,24,0.8)] border border-[rgba(39,217,247,0.2)] focus:border-[#27d9f7]"
          />
          <div className="flex gap-2">
            <input
              placeholder={tx('package_points')}
              value={form.points_amount}
              inputMode="decimal"
              onChange={(e) => setForm((f) => ({ ...f, points_amount: e.target.value }))}
              className="flex-1 rounded-xl px-3 py-2 text-sm text-[#dfe2f1] placeholder:text-[#859397] outline-none bg-[rgba(10,14,24,0.8)] border border-[rgba(39,217,247,0.2)] focus:border-[#27d9f7]"
            />
            <input
              placeholder={tx('package_price')}
              value={form.price_eur}
              inputMode="decimal"
              onChange={(e) => setForm((f) => ({ ...f, price_eur: e.target.value }))}
              className="flex-1 rounded-xl px-3 py-2 text-sm text-[#dfe2f1] placeholder:text-[#859397] outline-none bg-[rgba(10,14,24,0.8)] border border-[rgba(39,217,247,0.2)] focus:border-[#27d9f7]"
            />
            <input
              placeholder={tx('package_price_stars')}
              value={form.price_stars}
              inputMode="numeric"
              onChange={(e) => setForm((f) => ({ ...f, price_stars: e.target.value }))}
              className="flex-1 rounded-xl px-3 py-2 text-sm text-[#dfe2f1] placeholder:text-[#859397] outline-none bg-[rgba(10,14,24,0.8)] border border-[rgba(39,217,247,0.2)] focus:border-[#27d9f7]"
            />
          </div>
          <button
            onClick={handleAdd}
            disabled={creating}
            className="py-2.5 rounded-xl text-xs font-bold text-[#060a14] bg-gradient-to-r from-[#27d9f7] to-[#059af0] shadow-[0_0_14px_rgba(39,217,247,0.3)] hover:shadow-[0_0_20px_rgba(39,217,247,0.45)] active:scale-[0.98] disabled:opacity-50 transition-all"
          >
            {creating ? <Loader className="w-3.5 h-3.5 animate-spin mx-auto text-[#060a14]" /> : tx('package_add')}
          </button>
        </div>
      )}

      {packages.length === 0 ? (
        <div className="text-center text-xs text-[#859397] py-4">{tx('no_packages')}</div>
      ) : (
        <div className="flex flex-col gap-2">
          {packages.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-2xl bg-[rgba(10,14,24,0.6)] border border-[rgba(39,217,247,0.14)] hover:border-[rgba(39,217,247,0.25)] transition-all"
            >
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-semibold truncate ${p.is_active ? 'text-[#dfe2f1]' : 'text-[#859397] line-through'}`}>
                  {p.label}
                </div>
                <div className="text-[11px] text-[#859397] font-mono">
                  <span className="text-[#c2f3ff]">{Number(p.points_amount).toFixed(0)} pts</span> · €{Number(p.price_eur).toFixed(2)} · ⭐{p.price_stars}
                </div>
              </div>
              <button
                onClick={() => toggleActive(p)}
                className={`px-2.5 py-1 rounded-full text-[10px] font-bold shrink-0 transition-all ${
                  p.is_active
                    ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
                    : 'bg-slate-500/15 border border-slate-500/25 text-[#859397]'
                }`}
              >
                {tx('package_active')}
              </button>
              <button
                onClick={() => setPendingDelete(p.id)}
                className="p-1.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 hover:bg-rose-500/25 active:scale-[0.95] transition-all shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {pendingDelete !== null && (
        <ConfirmModal
          tx={tx}
          message={tx('package_delete')}
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}

// ── PricingEditor ──────────────────────────────────────────
function PricingEditor({ tx, pricing, flash, onReload }: {
  tx: any; pricing: Pricing | null; flash: (m: string) => void; onReload: () => Promise<void>;
}) {
  const [text, setText] = useState(pricing?.price_text_message ?? '');
  const [voice, setVoice] = useState(pricing?.price_voice_message ?? '');
  const [slot, setSlot] = useState(pricing?.price_slot_per_hour ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setText(pricing?.price_text_message ?? '');
    setVoice(pricing?.price_voice_message ?? '');
    setSlot(pricing?.price_slot_per_hour ?? '');
  }, [pricing]);

  async function save() {
    const t = parseFloat(text), v = parseFloat(voice), s = parseFloat(slot);
    if (!(t >= 0) || !(v >= 0) || !(s >= 0)) return;
    setSaving(true);
    try {
      await adminUpdatePricing({ price_text_message: t, price_voice_message: v, price_slot_per_hour: s });
      flash('✅ ' + tx('pricing_saved'));
      await onReload();
    } catch { flash('❌'); }
    finally { setSaving(false); }
  }

  return (
    <div className="bg-[rgba(15,19,30,0.65)] border border-[rgba(39,217,247,0.18)] rounded-2xl p-4 backdrop-blur-xl shadow-[0_4px_24px_rgba(0,0,0,0.3)]">
      <div className="text-[10px] font-bold text-[#27d9f7] font-['Sora'] uppercase tracking-wider mb-1">{tx('pricing_title')}</div>
      <div className="text-[11px] text-[#859397] mb-3 leading-relaxed">{tx('pricing_hint')}</div>
      <div className="flex flex-col gap-2.5">
        {([
          ['text', text, setText, tx('pricing_text')],
          ['voice', voice, setVoice, tx('pricing_voice')],
          ['slot', slot, setSlot, tx('pricing_slot')],
        ] as const).map(([key, value, setValue, label]) => (
          <div key={key} className="flex items-center gap-3">
            <label className="flex-1 text-sm text-[#dfe2f1]">{label}</label>
            <input
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-24 rounded-xl px-3 py-2 text-sm text-right text-[#dfe2f1] font-mono outline-none bg-[rgba(10,14,24,0.8)] border border-[rgba(39,217,247,0.22)] focus:border-[#27d9f7]"
            />
          </div>
        ))}
      </div>
      <button
        onClick={save}
        disabled={saving}
        className="w-full mt-3 py-2.5 rounded-xl text-xs font-bold text-[#060a14] bg-gradient-to-r from-[#27d9f7] to-[#059af0] shadow-[0_0_14px_rgba(39,217,247,0.3)] hover:shadow-[0_0_20px_rgba(39,217,247,0.45)] active:scale-[0.98] disabled:opacity-50 transition-all"
      >
        {saving ? <Loader className="w-3.5 h-3.5 animate-spin mx-auto text-[#060a14]" /> : tx('save')}
      </button>
    </div>
  );
}

// ── AddPointsModal ─────────────────────────────────────────
function AddPointsModal({ user, tx, onClose, onSubmit }: {
  user: { id: number; display_name: string | null; username: string | null; telegram_id: number };
  tx: any; onClose: () => void; onSubmit: (amount: number) => Promise<void>;
}) {
  const [mode, setMode] = useState<'add' | 'deduct'>('add');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    const a = Math.abs(parseFloat(amount));
    if (!a) return;
    setBusy(true);
    try { await onSubmit(mode === 'deduct' ? -a : a); } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-[400] bg-[#060a14]/85 backdrop-blur-md flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-[360px] rounded-3xl p-5 bg-[rgba(15,19,30,0.95)] border border-[rgba(39,217,247,0.25)] shadow-[0_20px_60px_rgba(0,0,0,0.85)] backdrop-blur-2xl text-[#dfe2f1]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 mb-4">
          <h3 className="text-base font-bold text-[#27d9f7] font-['Sora']">{tx('add_pts_title')}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.1)] text-[#859397] hover:text-[#dfe2f1] active:scale-90 transition-all">
            <X size={16} />
          </button>
        </div>

        <div className="text-xs text-[#859397] mb-1">{tx('add_pts_to')}</div>
        <div className="text-sm font-semibold text-[#dfe2f1] mb-4">
          {user.display_name || user.username || `ID ${user.telegram_id}`}
        </div>

        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setMode('add')}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-[0.98] ${
              mode === 'add'
                ? 'bg-gradient-to-r from-[#27d9f7] to-[#059af0] text-[#060a14] shadow-[0_0_12px_rgba(39,217,247,0.35)]'
                : 'bg-[rgba(21,26,38,0.6)] border border-[rgba(39,217,247,0.12)] text-[#859397]'
            }`}
          >
            {tx('mode_add')}
          </button>
          <button
            onClick={() => setMode('deduct')}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-[0.98] ${
              mode === 'deduct'
                ? 'bg-rose-500/20 border border-rose-500/40 text-rose-300 shadow-[0_0_12px_rgba(239,68,68,0.25)]'
                : 'bg-[rgba(21,26,38,0.6)] border border-[rgba(39,217,247,0.12)] text-[#859397]'
            }`}
          >
            {tx('mode_deduct')}
          </button>
        </div>

        <label className="text-xs text-[#859397]">{tx('amount')}</label>
        <input
          autoFocus
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          inputMode="decimal"
          placeholder="0"
          className="w-full bg-[rgba(10,14,24,0.7)] border border-[rgba(39,217,247,0.22)] rounded-xl px-4 py-3 text-sm text-[#dfe2f1] outline-none focus:border-[#27d9f7] focus:shadow-[0_0_12px_rgba(39,217,247,0.3)] mb-1.5 transition-all"
        />
        <div className="text-[10px] text-[#859397] mb-4 leading-relaxed">{tx('add_pts_hint')}</div>

        <button
          onClick={submit}
          disabled={busy || !amount}
          className={`w-full py-3 rounded-xl font-bold text-sm disabled:opacity-40 transition-all active:scale-[0.98] ${
            mode === 'deduct'
              ? 'bg-rose-500/20 border border-rose-500/40 text-rose-300 hover:bg-rose-500/30 shadow-[0_0_14px_rgba(239,68,68,0.3)]'
              : 'bg-gradient-to-r from-[#27d9f7] to-[#059af0] text-[#060a14] shadow-[0_0_16px_rgba(39,217,247,0.35)] hover:shadow-[0_0_22px_rgba(39,217,247,0.5)]'
          }`}
        >
          {busy ? <Loader className="w-4 h-4 animate-spin mx-auto" /> : mode === 'deduct' ? tx('deduct_pts_submit') : tx('add_pts_submit')}
        </button>
      </div>
    </div>
  );
}

// ── GrantAccessModal ───────────────────────────────────────
function GrantAccessModal({ tx, meId, onClose, flash, onGranted }: {
  tx: any; meId?: number; onClose: () => void; flash: (m: string) => void; onGranted: () => void;
}) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<UserRow | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [granting, setGranting] = useState(false);

  useEffect(() => {
    getUsers().then(setUsers).catch(() => setUsers([])).finally(() => setLoading(false));
  }, []);

  const candidates = users.filter((u: any) => u.id !== meId);
  const filtered = (() => {
    const q = search.trim().toLowerCase().replace(/^@/, '');
    if (!q) return candidates;
    return candidates.filter((u: any) =>
      String(u.telegram_id).includes(q) ||
      String(u.id) === q ||
      (u.username || '').toLowerCase().includes(q) ||
      (u.display_name || '').toLowerCase().includes(q)
    );
  })();

  const willRevoke = selected?.role === 'admin';

  async function handleConfirm() {
    if (!selected) return;
    setGranting(true);
    try {
      await adminSetStaffRole(selected.id, willRevoke ? 'none' : 'admin');
      flash('✅');
      onGranted();
      onClose();
    } catch (e: any) {
      flash('❌ ' + (e.message || ''));
      setConfirming(false);
    } finally {
      setGranting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[400] bg-[#060a14]/85 backdrop-blur-md flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-[400px] max-h-[80vh] flex flex-col rounded-3xl p-5 bg-[rgba(15,19,30,0.95)] border border-[rgba(39,217,247,0.25)] shadow-[0_20px_60px_rgba(0,0,0,0.85)] backdrop-blur-2xl text-[#dfe2f1]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1 shrink-0">
          <h3 className="text-base font-bold text-[#27d9f7] font-['Sora']">{tx('grant_access_title')}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.1)] text-[#859397] hover:text-[#dfe2f1]">
            <X size={16} />
          </button>
        </div>
        <p className="text-[11px] text-[#859397] mb-3 leading-relaxed shrink-0">{tx('grant_access_hint')}</p>

        <div className="relative mb-3 shrink-0">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#859397] pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tx('search_users_placeholder')}
            className="w-full rounded-2xl pl-10 pr-9 py-2.5 text-sm text-[#dfe2f1] placeholder:text-[#859397] outline-none bg-[rgba(10,14,24,0.7)] border border-[rgba(39,217,247,0.22)] focus:border-[#27d9f7] transition-all"
          />
        </div>

        <div className="flex-1 overflow-y-auto flex flex-col gap-2 pr-0.5">
          {loading ? (
            <div className="text-center text-xs text-[#859397] py-6">…</div>
          ) : filtered.length === 0 ? (
            <div className="text-center text-xs text-[#859397] py-6">
              {candidates.length === 0 ? tx('no_candidates') : tx('search_no_results')}
            </div>
          ) : filtered.map((u: any) => {
            const isSelected = selected?.id === u.id;
            return (
              <button
                key={u.id}
                onClick={() => setSelected(u)}
                className={`flex items-center gap-2 rounded-2xl px-3.5 py-2.5 text-left transition-all ${
                  isSelected
                    ? 'bg-[rgba(39,217,247,0.12)] border border-[rgba(39,217,247,0.35)] shadow-[0_0_10px_rgba(39,217,247,0.2)]'
                    : 'bg-[rgba(10,14,24,0.5)] border border-[rgba(255,255,255,0.06)] hover:border-[rgba(39,217,247,0.2)]'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-[#dfe2f1] truncate">
                    {u.display_name || u.username || `ID ${u.telegram_id}`}
                  </div>
                  <div className="text-[10px] text-[#859397] font-mono">
                    <span className="font-sans text-[#27d9f7]">{tx('level_label')} {u.level}</span>
                    {u.role === 'admin' && <span className="ml-1.5 text-[#27d9f7] font-bold">👑 {tx('main_admin_badge')}</span>}
                    {u.role === 'moderator' && <span className="ml-1.5 text-[#059af0] font-bold">🛡 {tx('moderator_badge')}</span>}
                  </div>
                </div>
                {isSelected && <CheckCircle className="w-4 h-4 text-[#27d9f7] shrink-0" />}
              </button>
            );
          })}
        </div>

        <button
          onClick={() => selected && setConfirming(true)}
          disabled={!selected}
          className={`w-full mt-3 py-3 rounded-xl font-bold text-sm disabled:opacity-40 shrink-0 transition-all active:scale-[0.98] ${
            willRevoke
              ? 'bg-rose-500/15 border border-rose-500/30 text-rose-400 hover:bg-rose-500/25'
              : 'bg-gradient-to-r from-[#27d9f7] to-[#059af0] text-[#060a14] shadow-[0_0_16px_rgba(39,217,247,0.35)] hover:shadow-[0_0_24px_rgba(39,217,247,0.5)]'
          }`}
        >
          {selected ? (willRevoke ? tx('revoke_full_admin') : tx('make_full_admin')) : tx('grant_access_pick')}
        </button>
      </div>

      {confirming && selected && (
        <ConfirmModal
          tx={tx}
          message={tx(willRevoke ? 'confirm_revoke_full_admin' : 'confirm_grant_full_admin')}
          onConfirm={handleConfirm}
          onCancel={() => !granting && setConfirming(false)}
        />
      )}
    </div>
  );
}

// ── ConfirmModal ───────────────────────────────────────────
function ConfirmModal({ tx, message, onConfirm, onCancel }: {
  tx: any; message: string; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[400] bg-[#060a14]/85 backdrop-blur-md flex items-center justify-center p-4" onClick={onCancel}>
      <div className="w-full max-w-[340px] rounded-3xl p-5 bg-[rgba(15,19,30,0.95)] border border-[rgba(39,217,247,0.25)] shadow-[0_20px_60px_rgba(0,0,0,0.85)] backdrop-blur-2xl text-[#dfe2f1]" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-bold text-[#dfe2f1] font-['Sora'] mb-2">{tx('confirm_delete_title')}</h3>
        <p className="text-sm text-[#859397] mb-5 leading-relaxed">{message}</p>
        <div className="flex gap-2.5">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl text-sm font-semibold text-[#859397] bg-[rgba(21,26,38,0.7)] border border-[rgba(255,255,255,0.08)] hover:text-[#dfe2f1] hover:border-[rgba(39,217,247,0.2)] active:scale-[0.98] transition-all"
          >
            {tx('cancel')}
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-3 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-rose-500 to-red-600 shadow-[0_0_14px_rgba(239,68,68,0.4)] active:scale-[0.98] transition-all"
          >
            {tx('confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
