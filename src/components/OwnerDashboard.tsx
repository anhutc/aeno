/**
 * ============================================================================
 * GHI CHÚ CHỈNH SỬA / CHANGELOG:
 * - Hỗ trợ chức năng xóa con nợ với hộp thoại xác nhận nội bộ In-App ConfirmDeleteDebtorModal,
 *   thay thế triệt để window.confirm() bị chặn bởi sandbox.
 * - Xóa số điện thoại người nợ: Bỏ tìm kiếm theo SĐT người nợ và bỏ thẻ SĐT trên từng con nợ.
 * - Thêm số điện thoại Chủ Nợ: Hiển thị nổi bật SĐT Chủ Nợ (ownerPhone) tại thanh thông tin.
 * ============================================================================
 */

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  UserPlus,
  PlusCircle,
  PartyPopper,
  Search,
  KeyRound,
  ArrowUpRight,
  ArrowDownLeft,
  ChevronRight,
  Receipt,
  Users,
  Sparkles,
  Calendar,
  BookOpen,
  Trash2,
  RefreshCw,
  Pencil,
  Lock,
  Copy,
  Check,
  Filter,
  X,
  LayoutGrid,
  List,
  Table as TableIcon,
  ArrowUpDown,
  SlidersHorizontal,
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  Clock,
  Eye,
  EyeOff,
  FileSpreadsheet,
} from 'lucide-react';
import { Debtor, Transaction, PartySplit, AppSettings } from '../types';
import { formatVND } from '../utils/vietqr';
import { getDebtorBalance } from '../utils/storage';
import { triggerHaptic } from '../utils/haptic';
import { AnimatedCounter } from './AnimatedCounter';
import { LookupGuideModal } from './LookupGuideModal';
import { ConfirmClearSampleModal } from './ConfirmClearSampleModal';
import { ConfirmDeleteDebtorModal } from './ConfirmDeleteDebtorModal';
import { ConfirmDeletePartyModal } from './ConfirmDeletePartyModal';
import { ConfirmDeleteTxModal } from './ConfirmDeleteTxModal';
import { TransactionRow } from './TransactionRow';
import { resolveSplitBillDetails } from '../utils/splitBillHelper';

interface OwnerDashboardProps {
  debtors: Debtor[];
  transactions: Transaction[];
  parties: PartySplit[];
  settings: AppSettings;
  onOpenAddDebtor: () => void;
  onOpenAddTx: (defaultDebtorId?: string) => void;
  onOpenSplitParty: () => void;
  onSelectDebtor: (debtor: Debtor) => void;
  onViewImage: (url: string, title?: string) => void;
  onDeleteDebtor?: (debtorId: string) => void;
  onOpenSettings?: () => void;
  onDataReload?: () => void;
  onEditTx?: (tx: Transaction) => void;
  onDeleteTx?: (txId: string) => void;
  onEditParty?: (party: PartySplit) => void;
  onDeleteParty?: (partyId: string) => void;
}

