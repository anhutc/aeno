/**
 * ============================================================================
 * GHI CHÚ CHỈNH SỬA / CHANGELOG:
 * - Khắc phục lỗi chức năng xóa không hoạt động: Thay thế hoàn toàn hàm confirm()
 *   của trình duyệt (vốn bị sandbox iframe chặn không mở được) bằng hộp thoại
 *   xác nhận xóa nội bộ ConfirmDeleteDebtorModal và modal xác nhận xóa giao dịch.
 * - Xóa bỏ hiển thị số điện thoại của con nợ trong tiêu đề modal thông tin chi tiết.
 * - Hộp thoại chi tiết & sao kê của con nợ / người nợ (DebtorDetailModal, z-50).
 * ============================================================================
 */

import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Plus,
  KeyRound,
  Calendar,
  Trash2,
  Edit3,
  Pencil,
  Receipt,
  ArrowUpRight,
  ArrowDownLeft,
  BookOpen,
  AlertTriangle,
  Lock,
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  Copy,
  Check,
  Image as ImageIcon,
  Users,
  Search,
  Filter,
  SlidersHorizontal,
  RefreshCw,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { Debtor, Transaction, AppSettings, PartySplit } from '../types';
import { formatVND } from '../utils/vietqr';
import { getDebtorBalance, getDebtorStatement } from '../utils/storage';
import { triggerHaptic } from '../utils/haptic';
import { AnimatedCounter } from './AnimatedCounter';
import { LookupGuideModal } from './LookupGuideModal';
import { resolveSplitBillDetails, getCustomSplitNote } from '../utils/splitBillHelper';
import { ConfirmDeleteDebtorModal } from './ConfirmDeleteDebtorModal';
import { EditTransactionModal } from './EditTransactionModal';
import { ShareDebtorImageModal } from './ShareDebtorImageModal';
import { TransactionRow } from './TransactionRow';

interface DebtorDetailModalProps {
  debtor: Debtor | null;
  transactions: Transaction[];
  settings: AppSettings;
  parties?: PartySplit[];
  allDebtors?: Debtor[];
  onClose: () => void;
  onOpenAddTx: (debtorId: string) => void;
  onEditDebtor: (debtor: Debtor) => void;
  onDeleteDebtor: (debtorId: string) => void;
  onDeleteTx: (txId: string) => void;
  onEditTx?: (updatedTx: Transaction) => Promise<void> | void;
  onEditParty?: (party: PartySplit) => void;
  onViewImage: (url: string, title?: string) => void;
  onDirectGuestView?: (debtor: Debtor) => void;
}

