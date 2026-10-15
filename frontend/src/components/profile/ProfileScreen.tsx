import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Check, X, Award, Globe, IdCard, User as UserIcon, AtSign, Focus, Smile, Tag,
  ArrowDown, ArrowUp, Edit, ShoppingCart, ChevronRight, History, ArrowUpRight, ArrowDownLeft,
  Gift, MessageSquare, Mic, Radio, Music, Clock, Trash2, type LucideIcon,
} from 'lucide-react';
import {
  updateProfile, transferPoints, requestPoints, getMyRequests,
  decideRequest, getPackages, getMe, updateLanguage, getPointsHistory, getPaymentMethod,
  createManualPayment, getMyManualPayments, cancelManualPayment,
} from '../../lib/api';
import { getLang, setLang as setI18nLang } from '../../lib/i18n';
import { LanguageSelector } from '../announcements/LanguageSelector';
import type {
  User, PointsRequest, PointPackage, Language, PointsTransaction, PaymentSettings,
  ManualPayment, ManualPaymentMethod,
} from '../../types';

interface ProfileScreenProps {
  user: User | null;
  onUserUpdate?: (user: User) => void;
}

// Ko'p tilli yorliqlar (dizaynga ta'sir qilmaydi)
const L: Record<string, Record<string, string>> = {
  ru: {
    balance: 'Ваш баланс', points: 'Баллы', level: 'Уровень', language: 'Язык', id: 'ID',
    name: 'Имя', username: 'Никнейм', edit: 'Редактировать профиль', save: 'Сохранить',
    request: 'Запросить', give: 'Отправить', buy: 'Купить', requests: 'Запросы ко мне',
    user_id: 'ID пользователя', amount: 'Количество', msg: 'Сообщение', approve: 'Одобрить',
    reject: 'Отклонить', no_req: 'Нет новых запросов', from_you: 'запрашивает у вас',
    admin: '👑 Admin Panel', saved: 'Сохранено', sent: 'Отправлено', error: 'Ошибка', requested: 'Запрос отправлен',
    lang_ru: 'Русский', lang_en: 'English', lang_lt: 'Lietuvių',
    history: 'История', history_title: 'История операций', no_history: 'Пока нет операций',
    tx_transfer_out: 'Перевод пользователю', tx_transfer_in: 'Перевод от пользователя',
    tx_purchase: 'Покупка поинтов', tx_gift: 'Подарок от админа',
    tx_text_message: 'Сообщение в чат', tx_voice_message: 'Голосовое в чат',
    tx_studio: 'Заявка в студию', tx_opinion_text: 'Мнение в студию', tx_opinion_voice: 'Голосовое мнение',
    tx_music_nominate: 'Номинация трека', tx_music_vote: 'Голос за трек',
    tx_slot_booking: 'Оплата слота эфира', tx_other: 'Операция',
    buy_manual_intro: 'Автоматическая оплата пока недоступна. Свяжитесь с администратором по инструкции ниже.',
    buy_stars_intro: 'Оплата проходит через бота безопасно (Telegram Payments). Нажмите на пакет — откроется бот.',
    pay_stars: '⭐ Stars', pay_manual: '✉️ Вручную',
    manual_intro: 'Переведите сумму по реквизитам ниже, затем отправьте заявку. Администратор проверит и начислит поинты.',
    manual_details_title: 'Реквизиты для оплаты',
    manual_no_details: 'Администратор ещё не указал реквизиты. Свяжитесь с ним напрямую.',
    manual_select_pkg: 'Выберите пакет',
    manual_method: 'Способ оплаты',
    manual_bank: 'Банковский перевод', manual_card: 'Карта', manual_cash: 'Наличные',
    manual_crypto: 'Криптовалюта', manual_other: 'Другое',
    manual_note: 'Комментарий (номер транзакции, время оплаты)',
    manual_note_ph: 'Например: перевод 15.03 в 14:30, чек №12345',
    manual_send: 'Отправить заявку',
    manual_sent: 'Заявка отправлена! Ожидайте подтверждения.',
    manual_pending_title: 'Заявка на рассмотрении',
    manual_cancel: 'Отменить заявку',
    manual_cancelled: 'Заявка отменена',
    manual_history: 'Мои заявки',
    st_pending: 'На рассмотрении', st_approved: 'Подтверждена', st_rejected: 'Отклонена',
    manual_disabled: 'Ручная оплата временно отключена',
    manual_need_note: 'Укажите комментарий к оплате',
  },
  en: {
    balance: 'Your balance', points: 'Points', level: 'Level', language: 'Language', id: 'ID',
    name: 'Name', username: 'Username', edit: 'Edit profile', save: 'Save',
    request: 'Request', give: 'Send', buy: 'Buy', requests: 'Requests to me',
    user_id: 'User ID', amount: 'Amount', msg: 'Message', approve: 'Approve',
    reject: 'Reject', no_req: 'No new requests', from_you: 'requests from you',
    admin: '👑 Admin Panel', saved: 'Saved', sent: 'Sent', error: 'Error', requested: 'Request sent',
    lang_ru: 'Русский', lang_en: 'English', lang_lt: 'Lietuvių',
    history: 'History', history_title: 'Transaction history', no_history: 'No transactions yet',
    tx_transfer_out: 'Transfer to user', tx_transfer_in: 'Transfer from user',
    tx_purchase: 'Points purchase', tx_gift: 'Gift from admin',
    tx_text_message: 'Chat message', tx_voice_message: 'Chat voice message',
    tx_studio: 'Studio request', tx_opinion_text: 'Studio opinion', tx_opinion_voice: 'Studio voice opinion',
    tx_music_nominate: 'Track nomination', tx_music_vote: 'Track vote',
    tx_slot_booking: 'Broadcast slot payment', tx_other: 'Transaction',
    buy_manual_intro: 'Automatic payment is not available yet. Please contact the admin using the instructions below.',
    buy_stars_intro: 'Payment goes through the bot securely (Telegram Payments). Tap a package to open the bot.',
    pay_stars: '⭐ Stars', pay_manual: '✉️ Manual',
    manual_intro: 'Transfer the amount using the details below, then submit a request. The admin will verify and credit your points.',
    manual_details_title: 'Payment details',
    manual_no_details: 'The admin has not added payment details yet. Please contact them directly.',
    manual_select_pkg: 'Select a package',
    manual_method: 'Payment method',
    manual_bank: 'Bank transfer', manual_card: 'Card', manual_cash: 'Cash',
    manual_crypto: 'Cryptocurrency', manual_other: 'Other',
    manual_note: 'Comment (transaction number, payment time)',
    manual_note_ph: 'e.g. transfer on 15.03 at 14:30, receipt #12345',
    manual_send: 'Submit request',
    manual_sent: 'Request submitted! Please wait for confirmation.',
    manual_pending_title: 'Request under review',
    manual_cancel: 'Cancel request',
    manual_cancelled: 'Request cancelled',
    manual_history: 'My requests',
    st_pending: 'Under review', st_approved: 'Approved', st_rejected: 'Rejected',
    manual_disabled: 'Manual payment is temporarily disabled',
    manual_need_note: 'Please add a payment comment',
  },
  lt: {
    balance: 'Jūsų balansas', points: 'Taškai', level: 'Lygis', language: 'Kalba', id: 'ID',
    name: 'Vardas', username: 'Slapyvardis', edit: 'Redaguoti profilį', save: 'Išsaugoti',
    request: 'Prašyti', give: 'Siųsti', buy: 'Pirkti', requests: 'Prašymai man',
    user_id: 'Vartotojo ID', amount: 'Kiekis', msg: 'Žinutė', approve: 'Patvirtinti',
    reject: 'Atmesti', no_req: 'Naujų prašymų nėra', from_you: 'prašo iš jūsų',
    admin: '👑 Admin Panel', saved: 'Išsaugota', sent: 'Išsiųsta', error: 'Klaida', requested: 'Prašymas išsiųstas',
    lang_ru: 'Русский', lang_en: 'English', lang_lt: 'Lietuvių',
    history: 'Istorija', history_title: 'Operacijų istorija', no_history: 'Kol kas nėra operacijų',
    tx_transfer_out: 'Pervedimas vartotojui', tx_transfer_in: 'Pervedimas iš vartotojo',
    tx_purchase: 'Taškų pirkimas', tx_gift: 'Dovana iš admino',
    tx_text_message: 'Žinutė pokalbyje', tx_voice_message: 'Balso žinutė pokalbyje',
    tx_studio: 'Užklausa studijai', tx_opinion_text: 'Nuomonė studijai', tx_opinion_voice: 'Balso nuomonė',
    tx_music_nominate: 'Dainos nominacija', tx_music_vote: 'Balsas už dainą',
    tx_slot_booking: 'Eterio slot apmokėjimas', tx_other: 'Operacija',
    buy_manual_intro: 'Automatinis mokėjimas kol kas nepasiekiamas. Susisiekite su administratoriumi pagal instrukciją žemiau.',
    buy_stars_intro: 'Mokėjimas vyksta saugiai per botą (Telegram Payments). Paspauskite paketą — atsidarys botas.',
    pay_stars: '⭐ Stars', pay_manual: '✉️ Rankiniu būdu',
    manual_intro: 'Perveskite sumą pagal žemiau nurodytus rekvizitus, tada išsiųskite užklausą. Administratorius patikrins ir priskirs taškus.',
    manual_details_title: 'Mokėjimo rekvizitai',
    manual_no_details: 'Administratorius dar nenurodė rekvizitų. Susisiekite su juo tiesiogiai.',
    manual_select_pkg: 'Pasirinkite paketą',
    manual_method: 'Mokėjimo būdas',
    manual_bank: 'Banko pervedimas', manual_card: 'Kortelė', manual_cash: 'Grynais',
    manual_crypto: 'Kriptovaliuta', manual_other: 'Kita',
    manual_note: 'Komentaras (operacijos numeris, laikas)',
    manual_note_ph: 'Pvz.: pervedimas 03.15 14:30, kvitas Nr. 12345',
    manual_send: 'Siųsti užklausą',
    manual_sent: 'Užklausa išsiųsta! Palaukite patvirtinimo.',
    manual_pending_title: 'Užklausa peržiūrima',
    manual_cancel: 'Atšaukti užklausą',
    manual_cancelled: 'Užklausa atšaukta',
    manual_history: 'Mano užklausos',
    st_pending: 'Peržiūrima', st_approved: 'Patvirtinta', st_rejected: 'Atmesta',
    manual_disabled: 'Rankinis mokėjimas laikinai išjungtas',
    manual_need_note: 'Nurodykite mokėjimo komentarą',
  },
};