export const OwnerDashboard: React.FC<OwnerDashboardProps> = ({
  debtors,
  transactions,
  parties,
  settings,
  onOpenAddDebtor,
  onOpenAddTx,
  onOpenSplitParty,
  onSelectDebtor,
  onViewImage,
  onDeleteDebtor,
  onDataReload,
  onEditTx,
  onDeleteTx,
  onEditParty,
  onDeleteParty,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'DEBTORS' | 'TRANSACTIONS' | 'PARTIES'>('DEBTORS');
  const [viewMode, setViewMode] = useState<'GRID' | 'LIST' | 'TABLE'>('GRID');
  const [sortBy, setSortBy] = useState<'BALANCE_DESC' | 'BALANCE_ASC' | 'NAME' | 'RECENT'>('BALANCE_DESC');
  const [debtorStatusFilter, setDebtorStatusFilter] = useState<'ALL' | 'RECEIVABLE' | 'PAYABLE' | 'SETTLED'>('ALL');
  const [copiedPinId, setCopiedPinId] = useState<string | null>(null);
  // Set of debtor IDs whose PIN is explicitly revealed (Đề xuất 2: Ẩn PIN mặc định)
  const [revealedPinIds, setRevealedPinIds] = useState<Set<string>>(() => new Set());

  const toggleRevealPin = (e: React.MouseEvent, debtorId: string) => {
    e.stopPropagation();
    triggerHaptic('selection');
    setRevealedPinIds((prev) => {
      const next = new Set(prev);
      if (next.has(debtorId)) {
        next.delete(debtorId);
      } else {
        next.add(debtorId);
      }
      return next;
    });
  };

  const [guideDebtor, setGuideDebtor] = useState<Debtor | null>(null);
  const [debtorToDelete, setDebtorToDelete] = useState<Debtor | null>(null);
  const [partyToDelete, setPartyToDelete] = useState<PartySplit | null>(null);
  const [txToDelete, setTxToDelete] = useState<Transaction | null>(null);
  const [isConfirmClearOpen, setIsConfirmClearOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' } | null>(null);

  const showToast = (message: string, type: 'success' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Pre-calculate debtor statistics in a single O(Debtors + Transactions) pass
  const {
    debtorStatsMap,
    totalReceivable,
    totalPayable,
    netBalance,
    receivableRatio,
    payableRatio,
    receivableDebtors,
    payableDebtors,
    settledDebtors,
  } = useMemo(() => {
    const statsMap = new Map<
      string,
      {
        balance: number;
        totalDebt: number;
        totalPaid: number;
        paidRate: number;
        lastTxTime: number;
        txCount: number;
      }
    >();

    for (const d of debtors) {
      statsMap.set(d.id, {
        balance: 0,
        totalDebt: 0,
        totalPaid: 0,
        paidRate: 0,
        lastTxTime: d.createdAt ? new Date(d.createdAt).getTime() : 0,
        txCount: 0,
      });
    }

    for (const tx of transactions) {
      let stat = statsMap.get(tx.debtorId);
      if (!stat) {
        stat = {
          balance: 0,
          totalDebt: 0,
          totalPaid: 0,
          paidRate: 0,
          lastTxTime: 0,
          txCount: 0,
        };
        statsMap.set(tx.debtorId, stat);
      }
      stat.txCount++;
      if (tx.type === 'ADD') {
        stat.balance += tx.amount;
        stat.totalDebt += tx.amount;
      } else {
        stat.balance -= tx.amount;
        stat.totalPaid += tx.amount;
      }
      if (tx.date) {
        const tTime = new Date(tx.date).getTime();
        if (tTime > stat.lastTxTime) {
          stat.lastTxTime = tTime;
        }
      }
    }

    let recTotal = 0;
    let payTotal = 0;
    const recList: Debtor[] = [];
    const payList: Debtor[] = [];
    const setlList: Debtor[] = [];

    for (const d of debtors) {
      const stat = statsMap.get(d.id);
      if (!stat) continue;
      stat.paidRate =
        stat.totalDebt > 0 ? Math.min(100, Math.round((stat.totalPaid / stat.totalDebt) * 100)) : 0;

      if (stat.balance > 0) {
        recTotal += stat.balance;
        recList.push(d);
      } else if (stat.balance < 0) {
        payTotal += Math.abs(stat.balance);
        payList.push(d);
      } else {
        setlList.push(d);
      }
    }

    const net = recTotal - payTotal;
    const vol = recTotal + payTotal;
    const recRatio = vol > 0 ? Math.round((recTotal / vol) * 100) : 50;
    const payRatio = vol > 0 ? 100 - recRatio : 50;

    return {
      debtorStatsMap: statsMap,
      totalReceivable: recTotal,
      totalPayable: payTotal,
      netBalance: net,
      receivableRatio: recRatio,
      payableRatio: payRatio,
      receivableDebtors: recList,
      payableDebtors: payList,
      settledDebtors: setlList,
    };
  }, [debtors, transactions]);

  // Lookup maps for O(1) instantaneous access
  const debtorsMap = useMemo(() => new Map(debtors.map((d) => [d.id, d])), [debtors]);
  const partiesMap = useMemo(() => new Map(parties.map((p) => [p.id, p])), [parties]);

  // Pagination for debtor list to ensure 60fps smooth scrolling
  const [debtorVisibleLimit, setDebtorVisibleLimit] = useState<number>(30);

  // Filter debtors by search and status (using precomputed O(1) map)
  const filteredDebtors = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    return debtors.filter((d) => {
      const stat = debtorStatsMap.get(d.id);
      const bal = stat ? stat.balance : 0;

      if (debtorStatusFilter === 'RECEIVABLE' && bal <= 0) return false;
      if (debtorStatusFilter === 'PAYABLE' && bal >= 0) return false;
      if (debtorStatusFilter === 'SETTLED' && bal !== 0) return false;

      if (term) {
        const matchName = d.name.toLowerCase().includes(term);
        const matchPin = d.pin ? d.pin.toLowerCase().includes(term) : false;
        const matchNote = d.note ? d.note.toLowerCase().includes(term) : false;
        if (!matchName && !matchPin && !matchNote) return false;
      }
      return true;
    });
  }, [debtors, debtorStatusFilter, searchTerm, debtorStatsMap]);

  // Sort debtors according to current sortBy
  const sortedDebtors = useMemo(() => {
    return [...filteredDebtors].sort((a, b) => {
      const statA = debtorStatsMap.get(a.id);
      const statB = debtorStatsMap.get(b.id);
      const balA = statA ? statA.balance : 0;
      const balB = statB ? statB.balance : 0;

      if (sortBy === 'BALANCE_DESC') return balB - balA;
      if (sortBy === 'BALANCE_ASC') return balA - balB;
      if (sortBy === 'NAME') return a.name.localeCompare(b.name, 'vi');
      if (sortBy === 'RECENT') {
        const timeA = statA ? statA.lastTxTime : 0;
        const timeB = statB ? statB.lastTxTime : 0;
        return timeB - timeA;
      }
      return 0;
    });
  }, [filteredDebtors, sortBy, debtorStatsMap]);

  // Slice debtors for viewport pagination
  const displayedDebtors = useMemo(() => {
    if (debtorVisibleLimit <= 0) return sortedDebtors;
    return sortedDebtors.slice(0, debtorVisibleLimit);
  }, [sortedDebtors, debtorVisibleLimit]);

  // Sort parties newest first: Ngày mới nhất ở trên, nếu trùng ngày thì tạo sau ở trên
  const sortedParties = useMemo(() => {
    return [...parties].sort((a, b) => {
      const dateA = a.date || (a.createdAt ? a.createdAt.slice(0, 10) : '');
      const dateB = b.date || (b.createdAt ? b.createdAt.slice(0, 10) : '');
      if (dateB !== dateA) {
        return dateB.localeCompare(dateA);
      }
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (timeB !== timeA) {
        return timeB - timeA;
      }
      return (b.id || '').localeCompare(a.id || '');
    });
  }, [parties]);

  const handleCopyPin = (e: React.MouseEvent, debtor: Debtor) => {
    e.stopPropagation();
    triggerHaptic('success');
    navigator.clipboard.writeText(debtor.pin);
    setCopiedPinId(debtor.id);
    showToast(`Đã sao chép mật khẩu "${debtor.pin}" của ${debtor.name}`, 'success');
    setTimeout(() => setCopiedPinId(null), 2000);
  };

  // --- TAB 2: State & Calculations for Lịch Sử Toàn Bộ Biến Động ---
  const [txSearchTerm, setTxSearchTerm] = useState('');
  const [txTypeFilter, setTxTypeFilter] = useState<'ALL' | 'ADD' | 'SUB' | 'SPLIT'>('ALL');
  const [txDebtorFilter, setTxDebtorFilter] = useState<string>('ALL');
  const [txSortBy, setTxSortBy] = useState<'DATE_DESC' | 'DATE_ASC' | 'AMOUNT_DESC' | 'AMOUNT_ASC'>('DATE_DESC');
  const [txDateRangeFilter, setTxDateRangeFilter] = useState<'ALL' | 'THIS_MONTH' | 'LAST_MONTH'>('ALL');
  const [txVisibleLimit, setTxVisibleLimit] = useState<number>(30);

  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthStr = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;

  const allFilteredTransactions = useMemo(() => {
    return transactions
      .filter((tx) => {
        // 1. Debtor filter
        if (txDebtorFilter !== 'ALL' && tx.debtorId !== txDebtorFilter) {
          return false;
        }

        // 2. Type filter
        const isSplit = Boolean(tx.partyId || tx.category === 'PARTY_SPLIT');
        if (txTypeFilter === 'ADD' && (tx.type !== 'ADD' || isSplit)) return false;
        if (txTypeFilter === 'SUB' && tx.type !== 'SUB') return false;
        if (txTypeFilter === 'SPLIT' && !isSplit) return false;

        // 3. Date range filter
        if (txDateRangeFilter === 'THIS_MONTH') {
          const txMonth = (tx.date || '').slice(0, 7);
          if (txMonth !== currentMonthStr) return false;
        } else if (txDateRangeFilter === 'LAST_MONTH') {
          const txMonth = (tx.date || '').slice(0, 7);
          if (txMonth !== lastMonthStr) return false;
        }

        // 4. Search term
        if (txSearchTerm.trim()) {
          const query = txSearchTerm.toLowerCase().trim();
          const debtor = debtorsMap.get(tx.debtorId);
          const debtorName = (debtor?.name || '').toLowerCase();
          const note = (tx.note || '').toLowerCase();
          const date = (tx.date || '').toLowerCase();
          const amountStr = tx.amount.toString();
          const formattedAmount = formatVND(tx.amount).toLowerCase();

          let partyName = '';
          if (tx.partyId) {
            const party = partiesMap.get(tx.partyId);
            if (party) partyName = party.name.toLowerCase();
          }

          const match =
            debtorName.includes(query) ||
            note.includes(query) ||
            date.includes(query) ||
            amountStr.includes(query) ||
            formattedAmount.includes(query) ||
            partyName.includes(query);

          if (!match) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (txSortBy === 'DATE_DESC') {
          const dateA = a.date || '';
          const dateB = b.date || '';
          if (dateB !== dateA) return dateB.localeCompare(dateA);
          const aTime = a.createdAt || '';
          const bTime = b.createdAt || '';
          return bTime.localeCompare(aTime);
        }
        if (txSortBy === 'DATE_ASC') {
          const dateA = a.date || '';
          const dateB = b.date || '';
          if (dateA !== dateB) return dateA.localeCompare(dateB);
          const aTime = a.createdAt || '';
          const bTime = b.createdAt || '';
          return aTime.localeCompare(bTime);
        }
        if (txSortBy === 'AMOUNT_DESC') {
          return b.amount - a.amount;
        }
        if (txSortBy === 'AMOUNT_ASC') {
          return a.amount - b.amount;
        }
        return 0;
      });
  }, [
    transactions,
    debtorsMap,
    partiesMap,
    txDebtorFilter,
    txTypeFilter,
    txDateRangeFilter,
    txSearchTerm,
    txSortBy,
    currentMonthStr,
    lastMonthStr,
  ]);

  // Statistics of filtered transactions
  const txFilteredStats = useMemo(() => {
    let addTotal = 0;
    let subTotal = 0;
    allFilteredTransactions.forEach((tx) => {
      if (tx.type === 'ADD') addTotal += tx.amount;
      else subTotal += tx.amount;
    });
    return {
      count: allFilteredTransactions.length,
      addTotal,
      subTotal,
      netTotal: addTotal - subTotal,
    };
  }, [allFilteredTransactions]);

  const displayedTransactions = useMemo(() => {
    if (txVisibleLimit <= 0) return allFilteredTransactions;
    return allFilteredTransactions.slice(0, txVisibleLimit);
  }, [allFilteredTransactions, txVisibleLimit]);

  return (
    <div className="space-y-5 sm:space-y-6">

      {/* BỐ CỤC MỚI LẠ 1: BẢNG ĐIỀU KHIỂN TÀI CHÍNH BENTO BẤT ĐỐI XỨNG (EXECUTIVE BENTO COCKPIT - BRIGHT LIGHT THEME) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Card Trung Tâm Điều Hành Nợ Ròng (Executive Command Hub - Bright Light) */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28 }}
          className="lg:col-span-7 bg-white text-slate-900 rounded-3xl p-5 sm:p-6 border border-slate-200/90 shadow-sm relative overflow-hidden flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200/80 text-emerald-800 text-[11px] font-bold uppercase tracking-wider">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>Trung Tâm Tài Chính</span>
              </div>
              {settings.googleSheetUrl ? (
                <a
                  href={settings.googleSheetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold transition-all shadow-2xs"
                  title="Mở Google Sheets trên Google Drive"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Google Sheets ↗</span>
                </a>
              ) : null}
            </div>

            <div className="mt-4">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                {netBalance > 0
                  ? 'Tổng Dư Nợ Ròng (Cần thu hồi)'
                  : netBalance < 0
                  ? 'Tổng Dư Nợ Ròng (Bạn phải trả)'
                  : 'Cân Bằng Sổ Nợ (0 đ)'}
              </span>
              <div className="text-3xl sm:text-4xl font-black font-mono tracking-tight mt-1 flex items-baseline gap-2">
                <span
                  className={
                    netBalance > 0
                      ? 'text-emerald-600'
                      : netBalance < 0
                      ? 'text-rose-600'
                      : 'text-slate-700'
                  }
                >
                  <AnimatedCounter
                    value={Math.abs(netBalance)}
                    formatter={(val) => {
                      const formatted = formatVND(val);
                      if (netBalance > 0) return `+${formatted}`;
                      if (netBalance < 0) return `-${formatted}`;
                      return formatted;
                    }}
                  />
                </span>
              </div>
            </div>

            {/* Thanh Phân Bổ Tỷ Lệ Dòng Tiền (Live Cashflow Ratio Meter) */}
            <div className="mt-5 pt-4 border-t border-slate-100">
              <div className="flex items-center justify-between text-xs font-bold mb-1.5">
                <span className="flex items-center gap-1.5 text-emerald-700">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  Phải thu: {receivableRatio}%
                </span>
                <span className="flex items-center gap-1.5 text-rose-700">
                  <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                  Phải trả: {payableRatio}%
                </span>
              </div>
              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden flex p-0.5 ring-1 ring-slate-200/80">
                <div
                  style={{ width: `${receivableRatio}%` }}
                  className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-l-full transition-all duration-500"
                  title={`Phải thu: ${receivableRatio}%`}
                ></div>
                <div
                  style={{ width: `${payableRatio}%` }}
                  className="h-full bg-gradient-to-r from-rose-500 to-orange-500 rounded-r-full transition-all duration-500"
                  title={`Phải trả: ${payableRatio}%`}
                ></div>
              </div>
            </div>
          </div>

          {/* 2 Chỉ Số Vi Mô Ở Chân Thẻ */}
          <div className="grid grid-cols-2 gap-3 mt-5 pt-4 border-t border-slate-100 text-center">
            <div className="p-2.5 bg-slate-50 rounded-2xl border border-slate-200/70">
              <div className="text-[10px] text-slate-500 uppercase font-bold">Tổng người nợ</div>
              <div className="text-base font-black font-mono text-slate-900 mt-0.5">
                <AnimatedCounter value={debtors.length} />
              </div>
            </div>
            <div className="p-2.5 bg-slate-50 rounded-2xl border border-slate-200/70">
              <div className="text-[10px] text-slate-500 uppercase font-bold">Tổng giao dịch</div>
              <div className="text-base font-black font-mono text-slate-900 mt-0.5">
                <AnimatedCounter value={transactions.length} />
              </div>
            </div>
          </div>
        </motion.div>

        {/* Hai Thẻ Vệ Tinh Phải Thu & Phải Trả (Satellite Financial Panels) */}
        <div className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
          {/* Card Phải Thu */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, delay: 0.05 }}
            onClick={() => setDebtorStatusFilter(debtorStatusFilter === 'RECEIVABLE' ? 'ALL' : 'RECEIVABLE')}
            className={`p-4 sm:p-5 rounded-3xl border transition-all cursor-pointer flex flex-col justify-between ${
              debtorStatusFilter === 'RECEIVABLE'
                ? 'bg-emerald-100/70 border-emerald-400 ring-2 ring-emerald-500/20 shadow-md'
                : 'bg-gradient-to-br from-emerald-50/90 via-teal-50/40 to-white border-emerald-200/80 hover:border-emerald-300 shadow-xs'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-bold">
              <span className="uppercase tracking-wider text-[11px] text-emerald-800 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                Đang nợ bạn (Phải thu)
              </span>
              <span className="p-1.5 rounded-xl bg-emerald-100/90 text-emerald-700">
                <ArrowUpRight className="w-4 h-4" />
              </span>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-emerald-700 tracking-tight font-mono my-2">
              +<AnimatedCounter value={totalReceivable} formatter={formatVND} />
            </div>
            <div className="flex items-center justify-between text-[11px] font-medium text-emerald-800/80 pt-2 border-t border-emerald-100">
              <span>{receivableDebtors.length} người nợ chưa thanh toán</span>
              <span className="font-bold underline text-emerald-700 hover:text-emerald-900">
                {debtorStatusFilter === 'RECEIVABLE' ? 'Đang lọc' : 'Lọc ngay →'}
              </span>
            </div>
          </motion.div>

          {/* Card Phải Trả */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, delay: 0.1 }}
            onClick={() => setDebtorStatusFilter(debtorStatusFilter === 'PAYABLE' ? 'ALL' : 'PAYABLE')}
            className={`p-4 sm:p-5 rounded-3xl border transition-all cursor-pointer flex flex-col justify-between ${
              debtorStatusFilter === 'PAYABLE'
                ? 'bg-rose-100/70 border-rose-400 ring-2 ring-rose-500/20 shadow-md'
                : 'bg-gradient-to-br from-rose-50/90 via-orange-50/40 to-white border-rose-200/80 hover:border-rose-300 shadow-xs'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-bold">
              <span className="uppercase tracking-wider text-[11px] text-rose-800 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                Bạn đang nợ (Phải trả)
              </span>
              <span className="p-1.5 rounded-xl bg-rose-100/90 text-rose-700">
                <ArrowDownLeft className="w-4 h-4" />
              </span>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-rose-700 tracking-tight font-mono my-2">
              -<AnimatedCounter value={totalPayable} formatter={formatVND} />
            </div>
            <div className="flex items-center justify-between text-[11px] font-medium text-rose-800/80 pt-2 border-t border-rose-100">
              <span>{payableDebtors.length} khoản cần thanh toán</span>
              <span className="font-bold underline text-rose-700 hover:text-rose-900">
                {debtorStatusFilter === 'PAYABLE' ? 'Đang lọc' : 'Lọc ngay →'}
              </span>
            </div>
          </motion.div>
        </div>
      </div>

      {/* DOCK HÀNH ĐỘNG CÔNG NGHỆ CAO (HIGH-PERFORMANCE ACTION DOCK) - Đề xuất 7: Thu gọn trên điện thoại */}
      {/* 1. Mobile Compact Version (Tiết kiệm chiều cao màn hình, 1 hàng 3 nút ngang tiện tay ngón cái) */}
      <div className="grid grid-cols-3 gap-2 sm:hidden">
        <motion.button
          whileTap={{ scale: 0.95 }}
          type="button"
          id="btn-open-form-2-mobile"
          onClick={() => onOpenAddTx()}
          className="flex flex-col items-center justify-center py-2.5 px-1 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-600 text-white shadow-xs border border-emerald-500/40 cursor-pointer active:opacity-90"
        >
          <div className="w-7 h-7 rounded-xl bg-white/20 flex items-center justify-center mb-1 shrink-0">
            <PlusCircle className="w-4 h-4 text-white" />
          </div>
          <span className="text-[11px] font-black tracking-tight leading-tight text-center">Ghi Nợ / Thu</span>
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.95 }}
          type="button"
          id="btn-open-form-1-mobile"
          onClick={onOpenAddDebtor}
          className="flex flex-col items-center justify-center py-2.5 px-1 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-xs border border-blue-500/40 cursor-pointer active:opacity-90"
        >
          <div className="w-7 h-7 rounded-xl bg-white/20 flex items-center justify-center mb-1 shrink-0">
            <UserPlus className="w-4 h-4 text-white" />
          </div>
          <span className="text-[11px] font-black tracking-tight leading-tight text-center">Thêm Người</span>
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.95 }}
          type="button"
          id="btn-open-form-3-mobile"
          onClick={onOpenSplitParty}
          className="flex flex-col items-center justify-center py-2.5 px-1 rounded-2xl bg-gradient-to-br from-amber-600 to-orange-600 text-white shadow-xs border border-amber-500/40 cursor-pointer active:opacity-90"
        >
          <div className="w-7 h-7 rounded-xl bg-white/20 flex items-center justify-center mb-1 shrink-0">
            <PartyPopper className="w-4 h-4 text-white" />
          </div>
          <span className="text-[11px] font-black tracking-tight leading-tight text-center">Chia Bill</span>
        </motion.button>
      </div>

      {/* 2. Desktop Spacious Version (Tablet & Desktop đầy đủ chi tiết và phụ đề) */}
      <div className="hidden sm:grid sm:grid-cols-3 gap-3">
        <motion.button
          whileHover={{ scale: 1.015, y: -2 }}
          whileTap={{ scale: 0.985 }}
          type="button"
          id="btn-open-form-2"
          onClick={() => onOpenAddTx()}
          className="group relative overflow-hidden flex items-center justify-between p-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-2xl shadow-sm hover:shadow-md transition-all text-left cursor-pointer border border-emerald-500/40"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0 ring-1 ring-white/25 group-hover:scale-110 transition-transform">
              <PlusCircle className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-200">
                Giao dịch đơn
              </div>
              <div className="font-extrabold text-sm sm:text-base leading-tight">
                Ghi Nợ / Thu Nợ
              </div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-emerald-200 group-hover:translate-x-1 transition-transform" />
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.015, y: -2 }}
          whileTap={{ scale: 0.985 }}
          type="button"
          id="btn-open-form-1"
          onClick={onOpenAddDebtor}
          className="group relative overflow-hidden flex items-center justify-between p-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-2xl shadow-sm hover:shadow-md transition-all text-left cursor-pointer border border-blue-500/40"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0 ring-1 ring-white/25 group-hover:scale-110 transition-transform">
              <UserPlus className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-blue-200">
                Thêm danh bạ
              </div>
              <div className="font-extrabold text-sm sm:text-base leading-tight">
                Thêm Người Mới
              </div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-blue-200 group-hover:translate-x-1 transition-transform" />
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.015, y: -2 }}
          whileTap={{ scale: 0.985 }}
          type="button"
          id="btn-open-form-3"
          onClick={onOpenSplitParty}
          className="group relative overflow-hidden flex items-center justify-between p-3.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white rounded-2xl shadow-sm hover:shadow-md transition-all text-left cursor-pointer border border-amber-500/40"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0 ring-1 ring-white/25 group-hover:scale-110 transition-transform">
              <PartyPopper className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-amber-200">
                Sự kiện / Tiệc tùng
              </div>
              <div className="font-extrabold text-sm sm:text-base leading-tight">
                Ăn Chia Nhóm
              </div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-amber-200 group-hover:translate-x-1 transition-transform" />
        </motion.button>
      </div>

      {/* BỐ CỤC MỚI LẠ 2: THANH ĐIỀU KHIỂN ĐA CHIỀU (SMART MULTI-MODE TOOLBAR) */}
      <div className="flex flex-col gap-3 border-b border-slate-200/80 pb-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Tabs Chính: Trên mobile chia đều 3 cột vừa vặn, trên desktop flex tự nhiên */}
          <div className="w-full sm:w-auto grid grid-cols-3 sm:flex items-center gap-1 sm:gap-1.5 p-1 bg-slate-100/90 rounded-2xl border border-slate-200/80">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('selection');
                setActiveTab('DEBTORS');
              }}
              className={`flex items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                activeTab === 'DEBTORS'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200/60'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
              }`}
            >
              <Users className="w-3.5 h-3.5 shrink-0" />
              <span>Người Nợ</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold leading-none ${activeTab === 'DEBTORS' ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'}`}>
                {debtors.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                triggerHaptic('selection');
                setActiveTab('TRANSACTIONS');
              }}
              className={`flex items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                activeTab === 'TRANSACTIONS'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200/60'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
              }`}
            >
              <Calendar className="w-3.5 h-3.5 shrink-0" />
              <span>Giao Dịch</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold leading-none ${activeTab === 'TRANSACTIONS' ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'}`}>
                {transactions.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                triggerHaptic('selection');
                setActiveTab('PARTIES');
              }}
              className={`flex items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                activeTab === 'PARTIES'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200/60'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
              }`}
            >
              <PartyPopper className="w-3.5 h-3.5 shrink-0" />
              <span>Cuộc Vui</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold leading-none ${activeTab === 'PARTIES' ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'}`}>
                {parties.length}
              </span>
            </button>
          </div>

          {/* Công cụ tìm kiếm & Chuyển đổi Bố cục (Chỉ hiển thị ở tab Danh bạ) */}
          {activeTab === 'DEBTORS' && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full lg:w-auto">
              <div className="flex items-center gap-2">
                {/* Chuyển đổi Bố Cục Thẻ Bento vs Danh Sách Apple vs Bảng Kế Toán Pro */}
                <div className="flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200/80 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('selection');
                      setViewMode('GRID');
                    }}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      viewMode === 'GRID'
                        ? 'bg-white text-slate-900 shadow-2xs border border-slate-200/60'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                    title="Xem dạng Thẻ Bento"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Thẻ</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('selection');
                      setViewMode('LIST');
                    }}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      viewMode === 'LIST'
                        ? 'bg-white text-slate-900 shadow-2xs border border-slate-200/60'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                    title="Xem dạng Danh sách Apple"
                  >
                    <List className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Danh sách</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('selection');
                      setViewMode('TABLE');
                    }}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      viewMode === 'TABLE'
                        ? 'bg-white text-slate-900 shadow-2xs border border-slate-200/60'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                    title="Xem dạng Bảng"
                  >
                    <TableIcon className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Bảng</span>
                  </button>
                </div>

                {/* Sắp Xếp */}
                <div className="relative flex-1 sm:flex-initial">
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="w-full sm:w-auto appearance-none bg-white border border-slate-300 text-slate-700 text-xs font-semibold py-1.5 pl-2.5 pr-7 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer shadow-2xs"
                  >
                    <option value="BALANCE_DESC">Dư nợ cao nhất</option>
                    <option value="BALANCE_ASC">Dư nợ thấp nhất</option>
                    <option value="NAME">Tên A-Z</option>
                    <option value="RECENT">Giao dịch gần nhất</option>
                  </select>
                  <ArrowUpDown className="w-3 h-3 text-slate-400 absolute right-2 top-2.5 pointer-events-none" />
                </div>
              </div>

              {/* Thanh Tìm Kiếm: Rộng rãi trên Mobile, cố định gọn gàng trên Desktop */}
              <div className="relative w-full sm:w-56">
                <input
                  type="text"
                  placeholder="Tìm tên..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-8 pr-7 py-1.5 text-xs bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800 placeholder-slate-400 shadow-2xs transition-all"
                />
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* --- TAB CONTENT WITH ANIMATE PRESENCE --- */}
      <AnimatePresence mode="wait">
        {/* --- TAB 1: DANH BẠ CON NỢ VỚI 2 CHẾ ĐỘ HIỂN THỊ (BENTO CARDS & PRO DATA TABLE) --- */}
        {activeTab === 'DEBTORS' && (
          <motion.div
            key="tab-debtors"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="space-y-4"
          >
            {/* Filter Pills for Quick Status Selection */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
            <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1 pl-1 shrink-0">
              <Filter className="w-3 h-3" />
              Lọc:
            </span>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('selection');
                setDebtorStatusFilter('ALL');
              }}
              className={`px-3 py-1 rounded-xl font-bold transition-all whitespace-nowrap cursor-pointer ${
                debtorStatusFilter === 'ALL'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Tất cả ({debtors.length})
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('selection');
                setDebtorStatusFilter('RECEIVABLE');
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl font-bold transition-all whitespace-nowrap cursor-pointer ${
                debtorStatusFilter === 'RECEIVABLE'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200/60'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
              Nợ tôi ({receivableDebtors.length})
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('selection');
                setDebtorStatusFilter('PAYABLE');
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl font-bold transition-all whitespace-nowrap cursor-pointer ${
                debtorStatusFilter === 'PAYABLE'
                  ? 'bg-rose-600 text-white shadow-2xs'
                  : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200/60'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
              Tôi nợ họ ({payableDebtors.length})
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('selection');
                setDebtorStatusFilter('SETTLED');
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl font-bold transition-all whitespace-nowrap cursor-pointer ${
                debtorStatusFilter === 'SETTLED'
                  ? 'bg-slate-700 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
              Đã hết nợ ({settledDebtors.length})
            </button>
          </div>

          {sortedDebtors.length === 0 ? (
            debtors.length === 0 ? (
              <div className="text-center py-12 sm:py-16 px-4 bg-white rounded-3xl border border-dashed border-slate-300 text-slate-600 text-xs space-y-4 shadow-2xs">
                <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center mx-auto text-3xl shadow-sm">
                  ✨
                </div>
                <div className="max-w-md mx-auto space-y-1.5">
                  <h4 className="font-bold text-base sm:text-lg text-slate-900">
                    Chưa Có Người Nợ Nào
                  </h4>
                  <p className="text-slate-500 text-xs leading-relaxed">
                    Sổ ghi nợ đang trống. Hãy thêm người mới để bắt đầu theo dõi công nợ và chia tiền cuộc vui!
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={onOpenAddDebtor}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Thêm Người Nợ Mới</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-10 bg-white rounded-2xl border border-dashed border-slate-200 text-slate-400 text-xs space-y-2">
                <Users className="w-8 h-8 mx-auto text-slate-300" />
                <div>Không tìm thấy người nào phù hợp với bộ lọc hiện tại.</div>
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setDebtorStatusFilter('ALL');
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Đặt lại bộ lọc
                </button>
              </div>
            )
          ) : viewMode === 'GRID' ? (
            /* BỐ CỤC CHẾ ĐỘ 1: THẺ BENTO 3D (GRID CARDS VIEW) */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {displayedDebtors.map((debtor) => {
                const stat = debtorStatsMap.get(debtor.id) || {
                  balance: 0,
                  totalDebt: 0,
                  totalPaid: 0,
                  paidRate: 0,
                  txCount: 0,
                };
                const balance = stat.balance;
                const totalDebt = stat.totalDebt;
                const totalPaid = stat.totalPaid;
                const paidRate = stat.paidRate;

                return (
                  <div
                    key={debtor.id}
                    className={`bg-white rounded-3xl border p-4 sm:p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between gap-3.5 relative overflow-hidden group ${
                      balance > 0
                        ? 'border-emerald-200/90 hover:border-emerald-300'
                        : balance < 0
                        ? 'border-rose-200/90 hover:border-rose-300'
                        : 'border-slate-200/90 hover:border-slate-300'
                    }`}
                  >
                    <div>
                      {/* Top Row: Avatar, Info & Balance */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div
                            onClick={() => onSelectDebtor(debtor)}
                            className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-base shrink-0 shadow-xs cursor-pointer transition-transform hover:scale-105 select-none ${
                              balance > 0
                                ? 'bg-gradient-to-br from-emerald-50 to-emerald-100 text-emerald-700 border border-emerald-200/80'
                                : balance < 0
                                ? 'bg-gradient-to-br from-rose-50 to-rose-100 text-rose-700 border border-rose-200/80'
                                : 'bg-gradient-to-br from-slate-100 to-slate-200 text-slate-700 border border-slate-200/80'
                            }`}
                          >
                            {debtor.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <h3
                              onClick={() => onSelectDebtor(debtor)}
                              className="font-extrabold text-sm sm:text-base text-slate-900 hover:text-emerald-600 cursor-pointer flex items-center gap-1.5 truncate transition-colors"
                            >
                              <span>{debtor.name}</span>
                            </h3>
                            <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 mt-1">
                              {/* PIN badge with hide/reveal toggle (Đề xuất 2: Ẩn PIN mặc định) */}
                              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-amber-50/90 text-amber-900 rounded-xl font-mono text-[11px] font-bold border border-amber-200/80">
                                <KeyRound className="w-3 h-3 text-amber-600 shrink-0" />
                                <span className="tracking-wider">
                                  {revealedPinIds.has(debtor.id) ? debtor.pin : '••••'}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => toggleRevealPin(e, debtor.id)}
                                  className="p-0.5 hover:bg-amber-200/70 rounded-md text-amber-700 hover:text-amber-950 transition-colors cursor-pointer"
                                  title={revealedPinIds.has(debtor.id) ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                                >
                                  {revealedPinIds.has(debtor.id) ? (
                                    <EyeOff className="w-3 h-3" />
                                  ) : (
                                    <Eye className="w-3 h-3 text-amber-700" />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => handleCopyPin(e, debtor)}
                                  className="ml-0.5 p-0.5 hover:bg-amber-200/70 rounded-md text-amber-700 hover:text-amber-950 transition-colors cursor-pointer"
                                  title="Sao chép mật khẩu tra cứu"
                                >
                                  {copiedPinId === debtor.id ? (
                                    <Check className="w-3 h-3 text-emerald-600" />
                                  ) : (
                                    <Copy className="w-3 h-3" />
                                  )}
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Balance Badge */}
                        <div className="text-right shrink-0">
                          <div
                            className={`font-black text-base sm:text-lg font-mono tracking-tight ${
                              balance > 0
                                ? 'text-emerald-600'
                                : balance < 0
                                ? 'text-rose-600'
                                : 'text-slate-400'
                            }`}
                          >
                            {balance > 0 ? `+${formatVND(balance)}` : balance < 0 ? `-${formatVND(Math.abs(balance))}` : '0 đ'}
                          </div>
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-extrabold mt-0.5 ${
                              balance > 0
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/70'
                                : balance < 0
                                ? 'bg-rose-50 text-rose-700 border border-rose-200/70'
                                : 'bg-slate-100 text-slate-600 border border-slate-200/70'
                            }`}
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                            {balance > 0 ? 'Đang nợ bạn' : balance < 0 ? 'Bạn nợ họ' : 'Đã hết nợ'}
                          </span>
                        </div>
                      </div>

                      {/* Tiến Độ Thanh Toán Khoản NỢ (Debt Progress Meter) */}
                      {totalDebt > 0 && (
                        <div className="mt-3 bg-slate-50/80 p-2.5 rounded-2xl border border-slate-100 text-xs">
                          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 mb-1">
                            <span>Đã trả: {formatVND(totalPaid)}</span>
                            <span className="font-bold text-slate-700">{paidRate}%</span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                            <div
                              style={{ width: `${paidRate}%` }}
                              className={`h-full rounded-full transition-all duration-300 ${
                                paidRate >= 100
                                  ? 'bg-emerald-500'
                                  : paidRate > 50
                                  ? 'bg-teal-500'
                                  : 'bg-amber-500'
                              }`}
                            ></div>
                          </div>
                        </div>
                      )}

                      {debtor.note && (
                        <p className="text-xs text-slate-600 mt-2.5 bg-slate-50/90 px-3 py-1.5 rounded-xl break-words border border-slate-200/70 leading-relaxed">
                          📝 {debtor.note}
                        </p>
                      )}
                    </div>

                    {/* Action buttons (Đề xuất 3: Nút nhanh nổi bật) */}
                    <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            triggerHaptic('medium');
                            onOpenAddTx(debtor.id);
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold rounded-xl transition-all text-[11px] cursor-pointer shadow-xs active:scale-95"
                          title="Ghi nợ hoặc thu tiền ngay cho người này"
                        >
                          <PlusCircle className="w-3.5 h-3.5" />
                          <span>+ Ghi Nợ / Thu</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setGuideDebtor(debtor)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100/90 hover:bg-slate-200/90 text-slate-700 font-semibold rounded-xl transition-all text-[11px] cursor-pointer border border-slate-200/60"
                          title="Xem tin nhắn và đường link tra cứu gửi cho người này"
                        >
                          <BookOpen className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Tra Cứu</span>
                        </button>

                        {onDeleteDebtor && (
                          <button
                            type="button"
                            onClick={() => setDebtorToDelete(debtor)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl text-[11px] font-semibold transition-colors cursor-pointer"
                            title="Xóa người nợ này"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Xóa</span>
                          </button>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => onSelectDebtor(debtor)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold rounded-xl transition-all text-[11px] cursor-pointer ml-auto shadow-xs"
                      >
                        <span>Chi tiết</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : viewMode === 'LIST' ? (
            /* BỐ CỤC CHẾ ĐỘ 2: DANH SÁCH APPLE INSET GROUPED (iOS NATIVE LIST) */
            <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden divide-y divide-slate-100/90">
              {displayedDebtors.map((debtor) => {
                const stat = debtorStatsMap.get(debtor.id);
                const balance = stat ? stat.balance : 0;

                return (
                  <div
                    key={debtor.id}
                    onClick={() => {
                      triggerHaptic('light');
                      onSelectDebtor(debtor);
                    }}
                    className="p-3.5 sm:p-4 hover:bg-slate-50/80 active:bg-slate-100/80 transition-colors flex items-center justify-between gap-3 cursor-pointer group"
                  >
                    {/* Left: Squircle Avatar & Info */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-11 h-11 rounded-2xl flex items-center justify-center font-black text-sm shrink-0 shadow-2xs select-none ${
                          balance > 0
                            ? 'bg-gradient-to-br from-emerald-50 to-emerald-100/80 text-emerald-700 border border-emerald-200/70'
                            : balance < 0
                            ? 'bg-gradient-to-br from-rose-50 to-rose-100/80 text-rose-700 border border-rose-200/70'
                            : 'bg-gradient-to-br from-slate-100 to-slate-200 text-slate-700 border border-slate-200/70'
                        }`}
                      >
                        {debtor.name.charAt(0).toUpperCase()}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="font-extrabold text-sm sm:text-base text-slate-900 group-hover:text-emerald-700 transition-colors truncate">
                            {debtor.name}
                          </h4>
                          {debtor.note && (
                            <span className="hidden sm:inline-block text-[11px] text-slate-400 font-medium truncate max-w-[150px]">
                              • {debtor.note}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 mt-0.5">
                          {/* PIN badge with hide/reveal in List view (Đề xuất 2) */}
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleRevealPin(e, debtor.id);
                            }}
                            className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 hover:bg-amber-100 text-amber-900 rounded-lg font-mono text-[10px] font-bold border border-amber-200/70 transition-colors cursor-pointer select-none"
                            title={revealedPinIds.has(debtor.id) ? 'Nhấn để ẩn PIN' : 'Nhấn để hiện PIN'}
                          >
                            <KeyRound className="w-2.5 h-2.5 text-amber-600" />
                            <span className="tracking-wider">
                              {revealedPinIds.has(debtor.id) ? debtor.pin : '••••'}
                            </span>
                            {revealedPinIds.has(debtor.id) ? (
                              <EyeOff className="w-2.5 h-2.5 text-amber-600 ml-0.5" />
                            ) : (
                              <Eye className="w-2.5 h-2.5 text-amber-600 ml-0.5" />
                            )}
                          </span>

                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyPin(e, debtor);
                            }}
                            className="p-1 hover:bg-slate-200/60 rounded-md text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                            title="Sao chép PIN"
                          >
                            {copiedPinId === debtor.id ? (
                              <Check className="w-2.5 h-2.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-2.5 h-2.5" />
                            )}
                          </span>

                          <span
                            className={`inline-flex items-center gap-1 text-[11px] font-bold ${
                              balance > 0
                                ? 'text-emerald-700'
                                : balance < 0
                                ? 'text-rose-700'
                                : 'text-slate-400'
                            }`}
                          >
                            {balance > 0 ? 'Họ nợ bạn' : balance < 0 ? 'Bạn nợ họ' : 'Đã thanh toán'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Right: Balance, Quick Action & Chevron (Đề xuất 3) */}
                    <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
                      <div className="text-right">
                        <div
                          className={`text-sm sm:text-base font-extrabold font-mono tracking-tight ${
                            balance > 0
                              ? 'text-emerald-700'
                              : balance < 0
                              ? 'text-rose-600'
                              : 'text-slate-400'
                          }`}
                        >
                          {balance > 0
                            ? `+${formatVND(balance)}`
                            : balance < 0
                            ? `-${formatVND(Math.abs(balance))}`
                            : '0 đ'}
                        </div>
                      </div>

                      {/* 1-Tap Quick Action (Đề xuất 3) */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          triggerHaptic('medium');
                          onOpenAddTx(debtor.id);
                        }}
                        className="p-1.5 sm:p-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 active:scale-95 text-emerald-700 border border-emerald-200/80 transition-all cursor-pointer shadow-2xs"
                        title={`Ghi nợ / Thu tiền nhanh cho ${debtor.name}`}
                      >
                        <PlusCircle className="w-4 h-4" />
                      </button>

                      <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 group-hover:translate-x-0.5 transition-all" />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* BỐ CỤC CHẾ ĐỘ 2: BẢNG KẾ TOÁN CHUYÊN NGHIỆP (PRO DATA TABLE VIEW) */
            <div className="bg-white rounded-3xl border border-slate-200/90 overflow-hidden shadow-xs">
              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50/90 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                      <th className="py-3.5 px-4">Người Nợ</th>
                      <th className="py-3.5 px-3">Mật Khẩu</th>
                      <th className="py-3.5 px-3 text-right">Tổng Nợ (+)</th>
                      <th className="py-3.5 px-3 text-right">Đã Trả (-)</th>
                      <th className="py-3.5 px-4 text-right">Dư Nợ Hiện Tại</th>
                      <th className="py-3.5 px-3 text-center">Trạng Thái</th>
                      <th className="py-3.5 px-4 text-right">Thao Tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {displayedDebtors.map((debtor) => {
                      const stat = debtorStatsMap.get(debtor.id) || {
                        balance: 0,
                        totalDebt: 0,
                        totalPaid: 0,
                        paidRate: 0,
                        txCount: 0,
                      };
                      const balance = stat.balance;
                      const totalDebt = stat.totalDebt;
                      const totalPaid = stat.totalPaid;

                      return (
                        <tr
                          key={debtor.id}
                          onClick={() => onSelectDebtor(debtor)}
                          className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                        >
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <div
                                className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-xs shrink-0 select-none ${
                                  balance > 0
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80'
                                    : balance < 0
                                    ? 'bg-rose-50 text-rose-700 border border-rose-200/80'
                                    : 'bg-slate-100 text-slate-700 border border-slate-200/80'
                                }`}
                              >
                                {debtor.name.charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <div className="font-extrabold text-slate-900 group-hover:text-emerald-700 transition-colors">
                                  {debtor.name}
                                </div>
                                {debtor.note && (
                                  <div className="text-[11px] text-slate-400 truncate max-w-[180px]">
                                    {debtor.note}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>

                          <td className="py-3 px-3">
                            <div
                              onClick={(e) => handleCopyPin(e, debtor)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200/80 rounded-lg font-mono text-[11px] font-bold cursor-pointer transition-colors"
                              title="Bấm để sao chép mật khẩu"
                            >
                              <KeyRound className="w-3 h-3 text-amber-600" />
                              <span>{debtor.pin}</span>
                              {copiedPinId === debtor.id ? (
                                <Check className="w-3 h-3 text-emerald-600" />
                              ) : (
                                <Copy className="w-3 h-3 text-slate-400" />
                              )}
                            </div>
                          </td>

                          <td className="py-3 px-3 text-right font-mono font-bold text-slate-700">
                            {totalDebt > 0 ? `+${formatVND(totalDebt)}` : '0 đ'}
                          </td>

                          <td className="py-3 px-3 text-right font-mono font-bold text-emerald-600">
                            {totalPaid > 0 ? `-${formatVND(totalPaid)}` : '0 đ'}
                          </td>

                          <td className="py-3 px-4 text-right">
                            <span
                              className={`font-black font-mono text-sm ${
                                balance > 0
                                  ? 'text-emerald-600'
                                  : balance < 0
                                  ? 'text-rose-600'
                                  : 'text-slate-400'
                              }`}
                            >
                              {balance > 0 ? `+${formatVND(balance)}` : balance < 0 ? `-${formatVND(Math.abs(balance))}` : '0 đ'}
                            </span>
                          </td>

                          <td className="py-3 px-3 text-center">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                                balance > 0
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                                  : balance < 0
                                  ? 'bg-rose-50 text-rose-700 border border-rose-200/60'
                                  : 'bg-slate-100 text-slate-600 border border-slate-200/60'
                              }`}
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                              {balance > 0 ? 'Đang nợ' : balance < 0 ? 'Bạn nợ' : 'Hết nợ'}
                            </span>
                          </td>

                          <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => onOpenAddTx(debtor.id)}
                                className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-[11px] font-bold transition-colors cursor-pointer"
                                title="Ghi giao dịch nhanh"
                              >
                                <PlusCircle className="w-3.5 h-3.5" />
                              </button>

                              <button
                                type="button"
                                onClick={() => setGuideDebtor(debtor)}
                                className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer"
                                title="Xem mẫu gửi tra cứu"
                              >
                                <BookOpen className="w-3.5 h-3.5 text-emerald-600" />
                              </button>

                              {onDeleteDebtor && (
                                <button
                                  type="button"
                                  onClick={() => setDebtorToDelete(debtor)}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                  title="Xóa người này"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>Xóa</span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => onSelectDebtor(debtor)}
                                className="p-1.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-lg transition-colors cursor-pointer ml-1"
                                title="Xem chi tiết"
                              >
                                <ChevronRight className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Pagination & Load More Footer for Debtors */}
          {sortedDebtors.length > 0 && (
            <div className="p-3.5 sm:p-4 rounded-2xl border border-slate-200/80 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-2xs mt-3">
              <div className="text-slate-500 font-medium">
                Đang hiển thị{' '}
                <strong className="text-slate-800">
                  {displayedDebtors.length}
                </strong>{' '}
                trên tổng số{' '}
                <strong className="text-slate-800">
                  {sortedDebtors.length}
                </strong>{' '}
                người nợ
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {sortedDebtors.length > displayedDebtors.length && (
                  <>
                    <button
                      type="button"
                      onClick={() => setDebtorVisibleLimit((prev) => prev + 30)}
                      className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 font-semibold rounded-xl border border-slate-200 transition-colors cursor-pointer shadow-2xs"
                    >
                      Xem thêm 30 người
                    </button>
                    <button
                      type="button"
                      onClick={() => setDebtorVisibleLimit(sortedDebtors.length)}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-semibold rounded-xl transition-colors cursor-pointer shadow-xs"
                    >
                      Hiển thị toàn bộ ({sortedDebtors.length})
                    </button>
                  </>
                )}

                {displayedDebtors.length >= sortedDebtors.length && sortedDebtors.length > 30 && (
                  <button
                    type="button"
                    onClick={() => setDebtorVisibleLimit(30)}
                    className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-600 font-semibold rounded-xl border border-slate-200 transition-colors cursor-pointer text-xs"
                  >
                    Thu gọn về 30 người
                  </button>
                )}
              </div>
            </div>
          )}
          </motion.div>
        )}

        {/* --- TAB 2: ALL TRANSACTIONS HISTORY (Enhanced Full Display, Filter & Pagination) --- */}
        {activeTab === 'TRANSACTIONS' && (
          <motion.div
            key="tab-transactions"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs space-y-0"
          >
            {/* Tab Header & Quick Action */}
            <div className="p-3.5 sm:p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-r from-slate-50 via-white to-slate-50">
              <div>
                <h3 className="font-bold text-slate-800 text-sm sm:text-base flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-emerald-600" />
                  <span>Lịch sử toàn bộ biến động</span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    {transactions.length} giao dịch
                  </span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tra cứu, lọc và quản lý chi tiết toàn bộ dòng tiền thu/chi, chia tiền trong sổ
                </p>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-center">
                <button
                  type="button"
                  onClick={() => onOpenAddTx()}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Tạo giao dịch</span>
                </button>
              </div>
            </div>

            {/* Filter & Search Toolbar */}
            <div className="p-3.5 sm:p-4 border-b border-slate-100 bg-slate-50/60 space-y-3">
              {/* Row 1: Search & Debtor Dropdown */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                <div className="sm:col-span-7 relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={txSearchTerm}
                    onChange={(e) => {
                      setTxSearchTerm(e.target.value);
                      setTxVisibleLimit(30);
                    }}
                    placeholder="Tìm theo người nợ, ghi chú, số tiền, ngày..."
                    className="w-full pl-9 pr-8 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-slate-900 placeholder:text-slate-400"
                  />
                  {txSearchTerm && (
                    <button
                      type="button"
                      onClick={() => setTxSearchTerm('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="sm:col-span-5 flex items-center gap-2">
                  <select
                    value={txDebtorFilter}
                    onChange={(e) => {
                      setTxDebtorFilter(e.target.value);
                      setTxVisibleLimit(30);
                    }}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-slate-700 font-medium cursor-pointer"
                  >
                    <option value="ALL">Tất cả người nợ ({debtors.length})</option>
                    {debtors.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 2: Type Filter Pills & Date/Sort Selectors */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
                  <button
                    type="button"
                    onClick={() => {
                      setTxTypeFilter('ALL');
                      setTxVisibleLimit(30);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                      txTypeFilter === 'ALL'
                        ? 'bg-slate-900 text-white shadow-2xs'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    Tất cả
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTxTypeFilter('ADD');
                      setTxVisibleLimit(30);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer inline-flex items-center gap-1 ${
                      txTypeFilter === 'ADD'
                        ? 'bg-rose-600 text-white shadow-2xs'
                        : 'bg-white text-rose-700 border border-rose-200 hover:bg-rose-50'
                    }`}
                  >
                    <ArrowUpRight className="w-3 h-3" />
                    <span>Ghi nợ (+)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTxTypeFilter('SUB');
                      setTxVisibleLimit(30);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer inline-flex items-center gap-1 ${
                      txTypeFilter === 'SUB'
                        ? 'bg-emerald-600 text-white shadow-2xs'
                        : 'bg-white text-emerald-700 border border-emerald-200 hover:bg-emerald-50'
                    }`}
                  >
                    <ArrowDownLeft className="w-3 h-3" />
                    <span>Đã trả (-)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTxTypeFilter('SPLIT');
                      setTxVisibleLimit(30);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer inline-flex items-center gap-1 ${
                      txTypeFilter === 'SPLIT'
                        ? 'bg-amber-600 text-white shadow-2xs'
                        : 'bg-white text-amber-800 border border-amber-200 hover:bg-amber-50'
                    }`}
                  >
                    <Users className="w-3 h-3" />
                    <span>Chia cuộc vui</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={txDateRangeFilter}
                    onChange={(e) => {
                      setTxDateRangeFilter(e.target.value as any);
                      setTxVisibleLimit(30);
                    }}
                    className="px-2.5 py-1 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-700 font-medium cursor-pointer"
                  >
                    <option value="ALL">Toàn thời gian</option>
                    <option value="THIS_MONTH">Tháng này</option>
                    <option value="LAST_MONTH">Tháng trước</option>
                  </select>

                  <select
                    value={txSortBy}
                    onChange={(e) => {
                      setTxSortBy(e.target.value as any);
                      setTxVisibleLimit(30);
                    }}
                    className="px-2.5 py-1 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-700 font-medium cursor-pointer"
                  >
                    <option value="DATE_DESC">Mới nhất trước</option>
                    <option value="DATE_ASC">Cũ nhất trước</option>
                    <option value="AMOUNT_DESC">Số tiền lớn nhất</option>
                    <option value="AMOUNT_ASC">Số tiền nhỏ nhất</option>
                  </select>
                </div>
              </div>

              {/* Statistics Pill Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-200/60 text-xs">
                <div className="bg-white p-2 rounded-xl border border-slate-200/80">
                  <div className="text-[11px] text-slate-500">Khớp bộ lọc</div>
                  <div className="font-bold text-slate-900 font-mono mt-0.5">
                    {txFilteredStats.count} / {transactions.length} GD
                  </div>
                </div>
                <div className="bg-rose-50/60 p-2 rounded-xl border border-rose-200/70">
                  <div className="text-[11px] text-rose-700 font-medium">Tổng ghi nợ (+)</div>
                  <div className="font-bold text-rose-700 font-mono mt-0.5">
                    +{formatVND(txFilteredStats.addTotal)}
                  </div>
                </div>
                <div className="bg-emerald-50/60 p-2 rounded-xl border border-emerald-200/70">
                  <div className="text-[11px] text-emerald-700 font-medium">Tổng đã thu (-)</div>
                  <div className="font-bold text-emerald-700 font-mono mt-0.5">
                    -{formatVND(txFilteredStats.subTotal)}
                  </div>
                </div>
                <div className="bg-slate-100/70 p-2 rounded-xl border border-slate-200">
                  <div className="text-[11px] text-slate-600 font-medium">Biến động ròng</div>
                  <div
                    className={`font-bold font-mono mt-0.5 ${
                      txFilteredStats.netTotal > 0
                        ? 'text-rose-700'
                        : txFilteredStats.netTotal < 0
                        ? 'text-emerald-700'
                        : 'text-slate-700'
                    }`}
                  >
                    {txFilteredStats.netTotal > 0 ? `+${formatVND(txFilteredStats.netTotal)}` : formatVND(txFilteredStats.netTotal)}
                  </div>
                </div>
              </div>
            </div>

            {/* List of Transactions */}
            {allFilteredTransactions.length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                  <Search className="w-5 h-5" />
                </div>
                <p className="text-xs font-semibold text-slate-700">
                  Không tìm thấy giao dịch nào phù hợp với bộ lọc hiện tại.
                </p>
                <p className="text-[11px] text-slate-400">
                  Thử tìm kiếm từ khóa khác hoặc đặt lại bộ lọc để xem toàn bộ giao dịch.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setTxSearchTerm('');
                    setTxTypeFilter('ALL');
                    setTxDebtorFilter('ALL');
                    setTxDateRangeFilter('ALL');
                    setTxSortBy('DATE_DESC');
                    setTxVisibleLimit(30);
                  }}
                  className="px-3 py-1.5 text-xs text-emerald-700 font-semibold bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1 mt-2"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Đặt lại bộ lọc</span>
                </button>
              </div>
            ) : (
              <div className="p-3.5 sm:p-4 space-y-2.5">
                {displayedTransactions.map((tx) => (
                  <TransactionRow
                    key={tx.id}
                    transaction={tx}
                    debtors={debtors}
                    debtorsMap={debtorsMap}
                    parties={parties}
                    showDebtorName={true}
                    onSelectDebtor={onSelectDebtor}
                    onViewImage={onViewImage}
                    onEditTx={(t) => {
                      if (t.partyId || t.category === 'PARTY_SPLIT') {
                        if (onEditParty) {
                          const p = parties.find(
                            (party) =>
                              party.id === t.partyId ||
                              (party.name && t.note && t.note.includes(party.name))
                          );
                          if (p) onEditParty(p);
                        }
                        return;
                      }
                      if (onEditTx) onEditTx(t);
                    }}
                    onDeleteTx={(t) => {
                      if (t.partyId || t.category === 'PARTY_SPLIT') {
                        return; // Khóa xóa lẻ giao dịch cuộc vui
                      }
                      setTxToDelete(t);
                    }}
                    onEditParty={onEditParty}
                  />
                ))}
              </div>
            )}

            {/* Pagination & Load More Footer */}
            {allFilteredTransactions.length > 0 && (
              <div className="p-3.5 sm:p-4 border-t border-slate-100 bg-slate-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="text-slate-500 font-medium">
                  Đang hiển thị{' '}
                  <strong className="text-slate-800">
                    {displayedTransactions.length}
                  </strong>{' '}
                  trên tổng số{' '}
                  <strong className="text-slate-800">
                    {allFilteredTransactions.length}
                  </strong>{' '}
                  giao dịch khớp bộ lọc
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {allFilteredTransactions.length > displayedTransactions.length && (
                    <>
                      <button
                        type="button"
                        onClick={() => setTxVisibleLimit((prev) => prev + 30)}
                        className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 font-semibold rounded-xl border border-slate-200 transition-colors cursor-pointer shadow-2xs"
                      >
                        Xem thêm 30 giao dịch
                      </button>
                      <button
                        type="button"
                        onClick={() => setTxVisibleLimit(allFilteredTransactions.length)}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-semibold rounded-xl transition-colors cursor-pointer shadow-xs"
                      >
                        Hiển thị toàn bộ ({allFilteredTransactions.length})
                      </button>
                    </>
                  )}

                  {displayedTransactions.length >= allFilteredTransactions.length && allFilteredTransactions.length > 30 && (
                    <button
                      type="button"
                      onClick={() => setTxVisibleLimit(30)}
                      className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-600 font-semibold rounded-xl border border-slate-200 transition-colors cursor-pointer text-xs"
                    >
                      Thu gọn về 30 giao dịch
                    </button>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* --- TAB 3: PARTIES HISTORY (Mobile Optimized) --- */}
        {activeTab === 'PARTIES' && (
          <motion.div
            key="tab-parties"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="space-y-3"
          >
          {sortedParties.length === 0 ? (
            <div className="text-center py-10 bg-white rounded-2xl border border-dashed border-slate-200 text-slate-400 text-xs">
              Chưa có cuộc vui nào được chia tiền.
            </div>
          ) : (
            sortedParties.map((party) => {
              const payer =
                party.payerType === 'ME'
                  ? settings.ownerName
                  : party.payerType === 'DEBTOR_ASSIGNED'
                  ? `${debtors.find((d) => d.id === party.payerDebtorId)?.name || 'Bạn bè'} (gán nợ cho Tôi)`
                  : debtors.find((d) => d.id === party.payerDebtorId)?.name || 'Người nợ';

              return (
                <div
                  key={party.id}
                  className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-2 text-xs"
                >
                  {(() => {
                    const numberOfPeople =
                      party.totalPeopleCount ||
                      (party.totalAmount > 0 && party.splitAmountPerPerson > 0
                        ? Math.round(party.totalAmount / party.splitAmountPerPerson)
                        : (party.participantDebtorIds?.length || 0) + (party.includeMe ? 1 : 0));

                    const payerObj = party.payerDebtorId ? debtors.find((d) => d.id === party.payerDebtorId) : null;
                    const baseParticipants = [
                      ...(party.includeMe ? [settings.ownerName] : []),
                      ...(party.payerType === 'DEBTOR_ASSIGNED' && payerObj && party.payerIncluded !== false
                        ? [payerObj.name]
                        : []),
                      ...party.participantDebtorIds
                        .filter((id) => party.payerType !== 'DEBTOR_ASSIGNED' || id !== party.payerDebtorId)
                        .map((id) => debtors.find((d) => d.id === id)?.name || id),
                    ];
                    const extraCount = Math.max(0, numberOfPeople - baseParticipants.length);
                    const allParticipantDisplay = [
                      ...baseParticipants,
                      ...(extraCount > 0 ? [`+${extraCount} người khác`] : []),
                    ].join(', ');

                    return (
                      <>
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-1.5">
                          <div>
                            <div className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                              <PartyPopper className="w-4 h-4 text-amber-600" />
                              <span>{party.name}</span>
                            </div>
                            <div className="text-slate-500 text-xs mt-0.5 flex items-center gap-1.5 flex-wrap">
                              <span>{party.date}</span>
                              <span aria-hidden="true" className="text-slate-300">·</span>
                              <span>Thanh toán: <strong className="text-slate-800">{payer}</strong></span>
                            </div>
                            {party.note && (
                              <div className="text-slate-500 text-xs italic mt-1">
                                Ghi chú: {party.note}
                              </div>
                            )}
                          </div>

                          <div className="text-left sm:text-right">
                            <div className="text-base font-black text-amber-700 font-mono tabular-nums">
                              {formatVND(party.totalAmount)}
                            </div>
                            <div className="text-xs text-slate-500 font-medium font-mono tabular-nums">
                              Chia {numberOfPeople} - {formatVND(party.splitAmountPerPerson)} 
                            </div>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-600">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-slate-400 font-medium">Tham gia:</span>
                            <span className="font-medium text-slate-800">
                              {allParticipantDisplay}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                            {party.billImage && (
                              <button
                                type="button"
                                onClick={() => onViewImage(party.billImage!, `Hóa đơn: ${party.name}`)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200/90 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                                title="Xem ảnh hóa đơn cuộc vui"
                              >
                                <img src={party.billImage} alt="Hóa đơn" className="w-3.5 h-3.5 rounded object-cover border border-emerald-300 shrink-0" />
                                <Receipt className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                <span>Hóa đơn</span>
                              </button>
                            )}

                            {onEditParty && (
                              <button
                                type="button"
                                onClick={() => onEditParty(party)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 font-semibold rounded-lg border border-amber-200 transition-colors cursor-pointer text-xs"
                                title="Sửa cuộc chia tiền này (hệ thống tự động tính lại cho mọi người)"
                              >
                                <Pencil className="w-3 h-3 text-amber-600" />
                                <span>Sửa</span>
                              </button>
                            )}

                            {onDeleteParty && (
                              <button
                                type="button"
                                onClick={() => setPartyToDelete(party)}
                                className="inline-flex items-center gap-1 px-2 py-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 font-semibold rounded-lg transition-colors cursor-pointer text-xs"
                                title="Xóa cuộc chia tiền này (tự động xóa giao dịch và hoàn số dư cho mọi người)"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>Xóa</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              );
            })
          )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Guide Modal when Owner clicks "Hướng dẫn tra cứu" */}
      {guideDebtor && (
        <LookupGuideModal
          isOpen={!!guideDebtor}
          onClose={() => setGuideDebtor(null)}
          debtor={guideDebtor}
          balance={getDebtorBalance(guideDebtor.id, transactions)}
          settings={settings}
        />
      )}

      {/* Admin Password Verification Modal to Clear Sample Data */}
      <ConfirmClearSampleModal
        isOpen={isConfirmClearOpen}
        onClose={() => setIsConfirmClearOpen(false)}
        onSuccess={() => {
          if (onDataReload) onDataReload();
          showToast('Đã xóa sạch toàn bộ dữ liệu mẫu! Ứng dụng của bạn đã sẵn sàng ghi dữ liệu thật.');
        }}
      />

      {/* Admin Password Verification Modal to Reset/Restore Sample Data */}

      {/* In-App Confirm Delete Debtor Modal */}
      <ConfirmDeleteDebtorModal
        isOpen={!!debtorToDelete}
        onClose={() => setDebtorToDelete(null)}
        debtor={debtorToDelete}
        balance={debtorToDelete ? getDebtorBalance(debtorToDelete.id, transactions) : 0}
        transactionCount={
          debtorToDelete
            ? transactions.filter((t) => t.debtorId === debtorToDelete.id).length
            : 0
        }
        onConfirm={() => {
          if (debtorToDelete && onDeleteDebtor) {
            onDeleteDebtor(debtorToDelete.id);
            showToast(`Đã xóa "${debtorToDelete.name}" thành công!`, 'success');
            setDebtorToDelete(null);
          }
        }}
      />

      {/* In-App Confirm Delete Party Split Modal */}
      <ConfirmDeletePartyModal
        isOpen={!!partyToDelete}
        onClose={() => setPartyToDelete(null)}
        party={partyToDelete}
        transactionCount={
          partyToDelete
            ? transactions.filter((t) => t.partyId === partyToDelete.id).length
            : 0
        }
        onConfirm={() => {
          if (partyToDelete && onDeleteParty) {
            onDeleteParty(partyToDelete.id);
            showToast(`Đã xóa cuộc vui "${partyToDelete.name}" và toàn bộ giao dịch liên quan!`, 'success');
            setPartyToDelete(null);
          }
        }}
      />

      {/* In-App Confirm Delete Transaction Modal */}
      <ConfirmDeleteTxModal
        isOpen={!!txToDelete}
        onClose={() => setTxToDelete(null)}
        transaction={txToDelete}
        debtorName={
          txToDelete ? debtors.find((d) => d.id === txToDelete.debtorId)?.name : undefined
        }
        onConfirm={() => {
          if (txToDelete && onDeleteTx) {
            onDeleteTx(txToDelete.id);
            showToast('Đã xóa giao dịch thành công!', 'success');
            setTxToDelete(null);
          }
        }}
      />

      {/* Toast Notification Banner */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-20 sm:bottom-6 right-4 sm:right-6 z-50 pointer-events-none"
          >
            <div
              className={`px-4 py-3 rounded-2xl shadow-xl border text-sm font-semibold flex items-center gap-2.5 ${
                toast.type === 'success'
                  ? 'bg-emerald-600 text-white border-emerald-500 shadow-emerald-600/20'
                  : 'bg-slate-800 text-white border-slate-700 shadow-slate-900/30'
              }`}
            >
              <span>{toast.type === 'success' ? '✓' : 'ℹ'}</span>
              <span>{toast.message}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
