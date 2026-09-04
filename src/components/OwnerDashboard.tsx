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
} from 'lucide-react';
import { Debtor, Transaction, PartySplit, AppSettings } from '../types';
import { formatVND } from '../utils/vietqr';
import { getDebtorBalance } from '../utils/storage';
import { apiSyncAllNow } from '../utils/api';
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
  onOpenChangePin?: (debtor: Debtor) => void;
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
  onOpenChangePin,
  onOpenSettings,
  onDataReload,
  onEditTx,
  onDeleteTx,
  onEditParty,
  onDeleteParty,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'DEBTORS' | 'TRANSACTIONS' | 'PARTIES'>('DEBTORS');
  const [guideDebtor, setGuideDebtor] = useState<Debtor | null>(null);
  const [debtorToDelete, setDebtorToDelete] = useState<Debtor | null>(null);
  const [partyToDelete, setPartyToDelete] = useState<PartySplit | null>(null);
  const [txToDelete, setTxToDelete] = useState<Transaction | null>(null);
  const [isConfirmClearOpen, setIsConfirmClearOpen] = useState(false);
  const [isConfirmResetOpen, setIsConfirmResetOpen] = useState(false);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' } | null>(null);

  const showToast = (message: string, type: 'success' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleSyncAllNow = async () => {
    setIsSyncingAll(true);
    try {
      const res = await apiSyncAllNow({ debtors, transactions, parties, settings });
      if (res.success) {
        const timeStr = new Date().toLocaleTimeString('vi-VN');
        setLastSyncTime(timeStr);
        showToast(
          res.message ||
            `Đã lưu và đồng bộ toàn bộ ${debtors.length} người nợ, ${transactions.length} giao dịch lên Cloud Firestore thành công!`,
          'success'
        );
        onDataReload?.();
      } else {
        showToast(res.message || 'Không thể đồng bộ toàn bộ dữ liệu lên Cloud Firestore', 'info');
      }
    } catch (err: any) {
      showToast(`Lỗi đồng bộ: ${err?.message || 'Thất bại'}`, 'info');
    } finally {
      setIsSyncingAll(false);
    }
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

  // Filter debtors
  const filteredDebtors = debtors.filter(
    (d) =>
      d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (d.pin && d.pin.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (d.note && d.note.toLowerCase().includes(searchTerm.toLowerCase()))
  );

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

      {/* Thông tin cấu hình Chủ Sổ & STK hiện tại (Đồng bộ tức thì) */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-white border border-slate-200/90 rounded-2xl shadow-2xs text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 font-bold text-slate-800">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Chủ Nợ: <strong className="text-emerald-700">{settings.ownerName || 'Chủ Nợ'}</strong></span>
          </div>
          {settings.ownerPhone && (
            <>
              <span className="text-slate-300 hidden sm:inline">•</span>
              <div className="flex items-center gap-1.5 text-slate-700 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200">
                <Phone className="w-3.5 h-3.5 text-emerald-600" />
                <span>SĐT:</span>
                <a
                  href={`tel:${settings.ownerPhone}`}
                  className="font-mono font-bold text-emerald-800 hover:text-emerald-900 hover:underline"
                  title="Bấm để gọi điện cho Chủ Nợ"
                >
                  {settings.ownerPhone}
                </a>
              </div>
            </>
          )}
          <span className="text-slate-300 hidden sm:inline">•</span>
          <div className="flex items-center gap-1.5 text-slate-600">
            <span>STK:</span>
            <span className="font-mono font-bold text-slate-900">
              {settings.bankName || 'Ngân hàng'} {settings.accountNumber ? `- ${settings.accountNumber}` : ''}
            </span>
            {settings.accountName && (
              <span className="text-slate-500 text-[11px]">({settings.accountName})</span>
            )}
          </div>
        </div>

        {onOpenSettings && (
          <button
            type="button"
            onClick={onOpenSettings}
            className="text-emerald-700 hover:text-emerald-800 font-semibold hover:underline text-[11px] cursor-pointer flex items-center gap-1 ml-auto"
          >
            <span>Cài đặt</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* 3 Quick Action Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button
          type="button"
          id="btn-open-form-1"
          onClick={onOpenAddDebtor}
          className="group flex items-center justify-between p-3.5 sm:p-4 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-2xl shadow-xs hover:shadow-md transition-all text-left cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <UserPlus className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-emerald-200">
                Con nợ mới
              </div>
              <div className="font-bold text-xs sm:text-sm leading-tight">
                Thêm Người
              </div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-white/70 group-hover:translate-x-1 transition-transform" />
        </button>

        <button
          type="button"
          id="btn-open-form-2"
          onClick={() => onOpenAddTx()}
          className="group flex items-center justify-between p-3.5 sm:p-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-2xl shadow-xs hover:shadow-md transition-all text-left cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <PlusCircle className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-blue-200">
                Giao dịch mới
              </div>
              <div className="font-bold text-xs sm:text-sm leading-tight">
                Thêm Giao Dịch
              </div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-white/70 group-hover:translate-x-1 transition-transform" />
        </button>

        <button
          type="button"
          id="btn-open-form-3"
          onClick={onOpenSplitParty}
          className="group flex items-center justify-between p-3.5 sm:p-4 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white rounded-2xl shadow-xs hover:shadow-md transition-all text-left cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <PartyPopper className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-amber-200">
                Giao dịch nhiều người
              </div>
              <div className="font-bold text-xs sm:text-sm leading-tight">
                Giao Dịch Chia Tiền
              </div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-white/70 group-hover:translate-x-1 transition-transform" />
        </button>
      </div>

      {/* Cloud Firestore Instant Sync Bar */}
      <div className="p-3.5 sm:p-4 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white rounded-2xl border border-slate-700/80 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
            <Cloud className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-xs sm:text-sm text-white">
                Đồng bộ tức thì Cloud Firestore
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                Trực Tiếp
              </span>
            </div>
            <p className="text-[11px] text-slate-300 mt-0.5 flex items-center gap-1.5 flex-wrap">
              <span><strong>{debtors.length}</strong> con nợ</span>
              <span>•</span>
              <span><strong>{transactions.length}</strong> giao dịch</span>
              <span>•</span>
              <span><strong>{parties.length}</strong> cuộc chia tiền</span>
              {lastSyncTime && (
                <>
                  <span>•</span>
                  <span className="text-emerald-300 font-medium">Đã đồng bộ lúc {lastSyncTime}</span>
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
          <button
            type="button"
            onClick={handleSyncAllNow}
            disabled={isSyncingAll}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-50"
            title="Lưu và đồng bộ ngay lập tức lên Cloud Firestore"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncingAll ? 'animate-spin' : ''}`} />
            <span>{isSyncingAll ? 'Đang Lưu & Đồng Bộ...' : '⚡ Lưu & Đồng Bộ Toàn Bộ Ngay'}</span>
          </button>
        </div>
      </div>

      {/* Financial Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        {/* Total people owe me */}
        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-1">
            <span>Đang nợ bạn</span>
            <span className="p-1 rounded-md bg-emerald-50 text-emerald-600">
              <ArrowUpRight className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="text-xl sm:text-2xl font-black text-emerald-600 tracking-tight font-mono">
            +{formatVND(totalReceivable)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {debtors.filter((d) => getDebtorBalance(d.id, transactions) > 0).length} con nợ
          </div>
        </div>

        {/* Total I owe people */}
        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-1">
            <span>Bạn đang nợ</span>
            <span className="p-1 rounded-md bg-rose-50 text-rose-600">
              <ArrowDownLeft className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="text-xl sm:text-2xl font-black text-rose-600 tracking-tight font-mono">
            -{formatVND(totalPayable)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {debtors.filter((d) => getDebtorBalance(d.id, transactions) < 0).length} cần trả
          </div>
        </div>

        {/* Net balance */}
        <div className="p-4 bg-slate-900 text-white rounded-2xl shadow-xs">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-1">
            <span>Số Dư</span>
            <Wallet className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black tracking-tight text-white font-mono">
            {netBalance >= 0 ? `+${formatVND(netBalance)}` : formatVND(netBalance)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-amber-400" />
            <span>Số dư hiện tại</span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs for Owner View */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-slate-200 pb-2.5">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <button
            type="button"
            onClick={() => setActiveTab('DEBTORS')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'DEBTORS'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            👥 Con Nợ ({debtors.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('TRANSACTIONS')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'TRANSACTIONS'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            📜 Lịch Sử Giao Dịch ({transactions.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('PARTIES')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'PARTIES'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            🎉 Chia Đầu Người ({parties.length})
          </button>
        </div>

        {activeTab === 'DEBTORS' && (
          <div className="relative w-full sm:w-64">
            <input
              type="text"
              placeholder="Tìm theo tên con nợ..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
          </div>
        )}
      </div>

      {/* --- TAB 1: DEBTOR CARDS --- */}
      {activeTab === 'DEBTORS' && (
        <div className="space-y-3">
          {filteredDebtors.length === 0 ? (
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
                <div>Không tìm thấy con nợ nào phù hợp với từ khóa "{searchTerm}".</div>
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Xóa bộ lọc
                </button>
              </div>
            )
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {filteredDebtors.map((debtor) => {
                const balance = getDebtorBalance(debtor.id, transactions);

                return (
                  <div
                    key={debtor.id}
                    className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs hover:shadow-sm transition-all flex flex-col justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-700 text-base shrink-0">
                            {debtor.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <h3
                              onClick={() => onSelectDebtor(debtor)}
                              className="font-bold text-sm text-slate-900 hover:text-emerald-600 cursor-pointer flex items-center gap-1.5 truncate"
                            >
                              <span>{debtor.name}</span>
                            </h3>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-0.5">
                              {onOpenChangePin ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onOpenChangePin(debtor);
                                  }}
                                  className="flex items-center gap-1 px-1.5 py-0.5 bg-amber-50 hover:bg-amber-100 text-amber-900 rounded font-mono text-[11px] font-semibold border border-amber-300 transition-colors cursor-pointer"
                                  title="Bấm để đổi mật khẩu tra cứu cho người này"
                                >
                                  <KeyRound className="w-3 h-3 text-amber-600" />
                                  <span>Pass: {debtor.pin}</span>
                                  <span className="text-[9px] text-amber-600 font-normal">✎</span>
                                </button>
                              ) : (
                                <span className="flex items-center gap-1 px-1.5 py-0.5 bg-amber-50 text-amber-900 rounded font-mono text-[11px] font-semibold border border-amber-200">
                                  <KeyRound className="w-3 h-3" />
                                  Pass: {debtor.pin}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Balance Badge */}
                        <div className="text-right shrink-0">
                          <div
                            className={`font-black text-sm font-mono ${
                              balance > 0
                                ? 'text-rose-600'
                                : balance < 0
                                ? 'text-emerald-600'
                                : 'text-slate-400'
                            }`}
                          >
                            {balance > 0 ? `+${formatVND(balance)}` : formatVND(balance)}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {balance > 0 ? 'Đang nợ bạn' : balance < 0 ? 'Bạn nợ họ' : 'Hết nợ'}
                          </div>
                        </div>
                      </div>

                      {debtor.note && (
                        <p className="text-xs text-slate-500 mt-2 bg-slate-50 px-2.5 py-1.5 rounded-lg break-words">
                          📝 {debtor.note}
                        </p>
                      )}
                    </div>

                    {/* Action buttons (Cleaned up: Replaced Zalo/reminder with Lookup Guide & Direct View) */}
                    <div className="pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onOpenAddTx(debtor.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold rounded-lg transition-colors text-[11px] cursor-pointer"
                          title="Tạo giao dịch cho người này"
                        >
                          <PlusCircle className="w-3.5 h-3.5" />
                          <span>Giao dịch</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setGuideDebtor(debtor)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg transition-colors text-[11px] cursor-pointer"
                          title="Xem và gửi hướng dẫn tra cứu & mật khẩu cho người này"
                        >
                          <BookOpen className="w-3.5 h-3.5 text-blue-600" />
                          <span>Hướng dẫn</span>
                        </button>

                        {onDeleteDebtor && (
                          <button
                            type="button"
                            onClick={() => setDebtorToDelete(debtor)}
                            className="inline-flex items-center gap-1 px-2 py-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer"
                            title="Xóa nợ"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Xóa</span>
                          </button>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => onSelectDebtor(debtor)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg transition-colors text-[11px] cursor-pointer ml-auto"
                      >
                        <span>Chi tiết</span>
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* --- TAB 2: ALL TRANSACTIONS HISTORY (Mobile Optimized) --- */}
      {activeTab === 'TRANSACTIONS' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
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
        </div>
      )}

      {/* --- TAB 3: PARTIES HISTORY (Mobile Optimized) --- */}
      {activeTab === 'PARTIES' && (
        <div className="space-y-3">
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
        </div>
      )}

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
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-3 duration-200">
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
        </div>
      )}
    </div>
  );
};
