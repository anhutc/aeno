import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ClipboardList,
  Search,
  Calendar,
  RefreshCw,
  FileSpreadsheet,
  Download,
  Trash2,
  CheckCircle2,
  PlusCircle,
  UserPlus,
  Users,
  UserX,
  Edit3,
  KeyRound,
  Settings,
  ShieldCheck,
  Clock,
  ExternalLink,
  Copy,
  Check,
  LogOut,
  Sparkles,
  Eye,
  ArrowRight,
  History,
} from 'lucide-react';
import { AuditLog, Debtor, Transaction, PartySplit, AppSettings } from '../types';
import { formatVND } from '../utils/vietqr';
import { triggerHaptic } from '../utils/haptic';
import {
  initGoogleAuth,
  signInWithGoogle,
  signOutGoogle,
  syncDatabaseToGoogleSheets,
  exportGoogleSheetsCsvFile,
  getGoogleAccessToken,
  getCurrentGoogleUser,
  GoogleUserProfile,
} from '../services/googleSheetsService';
import { clearAuditLogs, loadAuditLogs } from '../utils/storage';

interface AdminAuditLogsTabProps {
  auditLogs: AuditLog[];
  onRefreshLogs?: () => void;
  debtors: Debtor[];
  transactions: Transaction[];
  parties: PartySplit[];
  settings: AppSettings;
  onSaveSettings: (newSettings: AppSettings) => Promise<any> | void;
  showToast: (msg: string, type?: 'success' | 'info') => void;
}

