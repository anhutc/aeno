/**
 * ============================================================================
 * GHI CHÚ CHỈNH SỬA / CHANGELOG:
 * - Tăng z-index lên z-[60] để khi mở từ hộp thoại chi tiết người nợ (DebtorDetailModal),
 *   modal đổi mật khẩu tra cứu luôn hiển thị đè lên trên một cách chuẩn xác.
 * ============================================================================
 */

import React, { useState, useEffect, useRef } from 'react';
import { X, KeyRound, Dices, Save, Check, Eye, EyeOff } from 'lucide-react';
import { Debtor } from '../types';
import { generateRandomPin as createAlphanumericPin } from '../utils/pinGenerator';

interface ChangePinModalProps {
  isOpen: boolean;
  onClose: () => void;
  debtor: Debtor | null;
  existingDebtors: Debtor[];
  onSavePin: (debtorId: string, newPin: string) => Promise<boolean>;
}

export const ChangePinModal: React.FC<ChangePinModalProps> = ({
  isOpen,
  onClose,
  debtor,
  existingDebtors,
  onSavePin,
}) => {
  const [newPin, setNewPin] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [showPassword, setShowPassword] = useState(true);

  const prevIsOpenRef = useRef(false);
  const prevDebtorIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const isOpening = isOpen && !prevIsOpenRef.current;
    const isSwitchingDebtor = isOpen && debtor?.id !== prevDebtorIdRef.current;

    if ((isOpening || isSwitchingDebtor) && debtor) {
      setNewPin(debtor.pin);
      setError('');
      setSuccessMsg('');
      setIsSaving(false);
    }

    prevIsOpenRef.current = isOpen;
    prevDebtorIdRef.current = debtor?.id;
  }, [isOpen, debtor]);

  if (!isOpen || !debtor) return null;

  const handleGenerateRandom = () => {
    const existingPins = existingDebtors
      .filter((d) => d.id !== debtor.id)
      .map((d) => d.pin);
    const randomPass = createAlphanumericPin(existingPins, 4);
    setNewPin(randomPass);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    const trimmed = newPin.trim();
    if (!trimmed || trimmed.length < 2) {
      setError('Mật khẩu mới phải có ít nhất 2 ký tự (chữ hoặc số)');
      return;
    }

    // Check duplicate (case-insensitive)
    const duplicate = existingDebtors.find(
      (d) => d.id !== debtor.id && d.pin.toLowerCase().trim() === trimmed.toLowerCase()
    );
    if (duplicate) {
      setError(`Mật khẩu "${trimmed}" đã được cấp cho "${duplicate.name}". Vui lòng chọn mật khẩu khác.`);
      return;
    }

    setIsSaving(true);
    try {
      const ok = await onSavePin(debtor.id, trimmed);
      if (ok) {
        setSuccessMsg(`Đã đổi mật khẩu của ${debtor.name} thành "${trimmed}" thành công!`);
        setTimeout(() => {
          onClose();
        }, 1200);
      } else {
        setError('Không thể lưu mật khẩu mới. Vui lòng thử lại.');
      }
    } catch {
      setError('Lỗi kết nối khi cập nhật mật khẩu.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      id="change-pin-modal-backdrop"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-150"
    >
      <div
        id="change-pin-modal-card"
        className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="bg-amber-600 text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
              <KeyRound className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-sm sm:text-base leading-tight">
                Đổi Mật Khẩu Con Nợ
              </h2>
              <p className="text-[11px] text-amber-100">
                Cập nhật mật khẩu cho: <strong>{debtor.name}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-amber-100 hover:text-white p-1 hover:bg-amber-700 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 text-slate-800 text-sm">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-medium">
              {error}
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Current Pass display */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs">
            <span className="text-slate-500 font-medium">Mật khẩu hiện tại:</span>
            <span className="font-mono font-bold text-slate-800 bg-slate-200 px-2.5 py-1 rounded">
              {debtor.pin}
            </span>
          </div>

          {/* New Pass input */}
          <div>
            <label className="block font-bold text-xs uppercase tracking-wider text-slate-700 mb-1.5">
              Mật khẩu mới:
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value)}
                  placeholder="Ví dụ: nam123 hoặc 8888"
                  autoFocus
                  className="w-full pl-4 pr-10 py-3 text-center text-lg font-bold font-mono tracking-wider bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                  title={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <button
                type="button"
                onClick={handleGenerateRandom}
                className="px-3.5 py-3 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 font-semibold text-xs rounded-xl border border-slate-200 transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer"
                title="Tạo mật khẩu ngẫu nhiên không trùng lặp"
              >
                <Dices className="w-4 h-4 text-amber-600" />
                <span className="hidden sm:inline">Ngẫu nhiên</span>
                <span className="sm:hidden">Random</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
              Sau khi đổi, bạn gửi mật khẩu mới này cho <strong>{debtor.name}</strong> để họ tra cứu sao kê.
            </p>
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl font-semibold text-xs transition-colors cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSaving || !newPin.trim()}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSaving ? 'Đang lưu...' : 'Lưu Mật Khẩu Mới'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
