import { Radio, Zap } from 'lucide-react';

interface TopBarProps {
  points: number;
  telegramId?: number | null;
}

export function TopBar({ points, telegramId }: TopBarProps) {
  return (
    <header className="flex items-center justify-between py-1 px-0.5 select-none w-full min-w-0">
      {/* Brand Logo - INTRA GROUP */}
      <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0 min-w-0">
        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl flex items-center justify-center bg-[rgba(39,217,247,0.12)] border border-[rgba(39,217,247,0.3)] shadow-[0_0_15px_rgba(39,217,247,0.2)] shrink-0">
          <Radio size={16} className="text-[#27d9f7]" strokeWidth={2.2} />
        </div>
        <span className="text-[13px] sm:text-[16px] font-extrabold tracking-[1px] sm:tracking-[2px] uppercase bg-gradient-to-r from-[#c2f3ff] via-[#27d9f7] to-[#98cbff] bg-clip-text text-transparent font-['Sora'] truncate">
          INTRA GROUP
        </span>
      </div>

      {/* Right side: Telegram ID + Points Badge */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        {telegramId ? (
          <div
            className="flex items-center gap-1 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full transition-all duration-300"
            style={{
              background: 'rgba(15, 19, 30, 0.75)',
              backdropFilter: 'blur(16px)',
              border: '1px solid rgba(39, 217, 247, 0.22)',
              boxShadow: '0 0 12px rgba(39, 217, 247, 0.08)',
            }}
          >
            <span className="text-[8px] sm:text-[9px] font-extrabold text-[#859397] tracking-wider uppercase font-['Sora']">ID</span>
            <span className="font-mono text-[11px] sm:text-xs font-bold text-[#27d9f7] tabular-nums">
              {telegramId}
            </span>
          </div>
        ) : null}

        <div
          className="flex items-center gap-1 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full transition-all duration-300"
          style={{
            background: 'rgba(15, 19, 30, 0.75)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(39, 217, 247, 0.25)',
            boxShadow: '0 0 16px rgba(39, 217, 247, 0.12)',
          }}
        >
          <Zap size={12} className="text-[#27d9f7] fill-[#27d9f7] shrink-0" />
          <span className="font-mono text-[11px] sm:text-xs font-bold text-[#c2f3ff] tabular-nums tracking-wide">
            {Number(points).toFixed(3)}
          </span>
        </div>
      </div>
    </header>
  );
}