export const AdminAuditLogsTab: React.FC<AdminAuditLogsTabProps> = ({
  auditLogs,
  onRefreshLogs,
  debtors,
  transactions,
  parties,
  settings,
  onSaveSettings,
  showToast,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterActionGroup, setFilterActionGroup] = useState<
    'ALL' | 'TRANSACTION' | 'LOOKUP' | 'DEBTOR' | 'PARTY' | 'SYSTEM'
  >('ALL');
  const [dateFilter, setDateFilter] = useState<'ALL' | 'TODAY' | '7_DAYS' | '30_DAYS'>('ALL');
  const [isSyncingSheets, setIsSyncingSheets] = useState(false);
  const [isSigningInGoogle, setIsSigningInGoogle] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Google Auth integration (shared with GoogleSheetsSyncSection)
  const [googleUser, setGoogleUser] = useState<GoogleUserProfile | null>(() => getCurrentGoogleUser());
  const [hasGoogleToken, setHasGoogleToken] = useState<boolean>(() => Boolean(getGoogleAccessToken()));

  useEffect(() => {
    const unsubscribe = initGoogleAuth((user, token) => {
      setGoogleUser(user);
      setHasGoogleToken(Boolean(token));
    });
    return () => unsubscribe();
  }, []);

  // Filter logic
  const filteredLogs = useMemo(() => {
    let result = [...auditLogs];

    // Filter by group
    if (filterActionGroup === 'TRANSACTION') {
      result = result.filter((l) =>
        ['ADD_TRANSACTION', 'UPDATE_TRANSACTION', 'DELETE_TRANSACTION', 'SETTLE_DEBT', 'GUEST_REPORT'].includes(
          l.action
        )
      );
    } else if (filterActionGroup === 'LOOKUP') {
      result = result.filter((l) => l.action === 'GUEST_LOOKUP');
    } else if (filterActionGroup === 'DEBTOR') {
      result = result.filter((l) =>
        ['ADD_DEBTOR', 'UPDATE_DEBTOR', 'DELETE_DEBTOR'].includes(l.action)
      );
    } else if (filterActionGroup === 'PARTY') {
      result = result.filter((l) =>
        ['ADD_PARTY', 'UPDATE_PARTY', 'DELETE_PARTY'].includes(l.action)
      );
    } else if (filterActionGroup === 'SYSTEM') {
      result = result.filter((l) =>
        ['UPDATE_SETTINGS', 'SYNC_SHEETS', 'RESTORE_DATA', 'CLEAR_DATA'].includes(l.action)
      );
    }

    // Filter by Date
    if (dateFilter !== 'ALL') {
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const sevenDaysAgo = startOfToday - 7 * 86400000;
      const thirtyDaysAgo = startOfToday - 30 * 86400000;

      result = result.filter((l) => {
        const time = new Date(l.timestamp).getTime();
        if (dateFilter === 'TODAY') return time >= startOfToday;
        if (dateFilter === '7_DAYS') return time >= sevenDaysAgo;
        if (dateFilter === '30_DAYS') return time >= thirtyDaysAgo;
        return true;
      });
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((l) => {
        return (
          l.title.toLowerCase().includes(q) ||
          l.description.toLowerCase().includes(q) ||
          (l.debtorName && l.debtorName.toLowerCase().includes(q)) ||
          l.actor.toLowerCase().includes(q) ||
          (l.amount && String(l.amount).includes(q))
        );
      });
    }

    // Sort newest first
    return result.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
  }, [auditLogs, filterActionGroup, dateFilter, searchQuery]);

  // Unified Google Login
  const handleGoogleSignIn = async () => {
    triggerHaptic('medium');
    setIsSigningInGoogle(true);
    try {
      const res = await signInWithGoogle();
      setGoogleUser(res.user);
      setHasGoogleToken(true);
      showToast(`Đã kết nối tài khoản Google: ${res.user.email}`, 'success');
    } catch (err: any) {
      if (err?.code !== 'popup_closed') {
        showToast(err?.message || 'Lỗi đăng nhập Google', 'info');
      }
    } finally {
      setIsSigningInGoogle(false);
    }
  };

  const handleGoogleSignOut = async () => {
    triggerHaptic('light');
    await signOutGoogle();
    setGoogleUser(null);
    setHasGoogleToken(false);
    showToast('Đã đăng xuất tài khoản Google', 'info');
  };

  // Master Sync to Google Sheets (4 Tabs together: Debtors, Transactions, Parties, and Audit Logs)
  const handleMasterSyncToGoogleSheets = async () => {
    triggerHaptic('medium');
    setIsSyncingSheets(true);
    try {
      const result = await syncDatabaseToGoogleSheets({
        debtors,
        transactions,
        parties,
        settings,
        auditLogs,
      });

      const updatedSettings: AppSettings = {
        ...settings,
        googleSheetId: result.spreadsheetId,
        googleSheetUrl: result.spreadsheetUrl,
        lastGoogleSheetSyncAt: result.updatedAt,
      };
      await onSaveSettings(updatedSettings);

      showToast(
        `Đã đồng bộ toàn bộ 4 Tab (Công Nợ, Giao Dịch, Chia Bill, Nhật Ký) sang Google Sheets!`,
        'success'
      );
    } catch (err: any) {
      console.error('Master Google Sheets sync error:', err);
      showToast(err?.message || 'Lỗi khi đồng bộ lên Google Sheets', 'info');
    } finally {
      setIsSyncingSheets(false);
    }
  };

  const handleExportCsv = () => {
    triggerHaptic('light');
    try {
      exportGoogleSheetsCsvFile({
        debtors,
        transactions,
        parties,
        settings,
        auditLogs,
      });
      showToast('Đã xuất tệp dữ liệu chuẩn 4 bảng (bao gồm Nhật ký)!', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Lỗi xuất tệp CSV', 'info');
    }
  };

  const handleCopyLogId = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    triggerHaptic('selection');
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const handleClearLogs = () => {
    triggerHaptic('medium');
    clearAuditLogs();
    if (onRefreshLogs) onRefreshLogs();
    setShowClearConfirm(false);
    showToast('Đã làm sạch nhật ký trên ứng dụng (Dữ liệu trên Google Sheets được bảo toàn vĩnh viễn)', 'success');
  };

  const formatLogTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      const now = new Date();
      const isToday =
        d.getDate() === now.getDate() &&
        d.getMonth() === now.getMonth() &&
        d.getFullYear() === now.getFullYear();

      const timePart = d.toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

      if (isToday) {
        return `${timePart} - Hôm nay`;
      }

      const datePart = d.toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
      return `${timePart} - ${datePart}`;
    } catch {
      return isoString;
    }
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'ADD_TRANSACTION':
        return {
          icon: <PlusCircle className="w-4 h-4 text-emerald-600" />,
          bg: 'bg-emerald-50 text-emerald-700 border-emerald-200/90',
          label: 'Ghi nợ (+)',
        };
      case 'UPDATE_TRANSACTION':
        return {
          icon: <Edit3 className="w-4 h-4 text-blue-600" />,
          bg: 'bg-blue-50 text-blue-700 border-blue-200/90',
          label: 'Cập nhật / Thu (-)',
        };
      case 'DELETE_TRANSACTION':
        return {
          icon: <Trash2 className="w-4 h-4 text-rose-600" />,
          bg: 'bg-rose-50 text-rose-700 border-rose-200/90',
          label: 'Xóa giao dịch',
        };
      case 'ADD_DEBTOR':
        return {
          icon: <UserPlus className="w-4 h-4 text-teal-600" />,
          bg: 'bg-teal-50 text-teal-700 border-teal-200/90',
          label: 'Thêm người nợ',
        };
      case 'UPDATE_DEBTOR':
        return {
          icon: <KeyRound className="w-4 h-4 text-amber-600" />,
          bg: 'bg-amber-50 text-amber-700 border-amber-200/90',
          label: 'Sửa người nợ',
        };
      case 'DELETE_DEBTOR':
        return {
          icon: <UserX className="w-4 h-4 text-rose-600" />,
          bg: 'bg-rose-50 text-rose-700 border-rose-200/90',
          label: 'Xóa người nợ',
        };
      case 'ADD_PARTY':
        return {
          icon: <Users className="w-4 h-4 text-purple-600" />,
          bg: 'bg-purple-50 text-purple-700 border-purple-200/90',
          label: 'Chia bill nhóm',
        };
      case 'UPDATE_PARTY':
        return {
          icon: <Edit3 className="w-4 h-4 text-purple-600" />,
          bg: 'bg-purple-50 text-purple-700 border-purple-200/90',
          label: 'Sửa chia bill',
        };
      case 'DELETE_PARTY':
        return {
          icon: <Trash2 className="w-4 h-4 text-rose-600" />,
          bg: 'bg-rose-50 text-rose-700 border-rose-200/90',
          label: 'Xóa chia bill',
        };
      case 'UPDATE_SETTINGS':
        return {
          icon: <Settings className="w-4 h-4 text-slate-700" />,
          bg: 'bg-slate-100 text-slate-700 border-slate-200',
          label: 'Cài đặt hệ thống',
        };
      case 'SYNC_SHEETS':
        return {
          icon: <FileSpreadsheet className="w-4 h-4 text-emerald-600" />,
          bg: 'bg-emerald-50 text-emerald-800 border-emerald-300',
          label: 'Google Sheets',
        };
      case 'GUEST_LOOKUP':
        return {
          icon: <Eye className="w-4 h-4 text-cyan-600" />,
          bg: 'bg-cyan-50 text-cyan-800 border-cyan-300',
          label: 'Khách tra cứu',
        };
      case 'GUEST_REPORT':
        return {
          icon: <CheckCircle2 className="w-4 h-4 text-amber-600" />,
          bg: 'bg-amber-50 text-amber-800 border-amber-300',
          label: 'Khách báo CK',
        };
      default:
        return {
          icon: <ClipboardList className="w-4 h-4 text-slate-600" />,
          bg: 'bg-slate-50 text-slate-700 border-slate-200',
          label: 'Thao tác',
        };
    }
  };

  const spreadsheetUrl = settings.googleSheetUrl;
  const lastSyncDateStr = settings.lastGoogleSheetSyncAt
    ? new Date(settings.lastGoogleSheetSyncAt).toLocaleString('vi-VN')
    : null;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* 1. Header Banner & Actions - GIAO DIỆN SÁNG ĐỒNG NHẤT, CHỈ CÓ NHẬT KÝ, KHÔNG THỐNG KÊ */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/90 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="p-1.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200/80">
              <ClipboardList className="w-5 h-5" />
            </span>
            <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">
              Nhật Ký Thao Tác &amp; Kiểm Vết
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
              Audit Trail
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900">
            Lịch Sử Kiểm Toán Hệ Thống
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-xl">
            Ghi nhận chi tiết mọi thao tác nợ, thanh toán, chia bill, tra cứu và thay đổi hệ thống. Toàn bộ lịch sử được lưu trữ an toàn và đồng bộ sang Google Sheets.
          </p>
        </div>

        {/* Action Buttons: Làm Mới, Xuất CSV, Làm Sạch Nhật Ký */}
        <div className="flex flex-wrap items-center gap-2">
          {onRefreshLogs && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onRefreshLogs();
                showToast('Đã làm mới danh sách nhật ký!', 'info');
              }}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs sm:text-sm font-bold border border-slate-200 shadow-2xs active:scale-95 transition-all cursor-pointer"
              title="Tải lại danh sách nhật ký mới nhất"
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
              <span>Làm mới</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl bg-white hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-bold border border-slate-200 shadow-2xs active:scale-95 transition-all cursor-pointer"
            title="Xuất file CSV kiểm toán 4 bảng"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Xuất CSV</span>
          </button>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('medium');
              setShowClearConfirm(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs sm:text-sm font-bold border border-rose-200 shadow-2xs active:scale-95 transition-all cursor-pointer"
            title="Làm sạch danh sách nhật ký trên ứng dụng này (Dữ liệu trên Google Sheets luôn được bảo toàn)"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-600" />
            <span>Làm sạch nhật ký</span>
          </button>

          {spreadsheetUrl && (
            <a
              href={spreadsheetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-2xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs shadow-2xs transition-colors cursor-pointer border border-emerald-200"
              title="Mở Google Sheets liên kết"
            >
              <ExternalLink className="w-3.5 h-3.5 text-emerald-600" />
              <span className="hidden sm:inline">Mở Sheets</span>
            </a>
          )}
        </div>
      </div>

      {/* 3. Search & Filter Bar */}
      <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/80 shadow-xs space-y-3.5">
        <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm kiếm theo người nợ, nội dung, số tiền..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-xs sm:text-sm font-medium text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            )}
          </div>

          {/* Date Filter */}
          <div className="flex items-center gap-1.5 shrink-0 overflow-x-auto pb-1 sm:pb-0">
            <span className="text-xs text-slate-400 font-bold hidden sm:inline flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" /> Thời gian:
            </span>
            {(
              [
                { id: 'ALL', label: 'Tất cả' },
                { id: 'TODAY', label: 'Hôm nay' },
                { id: '7_DAYS', label: '7 ngày qua' },
                { id: '30_DAYS', label: '30 ngày' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  triggerHaptic('selection');
                  setDateFilter(opt.id);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  dateFilter === opt.id
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Action Group Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-2 border-t border-slate-100 no-scrollbar">
          {(
            [
              { id: 'ALL', label: 'Tất cả thao tác', count: auditLogs.length },
              {
                id: 'LOOKUP',
                label: 'Khách tra cứu',
                count: auditLogs.filter((l) => l.action === 'GUEST_LOOKUP').length,
              },
              {
                id: 'TRANSACTION',
                label: 'Giao dịch (+ / -)',
                count: auditLogs.filter((l) =>
                  ['ADD_TRANSACTION', 'UPDATE_TRANSACTION', 'DELETE_TRANSACTION', 'SETTLE_DEBT', 'GUEST_REPORT'].includes(l.action)
                ).length,
              },
              {
                id: 'DEBTOR',
                label: 'Người nợ',
                count: auditLogs.filter((l) =>
                  ['ADD_DEBTOR', 'UPDATE_DEBTOR', 'DELETE_DEBTOR'].includes(l.action)
                ).length,
              },
              {
                id: 'PARTY',
                label: 'Chia bill nhóm',
                count: auditLogs.filter((l) =>
                  ['ADD_PARTY', 'UPDATE_PARTY', 'DELETE_PARTY'].includes(l.action)
                ).length,
              },
              {
                id: 'SYSTEM',
                label: 'Cài đặt & Đồng bộ',
                count: auditLogs.filter((l) =>
                  ['UPDATE_SETTINGS', 'SYNC_SHEETS', 'RESTORE_DATA', 'CLEAR_DATA'].includes(l.action)
                ).length,
              },
            ] as const
          ).map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => {
                triggerHaptic('selection');
                setFilterActionGroup(chip.id);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                filterActionGroup === chip.id
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
              }`}
            >
              <span>{chip.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  filterActionGroup === chip.id ? 'bg-white/25 text-white' : 'bg-slate-200 text-slate-600'
                }`}
              >
                {chip.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* 4. Audit Logs Timeline List */}
      <div className="space-y-3">
        {filteredLogs.length === 0 ? (
          <div className="bg-white rounded-3xl p-10 text-center border border-slate-200/80 shadow-xs">
            <div className="w-14 h-14 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <ClipboardList className="w-7 h-7 stroke-[1.5]" />
            </div>
            <h4 className="text-base font-bold text-slate-800">Không tìm thấy bản ghi nào</h4>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Không có thao tác nào khớp với bộ lọc hiện tại. Thử chọn &quot;Tất cả&quot; hoặc xóa từ khóa tìm kiếm.
            </p>
          </div>
        ) : (
          filteredLogs.map((log) => {
            const badge = getActionBadge(log.action);
            return (
              <motion.div
                key={log.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-slate-200/80 hover:border-emerald-300 shadow-2xs hover:shadow-xs transition-all"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  {/* Left: Badge, Title, Description */}
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 border mt-0.5 ${badge.bg}`}
                    >
                      {badge.icon}
                    </div>

                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-extrabold text-sm sm:text-base text-slate-900 leading-snug">
                          {log.title}
                        </span>

                        <span
                          className={`text-[11px] font-bold px-2 py-0.5 rounded-lg border flex items-center gap-1 ${badge.bg}`}
                        >
                          {badge.label}
                        </span>

                        {log.actor && (
                          <span className="text-[11px] font-medium text-slate-500 flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded-lg">
                            <ShieldCheck className="w-3 h-3 text-emerald-600" />
                            {log.actor}
                          </span>
                        )}
                      </div>

                      <p className="text-xs sm:text-sm text-slate-700 font-medium leading-relaxed break-words">
                        {log.description}
                      </p>

                      {/* Extra tags (Debtor, Amount, Metadata) */}
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        {log.debtorName && (
                          <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            {log.debtorName}
                          </span>
                        )}

                        {log.amount !== undefined && log.amount > 0 && (
                          <span
                            className={`text-xs font-black font-mono px-2 py-0.5 rounded-md border ${
                              log.action === 'ADD_TRANSACTION'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : log.action === 'UPDATE_TRANSACTION' || log.action === 'SETTLE_DEBT'
                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                : 'bg-slate-50 text-slate-700 border-slate-200'
                            }`}
                          >
                            {log.action === 'ADD_TRANSACTION' ? '+' : ''}
                            {formatVND(log.amount)} VNĐ
                          </span>
                        )}
                      </div>

                      {/* Before & After Info Box - THÔNG TIN TRƯỚC VÀ SAU THAY ĐỔI */}
                      {(Boolean(log.changes && log.changes.length > 0) || Boolean(log.beforeState || log.afterState)) && (
                        <div className="mt-3 pt-2.5 border-t border-slate-100 space-y-2">
                          <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700">
                            <History className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Thông tin trước &amp; sau thay đổi:</span>
                          </div>

                          {/* Specific Field Changes Table/List */}
                          {log.changes && log.changes.length > 0 ? (
                            <div className="rounded-xl overflow-hidden border border-slate-200/80 bg-slate-50/60 divide-y divide-slate-100 text-xs">
                              {log.changes.map((c, cIdx) => (
                                <div
                                  key={cIdx}
                                  className="p-2 sm:px-3 sm:py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5"
                                >
                                  <span className="font-semibold text-slate-600 sm:w-1/3 shrink-0">
                                    {c.fieldLabel}:
                                  </span>
                                  <div className="flex items-center gap-2 flex-1 min-w-0 font-mono text-[11px] sm:text-xs">
                                    <span
                                      className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200/80 truncate max-w-[45%]"
                                      title={String(c.before ?? '')}
                                    >
                                      {c.before !== undefined && c.before !== null && c.before !== ''
                                        ? String(c.before)
                                        : '(Trống)'}
                                    </span>
                                    <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                                    <span
                                      className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200/80 font-bold truncate max-w-[45%]"
                                      title={String(c.after ?? '')}
                                    >
                                      {c.after !== undefined && c.after !== null && c.after !== ''
                                        ? String(c.after)
                                        : '(Trống)'}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            /* State Summary Comparison */
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                              {log.beforeState && (
                                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/70 space-y-1">
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                    Trước thay đổi:
                                  </span>
                                  <p className="font-mono text-[11px] text-slate-600 break-words leading-relaxed">
                                    {typeof log.beforeState === 'object'
                                      ? JSON.stringify(log.beforeState)
                                      : log.beforeState}
                                  </p>
                                </div>
                              )}
                              {log.afterState && (
                                <div className="p-2.5 rounded-xl bg-emerald-50/50 border border-emerald-200/70 space-y-1">
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                                    Sau thay đổi:
                                  </span>
                                  <p className="font-mono text-[11px] font-semibold text-emerald-900 break-words leading-relaxed">
                                    {typeof log.afterState === 'object'
                                      ? JSON.stringify(log.afterState)
                                      : log.afterState}
                                  </p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: Timestamp & ID */}
                  <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-1 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 text-slate-400">
                    <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-400" />
                      {formatLogTime(log.timestamp)}
                    </span>

                    <button
                      type="button"
                      onClick={(e) => handleCopyLogId(e, log.id)}
                      className="text-[10px] font-mono text-slate-400 hover:text-slate-700 flex items-center gap-1 px-1.5 py-0.5 rounded-md hover:bg-slate-100 transition-colors cursor-pointer"
                      title="Sao chép mã kiểm vết"
                    >
                      {copiedId === log.id ? (
                        <>
                          <Check className="w-2.5 h-2.5 text-emerald-600" />
                          <span className="text-emerald-700 font-bold">Đã chép ID</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-2.5 h-2.5" />
                          <span>{log.id.slice(0, 14)}...</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })
        )}
      </div>

      {/* 5. Footer Note & Clear Action */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200/80 text-xs text-slate-500">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>
            Nhật ký thao tác được lưu trữ chung với Google Sheets &amp; Google Drive tại tab <strong>&quot;Nhật Ký Thao Tác (Logs)&quot;</strong>.
          </span>
        </div>

        {auditLogs.length > 0 && (
          <button
            type="button"
            onClick={() => setShowClearConfirm(true)}
            className="text-xs font-bold text-rose-600 hover:text-rose-700 hover:underline shrink-0 cursor-pointer"
          >
            Làm sạch nhật ký
          </button>
        )}
      </div>

      {/* Modal xác nhận làm sạch nhật ký */}
      <AnimatePresence>
        {showClearConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-slate-200 text-center space-y-4"
            >
              <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
                <Trash2 className="w-6 h-6" />
              </div>
              <h3 className="text-base font-extrabold text-slate-900">
                Làm sạch nhật ký trên ứng dụng?
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Thao tác này chỉ làm sạch danh sách nhật ký hiển thị trên thiết bị hiện tại để giải phóng bộ nhớ.
              </p>
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-left text-[11px] text-emerald-800 space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-emerald-900">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Google Sheets bảo toàn 100%</span>
                </div>
                <p className="text-emerald-700 leading-tight">
                  Toàn bộ dữ liệu log trên Google Sheets hoạt động theo chế độ chỉ ghi thêm (append-only), không bao giờ bị xóa.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowClearConfirm(false)}
                  className="py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={handleClearLogs}
                  className="py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-xs font-bold text-white shadow-sm cursor-pointer"
                >
                  Xác nhận xóa
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
