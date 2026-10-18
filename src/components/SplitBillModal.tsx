/**
 * ============================================================================
 * GHI CHÚ CHỈNH SỬA / CHANGELOG:
 * - Xóa số điện thoại người nợ: Bỏ trường SĐT trong form thêm nhanh con nợ khi chia hóa đơn.
 * - Loại bỏ hiển thị SĐT trong danh sách chọn người tham gia chia tiền và người trả hộ.
 * - Tinh gọn giao diện form thêm người mới: Chỉ gồm Tên, Pass tra cứu và Ghi chú.
 * ============================================================================
 */

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
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
  User,
  KeyRound,
  FileText,
  Upload,
  Trash2,
} from 'lucide-react';
import { Debtor, PartySplit, Transaction, AppSettings } from '../types';
import { formatVND } from '../utils/vietqr';
import { generateRandomPin as createAlphanumericPin } from '../utils/pinGenerator';
import { ThousandAmountInput } from './ThousandAmountInput';
import { compressImageFile } from '../utils/imageCompressor';
import { cleanStorageIfQuotaBloated } from '../utils/storage';

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
  settings?: AppSettings;
}

export const SplitBillModal: React.FC<SplitBillModalProps> = ({
  isOpen,
  onClose,
  debtors,
  onConfirmSplit,
  onUpdateSplit,
  initialParty,
  onSaveDebtor,
  settings,
}) => {
  const [name, setName] = useState('Đi ăn Lẩu Bò');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [totalAmount, setTotalAmount] = useState<number>(1200000);
  const [peopleCountInput, setPeopleCountInput] = useState('4');
  const [payerType, setPayerType] = useState<'ME' | 'DEBTOR' | 'DEBTOR_ASSIGNED'>('ME');
  const [payerDebtorId, setPayerDebtorId] = useState<string>('');
  const [selectedDebtorIds, setSelectedDebtorIds] = useState<string[]>([]);
  const [includeMe, setIncludeMe] = useState(true);
  const [payerIncluded, setPayerIncluded] = useState(true);
  const [billImage, setBillImage] = useState<string | undefined>(undefined);
  const [noteInput, setNoteInput] = useState('');
  const [error, setError] = useState('');

  // Comprehensive Add Debtor form (matching standard AddDebtorModal)
  const [showAddDebtorForm, setShowAddDebtorForm] = useState(false);
  const [newDebtorName, setNewDebtorName] = useState('');
  const [newDebtorPin, setNewDebtorPin] = useState('');
  const [newDebtorNote, setNewDebtorNote] = useState('');
  const [showNewPin, setShowNewPin] = useState(true);
  const [isAddingDebtor, setIsAddingDebtor] = useState(false);
  const [addDebtorError, setAddDebtorError] = useState('');
  const [newlyCreatedDebtorIds, setNewlyCreatedDebtorIds] = useState<string[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);
  const isAddingDebtorRef = useRef(false);

  const prevIsOpenRef = useRef(false);

  useEffect(() => {
    const isOpening = isOpen && !prevIsOpenRef.current;
    if (isOpening) {
      if (initialParty) {
        setName(initialParty.name || '');
        setDate(initialParty.date || new Date().toISOString().split('T')[0]);
        setTotalAmount(initialParty.totalAmount || 0);
        // Correctly restore participant count (prioritize totalPeopleCount, then derived from total/split, fallback to participantDebtorIds + includeMe)
        let participantCount = initialParty.totalPeopleCount;
        if (!participantCount && initialParty.totalAmount > 0 && initialParty.splitAmountPerPerson > 0) {
          const derived = Math.round(initialParty.totalAmount / initialParty.splitAmountPerPerson);
          if (derived > 0) participantCount = derived;
        }
        if (!participantCount) {
          participantCount = (initialParty.participantDebtorIds?.length || 0) + (initialParty.includeMe ? 1 : 0);
        }
        setPeopleCountInput(String(participantCount || 2));
        setPayerType(initialParty.payerType || 'ME');
        setIncludeMe(initialParty.includeMe !== false);
        setPayerIncluded(initialParty.payerIncluded !== false);
        setSelectedDebtorIds(initialParty.participantDebtorIds || []);
        setPayerDebtorId(initialParty.payerDebtorId || (debtors.length > 0 ? debtors[0].id : ''));
        setBillImage(initialParty.billImage);
        setNoteInput(initialParty.note || '');
      } else {
        setName('');
        setDate(new Date().toISOString().split('T')[0]);
        setTotalAmount(0);
        setPeopleCountInput('2');
        setPayerType('ME');
        setIncludeMe(true);
        setPayerIncluded(true);
        // Do not auto-select arbitrary debtors
        setSelectedDebtorIds([]);
        setPayerDebtorId(debtors.length > 0 ? debtors[0].id : '');
        setBillImage(undefined);
        setNoteInput('');
      }
      setError('');
      setShowAddDebtorForm(false);
      setNewlyCreatedDebtorIds([]);
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
    if (isAddingDebtorRef.current) return;

    if (!newDebtorName.trim()) {
      setAddDebtorError('Vui lòng nhập tên người nợ / bạn bè');
      return;
    }
    const cleanPin = newDebtorPin.trim();
    if (!cleanPin || cleanPin.length < 2) {
      setAddDebtorError('Mật khẩu phải có ít nhất 2 ký tự (chữ hoặc số)');
      return;
    }
    // Check duplicate PIN (case-insensitive)
    if (debtors.some((d) => d.pin.toLowerCase().trim() === cleanPin.toLowerCase().trim())) {
      setAddDebtorError('Mật khẩu này đã được dùng cho người khác. Hãy bấm "Ngẫu nhiên" để lấy mã khác!');
      return;
    }

    if (!onSaveDebtor) return;

    isAddingDebtorRef.current = true;
    setIsAddingDebtor(true);
    setAddDebtorError('');

    try {
      const created = await onSaveDebtor({
        name: newDebtorName.trim(),
        pin: cleanPin,
        note: newDebtorNote.trim() || undefined,
      });

      if (created && created.id) {
        setNewlyCreatedDebtorIds((prev) => [...prev, created.id]);
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
      isAddingDebtorRef.current = false;
      setIsAddingDebtor(false);
    }
  };

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

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 15 * 1024 * 1024) {
        setError('Kích thước ảnh không vượt quá 15MB');
        return;
      }
      try {
        setError('');
        const compressedBase64 = await compressImageFile(file, 1200, 1200, 0.75);
        setBillImage(compressedBase64);
      } catch (err) {
        console.error('Image compression failed:', err);
        setError('Không thể xử lý hình ảnh này. Vui lòng chọn ảnh khác.');
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingRef.current) return;

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

    if (payerType === 'DEBTOR_ASSIGNED') {
      if (!payerDebtorId) {
        setError('Vui lòng chọn người đã đứng ra thanh toán thay');
        return;
      }
      const otherSelected = selectedDebtorIds.filter((id) => id !== payerDebtorId);
      if (otherSelected.length === 0) {
        setError('Vui lòng chọn ít nhất 1 người cùng tham gia nợ bạn (hoặc bỏ tích "Gán nợ cho tôi" nếu bạn chỉ nợ người đó 1 phần)');
        return;
      }
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setError('');

    const targetPartyId = initialParty?.id || `party-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const trimmedCustomNote = noteInput.trim();
    const partyData: PartySplit = {
      id: targetPartyId,
      name: name.trim(),
      date,
      totalAmount,
      payerType,
      ...(payerType !== 'ME' && payerDebtorId ? { payerDebtorId } : {}),
      participantDebtorIds:
        payerType === 'DEBTOR'
          ? [payerDebtorId]
          : payerType === 'DEBTOR_ASSIGNED'
          ? selectedDebtorIds.filter((id) => id !== payerDebtorId)
          : selectedDebtorIds,
      includeMe,
      payerIncluded: payerType === 'DEBTOR_ASSIGNED' ? payerIncluded : true,
      splitAmountPerPerson,
      totalPeopleCount: numberOfPeople,
      ...(billImage ? { billImage } : {}),
      ...(trimmedCustomNote ? { note: trimmedCustomNote } : {}),
      createdAt: initialParty?.createdAt || new Date().toISOString(),
    };

    const ownerDisplayName = settings?.ownerName || 'Tôi (Chủ sổ)';
    const participantNames: string[] = [];
    if (includeMe) {
      participantNames.push(ownerDisplayName);
    }
    if (payerType === 'ME') {
      selectedDebtorIds.forEach((id) => {
        const d = debtors.find((deb) => deb.id === id);
        if (d && !participantNames.includes(d.name)) participantNames.push(d.name);
      });
    } else if (payerType === 'DEBTOR') {
      const p = debtors.find((deb) => deb.id === payerDebtorId);
      if (p && !participantNames.includes(p.name)) participantNames.push(p.name);
    } else {
      // DEBTOR_ASSIGNED: Họ trả & gán nợ cho Tôi
      const p = debtors.find((deb) => deb.id === payerDebtorId);
      if (p && payerIncluded && !participantNames.includes(p.name)) participantNames.push(p.name);
      selectedDebtorIds
        .filter((id) => id !== payerDebtorId)
        .forEach((id) => {
          const d = debtors.find((deb) => deb.id === id);
          if (d && !participantNames.includes(d.name)) participantNames.push(d.name);
        });
    }
    // Tuyệt đối không sinh tên giả lập ("Bạn 1", "Bạn 2"...) khi số người chia lớn hơn số người biết tên

    const payerName = payerType === 'ME'
      ? ownerDisplayName
      : (debtors.find((deb) => deb.id === payerDebtorId)?.name || 'Người này');

    const generatedTransactions: Transaction[] = [];
    if (payerType === 'ME') {
      // "Người nợ tôi": Each selected debtor owes Me (+)
      selectedDebtorIds.forEach((debtorId) => {
        const baseNote = `Ăn Chia: ${name.trim()} (Tổng bill: ${formatVND(totalAmount)} chia ${numberOfPeople} người)`;
        generatedTransactions.push({
          id: `tx-party-${targetPartyId}-${debtorId}`,
          partyId: targetPartyId,
          debtorId,
          type: 'ADD',
          amount: splitAmountPerPerson,
          date,
          note: trimmedCustomNote ? `${baseNote} - ${trimmedCustomNote}` : baseNote,
          category: 'PARTY_SPLIT',
          partyTotalAmount: totalAmount,
          partySplitAmount: splitAmountPerPerson,
          partyTotalPeople: numberOfPeople,
          partyParticipants: participantNames,
          partyPayerName: payerName,
          partyName: name.trim(),
          ...(trimmedCustomNote ? { customNote: trimmedCustomNote } : {}),
          ...(billImage ? { billImage } : {}),
          createdAt: new Date().toISOString(),
        });
      });
    } else if (payerType === 'DEBTOR') {
      // "Tôi nợ họ": Debtor paid upfront -> I owe debtor my share (-)
      const baseNote = `${payerName} trả tiền cuộc vui: ${name.trim()} (Tổng bill: ${formatVND(totalAmount)} chia ${numberOfPeople} người, phần của Tôi: ${formatVND(splitAmountPerPerson)})`;
      generatedTransactions.push({
        id: `tx-party-${targetPartyId}-${payerDebtorId}`,
        partyId: targetPartyId,
        debtorId: payerDebtorId,
        type: 'SUB',
        amount: splitAmountPerPerson,
        date,
        note: trimmedCustomNote ? `${baseNote} - ${trimmedCustomNote}` : baseNote,
        category: 'PARTY_SPLIT',
        partyTotalAmount: totalAmount,
        partySplitAmount: splitAmountPerPerson,
        partyTotalPeople: numberOfPeople,
        partyParticipants: participantNames,
        partyPayerName: payerName,
        partyName: name.trim(),
        ...(trimmedCustomNote ? { customNote: trimmedCustomNote } : {}),
        ...(billImage ? { billImage } : {}),
        createdAt: new Date().toISOString(),
      });
    } else {
      // "DEBTOR_ASSIGNED": Họ trả bill & gán nợ cho Tôi
      // 1. Tôi nợ người trả tiền (Nam) số tiền họ đã thanh toán thay cho nhóm
      const payerUpfrontAmount = payerIncluded
        ? Math.max(0, totalAmount - splitAmountPerPerson)
        : totalAmount;

      const payerBaseNote = `${payerName} trả bill & gán nợ: ${name.trim()} (Tổng bill: ${formatVND(totalAmount)} chia ${numberOfPeople} người, ứng hộ: ${formatVND(payerUpfrontAmount)})`;
      generatedTransactions.push({
        id: `tx-party-${targetPartyId}-payer-${payerDebtorId}`,
        partyId: targetPartyId,
        debtorId: payerDebtorId,
        type: 'SUB',
        amount: payerUpfrontAmount,
        date,
        note: trimmedCustomNote ? `${payerBaseNote} - ${trimmedCustomNote}` : payerBaseNote,
        category: 'PARTY_SPLIT',
        partyTotalAmount: totalAmount,
        partySplitAmount: splitAmountPerPerson,
        partyTotalPeople: numberOfPeople,
        partyParticipants: participantNames,
        partyPayerName: payerName,
        partyName: name.trim(),
        ...(trimmedCustomNote ? { customNote: trimmedCustomNote } : {}),
        ...(billImage ? { billImage } : {}),
        createdAt: new Date().toISOString(),
      });

      // 2. Từng người bạn được chọn nợ Tôi 1 phần để Tôi đi thu
      selectedDebtorIds
        .filter((debtorId) => debtorId !== payerDebtorId)
        .forEach((debtorId) => {
        const friendBaseNote = `Ăn Chia (gán nợ từ ${payerName}): ${name.trim()} (Tổng bill: ${formatVND(totalAmount)} chia ${numberOfPeople} người)`;
        generatedTransactions.push({
          id: `tx-party-${targetPartyId}-${debtorId}`,
          partyId: targetPartyId,
          debtorId,
          type: 'ADD',
          amount: splitAmountPerPerson,
          date,
          note: trimmedCustomNote ? `${friendBaseNote} - ${trimmedCustomNote}` : friendBaseNote,
          category: 'PARTY_SPLIT',
          partyTotalAmount: totalAmount,
          partySplitAmount: splitAmountPerPerson,
          partyTotalPeople: numberOfPeople,
          partyParticipants: participantNames,
          partyPayerName: payerName,
          partyName: name.trim(),
          ...(trimmedCustomNote ? { customNote: trimmedCustomNote } : {}),
          ...(billImage ? { billImage } : {}),
          createdAt: new Date().toISOString(),
        });
      });
    }

    try {
      if (initialParty && onUpdateSplit) {
        await onUpdateSplit(targetPartyId, partyData, generatedTransactions);
      } else {
        await onConfirmSplit(partyData, generatedTransactions);
      }
      onClose();
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('exceeded')) {
        cleanStorageIfQuotaBloated();
        setError('Bộ nhớ tạm đã đầy và hệ thống đã tự động dọn dẹp. Bạn hãy thử bấm Tạo / Cập Nhật lại lần nữa nhé!');
      } else {
        setError(msg || 'Có lỗi xảy ra khi lưu cuộc chia tiền');
      }
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const payerDebtor = debtors.find((d) => d.id === payerDebtorId);

  const renderAddDebtorForm = () => (
    <div className="p-3.5 sm:p-4 bg-amber-50/70 border border-amber-200/90 rounded-2xl space-y-3 animate-in fade-in shadow-2xs">
      <div className="flex items-center justify-between text-xs">
        <span className="font-bold text-slate-900 uppercase flex items-center gap-1.5 tracking-wider">
          <UserPlus className="w-4 h-4 text-amber-600" />
          Thêm Danh Bạ Mới:
        </span>
        <button
          type="button"
          onClick={() => setShowAddDebtorForm(false)}
          className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
          title="Đóng form thêm người"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {addDebtorError && (
        <div className="p-2.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-xs font-semibold">
          {addDebtorError}
        </div>
      )}

      <div className="space-y-2.5">
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-amber-600" />
            <span>Tên</span>
            <span className="text-rose-500 font-bold">*</span>
          </label>
          <div className="relative flex items-center bg-white rounded-xl border border-slate-200/90 shadow-2xs hover:border-slate-300 focus-within:border-amber-500 focus-within:ring-4 focus-within:ring-amber-500/10 transition-all">
            <input
              type="text"
              value={newDebtorName}
              onChange={(e) => setNewDebtorName(e.target.value)}
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
              <KeyRound className="w-3.5 h-3.5 text-amber-600" />
              <span>Mật Khẩu</span>
              <span className="text-rose-500 font-bold">*</span>
            </label>
            <button
              type="button"
              onClick={handleGenerateNewPin}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white hover:bg-amber-50 active:scale-95 text-amber-700 font-bold text-[11px] rounded-lg border border-amber-200 transition-all cursor-pointer shadow-2xs"
              title="Tạo ngẫu nhiên mật khẩu dễ nhớ"
            >
              <Dices className="w-3.5 h-3.5 text-amber-600" />
              <span>Ngẫu nhiên</span>
            </button>
          </div>
          <div className="relative flex items-center bg-white rounded-xl border border-slate-200/90 shadow-2xs hover:border-slate-300 focus-within:border-amber-500 focus-within:ring-4 focus-within:ring-amber-500/10 transition-all">
            <input
              type={showNewPin ? 'text' : 'password'}
              value={newDebtorPin}
              onChange={(e) => setNewDebtorPin(e.target.value)}
              placeholder="Ví dụ: nam123 hoặc 1234"
              className="w-full pl-3.5 pr-10 py-2.5 bg-transparent font-mono font-bold tracking-wider text-slate-900 placeholder:text-slate-400 text-xs sm:text-sm outline-none"
            />
            <button
              type="button"
              onClick={() => setShowNewPin(!showNewPin)}
              className="absolute right-2.5 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              title={showNewPin ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
            >
              {showNewPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4 text-amber-600" />}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-slate-400" />
            <span>Ghi Chú</span>
            <span className="text-slate-400 font-normal">(Tùy chọn)</span>
          </label>
          <div className="relative flex items-center bg-white rounded-xl border border-slate-200/90 shadow-2xs hover:border-slate-300 focus-within:border-amber-500 focus-within:ring-4 focus-within:ring-amber-500/10 transition-all">
            <input
              type="text"
              value={newDebtorNote}
              onChange={(e) => setNewDebtorNote(e.target.value)}
              placeholder="Bạn cấp 3 / Đồng nghiệp / Nhóm đá banh..."
              className="w-full px-3.5 py-2.5 bg-transparent text-slate-900 font-medium placeholder:text-slate-400 text-xs sm:text-sm outline-none"
            />
          </div>
        </div>
      </div>

      <div className="flex items-start gap-2 p-2.5 bg-white/90 rounded-xl border border-amber-100 text-[11px] text-amber-800 font-medium">
        <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
        <span>Mật khẩu riêng để người này tự đăng nhập và xem sao kê.</span>
      </div>

      <div className="flex items-center justify-end gap-2 pt-1 border-t border-amber-200/60">
        <button
          type="button"
          onClick={() => setShowAddDebtorForm(false)}
          className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 font-semibold cursor-pointer whitespace-nowrap"
        >
          Hủy
        </button>
        <button
          type="button"
          onClick={handleSaveNewDebtor}
          disabled={isAddingDebtor || !newDebtorName.trim()}
          className="px-3.5 py-1.5 bg-gradient-to-r from-amber-600 to-teal-600 hover:from-amber-700 hover:to-teal-700 active:from-amber-800 active:to-teal-800 text-white rounded-xl text-xs font-bold shadow-2xs transition-all disabled:opacity-50 flex items-center gap-1.5 cursor-pointer shrink-0"
        >
          <Check className="w-3.5 h-3.5" />
          <span>{isAddingDebtor ? 'Đang thêm...' : 'Lưu & Chọn Ngay'}</span>
        </button>
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(
        <AnimatePresence>
          {isOpen && (
            <div
              id="split-bill-modal-backdrop"
              onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
              }}
              className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-md p-0 sm:p-4 overflow-y-auto overflow-x-hidden overscroll-contain"
            >
              <motion.div
                id="split-bill-modal-card"
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
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-100 flex items-center justify-center text-amber-600 shrink-0 shadow-xs">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="font-extrabold text-base sm:text-lg tracking-tight text-slate-900 leading-tight truncate">
                    {initialParty ? 'Chỉnh Sửa Cuộc Vui Chia Tiền' : 'Chia Tiền Cuộc Ăn Chơi'}
                  </h2>
                  <p className="text-xs text-slate-500 font-medium truncate mt-0.5">
                    {initialParty
                      ? 'Cập nhật thông tin & tự động tính toán lại phần chia'
                      : 'Nhập số người chia & tự động tính toán lại phần chia'}
                  </p>
                </div>
              </div>
              <button
                id="close-split-bill-btn"
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-all cursor-pointer shrink-0"
                title="Đóng"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <form
              onSubmit={handleSubmit}
              className="flex flex-col flex-1 min-h-0 overflow-hidden bg-slate-50/40"
            >
              <div className="p-5 sm:p-6 space-y-4 text-slate-800 text-sm overflow-y-auto overflow-x-hidden flex-1 overscroll-contain">
                {error && (
                  <div className="p-3.5 bg-rose-50 border border-rose-200/80 text-rose-700 rounded-2xl text-xs font-semibold">
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

          <div className="space-y-3">
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

            {/* Tổng tiền hóa đơn tối ưu theo đơn vị nghìn */}
            <ThousandAmountInput
              id="input-party-total"
              value={totalAmount}
              onChange={(val) => {
                setTotalAmount(val);
                setError('');
              }}
              label="Tổng tiền hóa đơn"
              required
              accentColor="amber"
              placeholder="VD: 500k, 1200k, 1.5tr..."
            />
          </div>

          {/* SỐ NGƯỜI CHIA TIỀN */}
          <div className="p-3.5 bg-amber-50/80 border border-amber-200 rounded-2xl space-y-2">
            <div className="flex items-center justify-between gap-1 flex-wrap sm:flex-nowrap">
              <label
                htmlFor="input-party-people-count"
                className="font-bold text-xs uppercase tracking-wider text-amber-950 flex items-center gap-1.5 shrink-0"
              >
                <Users className="w-4 h-4 text-amber-700 shrink-0" />
                <span>Số Người Chia Tiền (*):</span>
              </label>
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
                <strong className="text-base text-amber-950 block font-mono">
                  {formatVND(splitAmountPerPerson)}
                </strong>
              </div>
            </div>
          </div>

          {/* CHIỀU NỢ: TÔI ĐÃ THANH TOÁN HOẶC BẠN BÈ ĐÃ THANH TOÁN (GÁN NỢ TÍCH HỢP) */}
          <div className="space-y-2">
            <label className="block font-semibold text-slate-700 text-xs uppercase tracking-wider">
              Người Thanh Toán:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-2.5">
              <button
                type="button"
                onClick={() => setPayerType('ME')}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  payerType === 'ME'
                    ? 'bg-amber-50 border-amber-500 text-amber-950 ring-2 ring-amber-500/20 shadow-xs'
                    : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-xs uppercase tracking-wide">
                    👑 Tôi đã thanh toán
                  </span>
                  {payerType === 'ME' && <Check className="w-4 h-4 text-amber-600" />}
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (payerType === 'ME') {
                    setPayerType('DEBTOR');
                  }
                }}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  payerType !== 'ME'
                    ? 'bg-rose-50 border-rose-500 text-rose-950 ring-2 ring-rose-500/20 shadow-xs'
                    : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-xs uppercase tracking-wide">
                    🤝 Bạn bè đã thanh toán
                  </span>
                  {payerType !== 'ME' && <Check className="w-4 h-4 text-rose-600" />}
                </div>
              </button>
            </div>
          </div>

          {/* TRƯỜNG HỢP 1: NGƯỜI NỢ TÔI */}
          {payerType === 'ME' && (
            <div className="space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2">
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <label className="font-bold text-slate-800 text-xs uppercase tracking-wider truncate">
                    Người nợ tôi ({selectedDebtorIds.length}/{debtors.length})
                  </label>
                  <button
                    type="button"
                    onClick={handleToggleAddDebtor}
                    className="sm:hidden text-amber-800 hover:text-amber-950 bg-amber-100/90 hover:bg-amber-200 px-2.5 py-1 rounded-lg border border-amber-300 font-bold text-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 shadow-2xs"
                  >
                    <UserPlus className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>{showAddDebtorForm ? 'Đóng' : 'Thêm mới'}</span>
                  </button>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-2 text-xs">
                  <div className="flex items-center gap-1.5 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={handleSelectAll}
                      className="text-amber-700 hover:text-amber-900 font-semibold cursor-pointer whitespace-nowrap px-1.5 py-0.5 rounded hover:bg-amber-50 active:bg-amber-100"
                    >
                      Chọn tất cả
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={() => setSelectedDebtorIds([])}
                      className="text-slate-500 hover:text-slate-700 font-medium cursor-pointer whitespace-nowrap px-1.5 py-0.5 rounded hover:bg-slate-100 active:bg-slate-200"
                    >
                      Bỏ chọn
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleToggleAddDebtor}
                    className="hidden sm:inline-flex text-amber-800 hover:text-amber-950 bg-amber-100/90 hover:bg-amber-200 px-2.5 py-1 rounded-lg border border-amber-300 font-bold text-xs items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 shadow-2xs"
                  >
                    <UserPlus className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>{showAddDebtorForm ? 'Đóng' : 'Thêm người mới'}</span>
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
                    const isNewlyCreated = newlyCreatedDebtorIds.includes(d.id);
                    return (
                      <label
                        key={d.id}
                        className={`flex items-center justify-between p-2.5 rounded-xl transition-all cursor-pointer border ${
                          isNewlyCreated
                            ? 'bg-amber-100/80 border-amber-400 ring-1 ring-amber-300/80 shadow-2xs'
                            : isSelected
                            ? 'bg-amber-50/90 border-amber-300 shadow-2xs'
                            : 'hover:bg-white border-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleDebtor(d.id)}
                            className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 accent-amber-600 shrink-0"
                          />
                          <div className="truncate">
                            <div className="flex items-center gap-1.5 truncate">
                              <span
                                className={`text-xs block truncate ${
                                  isNewlyCreated
                                    ? 'font-black text-amber-900'
                                    : isSelected
                                    ? 'font-bold text-amber-950'
                                    : 'font-semibold text-slate-800'
                                }`}
                              >
                                {d.name}
                              </span>
                              {isNewlyCreated && (
                                <span className="px-1.5 py-0.5 rounded-md bg-gradient-to-r from-amber-500 to-orange-500 text-white font-extrabold text-[10px] leading-none shrink-0 shadow-2xs whitespace-nowrap">
                                  Người mới
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-slate-400 font-mono">
                              Pass: {d.pin}
                            </span>
                          </div>
                        </div>
                        <span className="text-xs font-bold text-amber-700 shrink-0 font-mono">
                          +{formatVND(splitAmountPerPerson)}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* TRƯỜNG HỢP: BẠN BÈ ĐÃ THANH TOÁN (Tôi nợ họ, tích hợp tùy chọn Gán nợ trực tiếp - Không chia mục riêng) */}
          {payerType !== 'ME' && (
            <div className="space-y-3 p-3.5 sm:p-4 bg-rose-50/60 border border-rose-200 rounded-2xl">
              {/* 1. Chọn người đã đứng ra thanh toán */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="block font-bold text-xs text-rose-950 uppercase tracking-wider truncate">
                    1. Người thanh toán (*):
                  </label>
                  <button
                    type="button"
                    onClick={handleToggleAddDebtor}
                    className="text-amber-800 hover:text-amber-950 bg-amber-100/90 hover:bg-amber-200 px-2.5 py-1 rounded-lg border border-amber-300 font-bold text-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 shadow-2xs"
                  >
                    <UserPlus className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>{showAddDebtorForm ? 'Đóng' : 'Thêm mới'}</span>
                  </button>
                </div>

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
              </div>

              {/* Tóm tắt nợ tự động khi chỉ nợ người đó 1 phần */}
              {payerType === 'DEBTOR' && (
                <div className="p-3 bg-white rounded-xl border border-rose-200 text-xs text-rose-900 space-y-1">
                  <div className="font-bold flex items-center gap-1">
                    <span>💡 Ghi nhận nợ (chia {numberOfPeople}):</span>
                  </div>
                  <p className="text-base font-bold font-mono text-rose-600">
                    -{formatVND(splitAmountPerPerson)}
                  </p>
                </div>
              )}

              {/* Tùy chọn Gán nợ trực tiếp - TỐI ƯU KHÔNG CHIA LÀM MỤC RIÊNG */}
              <div className="pt-2 border-t border-rose-200/70 space-y-2.5">
                <label className="flex items-start gap-2.5 p-3 bg-white rounded-xl border border-rose-300/80 hover:border-purple-300 cursor-pointer select-none transition-all shadow-2xs">
                  <input
                    type="checkbox"
                    checked={payerType === 'DEBTOR_ASSIGNED'}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setPayerType('DEBTOR_ASSIGNED');
                      } else {
                        setPayerType('DEBTOR');
                      }
                    }}
                    className="w-4 h-4 mt-0.5 rounded text-purple-600 focus:ring-purple-500 accent-purple-600 shrink-0"
                  />
                  <div className="text-xs">
                    <span className="font-bold text-slate-900 flex items-center gap-1.5">
                      <span className="text-purple-700">⚡ Họ nhờ tôi thu hộ từ các bạn khác (Gán nợ cho tôi)</span>
                    </span>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                      Tích vào đây nếu người thanh toán nhờ bạn đi thu tiền các bạn khác. Bạn nợ người trả tiền khoản ứng hộ, và các bạn được chọn sẽ nợ bạn.
                    </p>
                  </div>
                </label>

                {/* Khi bật Gán nợ: Mở rộng danh sách chọn các bạn cùng tham gia */}
                {payerType === 'DEBTOR_ASSIGNED' && (
                  <div className="space-y-3 pt-2 pl-2 border-l-2 border-purple-300">
                    {/* Tùy chọn người trả tiền có tham gia ăn chia không */}
                    <label className="flex items-center gap-2.5 p-2.5 bg-white rounded-xl border border-purple-200/80 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={payerIncluded}
                        onChange={(e) => setPayerIncluded(e.target.checked)}
                        className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 accent-purple-600 shrink-0"
                      />
                      <span className="text-xs text-slate-700 font-medium">
                        {payerDebtor?.name || 'Người thanh toán'} <strong>có tham gia</strong> ăn chia (tự chịu 1 phần của họ)
                      </span>
                    </label>

                    {/* Danh sách các bạn cùng tham gia nợ Tôi */}
                    <div className="space-y-2">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2">
                        <label className="font-bold text-purple-950 text-xs uppercase tracking-wider truncate">
                          2. Chọn các bạn cùng tham gia nợ Tôi ({selectedDebtorIds.filter((id) => id !== payerDebtorId).length}):
                        </label>
                        <div className="flex items-center gap-1.5 text-xs whitespace-nowrap self-end sm:self-auto">
                          <button
                            type="button"
                            onClick={() => setSelectedDebtorIds(debtors.filter((d) => d.id !== payerDebtorId).map((d) => d.id))}
                            className="text-purple-700 hover:text-purple-900 font-semibold cursor-pointer px-1.5 py-0.5 rounded hover:bg-purple-100"
                          >
                            Chọn tất cả
                          </button>
                          <span className="text-purple-300">|</span>
                          <button
                            type="button"
                            onClick={() => setSelectedDebtorIds([])}
                            className="text-slate-500 hover:text-slate-700 font-medium cursor-pointer px-1.5 py-0.5 rounded hover:bg-slate-100"
                          >
                            Bỏ chọn
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1.5 max-h-44 overflow-y-auto p-2 bg-white border border-purple-200 rounded-xl">
                        {debtors.filter((d) => d.id !== payerDebtorId).length === 0 ? (
                          <div className="p-3 text-center text-xs text-slate-400">
                            Chưa có bạn bè khác trong sổ. Hãy bấm "+ Thêm mới" ở trên để thêm người!
                          </div>
                        ) : (
                          debtors
                            .filter((d) => d.id !== payerDebtorId)
                            .map((d) => {
                              const isSelected = selectedDebtorIds.includes(d.id);
                              return (
                                <label
                                  key={d.id}
                                  className={`flex items-center justify-between p-2 rounded-lg transition-all cursor-pointer border ${
                                    isSelected
                                      ? 'bg-purple-50/90 border-purple-300 shadow-2xs'
                                      : 'hover:bg-slate-50 border-transparent'
                                  }`}
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => handleToggleDebtor(d.id)}
                                      className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 accent-purple-600 shrink-0"
                                    />
                                    <span className="text-xs font-semibold text-slate-800 truncate">
                                      {d.name}
                                    </span>
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

                    {/* Tóm tắt dòng tiền gán nợ */}
                    {(() => {
                      const payerUpfront = payerIncluded
                        ? Math.max(0, totalAmount - splitAmountPerPerson)
                        : totalAmount;
                      const totalCollectFromFriends = selectedDebtorIds.filter((id) => id !== payerDebtorId).length * splitAmountPerPerson;
                      return (
                        <div className="p-3 bg-white rounded-xl border border-purple-200 text-xs space-y-1.5">
                          <div className="font-bold text-purple-950 flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                            <span>Cơ chế gán nợ tự động:</span>
                          </div>
                          <div className="text-[11px] space-y-1 text-slate-700">
                            <p>
                              • Tôi nợ <strong>{payerDebtor?.name || 'Người thanh toán'}</strong>:{' '}
                              <strong className="text-rose-600 font-mono">-{formatVND(payerUpfront)}</strong>
                            </p>
                            <p>
                              • Các bạn nợ <strong>Tôi</strong>:{' '}
                              <strong className="text-emerald-700 font-mono">+{formatVND(totalCollectFromFriends)}</strong>{' '}
                              ({selectedDebtorIds.filter((id) => id !== payerDebtorId).length} người x {formatVND(splitAmountPerPerson)})
                            </p>
                            <p>
                              • Bản thân Tôi chịu: <strong className="text-slate-900 font-mono">{formatVND(splitAmountPerPerson)}</strong>
                            </p>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Hộp tóm tắt tính toán */}
          <div className="p-4 bg-amber-50/80 text-amber-950 rounded-2xl space-y-2 text-xs border border-amber-200/80 shadow-2xs">
            <div className="flex items-center gap-1.5 font-bold text-amber-900 text-sm">
              <Sparkles className="w-4 h-4 text-amber-600" />
              <span>KẾT QUẢ PHÂN CHIA HÓA ĐƠN:</span>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-amber-200/60">
              <div>
                <span className="text-slate-500">• Số người chia:</span>{' '}
                <strong className="text-slate-900 text-sm font-mono">{numberOfPeople} người</strong>
              </div>
              <div>
                <span className="text-slate-500">• Tiền mỗi phần:</span>{' '}
                <strong className="text-amber-800 text-sm font-mono">
                  {formatVND(splitAmountPerPerson)}
                </strong>
              </div>
            </div>

            <div className="pt-2 border-t border-amber-200/60 text-slate-700 text-[11px] leading-relaxed">
              {payerType === 'ME' ? (
                <>
                  <span className="text-amber-700 font-bold">• Sẽ ghi nhận nợ (+): </span>
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
              ) : payerType === 'DEBTOR' ? (
                <>
                  <span className="text-rose-700 font-bold">• Tôi nợ (-): </span>
                  <span>
                    Ghi nhận Tôi nợ <strong>{payerDebtor?.name || 'người này'}</strong>{' '}
                    <strong className="text-rose-600 font-mono">-{formatVND(splitAmountPerPerson)}</strong>.
                  </span>
                </>
              ) : (
                <>
                  <div className="space-y-1">
                    <div>
                      <span className="text-rose-700 font-bold">• Tôi nợ (-): </span>
                      <span>
                        Tôi nợ <strong>{payerDebtor?.name || 'Người thanh toán'}</strong>{' '}
                        <strong className="text-rose-600 font-mono">
                          -{formatVND(payerIncluded ? Math.max(0, totalAmount - splitAmountPerPerson) : totalAmount)}
                        </strong>
                      </span>
                    </div>
                    <div>
                      <span className="text-emerald-700 font-bold">• Các bạn nợ Tôi (+): </span>
                      {selectedDebtorIds.filter((id) => id !== payerDebtorId).length > 0 ? (
                        <span>
                          {selectedDebtorIds
                            .filter((id) => id !== payerDebtorId)
                            .map((id) => debtors.find((d) => d.id === id)?.name || id)
                            .join(', ')}{' '}
                          (<strong className="text-emerald-700 font-mono">+{formatVND(splitAmountPerPerson)}/người</strong>)
                        </span>
                      ) : (
                        <span className="italic text-slate-400">Chưa chọn bạn nào nợ tôi</span>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Ghi chú thêm (tùy chọn) */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Ghi chú thêm (không bắt buộc)
            </label>
            <input
              type="text"
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              placeholder="VD: Liên hoan cuối tuần, kèm tiền xe..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-hidden transition-all bg-white placeholder:text-slate-400"
            />
          </div>

          {/* Ảnh hóa đơn / Chứng từ (Tùy chọn) - Đồng nhất với form Ghi nợ */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
              Ảnh hóa đơn / Chứng từ (Tùy chọn)
            </label>
            {billImage ? (
              <div className="flex items-center gap-3 p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                <img
                  src={billImage}
                  alt="Bill preview"
                  className="w-14 h-14 object-cover rounded-lg border border-slate-200 shrink-0"
                />
                <div className="flex-1 min-w-0 text-xs text-slate-600">
                  <div className="font-semibold text-slate-800 truncate">Ảnh đính kèm cuộc vui</div>
                  <div className="text-[11px] text-slate-400">Đã lưu cùng cuộc ăn chia này</div>
                </div>
                <button
                  type="button"
                  onClick={() => setBillImage(undefined)}
                  className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1 shrink-0"
                  title="Xóa ảnh này"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Xóa ảnh</span>
                </button>
              </div>
            ) : (
              <label className="flex items-center justify-center gap-2 p-3.5 border border-dashed border-slate-300 hover:border-amber-500 hover:bg-amber-50/40 rounded-xl text-slate-600 hover:text-amber-800 transition-colors cursor-pointer text-xs font-medium">
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

            </div>

            {/* Sticky Action Footer */}
            <div
              className="p-4 sm:p-5 bg-white border-t border-slate-100 flex items-center gap-3 shrink-0 select-none"
              style={{
                paddingBottom: 'max(calc(env(safe-area-inset-bottom, 0px) + 12px), 16px)',
              }}
            >
              <button
                type="button"
                id="btn-cancel-split"
                onClick={onClose}
                disabled={isSubmitting}
                className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 rounded-2xl text-sm font-bold transition-all cursor-pointer text-center disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                type="submit"
                id="btn-confirm-split"
                disabled={isSubmitting}
                className="flex-[1.6] inline-flex items-center justify-center gap-2 py-3 px-5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-extrabold text-sm rounded-2xl shadow-md shadow-amber-500/25 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
              >
                <Rocket className={`w-4 h-4 ${isSubmitting ? 'animate-spin' : ''}`} />
                <span>
                  {isSubmitting
                    ? initialParty
                      ? 'Đang lưu...'
                      : 'Đang chia tiền...'
                    : initialParty
                    ? 'Lưu Thay Đổi'
                    : 'Xác Nhận Chia Tiền'}
                </span>
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
