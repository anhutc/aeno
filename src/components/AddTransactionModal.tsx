/**
 * ============================================================================
 * GHI CHÚ CHỈNH SỬA / CHANGELOG:
 * - Đặt z-index lên z-[60] để khi mở từ hộp thoại chi tiết sổ nợ (DebtorDetailModal, z-50),
 *   modal tạo giao dịch hiển thị đè lên trên và khi tắt/lưu xong vẫn giữ nguyên popup chi tiết.
 * - Xóa số điện thoại người nợ: Loại bỏ trường SĐT trong form tạo nhanh người nợ khi ghi sổ giao dịch.
 * - Loại bỏ hiển thị SĐT trong dropdown chọn người nợ.
 * - Tinh gọn giao diện tạo nhanh người nợ: Tên, Mật khẩu tra cứu và Ghi chú cá nhân.
 * ============================================================================
 */

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  PlusCircle,
  MinusCircle,
  Calendar,
  Upload,
  Save,
  UserPlus,
  Users,
  Dices,
  Eye,
  EyeOff,
  Trash2,
  User,
  KeyRound,
  Sparkles,
  FileText,
  Check,
  Loader2,
} from 'lucide-react';
import { Debtor, Transaction, TransactionType } from '../types';
import { generateRandomPin as createAlphanumericPin } from '../utils/pinGenerator';
import { ThousandAmountInput } from './ThousandAmountInput';
import { uploadBillImage } from '../utils/imageUploader';
import { cleanStorageIfQuotaBloated } from '../utils/storage';

interface AddTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  debtors: Debtor[];
  onSave: (tx: Omit<Transaction, 'id' | 'createdAt'>) => Promise<void> | void;
  onSaveDebtor?: (
    debtorData: Omit<Debtor, 'id' | 'createdAt' | 'updatedAt'>,
    editId?: string
  ) => Promise<Debtor | null>;
  defaultDebtorId?: string;
}