export const DebtorDetailModal: React.FC<DebtorDetailModalProps> = ({
  debtor,
  transactions,
  settings,
  parties = [],
  allDebtors = [],
  onClose,
  onOpenAddTx,
  onEditDebtor,
  onDeleteDebtor,
  onDeleteTx,
  onEditTx,
  onEditParty,
  onViewImage,
}) => {
  const [isGuideModalOpen, setIsGuideModalOpen] = useState(false);
  const [isShareImageOpen, setIsShareImageOpen] = useState(false);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const [deletingTxId, setDeletingTxId] = useState<string | null>(null);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'amount_desc' | 'amount_asc'>('newest');
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'ADD' | 'SUB' | 'SPLIT'>('ALL');
  const [visibleLimit, setVisibleLimit] = useState<number>(25);
  const [copiedPin, setCopiedPin] = useState(false);

  const handleCopyPin = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!debtor) return;
    triggerHaptic('success');
    navigator.clipboard.writeText(debtor.pin);
    setCopiedPin(true);
    setTimeout(() => setCopiedPin(false), 2000);
  };

  const currentBalance = debtor ? getDebtorBalance(debtor.id, transactions) : 0;
  const statement = useMemo(() => {
    return debtor ? getDebtorStatement(debtor.id, transactions) : [];
  }, [debtor, transactions]);

  const allDebtorsMap = useMemo(() => new Map(allDebtors.map((d) => [d.id, d])), [allDebtors]);

  // Debtor specific financial statistics
  const debtorStats = useMemo(() => {
    let totalAdded = 0;
    let totalSubtracted = 0;
    let splitCount = 0;
    let directAddCount = 0;
    let subCount = 0;

    statement.forEach(({ transaction: tx }) => {
      const isSplit = Boolean(tx.partyId || tx.category === 'PARTY_SPLIT');
      if (tx.type === 'ADD') {
        totalAdded += tx.amount;
        if (isSplit) splitCount++;
        else directAddCount++;
      } else {
        totalSubtracted += tx.amount;
        subCount++;
      }
    });

    const paidPercentage = totalAdded > 0 ? Math.min(100, Math.round((totalSubtracted / totalAdded) * 100)) : 100;

    return {
      totalAdded,
      totalSubtracted,
      splitCount,
      directAddCount,
      subCount,
      totalCount: statement.length,
      paidPercentage,
    };
  }, [statement]);

  // Filtered & sorted statement
  const filteredStatement = useMemo(() => {
    return statement
      .filter(({ transaction: tx }) => {
        const isSplit = Boolean(tx.partyId || tx.category === 'PARTY_SPLIT');

        // Type filter
        if (typeFilter === 'ADD' && (tx.type !== 'ADD' || isSplit)) return false;
        if (typeFilter === 'SUB' && tx.type !== 'SUB') return false;
        if (typeFilter === 'SPLIT' && !isSplit) return false;

        // Search query
        if (searchQuery.trim()) {
          const query = searchQuery.toLowerCase().trim();
          const note = (tx.note || '').toLowerCase();
          const date = (tx.date || '').toLowerCase();
          const customNote = (tx.customNote || '').toLowerCase();
          const amountStr = tx.amount.toString();
          const formattedAmount = formatVND(tx.amount).toLowerCase();

          let partyName = '';
          if (tx.partyId) {
            const party = parties.find((p) => p.id === tx.partyId);
            if (party) partyName = party.name.toLowerCase();
          }

          const match =
            note.includes(query) ||
            customNote.includes(query) ||
            date.includes(query) ||
            amountStr.includes(query) ||
            formattedAmount.includes(query) ||
            partyName.includes(query);

          if (!match) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortOrder === 'newest') {
          const dateA = a.transaction.date || '';
          const dateB = b.transaction.date || '';
          if (dateB !== dateA) return dateB.localeCompare(dateA);
          const aTime = a.transaction.createdAt || '';
          const bTime = b.transaction.createdAt || '';
          return bTime.localeCompare(aTime);
        }
        if (sortOrder === 'oldest') {
          const dateA = a.transaction.date || '';
          const dateB = b.transaction.date || '';
          if (dateA !== dateB) return dateA.localeCompare(dateB);
          const aTime = a.transaction.createdAt || '';
          const bTime = b.transaction.createdAt || '';
          return aTime.localeCompare(bTime);
        }
        if (sortOrder === 'amount_desc') {
          return b.transaction.amount - a.transaction.amount;
        }
        if (sortOrder === 'amount_asc') {
          return a.transaction.amount - b.transaction.amount;
        }
        return 0;
      });
  }, [statement, typeFilter, searchQuery, sortOrder, parties]);

  const displayedStatement = useMemo(() => {
    if (visibleLimit <= 0) return filteredStatement;
    return filteredStatement.slice(0, visibleLimit);
  }, [filteredStatement, visibleLimit]);

  return (
    <>
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {debtor && (
              <div
                id="debtor-detail-modal-backdrop"
                onClick={(e) => {
                  if (e.target === e.currentTarget) {
                    triggerHaptic('selection');
                    onClose();
                  }
                }}
                className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-slate-900/35 backdrop-blur-xs p-0 sm:p-4 overflow-y-auto overflow-x-hidden overscroll-contain"
              >
                <motion.div
                  id="debtor-detail-modal-card"
                  drag="y"
                  dragConstraints={{ top: 0, bottom: 0 }}
                  dragElastic={{ top: 0, bottom: 0.5 }}
                  onDragEnd={(_e, info) => {
                    if (info.offset.y > 100 || info.velocity.y > 350) {
                      triggerHaptic('selection');
                      onClose();
                    }
                  }}
                  initial={{ opacity: 0, scale: 0.96, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96, y: 20 }}
                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                  className="bg-white w-full max-w-2xl rounded-t-[32px] sm:rounded-3xl shadow-2xl border border-slate-100 overflow-hidden max-h-[88dvh] sm:max-h-[92vh] flex flex-col shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
              {/* Mobile Drag Pill Handle */}
              <div className="w-10 h-1.5 bg-slate-200/90 rounded-full mx-auto my-3 sm:hidden shrink-0 cursor-grab active:cursor-grabbing" />

          {/* Header - Sáng & Tinh tế */}
          <div className="bg-slate-50 text-slate-900 px-5 sm:px-6 py-4 flex items-center justify-between shrink-0 border-b border-slate-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-100 border border-emerald-200 flex items-center justify-center font-bold text-emerald-800 text-lg shadow-2xs">
                {debtor.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <h2 className="font-bold text-base sm:text-lg leading-tight flex items-center gap-2 text-slate-900">
                  {debtor.name}
                </h2>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-1">
                  <div className="inline-flex items-center gap-1.5 text-amber-900 bg-amber-50 px-2.5 py-1 rounded-xl font-mono text-xs font-semibold border border-amber-200 shadow-2xs">
                    <KeyRound className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>{debtor.pin}</span>
                    <button
                      type="button"
                      onClick={handleCopyPin}
                      className="ml-0.5 p-1 hover:bg-amber-100 rounded text-amber-700 hover:text-amber-900 transition-colors cursor-pointer"
                      title="Sao chép mật khẩu tra cứu"
                    >
                      {copiedPin ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  onEditDebtor(debtor);
                }}
                title="Chỉnh sửa thông tin"
                className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-200/70 rounded-xl transition-colors cursor-pointer"
              >
                <Edit3 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('warning');
                  setIsConfirmDeleteOpen(true);
                }}
                title="Xóa người nợ này"
                className="p-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                id="close-debtor-detail-btn"
                type="button"
                onClick={() => {
                  triggerHaptic('selection');
                  onClose();
                }}
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 rounded-xl transition-colors ml-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Content Body */}
          <div className="p-4 sm:p-6 overflow-y-auto overflow-x-hidden space-y-4 flex-1">
            {/* Celebration banner if settled */}
            {currentBalance === 0 && (
              <div className="p-3.5 bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-100/70 border border-emerald-200/90 rounded-2xl flex items-center gap-3 shadow-2xs">
                <div className="w-8 h-8 rounded-xl bg-emerald-500 text-white flex items-center justify-center text-sm shadow-xs animate-bounce shrink-0">
                  🎉
                </div>
                <div>
                  <div className="text-xs font-black text-emerald-950 uppercase tracking-wide">
                    Đã hoàn thành sạch nợ 100%!
                  </div>
                  <p className="text-[11px] text-emerald-700 font-medium">
                    Không còn bất kỳ khoản nợ nào tồn đọng
                  </p>
                </div>
              </div>
            )}

            {/* Balance card */}
            <div
              className={`p-4 sm:p-5 rounded-2xl border transition-all ${
                currentBalance > 0
                  ? 'bg-emerald-50/70 border-emerald-200/80 text-emerald-950'
                  : currentBalance < 0
                  ? 'bg-rose-50/70 border-rose-200/80 text-rose-950'
                  : 'bg-slate-50 border-slate-200 text-slate-700'
              }`}
            >
              {/* Top: Số nợ & Trạng thái */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="text-[11px] uppercase tracking-wider font-bold opacity-70">
                    {currentBalance > 0
                      ? 'Người này đang nợ bạn'
                      : currentBalance < 0
                      ? 'Bạn cần trả cho người này'
                      : 'Số Dư Nợ Hiện Tại'}
                  </span>
                  <div className="flex items-baseline gap-2 font-mono mt-0.5">
                    <span
                      className={`text-3xl sm:text-4xl font-black tracking-tight ${
                        currentBalance > 0
                          ? 'text-emerald-700'
                          : currentBalance < 0
                          ? 'text-rose-700'
                          : 'text-slate-700'
                      }`}
                    >
                      <AnimatedCounter
                        value={Math.abs(currentBalance)}
                        formatter={(val) => {
                          const formatted = formatVND(val);
                          if (currentBalance > 0) return `+${formatted}`;
                          if (currentBalance < 0) return `-${formatted}`;
                          return formatted;
                        }}
                      />
                    </span>
                  </div>
                </div>

                <div className="self-start sm:self-center">
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border ${
                      currentBalance > 0
                        ? 'bg-emerald-100/90 text-emerald-800 border-emerald-200'
                        : currentBalance < 0
                        ? 'bg-rose-100/90 text-rose-800 border-rose-200'
                        : 'bg-white text-slate-600 border-slate-200 shadow-2xs'
                    }`}
                  >
                    {currentBalance > 0 ? (
                      <>
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        <span>{debtor.name} đang nợ bạn</span>
                      </>
                    ) : currentBalance < 0 ? (
                      <>
                        <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
                        <span>Bạn đang nợ {debtor.name}</span>
                      </>
                    ) : (
                      <span>Đã thanh toán hết (Không ai nợ ai)</span>
                    )}
                  </span>
                </div>
              </div>

              {/* Action Buttons Row: 2-column balanced grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-3.5 mt-3.5 border-t border-black/5">
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('medium');
                    onOpenAddTx(debtor.id);
                  }}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer"
                  title="Ghi nợ hoặc thu tiền cho người này"
                >
                  <Plus className="w-4 h-4 shrink-0" />
                  <span>Tạo Giao Dịch Mới</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setIsGuideModalOpen(true);
                  }}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-xl text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                  title="Xem và sao chép hướng dẫn tra cứu kèm mật khẩu"
                >
                  <BookOpen className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>Gửi Hướng Dẫn Tra Cứu</span>
                </button>
              </div>
            </div>

            {/* Quick Financial Overview for Debtor */}
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="bg-rose-50/70 border border-rose-200/80 rounded-2xl p-2.5 sm:p-3">
                <div className="flex items-center gap-1 text-[11px] font-semibold text-rose-700">
                  <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Tổng ghi nợ</span>
                </div>
                <div className="font-bold font-mono text-xs sm:text-sm text-rose-800 mt-1 truncate">
                  +{formatVND(debtorStats.totalAdded)}
                </div>
                <div className="text-[10px] text-rose-600/80 mt-0.5">
                  {debtorStats.directAddCount + debtorStats.splitCount} lần nợ
                </div>
              </div>

              <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-2.5 sm:p-3">
                <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                  <ArrowDownLeft className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Đã thanh toán</span>
                </div>
                <div className="font-bold font-mono text-xs sm:text-sm text-emerald-800 mt-1 truncate">
                  -{formatVND(debtorStats.totalSubtracted)}
                </div>
                <div className="text-[10px] text-emerald-600/80 mt-0.5">
                  {debtorStats.subCount} lần trả
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-2.5 sm:p-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-600">
                    <Calendar className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span className="truncate">Tổng biến động</span>
                  </div>
                  <div className="font-bold font-mono text-xs sm:text-sm text-slate-800 mt-1 truncate">
                    {debtorStats.totalCount} GD
                  </div>
                </div>
                <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden mt-1">
                  <div
                    className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                    style={{ width: `${debtorStats.paidPercentage}%` }}
                    title={`Đã trả ${debtorStats.paidPercentage}%`}
                  />
                </div>
              </div>
            </div>

            {/* Statement History Section */}
            <div className="space-y-3 pt-1">
              {/* Header & Export Image Action */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <h3 className="font-bold text-slate-800 text-xs sm:text-sm flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-emerald-600" />
                  <span>Lịch sử biến động</span>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                    {statement.length} giao dịch
                  </span>
                </h3>

                {statement.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setIsShareImageOpen(true)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 hover:text-emerald-800 border border-emerald-200/90 rounded-xl text-xs font-semibold transition-colors cursor-pointer self-start sm:self-auto shadow-2xs"
                    title="Tạo ảnh bảng kê các giao dịch để gửi cho người này"
                  >
                    <ImageIcon className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Xuất ảnh sao kê</span>
                  </button>
                )}
              </div>

              {/* Search & Filter Toolbar for Debtor Transactions */}
              {statement.length > 0 && (
                <div className="bg-slate-50/80 p-2.5 sm:p-3 rounded-2xl border border-slate-200/80 space-y-2.5">
                  {/* Search Bar */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setVisibleLimit(25);
                      }}
                      placeholder="Tìm theo nội dung, số tiền, ngày..."
                      className="w-full pl-8 pr-7 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-slate-900 placeholder:text-slate-400"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Filter Pills & Sort Selector */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 sm:pb-0 scrollbar-none">
                      <button
                        type="button"
                        onClick={() => {
                          setTypeFilter('ALL');
                          setVisibleLimit(25);
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all cursor-pointer ${
                          typeFilter === 'ALL'
                            ? 'bg-slate-900 text-white shadow-2xs'
                            : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        Tất cả ({statement.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setTypeFilter('ADD');
                          setVisibleLimit(25);
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all cursor-pointer inline-flex items-center gap-1 ${
                          typeFilter === 'ADD'
                            ? 'bg-rose-600 text-white shadow-2xs'
                            : 'bg-white text-rose-700 border border-rose-200 hover:bg-rose-50'
                        }`}
                      >
                        <ArrowUpRight className="w-3 h-3" />
                        <span>Ghi nợ ({debtorStats.directAddCount})</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setTypeFilter('SUB');
                          setVisibleLimit(25);
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all cursor-pointer inline-flex items-center gap-1 ${
                          typeFilter === 'SUB'
                            ? 'bg-emerald-600 text-white shadow-2xs'
                            : 'bg-white text-emerald-700 border border-emerald-200 hover:bg-emerald-50'
                        }`}
                      >
                        <ArrowDownLeft className="w-3 h-3" />
                        <span>Đã trả ({debtorStats.subCount})</span>
                      </button>
                      {debtorStats.splitCount > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setTypeFilter('SPLIT');
                            setVisibleLimit(25);
                          }}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all cursor-pointer inline-flex items-center gap-1 ${
                            typeFilter === 'SPLIT'
                              ? 'bg-amber-600 text-white shadow-2xs'
                              : 'bg-white text-amber-800 border border-amber-200 hover:bg-amber-50'
                          }`}
                        >
                          <Users className="w-3 h-3" />
                          <span>Cuộc vui ({debtorStats.splitCount})</span>
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                      <select
                        value={sortOrder}
                        onChange={(e) => {
                          setSortOrder(e.target.value as any);
                          setVisibleLimit(25);
                        }}
                        className="px-2 py-1 text-[11px] bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-700 font-medium cursor-pointer"
                      >
                        <option value="newest">Mới nhất trước</option>
                        <option value="oldest">Cũ nhất trước</option>
                        <option value="amount_desc">Số tiền lớn nhất</option>
                        <option value="amount_asc">Số tiền nhỏ nhất</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Transactions List */}
              {displayedStatement.length === 0 ? (
                <div className="text-center py-8 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-slate-500 text-xs space-y-1">
                  <p className="font-semibold text-slate-700">
                    {statement.length === 0
                      ? 'Chưa có giao dịch nào cho người này.'
                      : 'Không tìm thấy giao dịch nào phù hợp với bộ lọc.'}
                  </p>
                  {statement.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setTypeFilter('ALL');
                        setSortOrder('newest');
                        setVisibleLimit(25);
                      }}
                      className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-emerald-700 hover:bg-emerald-50 font-semibold cursor-pointer text-xs mt-2"
                    >
                      Xóa bộ lọc tra cứu
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-2.5">
                  {displayedStatement.map(({ transaction: tx, runningBalance }) => (
                    <TransactionRow
                      key={tx.id}
                      transaction={tx}
                      currentDebtor={debtor}
                      debtors={allDebtors}
                      debtorsMap={allDebtorsMap}
                      parties={parties}
                      runningBalance={runningBalance}
                      showDebtorName={false}
                      onViewImage={onViewImage}
                      onEditTx={(t) => {
                        if (t.partyId || t.category === 'PARTY_SPLIT') {
                          setEditingTx(null); // Ensure no edit transaction modal opens
                          if (onEditParty) {
                            const p = parties.find(
                              (party) =>
                                party.id === t.partyId ||
                                (party.name && t.note && t.note.includes(party.name))
                            );
                            if (p) {
                              onEditParty(p);
                            } else {
                              alert('Cuộc vui này không còn trong danh sách hoặc đã được cập nhật.');
                            }
                          }
                          return;
                        }
                        setEditingTx(t);
                      }}
                      onDeleteTx={(t) => {
                        if (t.partyId || t.category === 'PARTY_SPLIT') {
                          return; // Khóa xóa lẻ giao dịch cuộc vui
                        }
                        setDeletingTxId(t.id);
                      }}
                      onEditParty={(party) => {
                        setEditingTx(null); // Đảm bảo đóng EditTransactionModal nếu đang mở
                        if (onEditParty) onEditParty(party);
                      }}
                    />
                  ))}
                </div>
              )}

              {/* Pagination & Load More for Debtor Transactions */}
              {filteredStatement.length > 0 && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1 text-xs text-slate-500">
                  <div className="font-medium">
                    Đang hiển thị{' '}
                    <strong className="text-slate-800">{displayedStatement.length}</strong>{' '}
                    / <strong className="text-slate-800">{filteredStatement.length}</strong>{' '}
                    giao dịch
                  </div>

                  <div className="flex items-center gap-2">
                    {filteredStatement.length > displayedStatement.length && (
                      <>
                        <button
                          type="button"
                          onClick={() => setVisibleLimit((prev) => prev + 25)}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition-colors cursor-pointer"
                        >
                          Xem thêm 25 giao dịch
                        </button>
                        <button
                          type="button"
                          onClick={() => setVisibleLimit(filteredStatement.length)}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition-colors cursor-pointer shadow-xs"
                        >
                          Xem toàn bộ ({filteredStatement.length})
                        </button>
                      </>
                    )}

                    {displayedStatement.length >= filteredStatement.length && filteredStatement.length > 25 && (
                      <button
                        type="button"
                        onClick={() => setVisibleLimit(25)}
                        className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-medium rounded-lg transition-colors cursor-pointer text-xs"
                      >
                        Thu gọn về 25
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

            {/* Footer */}
            <div className="px-5 sm:px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0">
              <div className="truncate max-w-md text-slate-600">
                {debtor.note ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span>📝 Ghi chú:</span>
                    <strong className="text-slate-800 font-medium">{debtor.note}</strong>
                  </span>
                ) : (
                  <span className="text-slate-400 italic">Không có ghi chú thêm</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('selection');
                  onClose();
                }}
                className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-100 rounded-xl text-slate-700 font-semibold transition-colors cursor-pointer shadow-2xs"
              >
                Đóng
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  )}

      {/* Lookup Guide Modal */}
      <LookupGuideModal
        isOpen={isGuideModalOpen}
        onClose={() => setIsGuideModalOpen(false)}
        debtor={debtor}
        balance={currentBalance}
        settings={settings}
      />

      {/* In-App Confirm Delete Debtor Modal */}
      <ConfirmDeleteDebtorModal
        isOpen={isConfirmDeleteOpen}
        onClose={() => setIsConfirmDeleteOpen(false)}
        debtor={debtor}
        balance={currentBalance}
        transactionCount={statement.length}
        onConfirm={() => {
          onDeleteDebtor(debtor.id);
          setIsConfirmDeleteOpen(false);
          onClose();
        }}
      />

      {/* In-App Confirm Delete Transaction Modal */}
      <AnimatePresence>
        {deletingTxId && (
          <motion.div
            id="confirm-delete-tx-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/35 backdrop-blur-xs p-3 sm:p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2 }}
              className="bg-white w-full max-w-sm rounded-3xl shadow-2xl border border-slate-200 overflow-hidden p-5 space-y-4"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-100 flex items-center justify-center text-rose-600 shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Xóa Giao Dịch</h3>
                  <p className="text-xs text-slate-500">Hành động này không thể hoàn tác</p>
                </div>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Bạn có chắc chắn muốn xóa giao dịch này không?
              </p>
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setDeletingTxId(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onDeleteTx(deletingTxId);
                    setDeletingTxId(null);
                  }}
                  className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Xác Nhận Xóa</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal Chỉnh Sửa Giao Dịch Của Con Nợ Này */}
      <EditTransactionModal
        isOpen={Boolean(editingTx)}
        onClose={() => setEditingTx(null)}
        transaction={editingTx}
        debtor={debtor}
        onSave={async (updatedTx) => {
          if (onEditTx) {
            await onEditTx(updatedTx);
          }
          setEditingTx(null);
        }}
      />
      {/* Modal Tạo Ảnh Gửi Nhanh Cho Con Nợ */}
      <AnimatePresence>
        {isShareImageOpen && debtor && (
          <ShareDebtorImageModal
            debtor={debtor}
            transactions={transactions}
            settings={settings}
            onClose={() => setIsShareImageOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
};
