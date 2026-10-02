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
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Dices,
  UserPlus,
  Pencil,
  Save,
  Eye,
  EyeOff,
  User,
  KeyRound,
  FileText,
  Sparkles,
} from 'lucide-react';
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
  const isSubmittingRef = useRef(false);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingRef.current) return;

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

    isSubmittingRef.current = true;
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
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return typeof document !== 'undefined'
    ? createPortal(
        <AnimatePresence>
          {isOpen && (
            <div
              id="add-debtor-modal-backdrop"
              onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
              }}
              className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-md p-0 sm:p-4 overflow-y-auto overflow-x-hidden overscroll-contain"
            >
              <motion.div
                id="add-debtor-modal-card"
                drag="y"
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={{ top: 0, bottom: 0.5 }}
                onDragEnd={(_e, info) => {
                  if (info.offset.y > 100 || info.velocity.y > 350) {
                    onClose();
                  }
                }}
                initial={{ opacity: 0, scale: 0.96, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 20 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className="bg-white w-full sm:max-w-md rounded-t-[32px] sm:rounded-3xl shadow-2xl border border-slate-100 overflow-hidden max-h-[88dvh] sm:max-h-[90vh] flex flex-col shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Mobile Drag Pill Handle */}
                <div className="w-10 h-1.5 bg-slate-200/90 rounded-full mx-auto my-3 sm:hidden shrink-0 cursor-grab active:cursor-grabbing" />

                {/* Header */}
                <div className="px-5 sm:px-6 pt-1 sm:pt-5 pb-4 flex items-center justify-between shrink-0 border-b border-slate-100 bg-white">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0 shadow-xs">
                      {initialDebtor ? <Pencil className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
                    </div>
                    <div className="min-w-0">
                      <h2 className="font-extrabold text-base sm:text-lg tracking-tight text-slate-900 leading-tight truncate">
                        {initialDebtor ? 'Chỉnh Sửa Người Nợ' : 'Thêm Người Nợ Mới'}
                      </h2>
                      <p className="text-xs text-slate-500 font-medium truncate mt-0.5">
                        {initialDebtor
                          ? `Cập nhật thông tin: ${initialDebtor.name}`
                          : 'Cấp mã PIN để họ tự vào tra cứu sao kê'}
                      </p>
                    </div>
                  </div>
                  <button
                    id="close-add-debtor-btn"
                    onClick={onClose}
                    className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-all cursor-pointer shrink-0"
                    title="Đóng"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden bg-slate-50/40">
                  <div className="p-5 sm:p-6 space-y-4 text-slate-800 overflow-y-auto overflow-x-hidden flex-1 overscroll-contain">
                    {error && (
                      <div className="p-3.5 bg-rose-50 border border-rose-200/80 text-rose-700 rounded-2xl text-xs font-semibold flex items-center gap-2">
                        <span>{error}</span>
                      </div>
                    )}

                    {/* Tên người nợ */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-blue-600" />
                        <span>Tên Người Nợ</span>
                        <span className="text-rose-500 font-bold">*</span>
                      </label>
                      <div className="relative flex items-center bg-white rounded-2xl border border-slate-200/90 shadow-2xs hover:border-slate-300 focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10 transition-all">
                        <input
                          id="input-debtor-name"
                          type="text"
                          placeholder="Ví dụ: Nguyễn Văn Nam, Bạn Tuấn..."
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          onFocus={(e) => setTimeout(() => e.target.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150)}
                          className="w-full px-4 py-3 bg-transparent text-slate-900 font-semibold placeholder:text-slate-400/80 outline-none text-base sm:text-sm"
                        />
                      </div>
                    </div>

                    {/* Mật khẩu tra cứu */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                          <KeyRound className="w-3.5 h-3.5 text-blue-600" />
                          <span>Mật Khẩu Tra Cứu (PIN)</span>
                          <span className="text-rose-500 font-bold">*</span>
                        </label>
                        <button
                          type="button"
                          id="btn-random-pin"
                          onClick={generateRandomPin}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 hover:bg-blue-100 active:scale-95 text-blue-700 font-bold text-[11px] rounded-lg border border-blue-200/80 transition-all cursor-pointer"
                          title="Tạo ngẫu nhiên mật khẩu dễ nhớ"
                        >
                          <Dices className="w-3.5 h-3.5 text-blue-600" />
                          <span>Đổi mã khác</span>
                        </button>
                      </div>

                      <div className="relative flex items-center bg-white rounded-2xl border border-slate-200/90 shadow-2xs hover:border-slate-300 focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10 transition-all">
                        <input
                          id="input-debtor-pin"
                          type={showPassword ? 'text' : 'password'}
                          placeholder="Ví dụ: nam123 hoặc 1234"
                          value={pin}
                          onChange={(e) => setPin(e.target.value)}
                          onFocus={(e) => setTimeout(() => e.target.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150)}
                          className="w-full pl-4 pr-11 py-3 bg-transparent font-mono font-bold tracking-wider text-slate-900 placeholder:text-slate-400/80 outline-none text-base sm:text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3.5 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                          title={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4 text-blue-600" />}
                        </button>
                      </div>

                      <div className="flex items-start gap-2 p-2.5 bg-blue-50/70 rounded-xl border border-blue-100 text-[11px] text-blue-800 mt-2 font-medium">
                        <Sparkles className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
                        <span>Mật khẩu riêng để người nợ tự đăng nhập và xem sao kê trên điện thoại của họ.</span>
                      </div>
                    </div>

                    {/* Ghi chú cá nhân */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-slate-400" />
                        <span>Ghi Chú Phụ (Tùy chọn)</span>
                      </label>
                      <div className="relative flex items-center bg-white rounded-2xl border border-slate-200/90 shadow-2xs hover:border-slate-300 focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10 transition-all">
                        <input
                          id="input-debtor-note"
                          type="text"
                          placeholder="Bạn cấp 3 / Đồng nghiệp / Nhóm đá banh..."
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          onFocus={(e) => setTimeout(() => e.target.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150)}
                          className="w-full px-4 py-3 bg-transparent text-slate-900 font-medium placeholder:text-slate-400/80 outline-none text-base sm:text-sm"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Action buttons - Cố định ở đáy modal */}
                  <div
                    className="p-4 sm:p-5 bg-white border-t border-slate-100 flex items-center gap-3 shrink-0 select-none"
                    style={{
                      paddingBottom: 'max(calc(env(safe-area-inset-bottom, 0px) + 12px), 16px)',
                    }}
                  >
                    <button
                      type="button"
                      id="btn-cancel-debtor"
                      onClick={onClose}
                      disabled={isSubmitting}
                      className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 rounded-2xl text-sm font-bold transition-all cursor-pointer text-center disabled:opacity-50"
                    >
                      Hủy
                    </button>
                    <button
                      type="submit"
                      id="btn-save-debtor"
                      disabled={isSubmitting}
                      className="flex-[1.6] inline-flex items-center justify-center gap-2 py-3 px-5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-extrabold text-sm rounded-2xl shadow-md shadow-blue-500/25 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
                    >
                      <Save className={`w-4 h-4 ${isSubmitting ? 'animate-spin' : ''}`} />
                      <span>{isSubmitting ? 'Đang lưu...' : initialDebtor ? 'Lưu Thay Đổi' : 'Tạo Người Nợ'}</span>
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )
    : null;
};
