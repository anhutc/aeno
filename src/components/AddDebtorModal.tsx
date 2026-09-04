/**
 * ============================================================================
 * GHI CHÚ CHỈNH SỬA / CHANGELOG:
 * - Xóa bỏ hoàn toàn trường Số điện thoại (phone) của người nợ trong form thêm / sửa.
 * - Tối ưu giao diện form: Tinh gọn chỉ còn Tên, Mật khẩu tra cứu (PIN) và Ghi chú,
 *   giúp thao tác nhanh chóng và thoáng mắt hơn.
 * - Giữ nguyên z-index z-[60] để modal luôn hiển thị đè trên DebtorDetailModal.
 * ============================================================================
 */

import React, { useState, useEffect, useRef } from 'react';
import { X, Dices, UserPlus, Pencil, Save, Eye, EyeOff } from 'lucide-react';
import { Debtor } from '../types';
import { generateRandomPin as createAlphanumericPin } from '../utils/pinGenerator';

interface AddDebtorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (debtorData: Omit<Debtor, 'id' | 'createdAt' | 'updatedAt'>, editId?: string) => Promise<any> | void;
  initialDebtor?: Debtor | null;
  existingDebtors: Debtor[];
}

export const AddDebtorModal: React.FC<AddDebtorModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialDebtor,
  existingDebtors,
}) => {
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const prevIsOpenRef = useRef(false);
  const prevDebtorIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const isOpening = isOpen && !prevIsOpenRef.current;
    const isSwitchingDebtor = isOpen && initialDebtor?.id !== prevDebtorIdRef.current;

    // Only populate/reset form inputs when modal is newly opened or switched to a different debtor
    if (isOpening || isSwitchingDebtor) {
      if (initialDebtor) {
        setName(initialDebtor.name);
        setPin(initialDebtor.pin);
        setNote(initialDebtor.note || '');
      } else {
        setName('');
        const existingPins = existingDebtors
          .filter((d) => !initialDebtor || d.id !== initialDebtor.id)
          .map((d) => d.pin);
        const randomPass = createAlphanumericPin(existingPins, 4);
        setPin(randomPass);
        setNote('');
      }
      setError('');
      setIsSubmitting(false);
    }

    prevIsOpenRef.current = isOpen;
    prevDebtorIdRef.current = initialDebtor?.id;
  }, [initialDebtor, isOpen, existingDebtors]);

  const generateRandomPin = () => {
    const existingPins = existingDebtors
      .filter((d) => !initialDebtor || d.id !== initialDebtor.id)
      .map((d) => d.pin);
    const randomPass = createAlphanumericPin(existingPins, 4);
    setPin(randomPass);
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Vui lòng nhập tên người nợ');
      return;
    }
    const cleanPass = pin.trim();
    if (!cleanPass || cleanPass.length < 2) {
      setError('Mật khẩu tra cứu phải có ít nhất 2 ký tự');
      return;
    }

    // Check unique Pass (case-insensitive)
    const duplicate = existingDebtors.find(
      (d) =>
        (!initialDebtor || d.id !== initialDebtor.id) &&
        d.pin.toLowerCase().trim() === cleanPass.toLowerCase()
    );
    if (duplicate) {
      setError(
        `Mật khẩu "${cleanPass}" đã được cấp cho "${duplicate.name}". Vui lòng chọn mật khẩu khác để đảm bảo tính riêng tư cho từng người!`
      );
      return;
    }

    setIsSubmitting(true);
    try {
      await onSave(
        {
          name: name.trim(),
          pin: cleanPass,
          note: note.trim(),
        },
        initialDebtor ? initialDebtor.id : undefined
      );
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Có lỗi xảy ra khi lưu thông tin');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      id="add-debtor-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-150"
    >
      <div
        id="add-debtor-modal-card"
        className="bg-white w-full max-w-lg rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150 max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Unified Premium Dark Header */}
        <div className="bg-slate-900 text-white px-5 sm:px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center text-white shrink-0 shadow-xs">
              {initialDebtor ? <Pencil className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-sm sm:text-base tracking-wide uppercase leading-tight truncate">
                {initialDebtor ? 'Chỉnh Sửa Người Nợ' : 'Thêm Người Nợ Mới'}
              </h2>
              <p className="text-xs text-slate-300 truncate mt-0.5">
                {initialDebtor
                  ? `Đang sửa thông tin: ${initialDebtor.name}`
                  : 'Cung cấp tên và mật khẩu tra cứu bảo mật'}
              </p>
            </div>
          </div>
          <button
            id="close-add-debtor-btn"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer shrink-0"
            title="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 text-xs sm:text-sm text-slate-800 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-xs font-medium">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
              Tên người nợ <span className="text-rose-500">*</span>
            </label>
            <input
              id="input-debtor-name"
              type="text"
              placeholder="Nhập tên, ví dụ: Nguyễn Văn Nam"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-slate-900 font-medium transition-colors text-sm"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
              Mật khẩu tra cứu PIN <span className="text-rose-500">*</span>
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  id="input-debtor-pin"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Ví dụ: nam123 hoặc 1234"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  className="w-full pl-3.5 pr-10 py-2.5 text-sm sm:text-base font-bold font-mono bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-slate-900 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                  title={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4 text-emerald-600" />}
                </button>
              </div>

              <button
                type="button"
                id="btn-random-pin"
                onClick={generateRandomPin}
                className="inline-flex items-center gap-1.5 px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl border border-slate-200 transition-colors shrink-0 cursor-pointer"
                title="Tạo ngẫu nhiên mật khẩu dễ nhớ"
              >
                <Dices className="w-4 h-4 text-emerald-600" />
                <span>Ngẫu nhiên</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
              Bạn cấp mật khẩu này cho người đó để họ vào tra cứu sao kê riêng của mình (hỗ trợ cả chữ và số).
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
              Ghi chú cá nhân (Tùy chọn)
            </label>
            <input
              id="input-debtor-note"
              type="text"
              placeholder="Bạn cấp 3 / Đồng nghiệp / Nhóm đá banh..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-slate-900 transition-colors text-sm"
            />
          </div>

          {/* Action buttons */}
          <div className="pt-3 sm:pt-4 border-t border-slate-100 flex items-center justify-end gap-2.5 shrink-0">
            <button
              type="button"
              id="btn-cancel-debtor"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              id="btn-save-debtor"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold rounded-xl text-xs sm:text-sm shadow-xs transition-colors cursor-pointer"
            >
              <Save className={`w-4 h-4 ${isSubmitting ? 'animate-spin' : ''}`} />
              <span>{isSubmitting ? 'Đang lưu...' : initialDebtor ? 'Lưu Thay Đổi' : 'Tạo Người Nợ'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
