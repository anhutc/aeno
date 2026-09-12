/**
 * ============================================================================
 * GHI CHÚ CHỈNH SỬA / CHANGELOG:
 * - Hỗ trợ chức năng xóa con nợ với hộp thoại xác nhận nội bộ In-App ConfirmDeleteDebtorModal,
 *   thay thế triệt để window.confirm() bị chặn bởi sandbox.
 * - Xóa số điện thoại người nợ: Bỏ tìm kiếm theo SĐT người nợ và bỏ thẻ SĐT trên từng con nợ.
 * - Thêm số điện thoại Chủ Nợ: Hiển thị nổi bật SĐT Chủ Nợ (ownerPhone) tại thanh thông tin.
 * ============================================================================
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  UserPlus,
  PlusCircle,
  PartyPopper,
  Search,
  KeyRound,
  Phone,
  ArrowUpRight,
  ArrowDownLeft,
  ChevronRight,
  Receipt,
  Users,
  Wallet,
  Sparkles,
  Calendar,
  BookOpen,
  Trash2,
  RefreshCw,
  Cloud,
  Pencil,
  Lock,
  Copy,
  Check,
  Filter,
  Image as ImageIcon,
  X,
  LayoutGrid,
  Table as TableIcon,
  ArrowUpDown,
  SlidersHorizontal,
  Eye,
  CreditCard,
  Layers,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  ChevronDown,
} from 'lucide-react';
import { Debtor, Transaction, PartySplit, AppSettings } from '../types';
import { formatVND } from '../utils/vietqr';
import { getDebtorBalance } from '../utils/storage';
import { LookupGuideModal } from './LookupGuideModal';
import { ConfirmClearSampleModal } from './ConfirmClearSampleModal';
import { ConfirmResetSampleModal } from './ConfirmResetSampleModal';
import { ConfirmDeleteDebtorModal } from './ConfirmDeleteDebtorModal';
import { ConfirmDeletePartyModal } from './ConfirmDeletePartyModal';
import { ConfirmDeleteTxModal } from './ConfirmDeleteTxModal';

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
  onOpenSettings,
  onDataReload,
  onEditTx,
  onDeleteTx,
  onEditParty,
  onDeleteParty,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'DEBTORS' | 'TRANSACTIONS' | 'PARTIES'>('DEBTORS');
  const [viewMode, setViewMode] = useState<'GRID' | 'TABLE'>('GRID');
  const [sortBy, setSortBy] = useState<'BALANCE_DESC' | 'BALANCE_ASC' | 'NAME' | 'RECENT'>('BALANCE_DESC');
  const [debtorStatusFilter, setDebtorStatusFilter] = useState<'ALL' | 'RECEIVABLE' | 'PAYABLE' | 'SETTLED'>('ALL');
  const [copiedPinId, setCopiedPinId] = useState<string | null>(null);
  const [guideDebtor, setGuideDebtor] = useState<Debtor | null>(null);
  const [debtorToDelete, setDebtorToDelete] = useState<Debtor | null>(null);
  const [partyToDelete, setPartyToDelete] = useState<PartySplit | null>(null);
  const [txToDelete, setTxToDelete] = useState<Transaction | null>(null);
  const [isConfirmClearOpen, setIsConfirmClearOpen] = useState(false);
  const [isConfirmResetOpen, setIsConfirmResetOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' } | null>(null);

  const showToast = (message: string, type: 'success' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Check if current data contains sample mockup data
  const hasSampleData = debtors.some((d) =>
    ['debtor-nam', 'debtor-binh', 'debtor-an', 'debtor-cuong', 'd1', 'd2', 'd3', 'd4'].includes(d.id)
  );

  const handleResetSampleData = () => {
    setIsConfirmResetOpen(true);
  };

  // Calculate totals
  let totalReceivable = 0; // People owe me (> 0)
  let totalPayable = 0; // I owe people (< 0)

  debtors.forEach((d) => {
    const bal = getDebtorBalance(d.id, transactions);
    if (bal > 0) {
      totalReceivable += bal;
    } else if (bal < 0) {
      totalPayable += Math.abs(bal);
    }
  });

  const netBalance = totalReceivable - totalPayable;
  const totalVolume = totalReceivable + totalPayable;
  const receivableRatio = totalVolume > 0 ? Math.round((totalReceivable / totalVolume) * 100) : 50;
  const payableRatio = totalVolume > 0 ? 100 - receivableRatio : 50;

  // Counts by status
  const receivableDebtors = debtors.filter((d) => getDebtorBalance(d.id, transactions) > 0);
  const payableDebtors = debtors.filter((d) => getDebtorBalance(d.id, transactions) < 0);
  const settledDebtors = debtors.filter((d) => getDebtorBalance(d.id, transactions) === 0);

  // Filter debtors by search and status
  const filteredDebtors = debtors
    .filter((d) => {
      if (debtorStatusFilter === 'RECEIVABLE') return getDebtorBalance(d.id, transactions) > 0;
      if (debtorStatusFilter === 'PAYABLE') return getDebtorBalance(d.id, transactions) < 0;
      if (debtorStatusFilter === 'SETTLED') return getDebtorBalance(d.id, transactions) === 0;
      return true;
    })
    .filter(
      (d) =>
        d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (d.pin && d.pin.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (d.note && d.note.toLowerCase().includes(searchTerm.toLowerCase()))
    );

  // Sort debtors according to current sortBy
  const sortedDebtors = [...filteredDebtors].sort((a, b) => {
    const balA = getDebtorBalance(a.id, transactions);
    const balB = getDebtorBalance(b.id, transactions);
    if (sortBy === 'BALANCE_DESC') return balB - balA;
    if (sortBy === 'BALANCE_ASC') return balA - balB;
    if (sortBy === 'NAME') return a.name.localeCompare(b.name, 'vi');
    if (sortBy === 'RECENT') {
      const txsA = transactions.filter((t) => t.debtorId === a.id);
      const txsB = transactions.filter((t) => t.debtorId === b.id);
      const dateA = txsA.length > 0 ? Math.max(...txsA.map((t) => new Date(t.date).getTime())) : new Date(a.createdAt).getTime();
      const dateB = txsB.length > 0 ? Math.max(...txsB.map((t) => new Date(t.date).getTime())) : new Date(b.createdAt).getTime();
      return dateB - dateA;
    }
    return 0;
  });

  const handleCopyPin = (e: React.MouseEvent, debtor: Debtor) => {
    e.stopPropagation();
    navigator.clipboard.writeText(debtor.pin);
    setCopiedPinId(debtor.id);
    showToast(`Đã sao chép mật khẩu "${debtor.pin}" của ${debtor.name}`, 'success');
    setTimeout(() => setCopiedPinId(null), 2000);
  };

  // Recent transactions sorted descending
  const recentTransactions = [...transactions]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 20);

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Banner trợ giúp khi đang có dữ liệu mẫu */}
      {hasSampleData && (
        <div className="p-3.5 sm:p-4 bg-gradient-to-r from-amber-50 via-emerald-50 to-teal-50 border border-amber-200/80 rounded-2xl sm:rounded-3xl shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-700 flex items-center justify-center shrink-0 mt-0.5">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-slate-900 text-xs sm:text-sm">
                Bạn muốn sử dụng dữ liệu thực tế của riêng bạn thay vì dữ liệu mẫu?
              </div>
              <p className="text-slate-600 mt-0.5 leading-relaxed">
                Ứng dụng hiện đang nạp một số người nợ mẫu (Bình, Cường, Dũng...). Bạn có thể xóa sạch mẫu trong 1 click để bắt đầu ghi chép sổ thật.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setIsConfirmClearOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold shadow-2xs transition-colors cursor-pointer whitespace-nowrap"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Xóa Dữ Liệu Mẫu</span>
            </button>
          </div>
        </div>
      )}

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
            <div className="flex items-center justify-between gap-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200/80 text-emerald-800 text-[11px] font-bold uppercase tracking-wider">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>Trung Tâm Điều Hành Tài Chính</span>
              </div>
              <span className="text-[11px] text-slate-500 font-mono">
                Cập nhật tức thì
              </span>
            </div>

            <div className="mt-4">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Số Dư Nợ Ròng Toàn Sổ (Net Balance)
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
                  {netBalance > 0 ? `+${formatVND(netBalance)}` : formatVND(netBalance)}
                </span>
                <span className="text-xs font-normal text-slate-500">VNĐ</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {netBalance > 0
                  ? 'Tổng số tiền người khác đang nợ bạn lớn hơn số bạn cần chi trả.'
                  : netBalance < 0
                  ? 'Bạn đang có các khoản cần thanh toán lớn hơn khoản thu về.'
                  : 'Công nợ hiện đang ở trạng thái cân bằng tuyệt đối.'}
              </p>
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
              <div className="text-base font-black font-mono text-slate-900 mt-0.5">{debtors.length}</div>
            </div>
            <div className="p-2.5 bg-slate-50 rounded-2xl border border-slate-200/70">
              <div className="text-[10px] text-slate-500 uppercase font-bold">Tổng giao dịch</div>
              <div className="text-base font-black font-mono text-slate-900 mt-0.5">{transactions.length}</div>
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
              +{formatVND(totalReceivable)}
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
              -{formatVND(totalPayable)}
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

      {/* DOCK HÀNH ĐỘNG CÔNG NGHỆ CAO (HIGH-PERFORMANCE ACTION DOCK) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                Thêm Người Nợ Mới
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
          {/* Tabs Chính */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100/90 rounded-2xl border border-slate-200/80 overflow-x-auto scrollbar-none">
            <button
              type="button"
              onClick={() => setActiveTab('DEBTORS')}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                activeTab === 'DEBTORS'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200/60'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Danh Bạ</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${activeTab === 'DEBTORS' ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'}`}>
                {debtors.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('TRANSACTIONS')}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                activeTab === 'TRANSACTIONS'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200/60'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Giao Dịch</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${activeTab === 'TRANSACTIONS' ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'}`}>
                {transactions.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('PARTIES')}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                activeTab === 'PARTIES'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200/60'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
              }`}
            >
              <PartyPopper className="w-3.5 h-3.5" />
              <span>Cuộc Vui</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${activeTab === 'PARTIES' ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'}`}>
                {parties.length}
              </span>
            </button>
          </div>

          {/* Công cụ tìm kiếm & Chuyển đổi Bố cục (Chỉ hiển thị ở tab Danh bạ) */}
          {activeTab === 'DEBTORS' && (
            <div className="flex flex-wrap items-center gap-2">
              {/* Chuyển đổi Bố Cục Thẻ Bento vs Bảng Kế Toán Pro */}
              <div className="flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200/80">
                <button
                  type="button"
                  onClick={() => setViewMode('GRID')}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    viewMode === 'GRID'
                      ? 'bg-white text-slate-900 shadow-2xs border border-slate-200/60'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                  title="Xem dạng Thẻ Bento 3D"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Thẻ Bento</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('TABLE')}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    viewMode === 'TABLE'
                      ? 'bg-white text-slate-900 shadow-2xs border border-slate-200/60'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                  title="Xem dạng Bảng Kế Toán Pro"
                >
                  <TableIcon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Bảng Kế Toán</span>
                </button>
              </div>

              {/* Sắp Xếp */}
              <div className="relative">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="appearance-none bg-white border border-slate-300 text-slate-700 text-xs font-semibold py-1.5 pl-2.5 pr-7 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer shadow-2xs"
                >
                  <option value="BALANCE_DESC">Dư nợ cao nhất</option>
                  <option value="BALANCE_ASC">Dư nợ thấp nhất</option>
                  <option value="NAME">Tên A-Z</option>
                  <option value="RECENT">Giao dịch gần nhất</option>
                </select>
                <ArrowUpDown className="w-3 h-3 text-slate-400 absolute right-2 top-2.5 pointer-events-none" />
              </div>

              {/* Thanh Tìm Kiếm */}
              <div className="relative flex-1 sm:w-56">
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
                    className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 p-0.5"
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
              onClick={() => setDebtorStatusFilter('ALL')}
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
              onClick={() => setDebtorStatusFilter('RECEIVABLE')}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl font-bold transition-all whitespace-nowrap cursor-pointer ${
                debtorStatusFilter === 'RECEIVABLE'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200/60'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
              Đang nợ bạn ({receivableDebtors.length})
            </button>
            <button
              type="button"
              onClick={() => setDebtorStatusFilter('PAYABLE')}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl font-bold transition-all whitespace-nowrap cursor-pointer ${
                debtorStatusFilter === 'PAYABLE'
                  ? 'bg-rose-600 text-white shadow-2xs'
                  : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200/60'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
              Bạn nợ họ ({payableDebtors.length})
            </button>
            <button
              type="button"
              onClick={() => setDebtorStatusFilter('SETTLED')}
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
                    Không Có Con Nợ Nào
                  </h4>
                  <p className="text-slate-500 text-xs leading-relaxed">
                    Bạn đã xóa dữ liệu mẫu hoặc chưa thêm con nợ nào. Hãy bấm nút dưới đây để tạo con nợ!
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={onOpenAddDebtor}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Thêm Con Nợ</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleResetSampleData}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-600 rounded-xl text-xs font-medium transition-colors cursor-pointer"
                    title="Nạp lại dữ liệu người mẫu để xem lại giao diện"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Nạp lại dữ liệu mẫu</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-10 bg-white rounded-2xl border border-dashed border-slate-200 text-slate-400 text-xs space-y-2">
                <Users className="w-8 h-8 mx-auto text-slate-300" />
                <div>Không tìm thấy con nợ nào phù hợp với bộ lọc hiện tại.</div>
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
              {sortedDebtors.map((debtor) => {
                const balance = getDebtorBalance(debtor.id, transactions);
                const debtorTxs = transactions.filter((t) => t.debtorId === debtor.id);
                const totalDebt = debtorTxs.filter((t) => t.type === 'ADD').reduce((s, t) => s + t.amount, 0);
                const totalPaid = debtorTxs.filter((t) => t.type === 'SUB').reduce((s, t) => s + t.amount, 0);
                const paidRate = totalDebt > 0 ? Math.min(100, Math.round((totalPaid / totalDebt) * 100)) : 0;

                return (
                  <div
                    key={debtor.id}
                    className={`bg-white rounded-3xl border p-4 sm:p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between gap-3.5 relative overflow-hidden group ${
                      balance > 0
                        ? 'border-rose-200/90 hover:border-rose-300'
                        : balance < 0
                        ? 'border-emerald-200/90 hover:border-emerald-300'
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
                                ? 'bg-gradient-to-br from-rose-50 to-rose-100 text-rose-700 border border-rose-200/80'
                                : balance < 0
                                ? 'bg-gradient-to-br from-emerald-50 to-emerald-100 text-emerald-700 border border-emerald-200/80'
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
                              {/* PIN badge with 1-click copy */}
                              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-amber-50/90 text-amber-900 rounded-xl font-mono text-[11px] font-bold border border-amber-200/80">
                                <KeyRound className="w-3 h-3 text-amber-600 shrink-0" />
                                <span>Mật khẩu: {debtor.pin}</span>
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
                                ? 'text-rose-600'
                                : balance < 0
                                ? 'text-emerald-600'
                                : 'text-slate-400'
                            }`}
                          >
                            {balance > 0 ? `+${formatVND(balance)}` : formatVND(balance)}
                          </div>
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-extrabold mt-0.5 ${
                              balance > 0
                                ? 'bg-rose-50 text-rose-700 border border-rose-200/70'
                                : balance < 0
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/70'
                                : 'bg-slate-100 text-slate-600 border border-slate-200/70'
                            }`}
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                            {balance > 0 ? 'Đang nợ bạn' : balance < 0 ? 'Bạn nợ họ' : 'Đã hết nợ'}
                          </span>
                        </div>
                      </div>

                      {/* Tiến Độ Thanh Toán Khoản Nợ (Debt Progress Meter) */}
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

                    {/* Action buttons */}
                    <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onOpenAddTx(debtor.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50/90 hover:bg-blue-100 text-blue-700 font-bold rounded-xl transition-all text-[11px] cursor-pointer shadow-2xs border border-blue-200/60"
                          title="Ghi nợ hoặc thu tiền cho người này"
                        >
                          <PlusCircle className="w-3.5 h-3.5" />
                          <span>Giao dịch</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setGuideDebtor(debtor)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100/90 hover:bg-slate-200/90 text-slate-700 font-semibold rounded-xl transition-all text-[11px] cursor-pointer border border-slate-200/60"
                          title="Xem tin nhắn và đường link tra cứu gửi cho người này"
                        >
                          <BookOpen className="w-3.5 h-3.5 text-blue-600" />
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
                    {sortedDebtors.map((debtor) => {
                      const balance = getDebtorBalance(debtor.id, transactions);
                      const debtorTxs = transactions.filter((t) => t.debtorId === debtor.id);
                      const totalDebt = debtorTxs.filter((t) => t.type === 'ADD').reduce((s, t) => s + t.amount, 0);
                      const totalPaid = debtorTxs.filter((t) => t.type === 'SUB').reduce((s, t) => s + t.amount, 0);

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
                                    ? 'bg-rose-50 text-rose-700 border border-rose-200/80'
                                    : balance < 0
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80'
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
                                  ? 'text-rose-600'
                                  : balance < 0
                                  ? 'text-emerald-600'
                                  : 'text-slate-400'
                              }`}
                            >
                              {balance > 0 ? `+${formatVND(balance)}` : formatVND(balance)}
                            </span>
                          </td>

                          <td className="py-3 px-3 text-center">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                                balance > 0
                                  ? 'bg-rose-50 text-rose-700 border border-rose-200/60'
                                  : balance < 0
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
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
                                className="p-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-[11px] font-bold transition-colors cursor-pointer"
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
                                <BookOpen className="w-3.5 h-3.5 text-blue-600" />
                              </button>

                              {onDeleteDebtor && (
                                <button
                                  type="button"
                                  onClick={() => setDebtorToDelete(debtor)}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                  title="Xóa người nợ này"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => onSelectDebtor(debtor)}
                                className="p-1.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-lg transition-colors cursor-pointer ml-1"
                                title="Xem chi tiết sổ nợ"
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
          </motion.div>
        )}

        {/* --- TAB 2: ALL TRANSACTIONS HISTORY (Mobile Optimized) --- */}
        {activeTab === 'TRANSACTIONS' && (
          <motion.div
            key="tab-transactions"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs"
          >
          <div className="p-3.5 sm:p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-bold text-slate-800 text-xs sm:text-sm flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-500" />
              Lịch sử toàn bộ biến động ({transactions.length} giao dịch)
            </h3>
            <button
              type="button"
              onClick={() => onOpenAddTx()}
              className="text-xs text-blue-600 hover:text-blue-700 font-semibold inline-flex items-center gap-1 cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Thêm mới</span>
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {recentTransactions.map((tx) => {
              const debtor = debtors.find((d) => d.id === tx.debtorId);
              const isAdd = tx.type === 'ADD';

              return (
                <div
                  key={tx.id}
                  className="p-3 sm:p-3.5 hover:bg-slate-50/80 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                        isAdd
                          ? 'bg-rose-100 text-rose-700'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {isAdd ? (
                        <ArrowUpRight className="w-4 h-4" />
                      ) : (
                        <ArrowDownLeft className="w-4 h-4" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 text-sm break-words">
                        <span className="text-blue-700 font-bold">{debtor?.name || 'Người dùng'}</span>
                        {' • '}
                        <span className="font-medium text-slate-700">{tx.note}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400 mt-0.5">
                        <span>📅 {tx.date}</span>
                        {tx.category === 'PARTY_SPLIT' && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-medium">
                            Chia tiền
                          </span>
                        )}
                        {tx.category === 'PAYMENT_SETTLED' && (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-medium">
                            Đã thanh toán
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-2.5 shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                    {tx.billImage && (
                      <button
                        type="button"
                        onClick={() => onViewImage(tx.billImage!, tx.note)}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                        title="Xem ảnh chứng từ"
                      >
                        <Receipt className="w-4 h-4" />
                      </button>
                    )}

                    <div
                      className={`font-bold font-mono text-sm text-right min-w-[90px] ${
                        isAdd ? 'text-rose-600' : 'text-emerald-600'
                      }`}
                    >
                      {isAdd ? `+${formatVND(tx.amount)}` : `-${formatVND(tx.amount)}`}
                    </div>

                    {/* Transaction Action Controls: strictly lock party split transactions, allow editing normal transactions */}
                    {tx.partyId || tx.category === 'PARTY_SPLIT' ? (
                      <button
                        type="button"
                        onClick={() => {
                          const associatedParty = parties.find((p) => p.id === tx.partyId);
                          if (associatedParty && onEditParty) {
                            onEditParty(associatedParty);
                          } else {
                            setActiveTab('PARTIES');
                          }
                        }}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer"
                        title="Giao dịch từ chia đầu người - Không thể sửa/xóa lẻ. Bấm để sửa hoặc xóa toàn bộ cuộc vui."
                      >
                        <Lock className="w-3 h-3 text-amber-600" />
                        <span className="hidden sm:inline">Sửa cuộc vui</span>
                        <span className="sm:hidden">Cuộc vui</span>
                      </button>
                    ) : (
                      <div className="flex items-center gap-0.5">
                        {onEditTx && (
                          <button
                            type="button"
                            onClick={() => onEditTx(tx)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                            title="Chỉnh sửa giao dịch này"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {onDeleteTx && (
                          <button
                            type="button"
                            onClick={() => setTxToDelete(tx)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="Xóa giao dịch này"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
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
          {parties.length === 0 ? (
            <div className="text-center py-10 bg-white rounded-2xl border border-dashed border-slate-200 text-slate-400 text-xs">
              Chưa có cuộc vui nào được chia tiền.
            </div>
          ) : (
            parties.map((party) => {
              const payer =
                party.payerType === 'ME'
                  ? settings.ownerName
                  : debtors.find((d) => d.id === party.payerDebtorId)?.name || 'Người nợ';

              return (
                <div
                  key={party.id}
                  className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-2 text-xs"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-1.5">
                    <div>
                      <div className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                        <PartyPopper className="w-4 h-4 text-amber-600" />
                        <span>{party.name}</span>
                      </div>
                      <div className="text-slate-400 text-[11px] mt-0.5">
                        Ngày: {party.date} • Người thanh toán: <strong>{payer}</strong>
                      </div>
                    </div>

                    <div className="text-left sm:text-right">
                      <div className="text-base font-black text-amber-700 font-mono">
                        {formatVND(party.totalAmount)}
                      </div>
                      <div className="text-[11px] text-slate-500 font-medium">
                        Mỗi người: {formatVND(party.splitAmountPerPerson)}
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-slate-500">
                    <div>
                      Tham gia:{' '}
                      {party.includeMe && <span className="font-semibold text-slate-700">{settings.ownerName}, </span>}
                      {party.participantDebtorIds
                        .map((id) => debtors.find((d) => d.id === id)?.name || id)
                        .join(', ')}
                    </div>

                    <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                      {party.billImage && (
                        <button
                          type="button"
                          onClick={() => onViewImage(party.billImage!, party.name)}
                          className="inline-flex items-center gap-1 text-blue-600 hover:underline font-semibold cursor-pointer"
                        >
                          <Receipt className="w-3.5 h-3.5" />
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
                          <span>Sửa cuộc vui</span>
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
          showToast('Đã xóa sạch toàn bộ dữ liệu mẫu! Sổ nợ của bạn đã sẵn sàng ghi dữ liệu thật.');
        }}
      />

      {/* Admin Password Verification Modal to Reset/Restore Sample Data */}
      <ConfirmResetSampleModal
        isOpen={isConfirmResetOpen}
        onClose={() => setIsConfirmResetOpen(false)}
        onSuccess={() => {
          if (onDataReload) onDataReload();
          showToast('Đã khôi phục dữ liệu mẫu ban đầu thành công!', 'info');
        }}
      />

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
            showToast(`Đã xóa con nợ "${debtorToDelete.name}" thành công!`, 'success');
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
            className="fixed bottom-6 right-6 z-50 pointer-events-none"
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
