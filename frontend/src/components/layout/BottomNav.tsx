import { MessageCircle, TrendingUp, Radio, Music, User } from 'lucide-react';
import type { Screen } from '../../types';

interface BottomNavProps {
  currentScreen: Screen;
  onNavigate: (screen: Screen) => void;
  profileBadgeCount?: number;
  chatBadgeCount?: number;
}

const ICONS: Record<string, typeof MessageCircle> = {
  chat: MessageCircle,
  show_chart: TrendingUp,
  radio: Radio,
  music_note: Music,
  person: User,
};

export function BottomNav({ currentScreen, onNavigate, profileBadgeCount = 0, chatBadgeCount = 0 }: BottomNavProps) {
  // Stitch modernized: Chat | Stats | [LIVE ORB] | Music | Profile
  const navItems: { id: Screen; icon: string; isCenter?: boolean }[] = [
    { id: 'anons', icon: 'chat' },
    { id: 'stats', icon: 'show_chart' },
    { id: 'efir', icon: 'radio', isCenter: true },
    { id: 'music', icon: 'music_note' },
    { id: 'profile', icon: 'person' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 pointer-events-none select-none">
      <div
        className="pointer-events-auto max-w-[460px] sm:max-w-[480px] lg:max-w-[520px] mx-auto px-4 pt-1"
        style={{
          background: 'linear-gradient(180deg, transparent 0%, rgba(6, 10, 20, 0.85) 35%, rgba(6, 10, 20, 0.98) 100%)',
          paddingBottom: 'calc(10px + max(env(safe-area-inset-bottom), var(--tg-safe-bottom, 0px)))',
        }}
      >
        <div
          className="flex justify-around items-center h-[64px] px-3 relative"
          style={{
            background: 'rgba(15, 19, 30, 0.75)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(39, 217, 247, 0.22)',
            borderRadius: '22px',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.06)',
          }}
        >
          {navItems.map((item) => {
            const isActive = currentScreen === item.id;
            const Icon = ICONS[item.icon];

            if (item.isCenter) {
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  className="relative -translate-y-4 active:scale-90 transition-transform duration-200"
                  aria-label="efir"
                >
                  {/* Subtle outer breathing ring */}
                  <span
                    className="absolute -inset-1.5 rounded-full animate-ping opacity-25 pointer-events-none"
                    style={{ background: 'radial-gradient(circle, #27d9f7 0%, transparent 70%)' }}
                  />
                  {/* Modernized Central Glowing Orb */}
                  <div
                    className="w-14 h-14 rounded-full flex items-center justify-center text-[#060a14] transition-all duration-300"
                    style={{
                      background: 'radial-gradient(circle at 35% 35%, #ffffff 0%, #c2f3ff 20%, #27d9f7 65%, #059af0 100%)',
                      boxShadow: isActive
                        ? '0 0 25px rgba(39, 217, 247, 0.9), 0 0 45px rgba(5, 154, 240, 0.5)'
                        : '0 0 18px rgba(39, 217, 247, 0.6), 0 0 35px rgba(5, 154, 240, 0.3)',
                    }}
                  >
                    <Icon size={24} className="text-[#060a14]" strokeWidth={2.4} />
                  </div>
                </button>
              );
            }

            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className="relative flex items-center justify-center w-11 h-11 rounded-xl transition-all duration-200 active:scale-90"
                style={{
                  color: isActive ? '#27d9f7' : '#859397',
                  background: isActive ? 'rgba(39, 217, 247, 0.12)' : 'transparent',
                  border: isActive ? '1px solid rgba(39, 217, 247, 0.35)' : '1px solid transparent',
                  boxShadow: isActive ? '0 0 12px rgba(39, 217, 247, 0.2)' : 'none',
                }}
              >
                <Icon size={20} strokeWidth={isActive ? 2.3 : 1.8} />
                {item.id === 'anons' && chatBadgeCount > 0 && (
                  <span
                    className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-[3px] rounded-full flex items-center justify-center text-[9px] font-extrabold text-[#060a14] bg-[#27d9f7] shadow-[0_0_10px_rgba(39,217,247,0.7)]"
                  >
                    {chatBadgeCount > 9 ? '9+' : chatBadgeCount}
                  </span>
                )}
                {item.id === 'profile' && profileBadgeCount > 0 && (
                  <span
                    className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-[3px] rounded-full flex items-center justify-center text-[9px] font-extrabold text-white"
                    style={{ background: '#ef4444', boxShadow: '0 0 0 2px #0f131e' }}
                  >
                    {profileBadgeCount > 9 ? '9+' : profileBadgeCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
