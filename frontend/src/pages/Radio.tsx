import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Gift, Sparkles } from 'lucide-react';
import { TopBar } from '../components/layout/TopBar';
import { BottomNav } from '../components/layout/BottomNav';
import { ChatScreen } from '../components/radio/ChatScreen';
import { EfirScreen } from '../components/radio/EfirScreen';
import { ProfileScreen } from '../components/profile/ProfileScreen';
import { StatsScreen } from '../components/stats/StatsScreen';
import { MusicScreen } from '../components/music/MusicScreen';
import { SlotsScreen } from '../components/slots/SlotsScreen';
import { CastingScreen } from '../components/casting/CastingScreen';
import { OnboardingModal } from '../components/ui/OnboardingModal';
import { useTelegramBackButton } from '../hooks/useTelegramBackButton';
import { useWebSocket } from '../hooks/useWebSocket';
import { useLiveBroadcast } from '../hooks/useLiveBroadcast';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import { useTranslation } from '../hooks/useTranslation';
import { getMe, getPointsHistory, getRadioStatus, adminGetCastingPendingCount } from '../lib/api';
import { authenticate, isAuthenticated } from '../lib/auth';
import { DEFAULT_CITY, LS_CITY } from '../lib/config';
import { t } from '../lib/i18n';
import type { Screen, User, RadioStatus } from '../types';

const ONBOARDING_KEY = 'sfera5_onboarded';
const POINTS_POLL_MS = 20000;

interface RadioProps {
  // App.tsx darajasida ushlanadi (Router'dan ham yuqorida) — /radio va
  // /admin orasida almashish Radio.tsx'ni butunlay qayta mount qiladi,
  // shuning uchun bu holat shu yerda emas, yanada yuqorida yashaydi.
  liveBroadcast: ReturnType<typeof useLiveBroadcast>;
  // App.tsx'ning yagona global toast'i — shu yerda alohida useToast()
  // ishlatilsa, ikkita mustaqil <Toast> bir vaqtda bir xil joyga chiqib,
  // ustma-ust tushishi mumkin edi (masalan LIVE tugmasi va audio pleer
  // xatosi bir vaqtda bo'lsa).
  showToast: (message: string) => void;
}

