import { getTelegram } from './config';

// Telegram WebApp initialization
export function initTelegramWebApp() {
  const tg = getTelegram();
  if (!tg) return;

  try {
    tg.ready();
    tg.expand();

    // To'liq ekran (Bot API 8.0+) — expand() o'zi Telegram xromini yashirmaydi,
    // ayniqsa iOS'da. requestFullscreen shart.
    if (typeof tg.requestFullscreen === 'function') {
      try { tg.requestFullscreen(); } catch (e) { /* eski versiya */ }
    }

    // Android: prevent accidental closing
    if (typeof tg.disableVerticalSwipes === 'function') {
      tg.disableVerticalSwipes();
    }
    if (typeof tg.enableClosingConfirmation === 'function') {
      tg.enableClosingConfirmation();
    }

    // Viewport changes (keyboard, focus, fullscreen)
    if (typeof tg.onEvent === 'function') {
      tg.onEvent('viewportChanged', applyViewportHeight);
      // Android jismoniy "Kнопки" navigatsiyasi (yoki gesture pill) —
      // fullscreen rejimda kontent ular ostiga tushib qolishi mumkin.
      // Telegram bu maydonni o'zi biladi (WebView emas, native ilova
      // darajasida), shuning uchun CSS env(safe-area-inset-*)ga emas,
      // shu API'ga tayanamiz — u ancha ishonchli.
      tg.onEvent('safeAreaChanged', applySafeAreaInsets);
      tg.onEvent('contentSafeAreaChanged', applySafeAreaInsets);
      tg.onEvent('fullscreenChanged', () => {
        applyViewportHeight();
        applySafeAreaInsets();
      });
    }

    // Telegram theme colors
    try {
      if (tg.setHeaderColor) tg.setHeaderColor('#0F0F23');
      if (tg.setBackgroundColor) tg.setBackgroundColor('#0F0F23');
    } catch (e) {
      /* old versions */
    }

    applyViewportHeight();
    applySafeAreaInsets();
    setTimeout(applySafeAreaInsets, 150);
    setTimeout(applySafeAreaInsets, 400);
  } catch (e) {
    console.error('TG init error:', e);
  }
}

// Real viewport height for Android
export function applyViewportHeight() {
  const tg = getTelegram();
  let h = window.innerHeight;
  
  if (tg && tg.viewportStableHeight) {
    h = tg.viewportStableHeight;
  } else if (tg && tg.viewportHeight) {
    h = tg.viewportHeight;
  }
  
  document.documentElement.style.setProperty('--app-vh', h + 'px');
}

// Qurilmaning haqiqiy xavfsiz maydoni (Android jismoniy "Kнопки" paneli,
// gesture pill, notch va h.k.) — Telegram native ilova darajasida biladi.
// CSS env(safe-area-inset-*) Android'da 3-tugmali navigatsiya balandligini
// har doim ham to'g'ri bermaydi (WebView buni "system bar" deb hisoblab,
// kontentni undan tashqarida chizadi — ayniqsa fullscreen'da esa aksincha
// bo'lib, tugmalar kontent ustiga tushib qolishi mumkin). Shu sabab
// pastki navigatsiya balandligini shu qiymat bilan CSS max() orqali
// solishtiramiz (qaysi biri kattaroq — o'shani ishlatamiz).
export function applySafeAreaInsets() {
  const tg = getTelegram();
  const root = document.documentElement.style;
  const safe = (tg && tg.safeAreaInset) || { top: 0, bottom: 0, left: 0, right: 0 };
  const content = (tg && tg.contentSafeAreaInset) || { top: 0, bottom: 0, left: 0, right: 0 };

  root.setProperty('--tg-safe-top', `${Math.max(safe.top || 0, content.top || 0)}px`);
  root.setProperty('--tg-safe-bottom', `${Math.max(safe.bottom || 0, content.bottom || 0)}px`);
  root.setProperty('--tg-safe-left', `${Math.max(safe.left || 0, content.left || 0)}px`);
  root.setProperty('--tg-safe-right', `${Math.max(safe.right || 0, content.right || 0)}px`);
}

// Haptic-фидбек, синхронизированный с глитч-моментами (RGB-джиттер
// заголовков, старт/стоп эфира, пауза) — чисто визуальный/UX слой поверх
// уже существующих обработчиков, бизнес-логику не трогает. Вне Telegram
// или на старых клиентах API просто отсутствует — try/catch no-op.
type ImpactStyle = 'light' | 'medium' | 'heavy' | 'rigid' | 'soft';
type NotificationType = 'error' | 'success' | 'warning';

export function hapticImpact(style: ImpactStyle = 'light') {
  try {
    getTelegram()?.HapticFeedback?.impactOccurred?.(style);
  } catch (e) { /* no-op */ }
}

export function hapticNotify(type: NotificationType) {
  try {
    getTelegram()?.HapticFeedback?.notificationOccurred?.(type);
  } catch (e) { /* no-op */ }
}

export function hapticTick() {
  try {
    getTelegram()?.HapticFeedback?.selectionChanged?.();
  } catch (e) { /* no-op */ }
}

// Get Telegram user (yoki mustaqil veb-platforma foydalanuvchisi)
export function getTgUser() {
  const tg = getTelegram();
  
  if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
    return tg.initDataUnsafe.user;
  }
  
  // Veb-sayt platformasida ochilganda
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const paramId = params.get('tg_id') || params.get('id');
    const paramUser = params.get('username');
    const paramName = params.get('name') || params.get('first_name');
    if (paramId && /^\d+$/.test(paramId)) {
      const u = {
        id: Number(paramId),
        username: paramUser || null,
        first_name: paramName || `User_${paramId.slice(-4)}`,
      };
      localStorage.setItem('intra_web_user', JSON.stringify(u));
      return u;
    }

    // Brauzer xotirasidagi mavjud veb profil
    const saved = localStorage.getItem('intra_web_user');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed?.id) return parsed;
      } catch (e) {}
    }

    // Yangi veb-mehmon uchun unikal profil generatsiya qilamiz
    const randomId = 800000000 + Math.floor(Math.random() * 90000000);
    const newWebUser = {
      id: randomId,
      username: `web_${String(randomId).slice(-5)}`,
      first_name: `Web Guest ${String(randomId).slice(-4)}`,
    };
    localStorage.setItem('intra_web_user', JSON.stringify(newWebUser));
    return newWebUser;
  }

  return { id: 999999, username: 'test_user', first_name: 'Test' };
}

// Setup viewport listeners
if (typeof window !== 'undefined') {
  window.addEventListener('resize', applyViewportHeight);
  window.addEventListener('orientationchange', () =>
    setTimeout(applyViewportHeight, 200)
  );
}
