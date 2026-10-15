// API konfiguratsiyasi
const getApiUrl = () => {
  // 1. Env dan olish (faqat agar aniq berilgan bo'lsa)
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  // 2. Vercel yoki alohida veb-sayt platformasida ochilsa — Render backendiga ulanadi
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host.includes('vercel.app') || host === 'localhost' || host === '127.0.0.1') {
      return 'https://sphera-backend-edgc.onrender.com';
    }
  }

  // 3. Same-origin — backend frontend'ni o'zi serve qiladi (Render o'zida)
  return '';
};

export const API_URL = getApiUrl();

// WebSocket: VITE_WS_URL bo'lsa o'sha, aks holda Vercel uchun Render wss://, Render o'zida same-origin
const getWsUrl = () => {
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL;
  }
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host.includes('vercel.app') || host === 'localhost' || host === '127.0.0.1') {
      return 'wss://sphera-backend-edgc.onrender.com';
    }
  }
  const isHttps = typeof location !== 'undefined' && location.protocol === 'https:';
  const currentHost = typeof location !== 'undefined' ? location.host : 'localhost';
  return `${isHttps ? 'wss:' : 'ws:'}//${currentHost}`;
};

export const WS_URL = getWsUrl();

export const RADIO_URL = import.meta.env.VITE_RADIO_URL || API_URL;

// LocalStorage keys
export const LS_TOKEN = 'sfera5_token';
export const LS_CITY = 'sfera5_city';
export const LS_ROLE = 'sfera5_role';
export const LS_LANG = 'sfera5_lang';

// Default city
export const DEFAULT_CITY = import.meta.env.VITE_DEFAULT_CITY || 'global';

// Telegram WebApp
export const getTelegram = () => {
  return (window as any).Telegram?.WebApp || null;
};