export const AddTransactionModal: React.FC<AddTransactionModalProps> = ({
  isOpen,
  onClose,
  debtors,
  onSave,
  onSaveDebtor,
  defaultDebtorId,
}) => {
  // Selection vs Inline Creation mode
  const [debtorMode, setDebtorMode] = useState<'SELECT' | 'CREATE_NEW'>('SELECT');
  const [debtorId, setDebtorId] = useState('');

  // Inline debtor fields (unified with AddDebtorModal)
  const [newName, setNewName] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newNote, setNewNote] = useState('');
  const [showNewPin, setShowNewPin] = useState(true);

  // Transaction fields
  const [type, setType] = useState<TransactionType>('ADD');
  const [amount, setAmount] = useState<number>(100000);
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [note, setNote] = useState('');
  const [billImage, setBillImage] = useState<string | undefined>(undefined);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);

  const prevIsOpenRef = useRef(false);
  const prevDefaultDebtorIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const isOpening = isOpen && !prevIsOpenRef.current;
    const isChangingDebtor = isOpen && defaultDebtorId !== prevDefaultDebtorIdRef.current;

    // Only re-initialize transaction form when newly opened or switching debtor target
    if (isOpening || isChangingDebtor) {
      if (defaultDebtorId) {
        setDebtorMode('SELECT');
        setDebtorId(defaultDebtorId);
      } else if (debtors.length > 0) {
        setDebtorMode('SELECT');
        setDebtorId((prev) => (debtors.some((d) => d.id === prev) ? prev : debtors[0].id));
      } else {
        // No debtors exist yet -> seamlessly start in creation mode
        setDebtorMode('CREATE_NEW');
        setDebtorId('');
      }

      setNewName('');
      const existingPins = debtors.map((d) => d.pin);
      setNewPin(createAlphanumericPin(existingPins, 4));
      setNewNote('');
      setShowNewPin(true);

      setType('ADD');
      setAmount(100000);
      setDate(new Date().toISOString().split('T')[0]);
      setNote('');
      setBillImage(undefined);
      setError('');
      setIsSubmitting(false);
    }

    prevIsOpenRef.current = isOpen;
    prevDefaultDebtorIdRef.current = defaultDebtorId;
  }, [isOpen, defaultDebtorId, debtors]);

  const handleGenerateNewPin = () => {
    const existingPins = debtors.map((d) => d.pin);
    setNewPin(createAlphanumericPin(existingPins, 4));
  };

  const [isAddingDebtorInline, setIsAddingDebtorInline] = useState(false);

  const handleSaveDebtorInline = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      setError('Vui lòng nhập tên người nợ / bạn bè');
      return;
    }
    const cleanPass = newPin.trim();
    if (!cleanPass || cleanPass.length < 2) {
      setError('Mật khẩu phải có ít nhất 2 ký tự (chữ hoặc số)');
      return;
    }
    if (debtors.some((d) => d.pin.toLowerCase().trim() === cleanPass.toLowerCase().trim())) {
      setError(`Mật khẩu "${cleanPass}" đã được dùng cho người khác. Vui lòng bấm "Ngẫu nhiên" để lấy mã khác!`);
      return;
    }
    if (!onSaveDebtor) return;
    setIsAddingDebtorInline(true);
    setError('');
    try {
      const created = await onSaveDebtor({
        name: newName.trim(),
        pin: cleanPass,
        note: newNote.trim() || undefined,
      });
      if (created && created.id) {
        setDebtorId(created.id);
        setDebtorMode('SELECT');
        setNewName('');
        setNewNote('');
        const existingPins = [...debtors.map((d) => d.pin), created.pin];
        setNewPin(createAlphanumericPin(existingPins, 4));
      }
    } catch {
      setError('Không thể tạo người mới. Vui lòng thử lại.');
    } finally {
      setIsAddingDebtorInline(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 25 * 1024 * 1024) {
        setError('Kích thước ảnh gốc không vượt quá 25MB');
        return;
      }
      try {
        setError('');
        setIsUploadingImage(true);
        // Upload original full-resolution image to cloud vault without lossy compression
        const uploadedUrl = await uploadBillImage(file);
        setBillImage(uploadedUrl);
      } catch (err: any) {
        console.error('Image upload failed:', err);
        setError(err?.message || 'Không thể tải hình ảnh này. Vui lòng chọn ảnh khác.');
      } finally {
        setIsUploadingImage(false);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingRef.current) return;
    setError('');

    let targetDebtorId = debtorId;

    // Validate inputs
    if (debtorMode === 'CREATE_NEW') {
      if (!newName.trim()) {
        setError('Vui lòng nhập tên người mới');
        return;
      }
      const cleanPass = newPin.trim();
      if (!cleanPass || cleanPass.length < 2) {
        setError('Mật khẩu phải có ít nhất 2 ký tự (chữ hoặc số)');
        return;
      }
      if (
        debtors.some((d) => d.pin.toLowerCase().trim() === cleanPass.toLowerCase().trim())
      ) {
        setError(
          `Mật khẩu "${cleanPass}" đã được dùng cho người khác. Vui lòng bấm "Ngẫu nhiên" để lấy mã khác!`
        );
        return;
      }
    } else {
      if (!targetDebtorId) {
        setError('Vui lòng chọn người mới');
        return;
      }
    }

    if (!amount || amount <= 0) {
      setError('Vui lòng nhập số tiền hợp lệ (> 0)');
      return;
    }
    if (!date) {
      setError('Vui lòng chọn ngày giao dịch');
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);

    try {
      // If in CREATE_NEW mode, create debtor first
      if (debtorMode === 'CREATE_NEW') {
        const cleanPass = newPin.trim();
        if (onSaveDebtor) {
          const created = await onSaveDebtor({
            name: newName.trim(),
            pin: cleanPass,
            note: newNote.trim() || undefined,
          });

          if (created && created.id) {
            targetDebtorId = created.id;
          } else {
            setError('Không thể tạo người mới. Vui lòng thử lại.');
            return;
          }
        } else {
          setError('Hệ thống chưa hỗ trợ tạo người mới tại đây');
          return;
        }
      }

      const payload: Omit<Transaction, 'id' | 'createdAt'> = {
        debtorId: targetDebtorId,
        type,
        amount,
        date,
        note: note.trim(),
        category: 'SINGLE',
        ...(billImage ? { billImage } : {}),
      };
      await onSave(payload);
      onClose();
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('exceeded')) {
        cleanStorageIfQuotaBloated();
        // Retry once after cleaning local cache
        try {
          const payloadRetry: Omit<Transaction, 'id' | 'createdAt'> = {
            debtorId: targetDebtorId,
            type,
            amount,
            date,
            note: note.trim(),
            category: 'SINGLE',
            ...(billImage ? { billImage } : {}),
          };
          await onSave(payloadRetry);
          onClose();
          return;
        } catch {
          setError('Bộ nhớ trình duyệt tạm đầy. Hệ thống đã tự động dọn dẹp, bạn hãy nhấn "Tạo Giao Dịch" lại một lần nữa nhé!');
        }
      } else {
        setError(msg || 'Có lỗi xảy ra khi lưu giao dịch');
      }
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
              id="add-transaction-modal-backdrop"
              onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
              }}
              className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-slate-900/35 backdrop-blur-xs p-0 sm:p-4 overflow-y-auto overflow-x-hidden overscroll-contain"
            >
              <motion.div
                id="add-transaction-modal-card"
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
                className="bg-white w-full sm:max-w-lg rounded-t-[32px] sm:rounded-3xl shadow-2xl border border-slate-100 overflow-hidden max-h-[88dvh] sm:max-h-[90vh] flex flex-col shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
            {/* Mobile Drag Pill Handle */}
            <div className="w-10 h-1.5 bg-slate-200/90 rounded-full mx-auto my-3 sm:hidden shrink-0 cursor-grab active:cursor-grabbing" />

            {/* Header */}
            <div className="px-5 sm:px-6 pt-1 sm:pt-5 pb-4 flex items-center justify-between shrink-0 border-b border-slate-100 bg-white">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0 shadow-xs">
                  <PlusCircle className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="font-extrabold text-base sm:text-lg tracking-tight text-slate-900 leading-tight truncate">
                    Tạo Giao Dịch Mới
                  </h2>
                  <p className="text-xs text-slate-500 font-medium truncate mt-0.5">
                    Ghi nhận khoản cho vay, chi hộ hoặc thu hồi tiền nợ
                  </p>
                </div>
              </div>
              <button
                id="close-add-transaction-btn"
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-all cursor-pointer shrink-0"
                title="Đóng"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form Content */}
            <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden bg-slate-50/40">
              <div className="p-5 sm:p-6 space-y-4 text-slate-800 text-sm overflow-y-auto overflow-x-hidden flex-1 overscroll-contain">
                {error && (
                  <div className="p-3.5 bg-rose-50 border border-rose-200/80 text-rose-700 rounded-2xl text-xs font-semibold">
                    {error}
                  </div>
                )}

          {/* Người nợ: Tùy biến chọn có sẵn hoặc tạo ngay tại chỗ */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <label className="font-semibold text-slate-700 text-xs sm:text-sm">
                Người giao dịch <span className="text-red-500">(*)</span>:
              </label>

              <div className="inline-flex p-0.5 bg-slate-100 rounded-lg border border-slate-200 text-xs shrink-0">
                <button
                  type="button"
                  id="btn-switch-select-debtor"
                  onClick={() => setDebtorMode('SELECT')}
                  disabled={debtors.length === 0}
                  className={`flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-md font-semibold transition-all whitespace-nowrap ${
                    debtorMode === 'SELECT'
                      ? 'bg-white text-emerald-700 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800 disabled:opacity-40'
                  }`}
                >
                  <Users className="w-3 h-3 shrink-0" />
                  <span>Có sẵn ({debtors.length})</span>
                </button>
                <button
                  type="button"
                  id="btn-switch-create-debtor"
                  onClick={() => setDebtorMode('CREATE_NEW')}
                  className={`flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-md font-semibold transition-all whitespace-nowrap ${
                    debtorMode === 'CREATE_NEW'
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <UserPlus className="w-3 h-3 shrink-0" />
                  <span>Tạo mới</span>
                </button>
              </div>
            </div>

            {debtorMode === 'SELECT' ? (
              debtors.length > 0 ? (
                <select
                  id="select-tx-debtor"
                  value={debtorId}
                  onChange={(e) => setDebtorId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium text-slate-900 transition-all text-xs sm:text-sm"
                >
                  {debtors.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} - ({d.pin})
                    </option>
                  ))}
                </select>
              ) : (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center justify-between">
                  <span>Chưa có ai trong danh bạ. Hãy thêm người mới ngay:</span>
                  <button
                    type="button"
                    onClick={() => setDebtorMode('CREATE_NEW')}
                    className="font-bold text-emerald-600 underline cursor-pointer"
                  >
                    Thêm ngay
                  </button>
                </div>
              )
            ) : (
              <div className="p-3.5 sm:p-4 bg-emerald-50/70 border border-emerald-200/90 rounded-2xl space-y-3 animate-in fade-in shadow-2xs">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-900 uppercase flex items-center gap-1.5 tracking-wider">
                    <UserPlus className="w-4 h-4 text-emerald-600" />
                    Thêm Danh Bạ Mới:
                  </span>
                  {debtors.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setDebtorMode('SELECT')}
                      className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
                      title="Quay lại danh sách có sẵn"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="space-y-2.5">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Tên</span>
                      <span className="text-rose-500 font-bold">*</span>
                    </label>
                    <div className="relative flex items-center bg-white rounded-xl border border-slate-200/90 shadow-2xs hover:border-slate-300 focus-within:border-emerald-500 focus-within:ring-4 focus-within:ring-emerald-500/10 transition-all">
                      <input
                        type="text"
                        id="input-inline-debtor-name"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="Ví dụ: Nguyễn Văn Nam, Bạn Tuấn..."
                        className="w-full px-3.5 py-2.5 bg-transparent text-slate-900 font-semibold placeholder:text-slate-400 outline-none text-xs sm:text-sm"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                        <KeyRound className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Mật Khẩu</span>
                        <span className="text-rose-500 font-bold">*</span>
                      </label>
                      <button
                        type="button"
                        onClick={handleGenerateNewPin}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white hover:bg-emerald-50 active:scale-95 text-emerald-700 font-bold text-[11px] rounded-lg border border-emerald-200 transition-all cursor-pointer shadow-2xs"
                        title="Tạo ngẫu nhiên mật khẩu dễ nhớ"
                      >
                        <Dices className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Ngẫu nhiên</span>
                      </button>
                    </div>
                    <div className="relative flex items-center bg-white rounded-xl border border-slate-200/90 shadow-2xs hover:border-slate-300 focus-within:border-emerald-500 focus-within:ring-4 focus-within:ring-emerald-500/10 transition-all">
                      <input
                        type={showNewPin ? 'text' : 'password'}
                        id="input-inline-debtor-pin"
                        value={newPin}
                        onChange={(e) => setNewPin(e.target.value)}
                        placeholder="Ví dụ: nam123 hoặc 1234"
                        className="w-full pl-3.5 pr-10 py-2.5 bg-transparent font-mono font-bold tracking-wider text-slate-900 placeholder:text-slate-400 text-xs sm:text-sm outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPin(!showNewPin)}
                        className="absolute right-2.5 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                        title={showNewPin ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                      >
                        {showNewPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4 text-emerald-600" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-slate-400" />
                      <span>Ghi Chú</span>
                      <span className="text-slate-400 font-normal">(Tùy chọn)</span>
                    </label>
                    <div className="relative flex items-center bg-white rounded-xl border border-slate-200/90 shadow-2xs hover:border-slate-300 focus-within:border-emerald-500 focus-within:ring-4 focus-within:ring-emerald-500/10 transition-all">
                      <input
                        type="text"
                        id="input-inline-debtor-note"
                        value={newNote}
                        onChange={(e) => setNewNote(e.target.value)}
                        placeholder="Bạn cấp 3 / Đồng nghiệp / Nhóm đá banh..."
                        className="w-full px-3.5 py-2.5 bg-transparent text-slate-900 font-medium placeholder:text-slate-400 text-xs sm:text-sm outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-2 p-2.5 bg-white/90 rounded-xl border border-emerald-100 text-[11px] text-emerald-800 font-medium">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span>Mật khẩu riêng để người này tự đăng nhập và xem sao kê.</span>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1 border-t border-emerald-200/60">
                  {debtors.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setDebtorMode('SELECT')}
                      className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 font-semibold cursor-pointer"
                    >
                      Hủy
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleSaveDebtorInline}
                    disabled={isAddingDebtorInline || !newName.trim()}
                    className="px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 active:from-emerald-800 active:to-teal-800 text-white rounded-xl text-xs font-bold shadow-2xs transition-all disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{isAddingDebtorInline ? 'Đang lưu...' : 'Lưu & Chọn Ngay'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Phân loại giao dịch */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
              Phân loại giao dịch <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                id="btn-tx-type-add"
                onClick={() => setType('ADD')}
                className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all font-medium text-left cursor-pointer ${
                  type === 'ADD'
                    ? 'border-rose-500 bg-rose-50/90 text-rose-950 ring-2 ring-rose-200 shadow-xs'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:bg-slate-100/80'
                }`}
              >
                <PlusCircle className={`w-5 h-5 shrink-0 ${type === 'ADD' ? 'text-rose-600' : 'text-slate-400'}`} />
                <div className="min-w-0">
                  <div className="font-bold text-xs uppercase tracking-wide text-rose-800">
                    (+) Cho vay / Chi hộ
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">Họ mượn hoặc bạn thanh toán giúp</div>
                </div>
              </button>

              <button
                type="button"
                id="btn-tx-type-sub"
                onClick={() => setType('SUB')}
                className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all font-medium text-left cursor-pointer ${
                  type === 'SUB'
                    ? 'border-emerald-500 bg-emerald-50/90 text-emerald-950 ring-2 ring-emerald-200 shadow-xs'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:bg-slate-100/80'
                }`}
              >
                <MinusCircle className={`w-5 h-5 shrink-0 ${type === 'SUB' ? 'text-emerald-600' : 'text-slate-400'}`} />
                <div className="min-w-0">
                  <div className="font-bold text-xs uppercase tracking-wide text-emerald-800">
                    (-) Thu nợ / Thanh toán
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">Họ trả tiền hoặc cấn trừ nợ</div>
                </div>
              </button>
            </div>
          </div>

          {/* Số tiền tối ưu theo đơn vị nghìn */}
          <ThousandAmountInput
            id="input-tx-amount"
            value={amount}
            onChange={(val) => {
              setAmount(val);
              setError('');
            }}
            label="Số tiền"
            required
            accentColor="emerald"
          />

          {/* Ghi chú */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
              Ghi chú / Nội dung
            </label>
            <input
              id="input-tx-note"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="VD: Cơm trưa, Cà phê, Vay nóng, Đã chuyển khoản..."
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20 focus:bg-white rounded-xl text-xs sm:text-sm text-slate-900 outline-none transition-colors"
            />
          </div>

          {/* Ngày giao dịch */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
              Ngày ghi nhận <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                id="input-tx-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 border border-slate-300 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20 focus:bg-white rounded-xl text-xs sm:text-sm text-slate-900 outline-none transition-colors"
              />
              <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* Tùy chọn ảnh bill đối soát */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
              Ảnh hóa đơn / Chứng từ (Tùy chọn)
            </label>
            {isUploadingImage ? (
              <div className="flex items-center justify-center gap-2 p-3.5 border border-slate-200 bg-slate-50 rounded-xl text-slate-600 text-xs font-medium">
                <Loader2 className="w-4 h-4 text-emerald-600 animate-spin" />
                <span>Đang tải ảnh gốc chất lượng cao lên đám mây...</span>
              </div>
            ) : billImage ? (
              <div className="flex items-center gap-3 p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                <img
                  src={billImage}
                  alt="Bill preview"
                  className="w-14 h-14 object-cover rounded-lg border border-slate-200"
                />
                <div className="flex-1 min-w-0 text-xs text-slate-600">
                  <div className="font-semibold text-slate-800 truncate">Ảnh đính kèm gốc</div>
                  <div className="text-[11px] text-emerald-600 font-medium">Lưu trữ đám mây sắc nét 100%</div>
                </div>
                <button
                  type="button"
                  onClick={() => setBillImage(undefined)}
                  className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1"
                  title="Xóa ảnh này"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Xóa ảnh</span>
                </button>
              </div>
            ) : (
              <label className="flex items-center justify-center gap-2 p-3.5 border border-dashed border-slate-300 hover:border-emerald-500 hover:bg-emerald-50/40 rounded-xl text-slate-600 hover:text-emerald-700 transition-colors cursor-pointer text-xs font-medium">
                <Upload className="w-4 h-4 text-slate-400" />
                <span>Tải ảnh hóa đơn / chuyển khoản (Chất lượng gốc)</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </label>
            )}
          </div>

            </div>

            {/* Sticky Action Footer - Cố định nút ở chân modal */}
            <div
              className="p-4 sm:p-5 bg-white border-t border-slate-100 flex items-center gap-3 shrink-0 select-none"
              style={{
                paddingBottom: 'max(calc(env(safe-area-inset-bottom, 0px) + 12px), 16px)',
              }}
            >
              <button
                type="button"
                id="btn-cancel-transaction"
                onClick={onClose}
                disabled={isSubmitting}
                className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 rounded-2xl text-sm font-bold transition-all cursor-pointer text-center disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                type="submit"
                id="btn-save-transaction"
                disabled={isSubmitting}
                className="flex-[1.6] inline-flex items-center justify-center gap-2 py-3 px-5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-extrabold text-sm rounded-2xl shadow-md shadow-emerald-500/25 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
              >
                <Save className={`w-4 h-4 ${isSubmitting ? 'animate-spin' : ''}`} />
                <span>{isSubmitting ? 'Đang lưu...' : 'Tạo Giao Dịch'}</span>
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
