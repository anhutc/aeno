import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Pencil,
  PlusCircle,
  MinusCircle,
  Calendar,
  Upload,
  Save,
  Trash2,
  Users,
  Loader2,
} from 'lucide-react';
import { Debtor, Transaction, TransactionType } from '../types';
import { ThousandAmountInput } from './ThousandAmountInput';
import { uploadBillImage, resolveBillImageFallback } from '../utils/imageUploader';
import { cleanStorageIfQuotaBloated } from '../utils/storage';
import { KineticScanBar, LedgerWaveBars } from './DataPulseLoader';

interface EditTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: Transaction | null;
  debtor?: Debtor;
  debtors?: Debtor[];
  onSave: (updatedTx: Transaction) => Promise<void> | void;
}

export const EditTransactionModal: React.FC<EditTransactionModalProps> = ({
  isOpen,
  onClose,
  transaction,
  debtor,
  debtors = [],
  onSave,
}) => {
  const [selectedDebtorId, setSelectedDebtorId] = useState('');
  const [type, setType] = useState<TransactionType>('ADD');
  const [amount, setAmount] = useState<number>(() => transaction?.amount || 0);
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [billImage, setBillImage] = useState<string | undefined>(undefined);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadAbortControllerRef = useRef<AbortController | null>(null);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);

  useEffect(() => {
    if (isOpen && transaction) {
      setSelectedDebtorId(transaction.debtorId || debtor?.id || '');
      setType(transaction.type);
      setAmount(transaction.amount || 0);
      setDate(transaction.date || new Date().toISOString().split('T')[0]);
      setNote(transaction.note || '');
      setBillImage(transaction.billImage);
      setError('');
      setIsSubmitting(false);
      isSubmittingRef.current = false;
    }
  }, [isOpen, transaction, debtor]);

  const handleCancelUpload = () => {
    if (uploadAbortControllerRef.current) {
      uploadAbortControllerRef.current.abort();
      uploadAbortControllerRef.current = null;
    }
    setIsUploadingImage(false);
    setError('');
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 40 * 1024 * 1024) {
        setError('Kích thước ảnh không được vượt quá 40MB');
        return;
      }
      const controller = new AbortController();
      uploadAbortControllerRef.current = controller;
      try {
        setError('');
        setIsUploadingImage(true);
        // Automatically optimizes & downscales to crisp 1400px JPEG quality 0.80 (~150KB)
        const uploadedUrl = await uploadBillImage(file, { signal: controller.signal });
        if (!controller.signal.aborted) {
          setBillImage(uploadedUrl);
        }
      } catch (err: any) {
        if (err?.message?.includes('hủy')) {
          return;
        }
        console.error('Image upload failed:', err);
        setError(err?.message || 'Không thể tải hình ảnh này. Vui lòng thử lại.');
      } finally {
        if (uploadAbortControllerRef.current === controller) {
          uploadAbortControllerRef.current = null;
        }
        setIsUploadingImage(false);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingRef.current) return;

    if (!amount || amount <= 0) {
      setError('Vui lòng nhập số tiền lớn hơn 0');
      return;
    }

    if (!date) {
      setError('Vui lòng chọn ngày ghi nhận');
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    try {
      const updated: Transaction = {
        ...transaction,
        debtorId: selectedDebtorId || transaction.debtorId,
        type,
        amount,
        date: date || new Date().toISOString().split('T')[0],
        note: note.trim(),
      };
      if (billImage) {
        updated.billImage = billImage;
      } else {
        delete updated.billImage;
      }

      await onSave(updated);
      onClose();
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('exceeded')) {
        cleanStorageIfQuotaBloated();
        setError('Bộ nhớ tạm đã đầy và đang được dọn dẹp. Hãy thử bấm Lưu một lần nữa nhé!');
      } else {
        setError(msg || 'Có lỗi xảy ra khi lưu giao dịch');
      }
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const currentDebtorObj = debtors.find((d) => d.id === selectedDebtorId) || debtor;

  return typeof document !== 'undefined'
    ? createPortal(
        <AnimatePresence>
          {isOpen && transaction && (
            <div
              id="edit-transaction-modal-backdrop"
              onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
              }}
              className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-slate-900/35 backdrop-blur-xs p-0 sm:p-4 overflow-y-auto overflow-x-hidden overscroll-contain"
            >
              <motion.div
                id="edit-transaction-modal-card"
                initial={{ opacity: 0, scale: 0.96, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 20 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className="bg-white w-full sm:max-w-lg rounded-t-[32px] sm:rounded-3xl shadow-2xl border border-slate-100 overflow-hidden max-h-[88dvh] sm:max-h-[90vh] flex flex-col shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
            {/* Mobile Drag Pill Handle */}
            <div className="w-10 h-1.5 bg-slate-200/90 rounded-full mx-auto my-3 sm:hidden shrink-0" />

            {/* Header */}
            <div className="px-5 sm:px-6 pt-1 sm:pt-5 pb-4 flex items-center justify-between shrink-0 border-b border-slate-100 bg-white">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0 shadow-xs">
                  <Pencil className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="font-extrabold text-base sm:text-lg tracking-tight text-slate-900 leading-tight truncate">
                    Chỉnh Sửa Giao Dịch
                  </h2>
                  <p className="text-xs text-slate-500 font-medium truncate mt-0.5">
                    {currentDebtorObj ? (
                      <>
                        Người nợ: <span className="font-bold text-emerald-700">{currentDebtorObj.name}</span>
                      </>
                    ) : (
                      'Cập nhật số tiền, loại biến động hoặc chứng từ'
                    )}
                  </p>
                </div>
              </div>
              <button
                type="button"
                id="close-edit-tx-btn"
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-all cursor-pointer shrink-0"
                title="Đóng"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="p-4 sm:p-6 space-y-4 text-xs sm:text-sm text-slate-800 overflow-y-auto overflow-x-hidden flex-1">
            {Boolean(transaction?.partyId || transaction?.category === 'PARTY_SPLIT') && (
              <div className="p-3.5 bg-amber-50 text-amber-900 border border-amber-200 rounded-2xl text-xs space-y-1 shadow-2xs">
                <div className="font-bold flex items-center gap-1.5 text-amber-800">
                  <Users className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>Khoản nợ chia từ Cuộc vui chung</span>
                </div>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  Để đảm bảo số liệu luôn khớp giữa tất cả các thành viên, vui lòng chỉnh sửa hóa đơn tại mục <strong>Cuộc vui</strong> thay vì sửa lẻ từng giao dịch.
                </p>
              </div>
            )}

            {error && (
              <div className="p-3 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-xs font-medium">
                {error}
              </div>
            )}

          {/* 1. Người nợ (Cho phép đổi nếu chọn nhầm) */}
          {debtors.length > 1 ? (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                Thuộc về người nợ
              </label>
              <div className="relative">
                <select
                  value={selectedDebtorId}
                  onChange={(e) => setSelectedDebtorId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-slate-900 font-medium transition-colors text-sm"
                >
                  {debtors.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} (Pass: {d.pin})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : currentDebtorObj ? (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-slate-500" />
                <span className="text-xs font-semibold text-slate-600">Người nợ:</span>
                <span className="text-xs font-bold text-slate-900">{currentDebtorObj.name}</span>
              </div>
              <span className="text-[11px] font-mono font-semibold px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg">
                Pass: {currentDebtorObj.pin}
              </span>
            </div>
          ) : null}

          {/* 2. Phân Loại Giao Dịch */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
              Phân loại giao dịch <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                id="edit-btn-tx-type-add"
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
                id="edit-btn-tx-type-sub"
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

          {/* 3. Số Tiền tối ưu theo đơn vị nghìn */}
          <ThousandAmountInput
            id="edit-input-tx-amount"
            value={amount}
            onChange={(val) => {
              setAmount(val);
              setError('');
            }}
            label="Số tiền"
            required
            accentColor="emerald"
          />

          {/* 4. Nội Dung / Ghi Chú */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
              Ghi chú / Nội dung
            </label>
            <input
              type="text"
              id="edit-input-tx-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="VD: Cơm trưa, Cà phê, Vay nóng, Đã chuyển khoản..."
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20 focus:bg-white rounded-xl text-xs sm:text-sm text-slate-900 outline-none transition-colors"
            />
          </div>

          {/* 5. Ngày Ghi Nhận */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
              Ngày ghi nhận <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                type="date"
                id="edit-input-tx-date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 border border-slate-300 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20 focus:bg-white rounded-xl text-xs sm:text-sm text-slate-900 outline-none transition-colors"
              />
              <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* 6. Ảnh Chứng Từ / Hóa Đơn */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
              Ảnh hóa đơn / Chứng từ (Tùy chọn)
            </label>

            {/* Hidden file input: native picker handles both Camera and Photo Library */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/*"
              onChange={handleImageUpload}
              onClick={(e) => {
                (e.target as HTMLInputElement).value = '';
              }}
              className="sr-only"
              tabIndex={-1}
            />

            {isUploadingImage ? (
              <div className="border border-emerald-200/90 bg-white rounded-2xl overflow-hidden shadow-2xs">
                <KineticScanBar tone="emerald" />
                <div className="flex items-center justify-between gap-3 px-3.5 py-3 text-emerald-950 text-xs font-semibold">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <LedgerWaveBars size="sm" tone="emerald" />
                    <span className="truncate">Đang tối ưu & tải ảnh hóa đơn...</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCancelUpload}
                    className="px-2.5 py-1 text-[11px] font-bold text-rose-600 bg-rose-50/60 hover:bg-rose-100 border border-rose-200 rounded-lg shrink-0 cursor-pointer transition-colors"
                  >
                    Hủy
                  </button>
                </div>
              </div>
            ) : billImage ? (
              <div className="flex items-center gap-3 p-3 bg-emerald-50/50 border border-emerald-200 rounded-2xl shadow-2xs">
                <img
                  src={billImage}
                  alt="Bill preview"
                  onError={(e) => {
                    const imgEl = e.currentTarget;
                    if (imgEl.dataset.retried) return;
                    const fallback = resolveBillImageFallback(imgEl.src);
                    if (fallback) {
                      imgEl.dataset.retried = '1';
                      imgEl.src = fallback;
                    }
                  }}
                  className="w-14 h-14 object-cover rounded-xl border border-emerald-200 bg-white shrink-0 shadow-2xs"
                />
                <div className="flex-1 min-w-0 text-xs text-slate-600">
                  <div className="font-bold text-slate-900 truncate">Ảnh hóa đơn đính kèm</div>
                  <div className="text-[11px] text-emerald-700 font-semibold mt-0.5">Đã lưu trữ chất lượng cao</div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors cursor-pointer"
                  >
                    Đổi ảnh
                  </button>
                  <button
                    type="button"
                    onClick={() => setBillImage(undefined)}
                    className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                    title="Xóa ảnh này"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-3 p-3.5 border-2 border-dashed border-slate-300 hover:border-emerald-500 hover:bg-emerald-50/40 rounded-2xl text-slate-700 hover:text-emerald-800 transition-all cursor-pointer bg-white shadow-2xs active:scale-[0.99] group"
              >
                <div className="w-9 h-9 rounded-xl bg-slate-100 group-hover:bg-emerald-100 flex items-center justify-center shrink-0 transition-colors">
                  <Upload className="w-4 h-4 text-slate-500 group-hover:text-emerald-700" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-slate-800 group-hover:text-emerald-900 truncate">
                    Tải ảnh hóa đơn / Chứng từ chuyển khoản
                  </div>
                  <div className="text-[11px] text-slate-400 group-hover:text-emerald-700/80 truncate">
                    Chụp trực tiếp từ máy ảnh hoặc chọn từ thư viện ảnh
                  </div>
                </div>
              </div>
            )}
          </div>

            </div>

            {/* Footer Actions - Cố định nút ở chân modal */}
            <div
              className="p-4 sm:p-5 bg-white border-t border-slate-100 flex items-center gap-3 shrink-0 select-none"
              style={{
                paddingBottom: 'max(calc(env(safe-area-inset-bottom, 0px) + 12px), 16px)',
              }}
            >
              <button
                type="button"
                id="btn-cancel-edit-tx"
                onClick={onClose}
                disabled={isSubmitting}
                className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 rounded-2xl text-sm font-bold transition-all cursor-pointer text-center disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                type="submit"
                id="btn-submit-edit-tx"
                disabled={isSubmitting}
                className="flex-[1.6] inline-flex items-center justify-center gap-2 py-3 px-5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-extrabold text-sm rounded-2xl shadow-md shadow-emerald-500/25 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
              >
                <Save className={`w-4 h-4 ${isSubmitting ? 'animate-spin' : ''}`} />
                <span>{isSubmitting ? 'Đang lưu...' : 'Lưu Thay Đổi'}</span>
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
