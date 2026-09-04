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
import {
  X,
  PlusCircle,
  MinusCircle,
  Calendar,
  Receipt,
  Upload,
  Save,
  UserPlus,
  Users,
  Dices,
  Eye,
  EyeOff,
  Trash2,
} from 'lucide-react';
import { Debtor, Transaction, TransactionType } from '../types';
import { generateRandomPin as createAlphanumericPin } from '../utils/pinGenerator';

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
  const [amountInput, setAmountInput] = useState('100000');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [note, setNote] = useState('');
  const [billImage, setBillImage] = useState<string | undefined>(undefined);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      setAmountInput('100000');
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

  if (!isOpen) return null;

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setError('Kích thước ảnh không vượt quá 5MB');
        return;
      }
      const reader = new FileReader();
      reader.onload = (loadEvt) => {
        setBillImage(loadEvt.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleQuickAmount = (val: number) => {
    setAmountInput(val.toString());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    let targetDebtorId = debtorId;

    // If in CREATE_NEW mode, create debtor first
    if (debtorMode === 'CREATE_NEW') {
      if (!newName.trim()) {
        setError('Vui lòng nhập tên con nợ');
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

      setIsSubmitting(true);
      try {
        if (onSaveDebtor) {
          const created = await onSaveDebtor({
            name: newName.trim(),
            pin: cleanPass,
            note: newNote.trim() || undefined,
          });

          if (created && created.id) {
            targetDebtorId = created.id;
          } else {
            setError('Không thể tạo con nợ. Vui lòng thử lại.');
            setIsSubmitting(false);
            return;
          }
        } else {
          setError('Hệ thống chưa hỗ trợ tạo con nợ tại đây');
          setIsSubmitting(false);
          return;
        }
      } catch {
        setError('Lỗi kết nối khi tạo con nợ mới.');
        setIsSubmitting(false);
        return;
      }
    }

    if (!targetDebtorId) {
      setError('Vui lòng chọn hoặc nhập con nợ');
      setIsSubmitting(false);
      return;
    }

    const numAmount = parseInt(amountInput.replace(/\D/g, ''), 10);
    if (!numAmount || numAmount <= 0) {
      setError('Vui lòng nhập số tiền hợp lệ (> 0)');
      setIsSubmitting(false);
      return;
    }
    if (!date) {
      setError('Vui lòng chọn ngày giao dịch');
      setIsSubmitting(false);
      return;
    }

    try {
      const payload: Omit<Transaction, 'id' | 'createdAt'> = {
        debtorId: targetDebtorId,
        type,
        amount: numAmount,
        date,
        note: note.trim(),
        category: 'SINGLE',
        ...(billImage ? { billImage } : {}),
      };
      await onSave(payload);
      setIsSubmitting(false);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Có lỗi xảy ra khi lưu giao dịch');
      setIsSubmitting(false);
    }
  };

  const formattedDisplay = amountInput
    ? new Intl.NumberFormat('vi-VN').format(parseInt(amountInput.replace(/\D/g, '') || '0', 10))
    : '0';

  return (
    <div
      id="add-transaction-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-150"
    >
      <div
        id="add-transaction-modal-card"
        className="bg-white w-full max-w-lg rounded-2xl sm:rounded-3xl shadow-xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150 max-h-[92vh] flex flex-col"
      >
        {/* Unified Premium Dark Header */}
        <div className="bg-slate-900 text-white px-5 sm:px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shrink-0 shadow-xs">
              <PlusCircle className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-sm sm:text-base tracking-wide uppercase leading-tight truncate">
                Tạo Giao Dịch Mới
              </h2>
              <p className="text-xs text-slate-300 truncate mt-0.5">
                Ghi nợ mới hoặc ghi nhận thanh toán tiền nợ
              </p>
            </div>
          </div>
          <button
            id="close-add-transaction-btn"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer shrink-0"
            title="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Content */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 text-slate-800 text-sm overflow-y-auto flex-1">
          {error && (
            <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-lg text-xs font-medium">
              {error}
            </div>
          )}

          {/* Người nợ: Tùy biến chọn có sẵn hoặc tạo ngay tại chỗ */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-slate-700">
                Con nợ <span className="text-red-500">(*)</span>:
              </label>

              <div className="inline-flex p-0.5 bg-slate-100 rounded-lg border border-slate-200 text-xs">
                <button
                  type="button"
                  id="btn-switch-select-debtor"
                  onClick={() => setDebtorMode('SELECT')}
                  disabled={debtors.length === 0}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-semibold transition-all ${
                    debtorMode === 'SELECT'
                      ? 'bg-white text-blue-700 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800 disabled:opacity-40'
                  }`}
                >
                  <Users className="w-3 h-3" />
                  <span>Con nợ cũ ({debtors.length})</span>
                </button>
                <button
                  type="button"
                  id="btn-switch-create-debtor"
                  onClick={() => setDebtorMode('CREATE_NEW')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-semibold transition-all ${
                    debtorMode === 'CREATE_NEW'
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <UserPlus className="w-3 h-3" />
                  <span>Con nợ mới</span>
                </button>
              </div>
            </div>

            {debtorMode === 'SELECT' ? (
              debtors.length > 0 ? (
                <select
                  id="select-tx-debtor"
                  value={debtorId}
                  onChange={(e) => setDebtorId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-900 transition-all"
                >
                  {debtors.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} - (Pass: {d.pin})
                    </option>
                  ))}
                </select>
              ) : (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center justify-between">
                  <span>Chưa có người nào trong sổ. Hãy thêm người mới ngay:</span>
                  <button
                    type="button"
                    onClick={() => setDebtorMode('CREATE_NEW')}
                    className="font-bold text-blue-600 underline"
                  >
                    Thêm ngay
                  </button>
                </div>
              )
            ) : (
              <div className="p-3.5 bg-blue-50/80 border border-blue-200 rounded-2xl space-y-3 animate-in fade-in">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-blue-900 uppercase flex items-center gap-1.5">
                    <UserPlus className="w-3.5 h-3.5 text-blue-600" />
                    Thêm Người Con Nợ:
                  </span>
                  {debtors.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setDebtorMode('SELECT')}
                      className="text-blue-600 hover:text-blue-800 font-semibold cursor-pointer"
                    >
                      ← Quay lại chọn người có sẵn
                    </button>
                  )}
                </div>

                <div className="space-y-2.5">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Tên con nợ<span className="text-red-500">(*)</span>:
                    </label>
                    <input
                      type="text"
                      id="input-inline-debtor-name"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="VD: Nguyễn Văn Nam, Bạn Linh..."
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-medium text-slate-700">
                        Mật khẩu tra cứu <span className="text-red-500">(*)</span>:
                      </label>
                      <button
                        type="button"
                        onClick={handleGenerateNewPin}
                        className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <Dices className="w-3 h-3" />
                        <span>Ngẫu nhiên</span>
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type={showNewPin ? 'text' : 'password'}
                        id="input-inline-debtor-pin"
                        value={newPin}
                        onChange={(e) => setNewPin(e.target.value)}
                        placeholder="VD: 7k9a..."
                        className="w-full pl-3 pr-8 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 tracking-wider"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPin(!showNewPin)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        {showNewPin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Ghi chú:
                    </label>
                    <input
                      type="text"
                      id="input-inline-debtor-note"
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      placeholder="Bạn cấp 3 / Đồng nghiệp..."
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 leading-tight">
                  Bạn cấp mật khẩu này cho con nợ đó để họ tự vào tra cứu sao kê riêng (hỗ trợ cả chữ và số).
                </p>
              </div>
            )}
          </div>

          {/* Loại giao dịch */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
              Loại biến động <span className="text-rose-500">*</span>
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
                    (+) Ghi nợ thêm
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">Họ vay hoặc bạn chi hộ</div>
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
                    (-) Trả nợ / Giảm
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">Họ trả hoặc chi hộ bạn</div>
                </div>
              </button>
            </div>
          </div>

          {/* Số tiền */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                Số tiền (VNĐ) <span className="text-rose-500">*</span>
              </label>
              <span className="text-xs font-bold font-mono text-blue-600">{formattedDisplay} đ</span>
            </div>
            <div className="relative">
              <input
                id="input-tx-amount"
                type="text"
                inputMode="numeric"
                value={amountInput ? Number(amountInput.replace(/\D/g, '')).toLocaleString('vi-VN') : ''}
                onChange={(e) => setAmountInput(e.target.value.replace(/\D/g, ''))}
                placeholder="Nhập số tiền..."
                className="w-full pl-3.5 pr-14 py-2.5 bg-slate-50 border border-slate-300 focus:border-blue-600 focus:bg-white rounded-xl text-base font-bold font-mono text-slate-900 outline-none transition-colors"
                autoFocus
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                VNĐ
              </span>
            </div>
            {/* Quick amounts */}
            <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
              <span className="text-[11px] text-slate-400 font-medium">Cộng nhanh:</span>
              {[50000, 100000, 200000, 500000, 1000000].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handleQuickAmount(preset)}
                  className="px-2 py-1 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 font-medium rounded-lg text-[11px] transition-colors cursor-pointer"
                >
                  +{preset >= 1000000 ? `${preset / 1000000}Tr` : `${preset / 1000}k`}
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
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 focus:border-blue-600 focus:bg-white rounded-xl text-xs sm:text-sm text-slate-900 outline-none transition-colors"
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
                className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 border border-slate-300 focus:border-blue-600 focus:bg-white rounded-xl text-xs sm:text-sm text-slate-900 outline-none transition-colors"
              />
              <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* Tùy chọn ảnh bill đối soát */}
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

          {/* Footer */}
          <div className="pt-3 sm:pt-4 border-t border-slate-100 flex items-center justify-end gap-2.5 shrink-0">
            <button
              type="button"
              id="btn-cancel-transaction"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              id="btn-save-transaction"
              disabled={isSubmitting}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold rounded-xl text-xs sm:text-sm shadow-xs transition-colors cursor-pointer flex items-center gap-2"
            >
              <Save className={`w-4 h-4 ${isSubmitting ? 'animate-spin' : ''}`} />
              <span>{isSubmitting ? 'Đang lưu...' : 'Tạo Giao Dịch'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
