import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, Delete } from 'lucide-react';
import {
  parseSmartAmount,
  formatCurrencyInWords,
  formatThousandsDisplay,
} from '../utils/currencyUtils';

interface ThousandAmountInputProps {
  id?: string;
  value: number; // The actual numeric amount in VNĐ (e.g. 50000)
  onChange: (newAmount: number) => void;
  label?: string;
  required?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
  accentColor?: 'blue' | 'amber' | 'emerald';
}

const STORAGE_KEY_THOUSANDS_MODE = 'debtor_app_input_thousands_mode';

export const ThousandAmountInput: React.FC<ThousandAmountInputProps> = ({
  id = 'input-thousand-amount',
  value,
  onChange,
  label = 'Số tiền',
  required = true,
  autoFocus = false,
  placeholder,
  accentColor = 'blue',
}) => {
  // Check persisted mode (Default: true for thousands optimization)
  const [inThousandsMode, setInThousandsMode] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_THOUSANDS_MODE);
      return saved !== null ? saved === 'true' : true; // Mặc định bật chế độ nhập theo nghìn
    } catch {
      return true;
    }
  });

  const isFocusedRef = useRef(false);

  // Format value into initial text representation
  const formatTextForMode = (val: number, mode: boolean): string => {
    if (!val || val <= 0) return '';
    if (mode) {
      // In thousands mode, 50000 -> "50", 1200000 -> "1.200"
      const kVal = val / 1000;
      return kVal % 1 === 0 ? formatThousandsDisplay(kVal) : String(kVal);
    }
    return formatThousandsDisplay(val);
  };

  const [textInput, setTextInput] = useState<string>(() => formatTextForMode(value, inThousandsMode));

  // Keep textInput synced if value changes externally (e.g., reset, preset buttons), but not while user is typing
  useEffect(() => {
    if (!isFocusedRef.current) {
      setTextInput(formatTextForMode(value, inThousandsMode));
    }
  }, [value, inThousandsMode]);

  const toggleThousandsMode = () => {
    const nextMode = !inThousandsMode;
    setInThousandsMode(nextMode);
    try {
      localStorage.setItem(STORAGE_KEY_THOUSANDS_MODE, String(nextMode));
    } catch {
      // Ignore storage errors
    }
    setTextInput(formatTextForMode(value, nextMode));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setTextInput(raw);

    const parsed = parseSmartAmount(raw, inThousandsMode);
    onChange(parsed);
  };

  const handleBlur = () => {
    isFocusedRef.current = false;
    setTextInput(formatTextForMode(value, inThousandsMode));
  };

  const handleFocus = () => {
    isFocusedRef.current = true;
  };

  // Add 3 zeros (+000 / Thêm 3 số 0 / Nhân 1.000)
  const handleAddThreeZeros = () => {
    const current = value > 0 ? value * 1000 : 1000;
    onChange(current);
    setTextInput(formatTextForMode(current, inThousandsMode));
  };

  // Quick preset additions
  const handleQuickAdd = (amountToAdd: number) => {
    const next = (value || 0) + amountToAdd;
    onChange(next);
    setTextInput(formatTextForMode(next, inThousandsMode));
  };

  const handleClear = () => {
    setTextInput('');
    onChange(0);
  };

  const words = formatCurrencyInWords(value);

  const focusRingClass =
    accentColor === 'amber'
      ? 'focus:border-amber-500 focus:ring-amber-200'
      : accentColor === 'emerald'
        ? 'focus:border-emerald-500 focus:ring-emerald-200'
        : 'focus:border-blue-600 focus:ring-blue-200';

  const badgeColorClass =
    accentColor === 'amber'
      ? 'text-amber-800 bg-amber-50 border-amber-300 shadow-2xs hover:bg-amber-100'
      : accentColor === 'emerald'
        ? 'text-emerald-800 bg-emerald-50 border-emerald-300 shadow-2xs hover:bg-emerald-100'
        : 'text-blue-800 bg-blue-50 border-blue-300 shadow-2xs hover:bg-blue-100';

  return (
    <div className="space-y-2">
      {/* Thanh Tiêu Đề & Chuyển Đổi Chế Độ Nhập Theo Đơn Vị Nghìn */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <label className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1">
          <span>{label}</span>
          {required && <span className="text-rose-500">*</span>}
        </label>

        {/* Nút bật/tắt chế độ nhập theo nghìn */}
        <button
          type="button"
          onClick={toggleThousandsMode}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold transition-all cursor-pointer select-none ${
            inThousandsMode
              ? badgeColorClass
              : 'text-slate-600 bg-slate-100 border-slate-200 hover:bg-slate-200'
          }`}
          title={
            inThousandsMode
              ? 'Chế độ nghìn đang BẬT: Bạn chỉ cần gõ 50 để nhập 50.000đ. Nhấp để chuyển sang nhập VNĐ đầy đủ.'
              : 'Chế độ VNĐ đầy đủ. Nhấp để chuyển sang chế độ nhập theo đơn vị nghìn (k).'
          }
        >
          <span className={`w-2 h-2 rounded-full ${inThousandsMode ? 'bg-emerald-500 ring-2 ring-emerald-200' : 'bg-slate-400'}`}></span>
          <span>{inThousandsMode ? 'Đơn vị: Nghìn (k)' : 'Đơn vị: VNĐ'}</span>
        </button>
      </div>

      {/* Ô nhập tiền chính */}
      <div className="relative flex items-center">
        <input
          id={id}
          type="text"
          value={textInput}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={
            placeholder ||
            (inThousandsMode
              ? 'Gõ 50 (= 50k), 120, 1.5tr...'
              : 'VD: 50.000, 50k, 1.5tr...')
          }
          className={`w-full pl-3.5 pr-28 py-2.5 bg-slate-50 border border-slate-300 focus:bg-white rounded-xl text-lg sm:text-xl font-black font-mono text-slate-900 outline-none transition-all focus:ring-2 ${focusRingClass}`}
          autoFocus={autoFocus}
        />

        {/* Cụm công cụ bên trong ô input: Nút +000 và Đơn vị */}
        <div className="absolute right-2 flex items-center gap-1.5">
          {/* Nút bấm nhanh +000 */}
          <button
            type="button"
            onClick={handleAddThreeZeros}
            className="px-2 py-1 bg-slate-200 hover:bg-slate-300 active:bg-slate-400 text-slate-800 text-xs font-black font-mono rounded-lg transition-colors cursor-pointer shadow-2xs"
            title="Nhân 1.000 (Thêm 3 số 0)"
          >
            +000
          </button>
          <span className="text-xs font-bold font-mono text-slate-500 select-none pr-1">
            {inThousandsMode ? '.000 đ' : 'VNĐ'}
          </span>
        </div>
      </div>

      {/* Hiển thị số tiền thực tế & Đọc số bằng chữ */}
      {value > 0 ? (
        <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500 font-medium">Số tiền ghi nhận:</span>
            <span className="font-mono font-black text-sm text-blue-600">
              {formatThousandsDisplay(value)} VNĐ
            </span>
          </div>
          {words && (
            <div className="flex items-start gap-1.5 text-[11px] text-slate-600 italic">
              <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
              <span className="font-medium leading-tight">Bằng chữ: {words}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="text-[11px] text-slate-400 flex items-center justify-between px-1">
          <span>
            {inThousandsMode
              ? '💡 Gõ 50 = 50.000đ, 250 = 250.000đ, 1500 = 1.500.000đ'
              : '💡 Có thể gõ tắt: 50k, 100k, 1.5tr, 1tr5...'}
          </span>
        </div>
      )}

      {/* Hàng nút bấm chọn / cộng nhanh đơn vị nghìn */}
      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        <span className="text-[11px] text-slate-400 font-medium select-none">Cộng nhanh:</span>
        {[
          { label: '+10k', val: 10000 },
          { label: '+20k', val: 20000 },
          { label: '+50k', val: 50000 },
          { label: '+100k', val: 100000 },
          { label: '+200k', val: 200000 },
          { label: '+500k', val: 500000 },
          { label: '+1Tr', val: 1000000 },
        ].map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => handleQuickAdd(item.val)}
            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 font-bold rounded-lg text-[11px] font-mono transition-colors cursor-pointer select-none"
          >
            {item.label}
          </button>
        ))}

        {value > 0 && (
          <button
            type="button"
            onClick={handleClear}
            className="ml-auto inline-flex items-center gap-1 px-2 py-1 text-[11px] font-bold text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
            title="Xóa số tiền về 0"
          >
            <Delete className="w-3 h-3" />
            <span>Xóa</span>
          </button>
        )}
      </div>
    </div>
  );
};