export function Radio({ liveBroadcast, showToast }: RadioProps) {
  // Admin panelidan "Orqaga" bosilganda qaysi tabga qaytish kerakligi
  // location.state orqali keladi (masalan { screen: 'profile' }) — aks holda
  // Radio har safar remount bo'lganda tab holati yo'qolib, doim 'anons'ga
  // tushib qolar edi.
  const location = useLocation();
  const [currentScreen, setCurrentScreen] = useState<Screen>((location.state as { screen?: Screen } | null)?.screen || 'efir');
  // Chat ekranida BottomNav yashiriladi va o'rniga yuqorida chiqish tugmasi
  // ko'rsatiladi — shu tugma bosilganda foydalanuvchi oxirgi tashrif
  // buyurgan (chatdan boshqa) ekranga qaytadi.
  const [previousScreen, setPreviousScreen] = useState<Screen>('efir');
  const [user, setUser] = useState<User | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [pointsNotice, setPointsNotice] = useState<{ text: string; gift: boolean } | null>(null);
  // Kastingga yangi ariza — admin panelga kirmasdan ham profil tugmasida
  // значok ko'rinsin (faqat haqiqiy admin uchun, kasting faqat unga ochiq).
  const [pendingCastingCount, setPendingCastingCount] = useState(0);
  const [city] = useState(localStorage.getItem(LS_CITY) || DEFAULT_CITY);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastTxIdRef = useRef<number | null>(null);
  const noticeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Efir (mikrofon) holati App.tsx'dan prop sifatida keladi — /radio va
  // /admin orasida almashganda ham uzilmasligi uchun (quyida shu holatni
  // faqat iste'mol qilamiz, hook'ni o'zi bu yerda chaqirilmaydi).
  const { isLive, remainingSec: liveRemainingSec, elapsedSec: liveElapsedSec, toggleLive, isPaused: isLivePaused, togglePause: onToggleLivePause, shareUrl: liveShareUrl } = liveBroadcast;

  // Tinglash (audio pleer) holati ham shu darajada — avval EfirScreen
  // ichida edi, shuning uchun boshqa tabga (chat/profil) o'tilganda
  // EfirScreen unmount bo'lib, <audio> elementi va oqim uzilib qolardi.
  // Endi Radio.tsx qayta mount bo'lmagani uchun, eshitish foydalanuvchi
  // o'zi to'xtatmaguncha davom etadi — qaysi tab ochiq bo'lishidan qat'i nazar.
  const { lang } = useTranslation();
  const [radioStatus, setRadioStatus] = useState<RadioStatus | null>(null);
  const audioPlayer = useAudioPlayer({
    city,
    language: lang,
    // USE_ICECAST=true (server sozlamasi), radioStatus yuklanguncha ham true
    useIcecast: radioStatus?.use_icecast ?? true,
    useHls: radioStatus?.use_hls ?? false,
    isLive: radioStatus?.is_live,
    // Backend proksi orqali (bir xil origin) — /radio/live/{lang} yoki /radio/hls/...
    streamUrl: radioStatus?.stream_url,
    onError: showToast,
  });

  useEffect(() => {
    getRadioStatus(city).then(setRadioStatus).catch(console.error);
  }, [city]);

  useEffect(() => {
    async function init() {
      if (!isAuthenticated()) {
        try {
          await authenticate();
          if (!localStorage.getItem(LS_CITY)) {
            localStorage.setItem(LS_CITY, DEFAULT_CITY);
          }
        } catch (e) {
          console.error('[Radio] Auth error:', e);
          // Loop'ga tushmaslik uchun bu yerda navigate('/') QILMAYMIZ.
          // Auth keyinroq loadUser ichida qayta urinadi.
        }
      }

      async function loadUser() {
        try {
          const userData = await getMe();
          // Backend points ni string qaytaradi — number'ga convert qilamiz
          setUser({ ...userData, points: Number(userData.points) || 0 });
        } catch (e) {
          console.error('[Radio] Failed to load user:', e);
          try {
            await authenticate();
            const userData = await getMe();
            setUser({ ...userData, points: Number(userData.points) || 0 });
          } catch (retryError) {
            console.error('[Radio] Re-auth failed:', retryError);
          }
        }
      }

      await loadUser();

      if (!localStorage.getItem(ONBOARDING_KEY)) {
        setShowOnboarding(true);
      }
    }

    init();
  }, []);

  // Уведомление о получении поинтов (перевод от пользователя, подарок
  // от админа) — опрашиваем историю, т.к. WS-чат подключён только на
  // вкладке "Анонсы" и не ловит события с других вкладок.
  //
  // Telegram Mini App odatda "yopib qayta ochish"da haqiqiy sahifa
  // reload'i qilmaydi — WebView shunchaki background'dan qaytadi va
  // JS taymerlari pauza bo'lib qolgan bo'lishi mumkin. Shuning uchun
  // faqat setInterval'ga tayanmaymiz — ilova qayta faollashganda
  // (visibilitychange/focus/pageshow) darhol qayta tekshiramiz.
  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    let inFlight = false;

    async function poll() {
      if (inFlight) return;
      inFlight = true;
      try {
        // Profilni (rol/daraja) HAR DOIM yangilaymiz — pastdagi point
        // tarixiga bog'liq emas. Admin panelidan to'g'ridan-to'g'ri
        // rol/daraja o'zgartirilsa (masalan modератор qilinsa) hech qanday
        // points_transactions yozuvi yaralmaydi, shuning uchun bu tekshiruv
        // pastdagi "yangi tranzaksiya bormi" shartidan ALOHIDA turishi kerak
        // — aks holda WS push'ni sog'inib qolgan holatda (ilova fonda
        // bo'lganda uzilgan bo'lsa) foydalanuvchi to'liq qayta kirmaguncha
        // eski rol bilan qolib ketardi.
        try {
          const freshMe = await getMe();
          if (!cancelled) {
            setUser((prev) => (prev ? { ...prev, ...freshMe, points: Number(freshMe.points) || 0 } : prev));
          }
        } catch { /* keyingi poll'da urinib ko'radi */ }

        const history = await getPointsHistory();
        if (cancelled || history.length === 0) return;

        if (lastTxIdRef.current === null) {
          // Birinchi so'rov — faqat boshlang'ich holatni belgilaymiz,
          // eski tranzaksiyalar uchun bildirishnoma ko'rsatmaymiz.
          lastTxIdRef.current = Math.max(...history.map((h) => h.id));
          return;
        }

        const lastSeenId = lastTxIdRef.current;
        const fresh = history.filter((h) => h.id > lastSeenId);
        if (fresh.length === 0) return;
        lastTxIdRef.current = Math.max(lastSeenId, ...fresh.map((h) => h.id));

        // Balans yuqorida (har doimgi getMe()) allaqachon yangilangan —
        // bu yerda faqat kirim haqida bildirishnoma ko'rsatiladi.
        const incoming = fresh.find((h) => h.event_type === 'transfer_in' || h.event_type === 'gift');
        if (incoming) {
          const amount = Number(incoming.amount).toFixed(3);
          const key = incoming.event_type === 'gift' ? 'notify_points_gift' : 'notify_points_received';
          const text = t(key).replace('{amount}', amount);
          if (noticeTimeoutRef.current) clearTimeout(noticeTimeoutRef.current);
          setPointsNotice({ text, gift: incoming.event_type === 'gift' });
          noticeTimeoutRef.current = setTimeout(() => { if (!cancelled) setPointsNotice(null); }, 4500);
        }
      } catch { /* tarmoq xatosi — keyingi poll urinib ko'radi */ }
      finally { inFlight = false; }
    }

    function onWake() {
      if (document.visibilityState === 'visible') poll();
    }

    poll();
    const interval = setInterval(poll, POINTS_POLL_MS);
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);
    window.addEventListener('pageshow', onWake);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('focus', onWake);
      window.removeEventListener('pageshow', onWake);
      if (noticeTimeoutRef.current) clearTimeout(noticeTimeoutRef.current);
    };
  }, [!!user]);

  const handlePointsUpdate = (newPoints: number) => {
    if (user) {
      setUser({ ...user, points: Number(newPoints) || 0 });
    }
  };

  // Kastingga yangi ariza — faqat haqiqiy admin uchun значok (kasting
  // faqat unga ochiq). Admin panelga hech kirmasdan ham darhol bilishi
  // uchun (WS "casting_updated" pastda), plyus 20s'lik zaxira poll.
  useEffect(() => {
    if (user?.role !== 'admin') { setPendingCastingCount(0); return; }
    let cancelled = false;
    const loadCount = () => {
      adminGetCastingPendingCount().then((n) => { if (!cancelled) setPendingCastingCount(n); });
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
  }, [user?.role]);

  // Boshqa foydalanuvchidan point kelganda balansni darhol yangilash uchun —
  // Radio.tsx darajasida doim tirik ulanish (qaysi tab ochiq bo'lishidan
  // qat'i nazar), 20s'lik poll'ni kutmasdan. Backend barcha ulanishlarni
  // bitta "global" xonaga broadcast qiladi, shuning uchun user_id bo'yicha
  // o'zimizga tegishlisini filtrlaymiz.
  useWebSocket({
    city: 'global',
    onMessage: (msg) => {
      if (msg.type === 'points_update' && user && (msg.data as any)?.user_id === user.id) {
        const newPoints = Number((msg.data as any).points);
        // Sof qo'shilish (списание emas) bo'lsa — ko'rinadigan tost, oldin
        // faqat raqam jimgina o'zgarardi, kim ko'rmasa umuman bilmasdi.
        const delta = newPoints - (Number(user.points) || 0);
        if (delta > 0.0001) {
          showToast(`💰 +${delta.toFixed(3).replace(/\.?0+$/, '')} поинтов зачислено`);
        }
        handlePointsUpdate(newPoints);
      }
      // Rol/daraja admin panelidan o'zgartirilganda — ilova ochiq bo'lsa
      // darhol yangilanadi (masalan endigina admin qilingan odam sahifani
      // qayta ochmasdan ham "выйти в прямой эфир" tugmasini ko'rishi kerak,
      // aks holda eski `user.role` bilan UI noto'g'ri holatda qolib ketardi).
      if (msg.type === 'role_updated' && user && (msg.data as any)?.user_id === user.id) {
        const newRole = (msg.data as any).role;
        if (newRole && newRole !== user.role) {
          showToast('🔑 Ваш статус обновлён');
          setUser({ ...user, role: newRole });
        }
      }
      // Kastingga yangi ariza/qaror — Profil значokini darhol yangilaydi
      // (20s pollingni kutmasdan), faqat haqiqiy admin uchun.
      if (msg.type === 'casting_updated' && user?.role === 'admin') {
        adminGetCastingPendingCount().then(setPendingCastingCount);
      }
    },
  });

  const handleCloseOnboarding = () => {
    localStorage.setItem(ONBOARDING_KEY, '1');
    setShowOnboarding(false);
  };

  const handleNavigate = (newScreen: Screen) => {
    if (newScreen === currentScreen) return;
    // Chatga kirishdan oldingi ekranni eslab qolamiz — chiqish tugmasi
    // aynan o'sha ekranga qaytaradi (doim 'efir'ga emas).
    if (currentScreen !== 'anons') setPreviousScreen(currentScreen);
    setCurrentScreen(newScreen);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  };

  const renderScreen = (screen: Screen) => {
    switch (screen) {
      case 'anons':
        return (
          <ChatScreen
            user={user}
            onPointsUpdate={handlePointsUpdate}
            onExit={() => handleNavigate(previousScreen)}
            isLive={isLive}
          />
        );
      case 'efir':
        return (
          <EfirScreen
            user={user}
            onPointsUpdate={handlePointsUpdate}
            onNavigate={handleNavigate}
            isLive={isLive}
            liveRemainingSec={liveRemainingSec}
            liveElapsedSec={liveElapsedSec}
            onToggleLive={toggleLive}
            isLivePaused={isLivePaused}
            onToggleLivePause={onToggleLivePause}
            liveShareUrl={liveShareUrl}
            radioStatus={radioStatus}
            setRadioStatus={setRadioStatus}
            audioPlayer={audioPlayer}
          />
        );
      case 'stats':
        return <StatsScreen user={user} />;
      case 'music':
        return <MusicScreen user={user} onPointsUpdate={handlePointsUpdate} />;
      case 'schedule':
        return <SlotsScreen user={user} />;
      case 'casting':
        return <CastingScreen />;
      case 'profile':
        return <ProfileScreen user={user} onUserUpdate={setUser} />;
      case 'anons':
      default:
        return (
          <ChatScreen
            user={user}
            onPointsUpdate={handlePointsUpdate}
            onExit={() => handleNavigate(previousScreen || 'efir')}
            isLive={isLive}
          />
        );
    }
  };

  // Chat ekrani — to'liq balandlikda, o'z ichida scroll qiladi (boshqa ekranlar
  // kabi umumiy sahifa scroll'iga bog'lanmaydi)
  const isChat = currentScreen === 'anons';

  // Telegram'ning tabiiy "orqaga" tugmasi — DOM ichidagi chiqish tugmasi
  // ba'zi klientlarda native "Закрыть" paneli bilan to'qnashib bosilmay
  // qolishi mumkin, shuning uchun kafolatlangan qo'shimcha yo'l.
  useTelegramBackButton(isChat, () => handleNavigate(previousScreen));

  return (
    <div
      className="bg-[#060a14] text-[var(--text)] flex flex-col justify-center items-center relative min-h-screen selection:bg-[rgba(39,217,247,0.2)] selection:text-[#c2f3ff]"
      style={{ minHeight: 'var(--app-vh)' }}
    >
      {/* Background ambient neon glow */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-[radial-gradient(ellipse_at_center,rgba(39,217,247,0.12)_0%,rgba(5,154,240,0.05)_45%,transparent_75%)]" />
        <div className="absolute bottom-[-10%] left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-[radial-gradient(ellipse_at_center,rgba(139,92,246,0.08)_0%,transparent_70%)]" />
      </div>

      {/* Main app chassis — on mobile full width, on desktop elegant framed console */}
      <div
        className="w-full max-w-[440px] sm:max-w-[460px] h-full sm:h-[94vh] sm:max-h-[920px] sm:my-auto sm:rounded-[36px] sm:border sm:border-[rgba(39,217,247,0.22)] sm:shadow-[0_20px_60px_rgba(0,0,0,0.8),0_0_40px_rgba(39,217,247,0.15)] bg-[#060a14]/90 backdrop-blur-2xl flex flex-col relative z-10 overflow-hidden"
        style={{ height: 'var(--app-vh)' }}
      >
        {!isChat && (
          <div
            className="px-3 sm:px-4 pb-1.5 z-20 shrink-0 border-b border-[rgba(39,217,247,0.1)] bg-[#060a14]/80 backdrop-blur-md"
            style={{
              paddingTop: 'calc(max(env(safe-area-inset-top, 0px), var(--tg-content-safe-area-inset-top, 0px), var(--tg-safe-area-inset-top, 0px), var(--tg-safe-top, 0px), 16px) + 12px)',
            }}
          >
            <TopBar points={user?.points || 0} telegramId={user?.telegram_id} />
          </div>
        )}

        {/* Asosiy scroll container — mouse wheel + touch ikkalasi ishlaydi */}
        <div
          ref={scrollRef}
          className="relative z-10 flex-1 min-h-0"
          style={{
            overflowY: isChat ? 'hidden' : 'auto',
            overflowX: 'hidden',
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}
        >
          <div
            className={`w-full mx-auto flex flex-col gap-3 ${
              isChat
                ? 'h-full pb-[calc(86px+max(env(safe-area-inset-bottom,0px),var(--tg-safe-bottom,0px)))]'
                : 'px-3 sm:px-4 pt-1 pb-[calc(110px+max(env(safe-area-inset-bottom,0px),var(--tg-safe-bottom,0px)))]'
            }`}
          >
            {isChat ? (
              <div className="flex-1 min-h-0 flex flex-col">{renderScreen(currentScreen)}</div>
            ) : (
              renderScreen(currentScreen)
            )}
          </div>
        </div>

        <BottomNav currentScreen={currentScreen} onNavigate={handleNavigate} profileBadgeCount={pendingCastingCount} />
      </div>
      <OnboardingModal isOpen={showOnboarding} onClose={handleCloseOnboarding} />
      {/* Oddiy tost App.tsx darajasida (global, Router'dan tashqarida)
          ko'rsatiladi — shu yerda alohida emas, ikkitasi ustma-ust
          tushmasligi uchun. */}
      {pointsNotice && (
        <div
          className="fixed top-[calc(76px+env(safe-area-inset-top))] left-1/2 -translate-x-1/2 z-[2500] w-[92%] max-w-[400px] cursor-pointer"
          onClick={() => setPointsNotice(null)}
        >
          <div
            className="glass rounded-2xl px-4 py-3 flex items-center gap-3 animate-[slideDown_0.25s_ease-out]"
            style={{ border: '1px solid rgba(57,255,106,0.35)', boxShadow: '0 8px 30px rgba(57,255,106,0.15)' }}
          >
            <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-[rgba(57,255,106,0.15)] text-[var(--live)]">
              {pointsNotice.gift ? <Gift size={18} /> : <Sparkles size={18} />}
            </div>
            <span className="text-sm font-semibold text-[var(--text)]">{pointsNotice.text}</span>
          </div>
        </div>
      )}
    </div>
  );
}
