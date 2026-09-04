import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { Debtor, Transaction, TransactionType } from '../types';
import { formatVND } from '../utils/vietqr';

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
  const [amountInput, setAmountInput] = useState('');
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [billImage, setBillImage] = useState<string | undefined>(undefined);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen && transaction) {
      setSelectedDebtorId(transaction.debtorId || debtor?.id || '');
      setType(transaction.type);
      setAmountInput(String(transaction.amount || ''));
      setDate(transaction.date || new Date().toISOString().split('T')[0]);
      setNote(transaction.note || '');
      setBillImage(transaction.billImage);
      setError('');
      setIsSubmitting(false);
    }
  }, [isOpen, transaction, debtor]);

  if (!isOpen || !transaction) return null;

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setError('Kích thước ảnh không được vượt quá 5MB');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setBillImage(reader.result as string);
        setError('');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value.replace(/\D/g, '');
    setAmountInput(rawVal);
    setError('');
  };

  const handleQuickAddAmount = (addAmount: number) => {
    const current = Number(amountInput) || 0;
    setAmountInput(String(current + addAmount));
  };

  const handleQuickSetAmount = (setVal: number) => {
    setAmountInput(String(setVal));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = Number(amountInput);
    if (!numAmount || numAmount <= 0) {
      setError('Vui lòng nhập số tiền lớn hơn 0');
      return;
    }

    if (!date) {
      setError('Vui lòng chọn ngày ghi nhận');
      return;
    }

    setIsSubmitting(true);
    try {
      const updated: Transaction = {
        ...transaction,
        debtorId: selectedDebtorId || transaction.debtorId,
        type,
        amount: numAmount,
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
      setError(err?.message || 'Có lỗi xảy ra khi lưu giao dịch');
    } finally {
      setIsSubmitting(false);
    }
  };

  const numericAmount = Number(amountInput) || 0;
  const currentDebtorObj = debtors.find((d) => d.id === selectedDebtorId) || debtor;

  return (
    <div
      id="edit-transaction-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150"
    >
      <div
        id="edit-transaction-modal-card"
        className="bg-white w-full max-w-lg rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150 max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Unified Premium Dark Header */}
        <div className="bg-slate-900 text-white px-5 sm:px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shrink-0 shadow-xs">
              <Pencil className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-sm sm:text-base tracking-wide uppercase leading-tight truncate">
                Chỉnh Sửa Giao Dịch
              </h2>
              <p className="text-xs text-slate-300 truncate mt-0.5">
                {currentDebtorObj ? (
                  <>
                    Người nợ: <span className="font-semibold text-emerald-300">{currentDebtorObj.name}</span>
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
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-900 font-medium transition-colors text-sm"
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

          {/* 2. Loại Biến Động (Đồng bộ chuẩn (+) Rose nợ thêm / (-) Emerald trả bớt) */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
              Loại biến động <span className="text-rose-500">*</span>
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
                    (+) Ghi nợ thêm
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">Họ vay hoặc bạn chi hộ</div>
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
                    (-) Trả nợ / Giảm
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">Họ trả hoặc chi hộ bạn</div>
                </div>
              </button>
            </div>
          </div>

          {/* 3. Số Tiền */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                Số tiền (VNĐ) <span className="text-rose-500">*</span>
              </label>
              {numericAmount > 0 && (
                <span className="text-xs font-bold font-mono text-blue-600">
                  {formatVND(numericAmount)}
                </span>
              )}
            </div>

            <div className="relative">
              <input
                type="text"
                inputMode="numeric"
                id="edit-input-tx-amount"
                value={numericAmount > 0 ? numericAmount.toLocaleString('vi-VN') : ''}
                onChange={handleAmountChange}
                placeholder="Nhập số tiền..."
                className="w-full pl-3.5 pr-14 py-2.5 bg-slate-50 border border-slate-300 focus:border-blue-600 focus:bg-white rounded-xl text-base font-bold font-mono text-slate-900 outline-none transition-colors"
                autoFocus
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                VNĐ
              </span>
            </div>

            {/* Quick chips (Cộng nhanh & Đặt nhanh) */}
            <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
              <span className="text-[11px] text-slate-400 font-medium">Cộng nhanh:</span>
              {[50000, 100000, 200000, 500000, 1000000].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => handleQuickAddAmount(amt)}
                  className="px-2 py-1 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 font-medium rounded-lg text-[11px] transition-colors cursor-pointer"
                >
                  +{amt >= 1000000 ? `${amt / 1000000}Tr` : `${amt / 1000}k`}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setAmountInput('')}
                className="px-2 py-1 text-slate-400 hover:text-rose-600 text-[11px] font-medium transition-colors cursor-pointer ml-auto"
              >
                Xóa
              </button>
            </div>
          </div>

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
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 focus:border-blue-600 focus:bg-white rounded-xl text-xs sm:text-sm text-slate-900 outline-none transition-colors"
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
                className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 border border-slate-300 focus:border-blue-600 focus:bg-white rounded-xl text-xs sm:text-sm text-slate-900 outline-none transition-colors"
              />
              <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* 6. Ảnh Chứng Từ / Hóa Đơn */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
              Ảnh hóa đơn / Chứng từ (Tùy chọn)
            </label>
            {billImage ? (
              <div className="flex items-center gap-3 p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                <img
                  src={billImage}
                  alt="Bill preview"
                  className="w-14 h-14 object-cover rounded-lg border border-slate-200"
                />
                <div className="flex-1 min-w-0 text-xs text-slate-600">
                  <div className="font-semibold text-slate-800 truncate">Ảnh đính kèm</div>
                  <div className="text-[11px] text-slate-400">Đã lưu cùng giao dịch này</div>
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
              <label className="flex items-center justify-center gap-2 p-3.5 border border-dashed border-slate-300 hover:border-blue-500 hover:bg-blue-50/40 rounded-xl text-slate-600 hover:text-blue-700 transition-colors cursor-pointer text-xs font-medium">
                <Upload className="w-4 h-4 text-slate-400" />
                <span>Tải ảnh hóa đơn / chuyển khoản</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </label>
            )}
          </div>

          {/* Footer Actions */}
          <div className="pt-3 sm:pt-4 border-t border-slate-100 flex items-center justify-end gap-2.5 shrink-0">
            <button
              type="button"
              id="btn-cancel-edit-tx"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              id="btn-submit-edit-tx"
              disabled={isSubmitting}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl text-xs sm:text-sm font-bold shadow-xs transition-colors cursor-pointer flex items-center gap-2"
            >
              <Save className={`w-4 h-4 ${isSubmitting ? 'animate-spin' : ''}`} />
              <span>{isSubmitting ? 'Đang lưu...' : 'Lưu Thay Đổi'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