type Modal = null | 'edit' | 'give' | 'request' | 'buy' | 'lang' | 'history';

export function ProfileScreen({ user, onUserUpdate }: ProfileScreenProps) {
  const lang = getLang();
  const tx = (k: string) => L[lang]?.[k] || L.ru[k] || k;
  const navigate = useNavigate();
  const [modal, setModal] = useState<Modal>(null);
  const [requests, setRequests] = useState<PointsRequest[]>([]);
  const [packages, setPackages] = useState<PointPackage[]>([]);
  const [history, setHistory] = useState<PointsTransaction[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [toast, setToast] = useState('');
  const [toastError, setToastError] = useState(false);

  useEffect(() => {
    getMyRequests().then(setRequests).catch(() => {});
    getPackages().then(setPackages).catch(() => {});
  }, []);

  function showToast(m: string, isError = false) {
    setToast(m);
    setToastError(isError);
    setTimeout(() => setToast(''), 2500);
  }

  async function refresh() {
    try {
      const u = await getMe();
      onUserUpdate?.(u);
    } catch {}
    getMyRequests().then(setRequests).catch(() => {});
  }

  async function handleLangChange(newLang: Language) {
    setI18nLang(newLang);
    try {
      await updateLanguage(newLang);
      if (user) onUserUpdate?.({ ...user, language: newLang });
    } catch {
      showToast(tx('error'), true);
    } finally {
      setModal(null);
    }
  }

  async function openHistory() {
    setModal('history');
    setHistoryLoading(true);
    try { setHistory(await getPointsHistory()); }
    catch { setHistory([]); }
    finally { setHistoryLoading(false); }
  }

  async function handleDecide(id: number, approve: boolean) {
    try {
      await decideRequest(id, approve);
      await refresh();
      showToast(tx('saved'));
    } catch {
      showToast(tx('error'), true);
    }
  }

  if (!user) {
    return (
      <div className="rift-zone-u1 flex items-center justify-center min-h-[200px]">
        <div className="text-[#6b5f4f] text-sm">Loading...</div>
      </div>
    );
  }

  const langLabel = tx(`lang_${user.language || 'ru'}`);

  // Uровень отображается числом (1/2/3), а не словом — по требованию клиента
  const lvl = user.level ?? 1;
  const levelDisplay = String(lvl);

  return (
    <div className="w-full flex flex-col gap-4 pb-20 text-[#dfe2f1]">
      {/* Balance card — avatar + obsidian neon balance */}
      <section className="w-full rounded-2xl p-5 flex flex-col items-center justify-center relative overflow-hidden bg-gradient-to-b from-[#0f1628]/95 via-[#0b101e]/95 to-[#070b14]/95 border border-[rgba(39,217,247,0.22)] shadow-[0_10px_35px_rgba(0,0,0,0.5),0_0_25px_rgba(39,217,247,0.08)]">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-20 bg-[radial-gradient(ellipse_at_top,rgba(39,217,247,0.25)_0%,transparent_70%)] pointer-events-none" />
        
        <div className="relative z-10 w-full flex flex-col items-center justify-center">
          {/* Avatar with cyber ring */}
          <div className="relative mb-3">
            <div className="w-20 h-20 rounded-full border-2 border-[rgba(39,217,247,0.4)] bg-[#060a14] flex items-center justify-center shadow-[0_0_20px_rgba(39,217,247,0.25)]">
              <UserIcon size={38} className="text-[#27d9f7]" />
            </div>
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono tracking-wider bg-[#060a14] border border-[#27d9f7] text-[#27d9f7] shadow-[0_0_12px_rgba(39,217,247,0.4)] whitespace-nowrap uppercase">
              LVL {levelDisplay}
            </span>
          </div>

          <h2 className="text-[10px] text-[#859397] tracking-[0.25em] uppercase font-mono mt-1 mb-1">{tx('balance')}</h2>
          
          <div className="flex items-baseline gap-2">
            <span className="text-[34px] sm:text-[38px] leading-tight font-black font-mono tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-[#c2f3ff] to-[#27d9f7] drop-shadow-[0_0_16px_rgba(39,217,247,0.35)]">
              {Number(user.points).toFixed(3)}
            </span>
            <span className="px-2 py-0.5 rounded-md text-[11px] font-bold font-mono bg-[rgba(39,217,247,0.12)] text-[#27d9f7] border border-[rgba(39,217,247,0.3)] shadow-[0_0_10px_rgba(39,217,247,0.15)]">
              PTS
            </span>
          </div>
        </div>
      </section>

      {/* Point amallar — Request / Send / Buy (Obsidian Glass) */}
      <section className="grid grid-cols-3 gap-2.5 w-full">
        <button
          onClick={() => setModal('request')}
          className="py-3 px-2 rounded-xl flex flex-col items-center justify-center gap-1.5 bg-[#0f131e]/85 hover:bg-[#141b2b] border border-[rgba(39,217,247,0.18)] hover:border-[#27d9f7]/50 text-[#dfe2f1] active:scale-95 transition-all shadow-[0_4px_16px_rgba(0,0,0,0.3)]"
        >
          <ArrowDown size={20} className="text-[#27d9f7]" />
          <span className="text-[11px] font-semibold tracking-wide truncate w-full text-center">{tx('request')}</span>
        </button>

        <button
          onClick={() => setModal('give')}
          className="py-3 px-2 rounded-xl flex flex-col items-center justify-center gap-1.5 bg-[#0f131e]/85 hover:bg-[#141b2b] border border-[rgba(39,217,247,0.18)] hover:border-[#27d9f7]/50 text-[#dfe2f1] active:scale-95 transition-all shadow-[0_4px_16px_rgba(0,0,0,0.3)]"
        >
          <ArrowUp size={20} className="text-[#27d9f7]" />
          <span className="text-[11px] font-semibold tracking-wide truncate w-full text-center">{tx('give')}</span>
        </button>

        <button
          onClick={() => setModal('buy')}
          className="py-3 px-2 rounded-xl flex flex-col items-center justify-center gap-1.5 bg-gradient-to-br from-[#27d9f7] to-[#059af0] text-[#060a14] active:scale-95 transition-all shadow-[0_0_20px_rgba(39,217,247,0.35)]"
        >
          <ShoppingCart size={20} className="text-[#060a14]" />
          <span className="text-[11px] font-bold tracking-wide truncate w-full text-center text-[#060a14]">{tx('buy')}</span>
        </button>
      </section>

      {/* Info rows — Level / Language / ID / Name / Username */}
      <section className="w-full bg-[#0f131e]/75 backdrop-blur-xl border border-[rgba(39,217,247,0.18)] rounded-2xl p-4 flex flex-col shadow-[0_8px_30px_rgba(0,0,0,0.35)]">
        <div className="divide-y divide-white/[0.06]">
          <StitchRow icon={Award} label={tx('level')} value={levelDisplay} highlight />
          <button className="w-full text-left" onClick={() => setModal('lang')}>
            <StitchRow icon={Globe} label={tx('language')} value={langLabel} clickable />
          </button>
          <StitchRow icon={IdCard} label={tx('id')} value={String(user.telegram_id)} mono />
          <StitchRow icon={UserIcon} label={tx('name')} value={user.display_name || user.full_name || '—'} />
          <StitchRow icon={AtSign} label={tx('username')} value={user.username ? `@${user.username}` : '—'} accent last />
        </div>

        {/* Tahrirlash tugmasi */}
        <button
          onClick={() => setModal('edit')}
          className="w-full mt-3 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-[rgba(39,217,247,0.18)] hover:border-[#27d9f7]/40 flex items-center justify-center gap-2 text-xs font-semibold text-[#c2f3ff] active:scale-[0.98] transition-all"
        >
          <Edit size={15} className="text-[#27d9f7]" />
          {tx('edit')}
        </button>
      </section>

      {/* Psixoprofil — mavjud bo'lsa */}
      {(user.focus_of_attention || user.emotional_tone) && (
        <section className="w-full bg-[#0f131e]/75 backdrop-blur-xl border border-[rgba(39,217,247,0.18)] rounded-2xl p-4 flex flex-col shadow-[0_8px_30px_rgba(0,0,0,0.35)]">
          <div className="text-[11px] font-bold text-[#27d9f7] uppercase tracking-wider mb-2 font-mono flex items-center gap-2">
            <span>🧠 {lang === 'ru' ? 'Психопрофиль' : lang === 'lt' ? 'Psichotipas' : 'Psychotype'}</span>
          </div>
          <div className="divide-y divide-white/[0.06]">
            {user.focus_of_attention && (
              <StitchRow icon={Focus}
                label={lang === 'ru' ? 'Фокус' : lang === 'lt' ? 'Fokusas' : 'Focus'}
                value={
                  user.focus_of_attention === 'vnutrenniy'
                    ? (lang === 'ru' ? 'Внутренний' : lang === 'lt' ? 'Vidinis' : 'Internal')
                    : (lang === 'ru' ? 'Внешний' : lang === 'lt' ? 'Išorinis' : 'External')
                }
              />
            )}
            {user.emotional_tone && (
              <StitchRow icon={Smile}
                label={lang === 'ru' ? 'Тон' : lang === 'lt' ? 'Tonas' : 'Tone'}
                value={
                  user.emotional_tone === 'optimist'
                    ? (lang === 'ru' ? 'Оптимист' : lang === 'lt' ? 'Optimistas' : 'Optimist')
                    : user.emotional_tone === 'melanxolik'
                    ? (lang === 'ru' ? 'Меланхолик' : lang === 'lt' ? 'Melancholikas' : 'Melancholic')
                    : (lang === 'ru' ? 'Рационал' : lang === 'lt' ? 'Racionalistas' : 'Rational')
                }
              />
            )}
            {user.key_topic && (
              <StitchRow icon={Tag}
                label={lang === 'ru' ? 'Тема' : lang === 'lt' ? 'Tema' : 'Topic'}
                value={user.key_topic} last
              />
            )}
          </div>
        </section>
      )}

      {/* Tranzaksiyalar tarixi tugmasi */}
      <button
        onClick={openHistory}
        className="w-full py-3 px-4 rounded-xl bg-[#0f131e]/75 backdrop-blur-xl border border-[rgba(39,217,247,0.18)] hover:border-[#27d9f7]/40 flex items-center justify-between text-xs font-semibold text-[#dfe2f1] active:scale-[0.98] transition-all shadow-[0_4px_20px_rgba(0,0,0,0.3)]"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-[rgba(39,217,247,0.12)] border border-[rgba(39,217,247,0.25)] flex items-center justify-center">
            <History size={16} className="text-[#27d9f7]" />
          </div>
          <span>{tx('history_title')}</span>
        </div>
        <ChevronRight size={16} className="text-[#859397]" />
      </button>

      {/* Menga kelgan so'rovlar */}
      <div className="flex flex-col gap-2">
        <div className="text-[11px] font-bold text-[#27d9f7] uppercase tracking-wider font-mono flex items-center gap-2">
          <span>{tx('requests')}</span>
          {requests.length > 0 && (
            <span className="w-5 h-5 rounded-full bg-[#27d9f7] text-[#060a14] text-[10px] font-bold flex items-center justify-center font-mono">
              {requests.length}
            </span>
          )}
        </div>
        {requests.length === 0 ? (
          <div className="rounded-xl p-4 text-center text-xs text-[#859397] bg-[#0f131e]/50 border border-white/5">{tx('no_req')}</div>
        ) : (
          requests.map((r) => (
            <div key={r.id} className="rounded-xl p-3.5 bg-[#0f131e]/75 border border-[rgba(39,217,247,0.18)] flex flex-col gap-2">
              <div className="text-sm text-[#dfe2f1]">
                <b>{r.from_display_name || `#${r.from_user_id}`}</b> {tx('from_you')}{' '}
                <b className="text-[#27d9f7] font-mono">{Number(r.amount).toFixed(3)} PTS</b>
              </div>
              {r.message && <div className="text-xs text-[#859397]">{r.message}</div>}
              <div className="flex gap-2 mt-1">
                <button
                  onClick={() => handleDecide(r.id, true)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-[#27d9f7]/15 hover:bg-[#27d9f7]/25 text-[#27d9f7] text-xs font-semibold border border-[#27d9f7]/30 transition-all"
                >
                  <Check className="w-4 h-4" /> {tx('approve')}
                </button>
                <button
                  onClick={() => handleDecide(r.id, false)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-red-500/15 hover:bg-red-500/25 text-red-400 text-xs font-semibold border border-red-500/30 transition-all"
                >
                  <X className="w-4 h-4" /> {tx('reject')}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Admin link — admin va moderator uchun */}
      {(user.role === 'admin' || user.role === 'moderator') && (
        <button
          onClick={() => navigate('/admin', { state: { from: 'profile' } })}
          className="w-full py-3.5 px-4 rounded-xl text-center text-xs font-bold tracking-wider uppercase text-amber-300 bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-amber-500/15 border border-amber-500/35 hover:border-amber-400/60 shadow-[0_0_20px_rgba(245,158,11,0.2)] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
        >
          {tx('admin')}
        </button>
      )}

      {/* Modallar */}
      {modal === 'edit' && (
        <EditModal user={user} tx={tx} onClose={() => setModal(null)}
          onSaved={async () => { setModal(null); await refresh(); showToast(tx('saved')); }}
          onError={() => showToast(tx('error'), true)} />
      )}
      {modal === 'give' && (
        <TransferModal tx={tx} onClose={() => setModal(null)}
          onDone={async () => { setModal(null); await refresh(); showToast(tx('sent')); }}
          onError={(m) => showToast(m, true)} />
      )}
      {modal === 'request' && (
        <RequestModal tx={tx} onClose={() => setModal(null)}
          onDone={() => { setModal(null); showToast(tx('requested')); }}
          onError={(m) => showToast(m, true)} />
      )}
      {modal === 'buy' && (
        <BuyModal tx={tx} packages={packages} onClose={() => setModal(null)}
          onDone={() => showToast(tx('manual_sent'))}
          onError={(m) => showToast(m || tx('error'), true)} />
      )}
      {modal === 'lang' && (
        <ModalShell title={tx('language')} onClose={() => setModal(null)}>
          <LanguageSelector selectedLang={lang} onLangChange={handleLangChange} />
        </ModalShell>
      )}
      {modal === 'history' && (
        <ModalShell title={tx('history_title')} onClose={() => setModal(null)}>
          <HistoryList tx={tx} lang={lang} items={history} loading={historyLoading} />
        </ModalShell>
      )}

      {toast && (
        <div
          className={`fixed bottom-24 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-xl text-sm z-[200] backdrop-blur-xl shadow-2xl font-medium ${
            toastError ? 'bg-red-950/90 text-red-200 border border-red-500/40' : 'bg-[#0f172a]/95 text-[#c2f3ff] border border-[rgba(39,217,247,0.4)] shadow-[0_0_20px_rgba(39,217,247,0.3)]'
          }`}
        >
          {toast}
        </div>
      )}
    </div>
  );
}

// Obsidian Glass row: ikonka + label (chap), value (o'ng)
function StitchRow({ icon: Icon, label, value, highlight, accent, mono, last, clickable }: {
  icon: LucideIcon; label: string; value: string;
  highlight?: boolean; accent?: boolean; mono?: boolean; last?: boolean; clickable?: boolean;
}) {
  return (
    <div
      className="flex justify-between items-center py-3"
      style={last ? {} : { borderBottom: '1px solid rgba(255,255,255,0.06)' }}
    >
      <span className="text-xs text-[#859397] flex items-center gap-2.5 font-medium">
        <Icon size={17} className="text-[#27d9f7]" />
        {label}
      </span>
      <span className="flex items-center gap-1.5">
        {highlight ? (
          <span className="px-2.5 py-0.5 rounded-md bg-[rgba(39,217,247,0.15)] text-[#27d9f7] border border-[rgba(39,217,247,0.3)] text-xs font-bold font-mono">
            {value}
          </span>
        ) : (
          <span className={`text-xs font-semibold ${accent ? 'text-[#27d9f7]' : 'text-[#dfe2f1]'} ${mono ? 'font-mono' : ''}`}>
            {value}
          </span>
        )}
        {clickable && <ChevronRight size={14} className="text-[#859397]" />}
      </span>
    </div>
  );
}

function ModalShell({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[300] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 select-none" onClick={onClose}>
      <div
        className="w-full max-w-[390px] max-h-[88vh] rounded-3xl p-5 flex flex-col shadow-[0_15px_40px_rgba(0,0,0,0.7)]"
        style={{
          background: 'rgba(15, 19, 30, 0.95)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(39, 217, 247, 0.25)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 mb-4 shrink-0 border-b border-white/5 pb-3">
          <h3 className="text-base font-bold text-[#c2f3ff] font-['Sora'] tracking-wide">{title}</h3>
          <button
            onClick={onClose}
            aria-label="Закрыть"
            className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-white/5 text-[#859397] hover:text-[#dfe2f1] active:scale-90 transition-transform"
          >
            <X size={16} />
          </button>
        </div>
        <div className="overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

const inputCls = 'w-full bg-[rgba(10,14,24,0.7)] border border-[rgba(39,217,247,0.22)] rounded-xl px-4 py-3 text-sm text-[#dfe2f1] outline-none focus:border-[#27d9f7] focus:shadow-[0_0_12px_rgba(39,217,247,0.3)] mb-3';
const primaryBtn = 'w-full py-3.5 rounded-xl font-bold text-[#060a14] text-sm tracking-wide transition-all active:scale-[0.98]';
const primaryStyle = { background: 'linear-gradient(135deg, #c2f3ff 0%, #27d9f7 60%, #059af0 100%)', boxShadow: '0 0 20px rgba(39, 217, 247, 0.4)' };
type TX = (k: string) => string;

function EditModal({ user, tx, onClose, onSaved, onError }: { user: User; tx: TX; onClose: () => void; onSaved: () => void; onError: () => void }) {
  const [name, setName] = useState(user.display_name || user.full_name || '');
  const [username, setUsername] = useState(user.username || '');
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      await updateProfile({ display_name: name.trim() || undefined, username: username.trim() || undefined });
      onSaved();
    } catch { onError(); } finally { setBusy(false); }
  }
  return (
    <ModalShell title={tx('edit')} onClose={onClose}>
      <label className="text-xs text-[#859397] font-medium mb-1.5 block">{tx('name')}</label>
      <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
      <label className="text-xs text-[#859397] font-medium mb-1.5 block">{tx('username')}</label>
      <input className={inputCls} value={username} onChange={(e) => setUsername(e.target.value)} />
      <button className={primaryBtn} style={primaryStyle} onClick={save} disabled={busy}>{tx('save')}</button>
    </ModalShell>
  );
}

function TransferModal({ tx, onClose, onDone, onError }: { tx: TX; onClose: () => void; onDone: () => void; onError: (m: string) => void }) {
  const [toId, setToId] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit() {
    const id = parseInt(toId, 10), amt = parseFloat(amount);
    if (!id || !amt || amt <= 0) { onError(tx('error')); return; }
    setBusy(true);
    try { await transferPoints(id, amt); onDone(); }
    catch (e: any) { onError(e.message || tx('error')); } finally { setBusy(false); }
  }
  return (
    <ModalShell title={tx('give')} onClose={onClose}>
      <label className="text-xs text-[#859397] font-medium mb-1.5 block">{tx('user_id')}</label>
      <input className={inputCls} value={toId} onChange={(e) => setToId(e.target.value)} inputMode="numeric" />
      <label className="text-xs text-[#859397] font-medium mb-1.5 block">{tx('amount')}</label>
      <input className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
      <button className={primaryBtn} style={primaryStyle} onClick={submit} disabled={busy}>{tx('give')}</button>
    </ModalShell>
  );
}

function RequestModal({ tx, onClose, onDone, onError }: { tx: TX; onClose: () => void; onDone: () => void; onError: (m: string) => void }) {
  const [fromId, setFromId] = useState('');
  const [amount, setAmount] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit() {
    const id = parseInt(fromId, 10), amt = parseFloat(amount);
    if (!id || !amt || amt <= 0) { onError(tx('error')); return; }
    setBusy(true);
    try { await requestPoints(id, amt, msg.trim()); onDone(); }
    catch (e: any) { onError(e.message || tx('error')); } finally { setBusy(false); }
  }
  return (
    <ModalShell title={tx('request')} onClose={onClose}>
      <label className="text-xs text-[#859397] font-medium mb-1.5 block">{tx('user_id')}</label>
      <input className={inputCls} value={fromId} onChange={(e) => setFromId(e.target.value)} inputMode="numeric" />
      <label className="text-xs text-[#859397] font-medium mb-1.5 block">{tx('amount')}</label>
      <input className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
      <label className="text-xs text-[#859397] font-medium mb-1.5 block">{tx('msg')}</label>
      <input className={inputCls} value={msg} onChange={(e) => setMsg(e.target.value)} />
      <button className={primaryBtn} style={primaryStyle} onClick={submit} disabled={busy}>{tx('request')}</button>
    </ModalShell>
  );
}

const MANUAL_METHODS: ManualPaymentMethod[] = ['bank', 'card', 'cash', 'crypto', 'other'];

const DEFAULT_PAYMENT: PaymentSettings = {
  method: 'stars', instructions: '', manual_details: '', manual_enabled: true, bot_username: '',
};

// ── BuyModal — point sotib olish: Stars (avtomatik) yoki qo'lda (ariza) ──
function BuyModal({ tx, packages, onClose, onDone, onError }: {
  tx: TX; packages: PointPackage[]; onClose: () => void; onDone: () => void; onError: (m?: string) => void;
}) {
  const [payment, setPayment] = useState<PaymentSettings | null>(null);
  const [myPayments, setMyPayments] = useState<ManualPayment[]>([]);
  const [mode, setMode] = useState<'stars' | 'manual'>('stars');
  // Qo'lda to'lov formasi
  const [pkgId, setPkgId] = useState<number | null>(null);
  const [method, setMethod] = useState<ManualPaymentMethod>('bank');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getPaymentMethod()
      .then((p) => {
        setPayment(p);
        // Admin faqat qo'lda to'lovni yoqqan bo'lsa darhol manual tabni ochamiz
        setMode(p.method === 'manual' ? 'manual' : 'stars');
      })
      .catch(() => setPayment(DEFAULT_PAYMENT));
    reloadRequests();
  }, []);

  function reloadRequests() {
    getMyManualPayments().then(setMyPayments).catch(() => setMyPayments([]));
  }

  // To'lov botda bo'ladi (Telegram Payments faqat bot orqali) → botga yo'naltiramiz.
  // packageId berilsa — bot shu paket uchun to'g'ridan-to'g'ri invoyce ochadi.
  function buyViaBot(packageId?: number) {
    const botName = payment?.bot_username;
    if (!botName) { onError(tx('error')); return; }
    const tg = (window as any).Telegram?.WebApp;
    const base = `https://t.me/${botName}`;
    const deepLink = packageId ? `${base}?start=buy_${packageId}` : `${base}?start=buy`;
    if (tg?.openTelegramLink) {
      tg.openTelegramLink(deepLink);
      tg.close?.();
    } else {
      window.open(deepLink, '_blank');
    }
  }

  async function submitManual() {
    if (!pkgId) return;
    if (!note.trim()) { onError(tx('manual_need_note')); return; }
    setBusy(true);
    try {
      await createManualPayment({ package_id: pkgId, payment_method: method, payment_note: note.trim() });
      setNote('');
      setPkgId(null);
      reloadRequests();
      onDone();
    } catch (e: any) {
      onError(e?.message || tx('error'));
    } finally { setBusy(false); }
  }

  async function cancelPending(id: number) {
    setBusy(true);
    try { await cancelManualPayment(id); reloadRequests(); }
    catch (e: any) { onError(e?.message || tx('error')); }
    finally { setBusy(false); }
  }

  if (!payment) {
    return (
      <ModalShell title={tx('buy')} onClose={onClose}>
        <div className="py-8 text-center text-xs text-[#6b5f4f]">…</div>
      </ModalShell>
    );
  }

  const starsAvailable = payment.method === 'stars' || payment.method === 'both';
  const manualAvailable = (payment.method === 'manual' || payment.method === 'both') && payment.manual_enabled;
  const showTabs = starsAvailable && manualAvailable;
  const pending = myPayments.find((p) => p.status === 'pending') || null;
  const activeMode: 'stars' | 'manual' = starsAvailable && !manualAvailable
    ? 'stars'
    : manualAvailable && !starsAvailable
    ? 'manual'
    : mode;

  return (
    <ModalShell title={tx('buy')} onClose={onClose}>
      {showTabs && (
        <div className="flex gap-2 mb-4 p-1.5 rounded-2xl bg-[rgba(10,14,24,0.7)] border border-white/5">
          {(['stars', 'manual'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${
                activeMode === m ? 'text-[#060a14]' : 'text-[#859397]'
              }`}
              style={activeMode === m ? primaryStyle : undefined}
            >
              {tx(m === 'stars' ? 'pay_stars' : 'pay_manual')}
            </button>
          ))}
        </div>
      )}

      {/* ─── Stars: avtomatik to'lov bot orqali ─── */}
      {activeMode === 'stars' && (
        <>
          <p className="text-xs text-[#859397] mb-3 leading-relaxed">{tx('buy_stars_intro')}</p>
          <div className="flex flex-col gap-2 mb-4">
            {packages.map((p) => (
              <button key={p.id}
                onClick={() => buyViaBot(p.id)}
                className="flex items-center justify-between px-4 py-3.5 rounded-2xl border border-white/5 bg-[rgba(21,26,38,0.6)] active:scale-[0.98] transition-all hover:border-[#27d9f7]/30">
                <span className="font-semibold text-[#dfe2f1]">{p.label}</span>
                <span className="text-[#f59e0b] font-bold">⭐ {p.price_stars}</span>
              </button>
            ))}
          </div>
          <button className={primaryBtn} style={primaryStyle} onClick={() => buyViaBot()}>
            {tx('buy')} →
          </button>
          {payment.instructions && (
            <div className="mt-3 rounded-2xl px-4 py-3 text-xs text-[#dfe2f1] whitespace-pre-line"
              style={{ background: 'rgba(10,14,24,0.6)', border: '1px solid rgba(39,217,247,0.18)' }}>
              {payment.instructions}
            </div>
          )}
        </>
      )}

      {/* ─── Qo'lda to'lov: rekvizitlar → ariza → admin tasdiqlaydi ─── */}
      {activeMode === 'manual' && (
        <>
          {pending ? (
            /* Kutilayotgan ariza bor — yangi yubora olmaydi */
            <div className="rounded-2xl p-4 mb-3" style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.35)' }}>
              <div className="flex items-center gap-2 mb-2">
                <Clock size={16} className="text-[#f59e0b]" />
                <span className="text-sm font-bold text-[#fef3c7]">{tx('manual_pending_title')}</span>
              </div>
              <div className="text-xs text-[#d1d5db] mb-1">
                {pending.package_label} · {Number(pending.points_amount).toFixed(0)} pts · €{Number(pending.price_eur).toFixed(2)}
              </div>
              {pending.payment_note && (
                <div className="text-[11px] text-[#9ca3af] mb-3 whitespace-pre-line">{pending.payment_note}</div>
              )}
              <button
                onClick={() => cancelPending(pending.id)}
                disabled={busy}
                className="w-full mt-1 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50 transition-all"
                style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}
              >
                <Trash2 size={14} /> {tx('manual_cancel')}
              </button>
            </div>
          ) : (
            <>
              <p className="text-xs text-[#859397] mb-3 leading-relaxed">{tx('manual_intro')}</p>

              {/* Admin rekvizitlari */}
              <div className="text-[10px] text-[#859397] uppercase tracking-wide mb-1.5 font-['Sora']">{tx('manual_details_title')}</div>
              <div className="rounded-2xl px-4 py-3 mb-3 text-sm text-[#dfe2f1] whitespace-pre-line"
                style={{ background: 'rgba(10,14,24,0.65)', border: '1px solid rgba(39,217,247,0.2)' }}>
                {payment.manual_details || payment.instructions || (
                  <span className="text-[#859397] text-xs">{tx('manual_no_details')}</span>
                )}
              </div>

              {/* Paket tanlash */}
              <div className="text-[10px] text-[#859397] uppercase tracking-wide mb-1.5 font-['Sora']">{tx('manual_select_pkg')}</div>
              <div className="flex flex-col gap-2 mb-3">
                {packages.map((p) => (
                  <button key={p.id}
                    onClick={() => setPkgId(p.id)}
                    className="flex items-center justify-between px-4 py-3 rounded-2xl border active:scale-[0.98] transition-all"
                    style={pkgId === p.id
                      ? { borderColor: '#27d9f7', background: 'rgba(39,217,247,0.15)', boxShadow: '0 0 15px rgba(39,217,247,0.25)' }
                      : { borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(21,26,38,0.6)' }}>
                    <span className="font-semibold text-[#dfe2f1]">{p.label}</span>
                    <span className="text-[#27d9f7] font-bold">€{Number(p.price_eur).toFixed(2)}</span>
                  </button>
                ))}
              </div>

              {/* To'lov usuli */}
              <div className="text-[10px] text-[#859397] uppercase tracking-wide mb-1.5 font-['Sora']">{tx('manual_method')}</div>
              <div className="flex flex-wrap gap-2 mb-3">
                {MANUAL_METHODS.map((m) => (
                  <button key={m}
                    onClick={() => setMethod(m)}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all"
                    style={method === m
                      ? { borderColor: '#27d9f7', background: 'rgba(39,217,247,0.18)', color: '#c2f3ff' }
                      : { borderColor: 'rgba(255,255,255,0.08)', color: '#859397', background: 'rgba(21,26,38,0.5)' }}>
                    {tx(`manual_${m}`)}
                  </button>
                ))}
              </div>

              {/* Izoh */}
              <label className="text-[10px] text-[#859397] uppercase tracking-wide font-['Sora']">{tx('manual_note')}</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={tx('manual_note_ph')}
                rows={3}
                maxLength={1000}
                className="w-full mt-1.5 mb-3 rounded-xl px-4 py-3 text-sm text-[#dfe2f1] outline-none resize-none focus:border-[#27d9f7] focus:shadow-[0_0_12px_rgba(39,217,247,0.3)] transition-all"
                style={{ background: 'rgba(10,14,24,0.7)', border: '1px solid rgba(39,217,247,0.22)' }}
              />

              <button
                className={`${primaryBtn} disabled:opacity-40`}
                style={primaryStyle}
                onClick={submitManual}
                disabled={busy || !pkgId || !note.trim()}
              >
                {tx('manual_send')}
              </button>
            </>
          )}

          {/* Arizalar tarixi */}
          {myPayments.filter((p) => p.status !== 'pending').length > 0 && (
            <div className="mt-4">
              <div className="text-[10px] text-[#859397] uppercase tracking-wide mb-2 font-['Sora']">{tx('manual_history')}</div>
              <div className="flex flex-col gap-2">
                {myPayments.filter((p) => p.status !== 'pending').map((p) => (
                  <ManualPaymentRow key={p.id} tx={tx} item={p} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </ModalShell>
  );
}

function ManualPaymentRow({ tx, item }: { tx: TX; item: ManualPayment }) {
  const approved = item.status === 'approved';
  return (
    <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-[#0f131e]/75 border border-[rgba(39,217,247,0.15)]">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
        approved ? 'bg-[#27d9f7]/15 text-[#27d9f7] border border-[#27d9f7]/30' : 'bg-red-500/15 text-red-400 border border-red-500/30'
      }`}>
        {approved ? <Check size={15} /> : <X size={15} />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold text-[#dfe2f1] truncate">{item.package_label}</div>
        <div className="text-[11px] text-[#859397]">
          {tx(approved ? 'st_approved' : 'st_rejected')}
          {item.admin_note ? ` · ${item.admin_note}` : ''}
        </div>
      </div>
      <div className={`text-[13px] font-bold font-mono shrink-0 ${approved ? 'text-[#27d9f7]' : 'text-[#859397]'}`}>
        {approved ? '+' : ''}{Number(item.points_amount).toFixed(0)}
      </div>
    </div>
  );
}

const TX_ICON: Record<string, LucideIcon> = {
  transfer_out: ArrowUpRight,
  transfer_in: ArrowDownLeft,
  purchase: ShoppingCart,
  gift: Gift,
  text_message: MessageSquare,
  voice_message: MessageSquare,
  studio: Mic,
  opinion_text: Mic,
  opinion_voice: Mic,
  music_nominate: Music,
  music_vote: Music,
  slot_booking: Radio,
};

function HistoryList({ tx, lang, items, loading }: { tx: TX; lang: Language; items: PointsTransaction[]; loading: boolean }) {
  if (loading) {
    return <div className="py-8 text-center text-xs text-[#859397]">…</div>;
  }
  if (items.length === 0) {
    return <div className="py-8 text-center text-xs text-[#859397]">{tx('no_history')}</div>;
  }
  return (
    <div className="flex flex-col gap-2">
      {items.map((t) => {
        const Icon = TX_ICON[t.event_type] || History;
        const positive = Number(t.amount) >= 0;
        const label = tx(`tx_${t.event_type}`) === `tx_${t.event_type}` ? tx('tx_other') : tx(`tx_${t.event_type}`);
        const date = new Date(t.created_at).toLocaleString(lang === 'ru' ? 'ru-RU' : lang === 'lt' ? 'lt-LT' : 'en-GB', {
          day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
        });
        return (
          <div key={t.id} className="flex items-center gap-3 px-3.5 py-3 rounded-xl bg-[#0f131e]/75 border border-[rgba(39,217,247,0.15)] shadow-[0_4px_16px_rgba(0,0,0,0.25)]">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${positive ? 'bg-[#27d9f7]/15 text-[#27d9f7] border border-[#27d9f7]/30' : 'bg-red-500/15 text-red-400 border border-red-500/30'}`}>
              <Icon size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-semibold text-[#dfe2f1] truncate">{label}</div>
              <div className="text-[11px] text-[#859397]">{date}</div>
            </div>
            <div className={`text-[13px] font-bold font-mono shrink-0 ${positive ? 'text-[#27d9f7]' : 'text-red-400'}`}>
              {positive ? '+' : ''}{Number(t.amount).toFixed(3)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
