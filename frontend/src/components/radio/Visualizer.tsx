interface VisualizerProps {
  isPlaying: boolean;
  size?: number;
}

export function Visualizer({ isPlaying, size = 260 }: VisualizerProps) {
  // Waveform bars with smooth heights
  const bars = [6, 12, 18, 28, 42, 60, 78, 92, 78, 60, 42, 28, 18, 12, 6];
  const scale = size / 260;
  const ringSize = Math.round(230 * scale);
  const waveW = Math.round(180 * scale);
  const waveH = Math.round(96 * scale);
  const barW = Math.max(3, Math.round(6 * scale));
  const gap = Math.max(2, Math.round(4 * scale));

  return (
    <div className="relative flex items-center justify-center select-none" style={{ width: size, height: size }}>
      {/* Outer ambient glow */}
      <div
        className="absolute rounded-full pointer-events-none transition-all duration-700"
        style={{
          width: ringSize + 24,
          height: ringSize + 24,
          background: isPlaying
            ? 'radial-gradient(circle, rgba(39, 217, 247, 0.22) 0%, transparent 70%)'
            : 'radial-gradient(circle, rgba(39, 217, 247, 0.08) 0%, transparent 70%)',
          filter: 'blur(8px)',
        }}
      />

      {/* Main glass ring */}
      <div
        className="absolute transition-all duration-500"
        style={{
          width: ringSize,
          height: ringSize,
          borderRadius: '50%',
          border: isPlaying ? '2px solid rgba(39, 217, 247, 0.65)' : '1.5px solid rgba(39, 217, 247, 0.25)',
          background: 'radial-gradient(circle at center, rgba(39, 217, 247, 0.12) 0%, rgba(10, 14, 24, 0.75) 75%)',
          boxShadow: isPlaying
            ? '0 0 35px rgba(39, 217, 247, 0.35), inset 0 0 30px rgba(39, 217, 247, 0.2)'
            : '0 0 15px rgba(39, 217, 247, 0.12), inset 0 0 15px rgba(39, 217, 247, 0.08)',
          animation: isPlaying ? 'ringPulseModern 2.4s ease-in-out infinite' : 'none',
        }}
      />

      {/* Waveform bars */}
      <div className="absolute flex items-center justify-center z-10" style={{ width: waveW, height: waveH, gap }}>
        {bars.map((h, i) => (
          <div
            key={i}
            style={{
              width: barW,
              height: `${Math.max(4, h * scale)}px`,
              background: 'linear-gradient(180deg, #c2f3ff 0%, #27d9f7 50%, #059af0 100%)',
              borderRadius: '999px',
              boxShadow: isPlaying ? '0 0 8px rgba(39, 217, 247, 0.8)' : '0 0 3px rgba(39, 217, 247, 0.3)',
              animation: isPlaying
                ? `waveModern ${0.75 + (i % 3) * 0.2}s ease-in-out ${i * 0.07}s infinite alternate`
                : 'none',
              opacity: isPlaying ? 0.95 : 0.35,
              transformOrigin: 'center',
            }}
          />
        ))}
      </div>

      <style>{`
        @keyframes ringPulseModern {
          0%, 100% { transform: scale(1); opacity: 0.9; }
          50%      { transform: scale(1.025); opacity: 1; filter: drop-shadow(0 0 12px rgba(39, 217, 247, 0.4)); }
        }
        @keyframes waveModern {
          0%   { transform: scaleY(0.4); opacity: 0.5; }
          100% { transform: scaleY(1.35); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
