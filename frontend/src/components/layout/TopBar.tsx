import { Radio, Zap } from 'lucide-react';

interface TopBarProps {
  points: number;
}

export function TopBar({ points }: TopBarProps) {
  return (
    <header className="flex items-center justify-between py-2.5 px-1 select-none">
      {/* Brand Logo - INTRA GROUP */}
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-[rgba(39,217,247,0.12)] border border-[rgba(39,217,247,0.3)] shadow-[0_0_15px_rgba(39,217,247,0.2)]">
          <Radio size={18} className="text-[#27d9f7]" strokeWidth={2.2} />
        </div>
        <span className="text-[17px] font-extrabold tracking-[2px] uppercase bg-gradient-to-r from-[#c2f3ff] via-[#27d9f7] to-[#98cbff] bg-clip-text text-transparent font-['Sora']">
          INTRA GROUP
        </span>
      </div>

      {/* Points Badge */}
      <div
        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full transition-all duration-300"
        style={{
          background: 'rgba(15, 19, 30, 0.75)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(39, 217, 247, 0.25)',
          boxShadow: '0 0 16px rgba(39, 217, 247, 0.12)',
        }}
      >
        <Zap size={14} className="text-[#27d9f7] fill-[#27d9f7]" />
        <span className="font-mono text-xs font-bold text-[#c2f3ff] tabular-nums tracking-wide">
          {Number(points).toFixed(3)}
        </span>
      </div>
    </header>
  );
}
