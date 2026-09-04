/**
 * ============================================================================
 * GHI CHÚ CHỈNH SỬA / CHANGELOG:
 * - Xóa số điện thoại người nợ: Bỏ trường SĐT trong form thêm nhanh con nợ khi chia hóa đơn.
 * - Loại bỏ hiển thị SĐT trong danh sách chọn người tham gia chia tiền và người trả hộ.
 * - Tinh gọn giao diện form thêm người mới: Chỉ gồm Tên, Pass tra cứu và Ghi chú.
 * ============================================================================
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Users,
  Sparkles,
  Calendar,
  Receipt,
  Rocket,
  UserPlus,
  Dices,
  Eye,
  EyeOff,
  Check,
} from 'lucide-react';
import { Debtor, PartySplit, Transaction } from '../types';
import { formatVND } from '../utils/vietqr';
import { generateRandomPin as createAlphanumericPin } from '../utils/pinGenerator';

interface SplitBillModalProps {
  isOpen: boolean;
  onClose: () => void;
  debtors: Debtor[];
  onConfirmSplit: (
    party: Omit<PartySplit, 'id' | 'createdAt'>,
    transactions: Omit<Transaction, 'id' | 'createdAt'>[]
  ) => Promise<void> | void;
  onUpdateSplit?: (
    partyId: string,
    party: Omit<PartySplit, 'id' | 'createdAt'>,
    transactions: Omit<Transaction, 'id' | 'createdAt'>[]
  ) => Promise<void> | void;
  initialParty?: PartySplit | null;
  onSaveDebtor?: (
    debtorData: Omit<Debtor, 'id' | 'createdAt' | 'updatedAt'>,
    editId?: string
  ) => Promise<Debtor | null>;
}

export const SplitBillModal: React.FC<SplitBillModalProps> = ({
  isOpen,
  onClose,
  debtors,
  onConfirmSplit,
  onUpdateSplit,
  initialParty,
  onSaveDebtor,
}) => {
  const [name, setName] = useState('Đi ăn Lẩu Bò');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [totalAmountInput, setTotalAmountInput] = useState('1200000');
  const [peopleCountInput, setPeopleCountInput] = useState('4');
  const [payerType, setPayerType] = useState<'ME' | 'DEBTOR'>('ME');
  const [payerDebtorId, setPayerDebtorId] = useState<string>('');
  const [selectedDebtorIds, setSelectedDebtorIds] = useState<string[]>([]);
  const [billImage, setBillImage] = useState<string | undefined>(undefined);
  const [error, setError] = useState('');

  // Comprehensive Add Debtor form (matching standard AddDebtorModal)
  const [showAddDebtorForm, setShowAddDebtorForm] = useState(false);
  const [newDebtorName, setNewDebtorName] = useState('');
  const [newDebtorPin, setNewDebtorPin] = useState('');
  const [newDebtorNote, setNewDebtorNote] = useState('');
  const [showNewPin, setShowNewPin] = useState(true);
  const [isAddingDebtor, setIsAddingDebtor] = useState(false);
  const [addDebtorError, setAddDebtorError] = useState('');

  const prevIsOpenRef = useRef(false);

  useEffect(() => {
    const isOpening = isOpen && !prevIsOpenRef.current;
    if (isOpening) {
      if (initialParty) {
        setName(initialParty.name || '');
        setDate(initialParty.date || new Date().toISOString().split('T')[0]);
        setTotalAmountInput(String(initialParty.totalAmount || ''));
        const participantCount = (initialParty.participantDebtorIds?.length || 0) + (initialParty.includeMe ? 1 : 0);
        setPeopleCountInput(String(participantCount || 2));
        setPayerType(initialParty.payerType || 'ME');
        setSelectedDebtorIds(initialParty.participantDebtorIds || []);
        setPayerDebtorId(initialParty.payerDebtorId || (debtors.length > 0 ? debtors[0].id : ''));
        setBillImage(initialParty.billImage);
      } else {
        setName('');
        setDate(new Date().toISOString().split('T')[0]);
        setTotalAmountInput('');
        setPeopleCountInput('2');
        setPayerType('ME');
        // Do not auto-select arbitrary debtors
        setSelectedDebtorIds([]);
        setPayerDebtorId(debtors.length > 0 ? debtors[0].id : '');
        setBillImage(undefined);
      }
      setError('');
      setShowAddDebtorForm(false);
      resetNewDebtorForm();
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, debtors, initialParty]);

  const resetNewDebtorForm = () => {
    setNewDebtorName('');
    setNewDebtorNote('');
    const existingPins = debtors.map((d) => d.pin);
    setNewDebtorPin(createAlphanumericPin(existingPins, 4));
    setAddDebtorError('');
    setShowNewPin(true);
  };

  const handleGenerateNewPin = () => {
    const existingPins = debtors.map((d) => d.pin);
    setNewDebtorPin(createAlphanumericPin(existingPins, 4));
  };

  const handleToggleAddDebtor = () => {
    if (!showAddDebtorForm) {
      resetNewDebtorForm();
    }
    setShowAddDebtorForm(!showAddDebtorForm);
  };

  const handleSaveNewDebtor = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!newDebtorName.trim()) {
      setAddDebtorError('Vui lòng nhập tên người nợ / bạn bè');
      return;
    }
    const cleanPin = newDebtorPin.trim();
    if (!cleanPin || cleanPin.length < 2) {
      setAddDebtorError('Mật khẩu (Pass) phải có ít nhất 2 ký tự (chữ hoặc số)');
      return;
    }
    // Check duplicate PIN (case-insensitive)
    if (debtors.some((d) => d.pin.toLowerCase().trim() === cleanPin.toLowerCase().trim())) {
      setAddDebtorError('Mật khẩu này đã được dùng cho người khác. Hãy bấm "Ngẫu nhiên" để lấy mã khác!');
      return;
    }

    if (!onSaveDebtor) return;

    setIsAddingDebtor(true);
    setAddDebtorError('');

    try {
      const created = await onSaveDebtor({
        name: newDebtorName.trim(),
        pin: cleanPin,
        note: newDebtorNote.trim() || undefined,
      });

      if (created && created.id) {
        if (payerType === 'ME') {
          // Add to selected list
          setSelectedDebtorIds((prev) => [...prev, created.id]);
        } else {
          // Set as payer
          setPayerDebtorId(created.id);
        }
        setShowAddDebtorForm(false);
        resetNewDebtorForm();
      }
    } catch {
      setAddDebtorError('Không thể tạo người mới. Vui lòng thử lại.');
    } finally {
      setIsAddingDebtor(false);
    }
  };

  if (!isOpen) return null;

  const totalAmount = parseInt(totalAmountInput.replace(/\D/g, '') || '0', 10);
  const numberOfPeople = Math.max(1, parseInt(peopleCountInput.replace(/\D/g, '') || '1', 10));
  const rawPerPerson = numberOfPeople > 0 ? totalAmount / numberOfPeople : 0;
  const splitAmountPerPerson = Math.round(rawPerPerson / 1000) * 1000;

  const handleToggleDebtor = (id: string) => {
    if (selectedDebtorIds.includes(id)) {
      setSelectedDebtorIds(selectedDebtorIds.filter((item) => item !== id));
    } else {
      setSelectedDebtorIds([...selectedDebtorIds, id]);
    }
  };

  const handleSelectAll = () => {
    setSelectedDebtorIds(debtors.map((d) => d.id));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (loadEvt) => {
        setBillImage(loadEvt.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Vui lòng nhập tên cuộc vui (ví dụ: Đi ăn Lẩu Bò)');
      return;
    }
    if (totalAmount <= 0) {
      setError('Vui lòng nhập tổng tiền hóa đơn hợp lệ');
      return;
    }
    if (numberOfPeople <= 0) {
      setError('Vui lòng nhập số người tham gia (ít nhất 1 người)');
      return;
    }

    if (payerType === 'ME' && selectedDebtorIds.length === 0) {
      setError('Vui lòng chọn ít nhất 1 người nợ bạn trong danh sách');
      return;
    }

    if (payerType === 'DEBTOR' && !payerDebtorId) {
      setError('Vui lòng chọn người đã đứng ra thanh toán thay');
      return;
    }

    const generatedTransactions: Omit<Transaction, 'id' | 'createdAt'>[] = [];
    const partyData: Omit<PartySplit, 'id' | 'createdAt'> = {
      name: name.trim(),
      date,
      totalAmount,
      payerType,
      ...(payerType === 'DEBTOR' && payerDebtorId ? { payerDebtorId } : {}),
      participantDebtorIds: payerType === 'ME' ? selectedDebtorIds : [payerDebtorId],
      includeMe: true,
      splitAmountPerPerson,
      ...(billImage ? { billImage } : {}),
    };

    if (payerType === 'ME') {
      // "Người nợ tôi": Each selected debtor owes Me (+)
      selectedDebtorIds.forEach((debtorId) => {
        generatedTransactions.push({
          debtorId,
          type: 'ADD',
          amount: splitAmountPerPerson,
          date,
          note: `Chia tiền cuộc ăn chơi: ${name.trim()} (${numberOfPeople} người chia)`,
          category: 'PARTY_SPLIT',
          ...(billImage ? { billImage } : {}),
        });
      });
    } else {
      // "Tôi nợ họ": Debtor paid upfront -> I owe debtor my share (-)
      const payerObj = debtors.find((d) => d.id === payerDebtorId);
      const payerName = payerObj?.name || 'Người này';

      generatedTransactions.push({
        debtorId: payerDebtorId,
        type: 'SUB',
        amount: splitAmountPerPerson,
        date,
        note: `${payerName} trả tiền cuộc vui: ${name.trim()} (Phần tiền của Tôi: ${formatVND(
          splitAmountPerPerson
        )})`,
        category: 'PARTY_SPLIT',
        ...(billImage ? { billImage } : {}),
      });
    }

    try {
      if (initialParty && onUpdateSplit) {
        await onUpdateSplit(initialParty.id, partyData, generatedTransactions);
      } else {
        await onConfirmSplit(partyData, generatedTransactions);
      }
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Có lỗi xảy ra khi lưu cuộc chia tiền');
    }
  };

  const payerDebtor = debtors.find((d) => d.id === payerDebtorId);

  const renderAddDebtorForm = () => (
    <div className="p-3.5 bg-blue-50/80 border border-blue-200 rounded-2xl space-y-3 animate-in fade-in">
      <div className="flex items-center justify-between text-xs">
        <span className="font-bold text-blue-900 uppercase flex items-center gap-1.5">
          <UserPlus className="w-4 h-4 text-blue-600" />
          Thêm Người Mới &amp; Cấp Pass:
        </span>
        <button
          type="button"
          onClick={() => setShowAddDebtorForm(false)}
          className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {addDebtorError && (
        <div className="p-2.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-xs font-medium">
          {addDebtorError}
        </div>
      )}

      <div className="space-y-2.5">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Tên người nợ / Bạn bè <span className="text-red-500">(*)</span>:
          </label>
          <input
            type="text"
            value={newDebtorName}
            onChange={(e) => setNewDebtorName(e.target.value)}
            placeholder="VD: Nguyễn Văn Nam, Bạn Linh..."
            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-semibold text-slate-700">
              Mật khẩu tra cứu (Pass) <span className="text-red-500">(*)</span>:
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
              value={newDebtorPin}
              onChange={(e) => setNewDebtorPin(e.target.value)}
              placeholder="VD: 7k9a..."
              className="w-full pl-3 pr-8 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 tracking-wider transition-all"
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
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Ghi chú cá nhân (tùy chọn):
          </label>
          <input
            type="text"
            value={newDebtorNote}
            onChange={(e) => setNewDebtorNote(e.target.value)}
            placeholder="Bạn cấp 3 / Đồng nghiệp..."
            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
          />
        </div>
      </div>

      <p className="text-[11px] text-slate-500 leading-tight">
        Bạn cấp mật khẩu này cho người đó để họ tự vào tra cứu sao kê riêng (hỗ trợ cả chữ và số).
      </p>

      <div className="flex justify-end gap-2 pt-1 border-t border-blue-100">
        <button
          type="button"
          onClick={() => setShowAddDebtorForm(false)}
          className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800 font-semibold cursor-pointer"
        >
          Hủy
        </button>
        <button
          type="button"
          onClick={handleSaveNewDebtor}
          disabled={isAddingDebtor || !newDebtorName.trim()}
          className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl text-xs font-bold shadow-2xs transition-colors disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
        >
          {isAddingDebtor ? 'Đang thêm...' : 'Lưu Người Này & Chọn Ngay'}
        </button>
      </div>
    </div>
  );

  return (
    <div
      id="split-bill-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-150"
    >
      <div
        id="split-bill-modal-card"
        className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150 max-h-[92vh] flex flex-col"
      >
        {/* Unified Premium Dark Header */}
        <div className="bg-slate-900 text-white px-5 sm:px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-amber-600 flex items-center justify-center text-white shrink-0 shadow-xs">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-sm sm:text-base tracking-wide uppercase leading-tight truncate">
                {initialParty ? 'Chỉnh Sửa Cuộc Vui Chia Tiền' : 'Chia Tiền Cuộc Ăn Chơi'}
              </h2>
              <p className="text-xs text-slate-300 truncate mt-0.5">
                {initialParty
                  ? 'Cập nhật thông tin & tự động tính toán lại phần chia'
                  : 'Nhập số người chia & chọn người nợ tôi hoặc tôi nợ họ'}
              </p>
            </div>
          </div>
          <button
            id="close-split-bill-btn"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer shrink-0"
            title="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form
          onSubmit={handleSubmit}
          className="p-4 sm:p-6 space-y-4 text-slate-800 text-sm overflow-y-auto flex-1"
        >
          {error && (
            <div className="p-3 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-xs font-semibold">
              {error}
            </div>
          )}

          <div>
            <label className="block font-semibold mb-1 text-slate-700 text-xs uppercase tracking-wider">
              Tên cuộc vui <span className="text-red-500">(*)</span>:
            </label>
            <input
              id="input-party-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Đi ăn Lẩu Bò / Cà phê cuối tuần / Du lịch..."
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium text-slate-900 transition-all text-sm"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold mb-1 text-slate-700 text-xs uppercase tracking-wider">
                Ngày thực hiện:
              </label>
              <div className="relative">
                <input
                  id="input-party-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium text-slate-900 transition-all text-sm"
                />
                <Calendar className="w-4 h-4 text-slate-400 absolute right-3.5 top-3 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="block font-semibold mb-1 text-slate-700 text-xs uppercase tracking-wider">
                Tổng tiền hóa đơn (VNĐ) <span className="text-red-500">(*)</span>:
              </label>
              <input
                id="input-party-total"
                type="text"
                value={totalAmountInput}
                onChange={(e) => setTotalAmountInput(e.target.value.replace(/\D/g, ''))}
                placeholder="1,200,000"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-bold text-slate-900 transition-all text-sm"
              />
            </div>
          </div>

          {/* SỐ NGƯỜI CHIA TIỀN */}
          <div className="p-3.5 bg-amber-50/80 border border-amber-200 rounded-2xl space-y-2">
            <div className="flex items-center justify-between">
              <label
                htmlFor="input-party-people-count"
                className="font-bold text-xs uppercase tracking-wider text-amber-950 flex items-center gap-1.5"
              >
                <Users className="w-4 h-4 text-amber-700" />
                <span>Số Người Tham Gia Chia Tiền (*):</span>
              </label>
              <span className="text-[11px] text-amber-800 font-medium">
                (Tự động chia đều cho mỗi người)
              </span>
            </div>

            <div className="flex items-center gap-3">
              <input
                id="input-party-people-count"
                type="number"
                min="1"
                max="999"
                value={peopleCountInput}
                onChange={(e) => setPeopleCountInput(e.target.value)}
                className="w-28 px-3.5 py-2.5 bg-white border border-amber-300 rounded-xl text-center text-lg font-bold font-mono text-amber-950 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-2xs"
              />
              <div className="flex-1 text-xs text-amber-900 leading-snug">
                <span className="text-slate-500">Mỗi người chịu 1 phần:</span>{' '}
                <strong className="text-base text-amber-950 block font-mono">
                  {formatVND(splitAmountPerPerson)}
                </strong>
              </div>
            </div>
          </div>

          {/* CHIỀU NỢ: NGƯỜI NỢ TÔI HOẶC TÔI NỢ HỌ */}
          <div className="space-y-2">
            <label className="block font-semibold text-slate-700 text-xs uppercase tracking-wider">
              Chọn Hướng Ghi Nợ:
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setPayerType('ME')}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  payerType === 'ME'
                    ? 'bg-emerald-50 border-emerald-500 text-emerald-950 ring-2 ring-emerald-500/20 shadow-xs'
                    : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-xs uppercase tracking-wide">
                    👑 Người nợ tôi
                  </span>
                  {payerType === 'ME' && <Check className="w-4 h-4 text-emerald-600" />}
                </div>
                <p className="text-[11px] text-slate-500 leading-tight">
                  Tôi đã trả tiền toàn bộ hóa đơn. Các bạn nợ tôi.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setPayerType('DEBTOR')}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  payerType === 'DEBTOR'
                    ? 'bg-rose-50 border-rose-500 text-rose-950 ring-2 ring-rose-500/20 shadow-xs'
                    : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-xs uppercase tracking-wide">
                    🤝 Tôi nợ họ
                  </span>
                  {payerType === 'DEBTOR' && <Check className="w-4 h-4 text-rose-600" />}
                </div>
                <p className="text-[11px] text-slate-500 leading-tight">
                  Bạn bè đã trả thay cho tôi. Tôi nợ bạn 1 phần.
                </p>
              </button>
            </div>
          </div>

          {/* TRƯỜNG HỢP 1: NGƯỜI NỢ TÔI */}
          {payerType === 'ME' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="font-semibold text-slate-700 text-xs uppercase tracking-wider">
                  Chọn Người Nợ Tôi ({selectedDebtorIds.length} người được chọn):
                </label>
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="text-amber-700 hover:text-amber-900 font-semibold cursor-pointer"
                  >
                    Chọn tất cả
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={() => setSelectedDebtorIds([])}
                    className="text-slate-500 hover:text-slate-700 font-medium cursor-pointer"
                  >
                    Bỏ chọn
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={handleToggleAddDebtor}
                    className="text-blue-600 hover:text-blue-800 font-bold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>{showAddDebtorForm ? 'Đóng' : '+ Thêm người mới'}</span>
                  </button>
                </div>
              </div>

              {/* Unified Add Debtor Box */}
              {showAddDebtorForm && renderAddDebtorForm()}

              {/* Debtors List */}
              <div className="space-y-1.5 max-h-44 overflow-y-auto p-2 bg-slate-50 border border-slate-200 rounded-2xl">
                {debtors.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-400">
                    Chưa có ai trong sổ. Hãy bấm "+ Thêm người mới" ở trên để thêm bạn bè!
                  </div>
                ) : (
                  debtors.map((d) => {
                    const isSelected = selectedDebtorIds.includes(d.id);
                    return (
                      <label
                        key={d.id}
                        className={`flex items-center justify-between p-2.5 rounded-xl transition-all cursor-pointer border ${
                          isSelected
                            ? 'bg-emerald-50/70 border-emerald-300 shadow-2xs'
                            : 'hover:bg-white border-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleDebtor(d.id)}
                            className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 accent-emerald-600 shrink-0"
                          />
                          <div className="truncate">
                            <span className="font-bold text-xs text-slate-900 block truncate">
                              {d.name}
                            </span>
                            <span className="text-[11px] text-slate-400 font-mono">
                              Pass: {d.pin}
                            </span>
                          </div>
                        </div>
                        <span className="text-xs font-bold text-emerald-700 shrink-0 font-mono">
                          +{formatVND(splitAmountPerPerson)}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* TRƯỜNG HỢP 2: TÔI NỢ HỌ */}
          {payerType === 'DEBTOR' && (
            <div className="space-y-2 p-3.5 bg-rose-50/60 border border-rose-200 rounded-2xl">
              <div className="flex items-center justify-between gap-2">
                <label className="block font-bold text-xs text-rose-950 uppercase tracking-wider">
                  Chọn Người Bạn Đã Thanh Toán Thay (*):
                </label>
                <button
                  type="button"
                  onClick={handleToggleAddDebtor}
                  className="text-blue-600 hover:text-blue-800 font-bold text-xs inline-flex items-center gap-1 cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>{showAddDebtorForm ? 'Đóng' : '+ Thêm người mới'}</span>
                </button>
              </div>

              {/* Unified Add Debtor Box when in "Tôi nợ họ" */}
              {showAddDebtorForm && renderAddDebtorForm()}

              <select
                value={payerDebtorId}
                onChange={(e) => setPayerDebtorId(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white border border-rose-300 rounded-xl text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500"
              >
                {debtors.length === 0 ? (
                  <option value="">-- Sổ chưa có ai, bấm "+ Thêm người mới" --</option>
                ) : (
                  debtors.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} - Pass: {d.pin}
                    </option>
                  ))
                )}
              </select>

              <div className="p-3 bg-white rounded-xl border border-rose-200 text-xs text-rose-900 space-y-1">
                <div className="font-bold flex items-center gap-1">
                  <span>💡 Ghi nhận nợ tự động:</span>
                </div>
                <p>
                  Bạn sẽ nợ <strong>{payerDebtor?.name || 'người này'}</strong> đúng 1 phần tiền của bạn:
                </p>
                <p className="text-base font-bold font-mono text-rose-600">
                  -{formatVND(splitAmountPerPerson)}
                </p>
              </div>
            </div>
          )}

          {/* Hộp tóm tắt tính toán */}
          <div className="p-4 bg-slate-900 text-slate-100 rounded-2xl space-y-2 text-xs border border-slate-800">
            <div className="flex items-center gap-1.5 font-bold text-amber-400 text-sm">
              <Sparkles className="w-4 h-4" />
              <span>KẾT QUẢ PHÂN CHIA HÓA ĐƠN:</span>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800">
              <div>
                <span className="text-slate-400">• Số người chia:</span>{' '}
                <strong className="text-white text-sm font-mono">{numberOfPeople} người</strong>
              </div>
              <div>
                <span className="text-slate-400">• Tiền mỗi phần:</span>{' '}
                <strong className="text-amber-300 text-sm font-mono">
                  {formatVND(splitAmountPerPerson)}
                </strong>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800/80 text-slate-300 text-[11px] leading-relaxed">
              {payerType === 'ME' ? (
                <>
                  <span className="text-emerald-400 font-semibold">• Sẽ ghi nhận nợ (+): </span>
                  {selectedDebtorIds.length > 0 ? (
                    selectedDebtorIds
                      .map((id) => {
                        const deb = debtors.find((d) => d.id === id);
                        return `${deb?.name || id} (+${formatVND(splitAmountPerPerson)})`;
                      })
                      .join(', ')
                  ) : (
                    <span className="italic text-slate-400">Chưa chọn ai</span>
                  )}
                </>
              ) : (
                <>
                  <span className="text-rose-400 font-semibold">• Tôi nợ (-): </span>
                  <span>
                    Ghi nhận Tôi nợ <strong>{payerDebtor?.name || 'người này'}</strong>{' '}
                    <strong className="text-rose-400">-{formatVND(splitAmountPerPerson)}</strong>.
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Ảnh hóa đơn đính kèm */}
          <div className="p-3 bg-slate-50 rounded-2xl border border-dashed border-slate-300 text-xs">
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                <Receipt className="w-3.5 h-3.5 text-amber-600" />
                Ảnh chụp hóa đơn bàn ăn (tùy chọn)
              </span>
              {billImage && (
                <button
                  type="button"
                  onClick={() => setBillImage(undefined)}
                  className="text-red-600 hover:underline cursor-pointer"
                >
                  Xóa ảnh
                </button>
              )}
            </div>
            {billImage ? (
              <img
                src={billImage}
                alt="Receipt"
                className="w-full max-h-32 object-contain rounded-xl border border-slate-200 bg-white mt-1"
              />
            ) : (
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="text-xs text-slate-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-amber-100 file:text-amber-800 hover:file:bg-amber-200 cursor-pointer"
              />
            )}
          </div>

          {/* Action Buttons */}
          <div className="pt-3 sm:pt-4 border-t border-slate-100 flex items-center justify-end gap-2.5 shrink-0">
            <button
              type="button"
              id="btn-cancel-split"
              onClick={onClose}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              id="btn-confirm-split"
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-bold rounded-xl text-xs sm:text-sm shadow-xs transition-colors cursor-pointer"
            >
              <Rocket className="w-4 h-4" />
              <span>{initialParty ? 'Lưu Thay Đổi' : 'Xác Nhận Chia Tiền'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
