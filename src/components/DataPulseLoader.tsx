import React from 'react';
import { motion } from 'motion/react';

interface LedgerWaveBarsProps {
  size?: 'xs' | 'sm' | 'md' | 'lg';
  tone?: 'emerald' | 'light' | 'slate' | 'amber';
  className?: string;
}

const SIZE_MAP = {
  xs: { barW: 'w-[2px]', gap: 'gap-[2px]', heights: ['h-2.5', 'h-3', 'h-2.5'] },
  sm: { barW: 'w-[2.5px]', gap: 'gap-[2.5px]', heights: ['h-3', 'h-4', 'h-3', 'h-3.5'] },
  md: { barW: 'w-[3px]', gap: 'gap-[3px]', heights: ['h-4', 'h-5', 'h-4', 'h-4.5'] },
  lg: { barW: 'w-1', gap: 'gap-1', heights: ['h-5', 'h-7', 'h-5', 'h-6'] },
};

const TONE_MAP = {
  emerald: 'bg-emerald-600',
  light: 'bg-white',
  slate: 'bg-slate-600',
  amber: 'bg-amber-600',
};

export const LedgerWaveBars: React.FC<LedgerWaveBarsProps> = ({
  size = 'sm',
  tone = 'emerald',
  className = '',
}) => {
  const cfg = SIZE_MAP[size];
  const color = TONE_MAP[tone];

  return (
    <span
      aria-hidden="true"
      className={`inline-flex items-center justify-center shrink-0 ${cfg.gap} ${className}`}
    >
      {cfg.heights.map((hClass, idx) => (
        <motion.span
          key={idx}
          className={`${cfg.barW} ${hClass} rounded-full ${color} origin-center`}
          animate={{
            scaleY: [0.35, 1, 0.42],
            opacity: [0.45, 1, 0.45],
          }}
          transition={{
            duration: 0.85,
            repeat: Infinity,
            delay: idx * 0.12,
            ease: [0.4, 0, 0.2, 1],
          }}
        />
      ))}
    </span>
  );
};

interface KineticScanBarProps {
  tone?: 'emerald' | 'rose' | 'amber';
  className?: string;
}

export const KineticScanBar: React.FC<KineticScanBarProps> = ({
  tone = 'emerald',
  className = '',
}) => {
  const gradient =
    tone === 'rose'
      ? 'from-rose-400/0 via-rose-500 to-rose-400/0'
      : tone === 'amber'
      ? 'from-amber-400/0 via-amber-500 to-amber-400/0'
      : 'from-emerald-400/0 via-emerald-500 to-teal-400/0';

  return (
    <div
      aria-hidden="true"
      className={`relative h-[2.5px] w-full overflow-hidden bg-slate-100 ${className}`}
    >
      <motion.div
        className={`absolute inset-y-0 left-0 w-2/5 rounded-full bg-gradient-to-r ${gradient}`}
        animate={{ x: ['-110%', '275%'] }}
        transition={{ duration: 1.25, repeat: Infinity, ease: [0.4, 0, 0.2, 1] }}
      />
    </div>
  );
};
