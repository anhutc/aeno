import React, { useRef, useEffect } from 'react';
import { motion } from 'motion/react';

interface PinCodeInputProps {
  length: number;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (fullCode: string) => void;
  disabled?: boolean;
  isError?: boolean;
  mask?: boolean;
  autoFocus?: boolean;
}

export const PinCodeInput: React.FC<PinCodeInputProps> = ({
  length = 4,
  value = '',
  onChange,
  onComplete,
  disabled = false,
  isError = false,
  mask = false,
  autoFocus = true,
}) => {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Split string into array of characters
  const charArray = Array.from({ length }, (_, i) => value[i] || '');

  // Auto focus first input on mount or when length changes
  useEffect(() => {
    if (autoFocus && !disabled && inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, [length, autoFocus, disabled]);

  const handleChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;
    if (disabled) return;

    // If empty (e.g. backspace handled by onChange)
    if (!rawVal) {
      const newChars = [...charArray];
      newChars[index] = '';
      const newVal = newChars.join('');
      onChange(newVal);
      return;
    }

    // Handle single character or last character typed
    const char = rawVal[rawVal.length - 1];
    const newChars = [...charArray];
    newChars[index] = char;
    const newVal = newChars.join('');
    onChange(newVal);

    // Auto-advance to next input
    if (index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    // If completely filled all slots, trigger onComplete
    if (newVal.length === length) {
      setTimeout(() => {
        onComplete?.(newVal);
      }, 60);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    if (e.key === 'Backspace') {
      if (!charArray[index] && index > 0) {
        // Current box is already empty, jump to previous and clear it
        e.preventDefault();
        const newChars = [...charArray];
        newChars[index - 1] = '';
        onChange(newChars.join(''));
        inputRefs.current[index - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < length - 1) {
      e.preventDefault();
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (disabled) return;

    const pastedData = e.clipboardData.getData('text').trim();
    if (!pastedData) return;

    // Take up to `length` characters
    const targetVal = pastedData.slice(0, length);
    onChange(targetVal);

    // Focus either the next empty slot or the last filled slot
    const nextIdx = Math.min(targetVal.length, length - 1);
    inputRefs.current[nextIdx]?.focus();

    if (targetVal.length === length) {
      setTimeout(() => {
        onComplete?.(targetVal);
      }, 60);
    }
  };

  return (
    <div className="flex items-center justify-center gap-2.5 sm:gap-3.5 my-2">
      {Array.from({ length }).map((_, index) => {
        const char = charArray[index] || '';
        const isFilled = Boolean(char);

        return (
          <motion.div
            key={index}
            initial={false}
            animate={
              isError
                ? { x: [-8, 8, -6, 6, -3, 3, 0] }
                : isFilled
                ? { scale: [1, 1.05, 1] }
                : { scale: 1 }
            }
            transition={{ duration: isError ? 0.35 : 0.15 }}
            className="relative"
          >
            <input
              ref={(el) => {
                inputRefs.current[index] = el;
              }}
              type={mask ? 'password' : 'text'}
              inputMode="text"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              disabled={disabled}
              value={char}
              maxLength={1}
              onChange={(e) => handleChange(index, e)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              onPaste={handlePaste}
              onFocus={(e) => e.target.select()}
              className={`w-12 h-14 sm:w-14 sm:h-16 text-center text-2xl sm:text-3xl font-black font-mono rounded-2xl border-2 transition-all duration-150 select-all outline-none ${
                isError
                  ? 'border-rose-400 bg-rose-50/80 text-rose-700 ring-2 ring-rose-300/40 shadow-xs'
                  : isFilled
                  ? 'border-emerald-600 bg-emerald-50/60 text-emerald-950 font-black shadow-xs ring-1 ring-emerald-500/20'
                  : 'border-slate-300/90 bg-slate-50/90 text-slate-800 hover:border-slate-400 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/20'
              } disabled:opacity-40 disabled:cursor-not-allowed`}
              aria-label={`Mã ký tự thứ ${index + 1}`}
            />

            {/* Custom Mask Dot Indicator when masked and filled */}
            {mask && isFilled && (
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-emerald-800 text-3xl font-black">
                ●
              </span>
            )}
          </motion.div>
        );
      })}
    </div>
  );
};
