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
  AlertCircle,
  Cloud,
  Lock,
  ScanFace,
  Share2,
  Image as ImageIcon,
  ChevronDown,
  ChevronUp,
  Smartphone,
  ArrowLeft,
} from 'lucide-react';
import { AuditLog, Debtor, Transaction, PartySplit, AppSettings } from '../types';
import { formatVND } from '../utils/vietqr';
import { triggerHaptic } from '../utils/haptic';
import {
  syncViaAppsScript,
  exportGoogleSheetsCsvFile,
  GOOGLE_APPS_SCRIPT_TEMPLATE,
} from '../services/googleSheetsService';
import { clearAuditLogs, recordAuditLog } from '../utils/storage';

interface AdminAuditLogsTabProps {
  auditLogs: AuditLog[];
  onRefreshLogs?: () => Promise<any> | void;
  onRestoreClearedLogs?: () => Promise<any> | void;
  remoteSyncStatus?: {
    isSyncing?: boolean;
    needsAppsScriptUpgrade?: boolean;
    hiddenByClearCount?: number;
    source?: string;
    sheetsError?: string;
  };
  debtors: Debtor[];
  transactions: Transaction[];
  parties: PartySplit[];
  settings: AppSettings;
  onSaveSettings: (newSettings: AppSettings) => Promise<any> | void;
  showToast?: (msg: string, type?: 'success' | 'info') => void;
  onGoBack?: () => void;
}

export const AdminAuditLogsTab: React.FC<AdminAuditLogsTabProps> = ({
  auditLogs,
  onRefreshLogs,
  onRestoreClearedLogs,
  remoteSyncStatus,
  debtors,
  transactions,
  parties,
  settings,
  onSaveSettings,
  showToast: externalShowToast,
  onGoBack,
}) => {
  const [internalToast, setInternalToast] = useState<{ message: string; type: 'success' | 'info' } | null>(null);
  const showToast = (message: string, type: 'success' | 'info' = 'success') => {
    if (externalShowToast) {
      externalShowToast(message, type);
      return;
    }
    setInternalToast({ message, type });
    setTimeout(() => setInternalToast(null), 4000);
  };
  const [searchQuery, setSearchQuery] = useState('');
  const [filterActionGroup, setFilterActionGroup] = useState<
    'ALL' | 'TRANSACTION' | 'LOOKUP' | 'DEBTOR' | 'PARTY' | 'SECURITY' | 'SYSTEM' | 'ERRORS'
  >('ALL');
  const [dateFilter, setDateFilter] = useState<'ALL' | 'TODAY' | '7_DAYS' | '30_DAYS'>('ALL');
  const [isSyncingSheets, setIsSyncingSheets] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [expandedMetaIds, setExpandedMetaIds] = useState<Record<string, boolean>>({});
  const [visibleCount, setVisibleCount] = useState<number>(50);

  const toggleMetadata = (id: string) => {
    triggerHaptic('selection');
    setExpandedMetaIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Reset pagination when filters change
  useEffect(() => {
    setVisibleCount(50);
  }, [filterActionGroup, dateFilter, searchQuery]);

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
      result = result.filter((l) =>
        ['GUEST_LOOKUP', 'LOOKUP_FAILED', 'SHARE_REMINDER', 'VIEW_RECEIPT'].includes(l.action)
      );
    } else if (filterActionGroup === 'DEBTOR') {
      result = result.filter((l) =>
        ['ADD_DEBTOR', 'UPDATE_DEBTOR', 'DELETE_DEBTOR'].includes(l.action)
      );
    } else if (filterActionGroup === 'PARTY') {
      result = result.filter((l) =>
        ['ADD_PARTY', 'UPDATE_PARTY', 'DELETE_PARTY'].includes(l.action)
      );
    } else if (filterActionGroup === 'SECURITY') {
      result = result.filter((l) =>
        ['LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT', 'AUTO_LOCK', 'BIOMETRIC_AUTH'].includes(l.action)
      );
    } else if (filterActionGroup === 'SYSTEM') {
      result = result.filter((l) =>
        ['UPDATE_SETTINGS', 'SYNC_SHEETS', 'CLOUD_SYNC', 'RESTORE_DATA', 'CLEAR_DATA', 'EXPORT_DATA', 'EXPORT_STATEMENT'].includes(l.action)
      );
    } else if (filterActionGroup === 'ERRORS') {
      result = result.filter((l) =>
        ['OPERATION_FAILED', 'LOGIN_FAILED', 'LOOKUP_FAILED'].includes(l.action)
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

    // Filter by search query (includes changes & metadata)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((l) => {
        const changesHit = l.changes?.some(
          (c) =>
            c.fieldLabel.toLowerCase().includes(q) ||
            String(c.before ?? '').toLowerCase().includes(q) ||
            String(c.after ?? '').toLowerCase().includes(q)
        );
        const metaHit = l.metadata
          ? JSON.stringify(l.metadata).toLowerCase().includes(q)
          : false;
        return (
          l.id.toLowerCase().includes(q) ||
          l.action.toLowerCase().includes(q) ||
          l.title.toLowerCase().includes(q) ||
          l.description.toLowerCase().includes(q) ||
          (l.debtorName && l.debtorName.toLowerCase().includes(q)) ||
          l.actor.toLowerCase().includes(q) ||
          (l.amount && String(l.amount).includes(q)) ||
          Boolean(changesHit) ||
          metaHit
        );
      });
    }

    // Sort newest first
    return result.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
  }, [auditLogs, filterActionGroup, dateFilter, searchQuery]);

  const displayedLogs = useMemo(() => {
    return filteredLogs.slice(0, visibleCount);
  }, [filteredLogs, visibleCount]);

  // Master Sync to Google Sheets (4 Tabs together: Debtors, Transactions, Parties, and Audit Logs)
  const handleMasterSyncToGoogleSheets = async () => {
    triggerHaptic('medium');
    if (!settings.googleAppsScriptUrl) {
      showToast('Vui lòng thiết lập URL Google Apps Script Web App trong Cài Đặt trước khi đồng bộ.', 'info');
      return;
    }

    setIsSyncingSheets(true);
    try {
      const result = await syncViaAppsScript(
        {
          debtors,
          transactions,
          parties,
          settings,
          auditLogs,
        },
        settings.googleAppsScriptUrl
      );

      const updatedSettings: AppSettings = {
        ...settings,
        googleSheetId: result.spreadsheetId,
        googleSheetUrl: result.spreadsheetUrl,
        lastGoogleSheetSyncAt: result.updatedAt,
      };
      await onSaveSettings(updatedSettings);

      showToast(
        `Đã đồng bộ toàn bộ 5 Tab (Công Nợ, Giao Dịch, Chia Bill, Nhật Ký, Cài Đặt) sang Google Sheets!`,
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
    try {
      recordAuditLog({
        action: 'CLEAR_DATA',
        actor: 'Chủ Sổ (Admin)',
        title: 'Làm sạch nhật ký trên ứng dụng',
        description: 'Chủ sổ đã làm sạch toàn bộ nhật ký hiển thị trên ứng dụng. Toàn bộ lịch sử trên Google Sheets vẫn được lưu giữ an toàn vĩnh viễn (Append-Only).',
        beforeState: `${auditLogs.length} bản ghi trên ứng dụng`,
        afterState: '0 bản ghi trên ứng dụng (Google Sheets bảo toàn)',
        changes: [
          { fieldLabel: 'Nhật ký ứng dụng', before: `${auditLogs.length} bản ghi`, after: 'Đã làm sạch' },
          { fieldLabel: 'Google Sheets Tab 4', before: 'Bảo toàn', after: 'Chỉ ghi thêm (Append-Only)' },
        ],
      });
    } catch {
      // ignore
    }
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
          icon: <PlusCircle className="w-4 h-4 text-emerald-700" />,
          iconBox: 'bg-emerald-100 text-emerald-700',
          card: 'bg-emerald-50/20 hover:bg-emerald-50/40 border-emerald-200/80 border-l-emerald-500',
          labelColor: 'text-emerald-700',
          label: 'Ghi nợ (+)',
        };
      case 'UPDATE_TRANSACTION':
        return {
          icon: <Edit3 className="w-4 h-4 text-blue-700" />,
          iconBox: 'bg-blue-100 text-blue-700',
          card: 'bg-blue-50/20 hover:bg-blue-50/40 border-blue-200/80 border-l-blue-500',
          labelColor: 'text-blue-700',
          label: 'Cập nhật / Thu (-)',
        };
      case 'DELETE_TRANSACTION':
        return {
          icon: <Trash2 className="w-4 h-4 text-rose-700" />,
          iconBox: 'bg-rose-100 text-rose-700',
          card: 'bg-rose-50/20 hover:bg-rose-50/40 border-rose-200/80 border-l-rose-500',
          labelColor: 'text-rose-700',
          label: 'Xóa giao dịch',
        };
      case 'SETTLE_DEBT':
        return {
          icon: <CheckCircle2 className="w-4 h-4 text-emerald-700" />,
          iconBox: 'bg-emerald-100 text-emerald-700',
          card: 'bg-emerald-50/20 hover:bg-emerald-50/40 border-emerald-200/80 border-l-emerald-500',
          labelColor: 'text-emerald-700',
          label: 'Tất toán sạch nợ (0đ)',
        };
      case 'ADD_DEBTOR':
        return {
          icon: <UserPlus className="w-4 h-4 text-emerald-700" />,
          iconBox: 'bg-emerald-100 text-emerald-700',
          card: 'bg-emerald-50/20 hover:bg-emerald-50/40 border-emerald-200/80 border-l-emerald-500',
          labelColor: 'text-emerald-700',
          label: 'Thêm người nợ',
        };
      case 'UPDATE_DEBTOR':
        return {
          icon: <KeyRound className="w-4 h-4 text-amber-700" />,
          iconBox: 'bg-amber-100 text-amber-800',
          card: 'bg-amber-50/20 hover:bg-amber-50/40 border-amber-200/80 border-l-amber-500',
          labelColor: 'text-amber-700',
          label: 'Sửa người nợ',
        };
      case 'DELETE_DEBTOR':
        return {
          icon: <UserX className="w-4 h-4 text-rose-700" />,
          iconBox: 'bg-rose-100 text-rose-700',
          card: 'bg-rose-50/20 hover:bg-rose-50/40 border-rose-200/80 border-l-rose-500',
          labelColor: 'text-rose-700',
          label: 'Xóa người nợ',
        };
      case 'ADD_PARTY':
        return {
          icon: <Users className="w-4 h-4 text-amber-800" />,
          iconBox: 'bg-amber-100 text-amber-800',
          card: 'bg-amber-50/20 hover:bg-amber-50/40 border-amber-200/80 border-l-amber-500',
          labelColor: 'text-amber-700',
          label: 'Chia bill nhóm',
        };
      case 'UPDATE_PARTY':
        return {
          icon: <Edit3 className="w-4 h-4 text-amber-800" />,
          iconBox: 'bg-amber-100 text-amber-800',
          card: 'bg-amber-50/20 hover:bg-amber-50/40 border-amber-200/80 border-l-amber-500',
          labelColor: 'text-amber-700',
          label: 'Sửa chia bill',
        };
      case 'DELETE_PARTY':
        return {
          icon: <Trash2 className="w-4 h-4 text-rose-700" />,
          iconBox: 'bg-rose-100 text-rose-700',
          card: 'bg-rose-50/20 hover:bg-rose-50/40 border-rose-200/80 border-l-rose-500',
          labelColor: 'text-rose-700',
          label: 'Xóa chia bill',
        };
      case 'UPDATE_SETTINGS':
        return {
          icon: <Settings className="w-4 h-4 text-slate-700" />,
          iconBox: 'bg-slate-200/80 text-slate-700',
          card: 'bg-slate-50/50 hover:bg-slate-50/90 border-slate-200/80 border-l-slate-500',
          labelColor: 'text-slate-600',
          label: 'Cài đặt hệ thống',
        };
      case 'SYNC_SHEETS':
        return {
          icon: <FileSpreadsheet className="w-4 h-4 text-emerald-700" />,
          iconBox: 'bg-emerald-100 text-emerald-700',
          card: 'bg-emerald-50/20 hover:bg-emerald-50/40 border-emerald-200/80 border-l-emerald-500',
          labelColor: 'text-emerald-700',
          label: 'Google Sheets',
        };
      case 'CLOUD_SYNC':
        return {
          icon: <Cloud className="w-4 h-4 text-blue-700" />,
          iconBox: 'bg-blue-100 text-blue-700',
          card: 'bg-blue-50/20 hover:bg-blue-50/40 border-blue-200/80 border-l-blue-500',
          labelColor: 'text-blue-700',
          label: 'Google Sheets Cloud',
        };
      case 'GUEST_LOOKUP':
        return {
          icon: <Eye className="w-4 h-4 text-blue-700" />,
          iconBox: 'bg-blue-100 text-blue-700',
          card: 'bg-blue-50/20 hover:bg-blue-50/40 border-blue-200/80 border-l-blue-500',
          labelColor: 'text-blue-700',
          label: 'Khách tra cứu',
        };
      case 'LOOKUP_FAILED':
        return {
          icon: <AlertCircle className="w-4 h-4 text-amber-700" />,
          iconBox: 'bg-amber-100 text-amber-800',
          card: 'bg-amber-50/20 hover:bg-amber-50/40 border-amber-200/80 border-l-amber-500',
          labelColor: 'text-amber-700',
          label: 'Tra cứu thất bại',
        };
      case 'GUEST_REPORT':
        return {
          icon: <CheckCircle2 className="w-4 h-4 text-amber-800" />,
          iconBox: 'bg-amber-100 text-amber-800',
          card: 'bg-amber-50/20 hover:bg-amber-50/40 border-amber-200/80 border-l-amber-500',
          labelColor: 'text-amber-700',
          label: 'Khách báo CK',
        };
      case 'LOGIN_SUCCESS':
        return {
          icon: <ShieldCheck className="w-4 h-4 text-emerald-700" />,
          iconBox: 'bg-emerald-100 text-emerald-700',
          card: 'bg-emerald-50/20 hover:bg-emerald-50/40 border-emerald-200/80 border-l-emerald-500',
          labelColor: 'text-emerald-700',
          label: 'Đăng nhập thành công',
        };
      case 'BIOMETRIC_AUTH':
        return {
          icon: <ScanFace className="w-4 h-4 text-emerald-700" />,
          iconBox: 'bg-emerald-100 text-emerald-700',
          card: 'bg-emerald-50/20 hover:bg-emerald-50/40 border-emerald-200/80 border-l-emerald-500',
          labelColor: 'text-emerald-700',
          label: 'FaceID / Sinh trắc học',
        };
      case 'LOGIN_FAILED':
        return {
          icon: <AlertCircle className="w-4 h-4 text-rose-700" />,
          iconBox: 'bg-rose-100 text-rose-700',
          card: 'bg-rose-50/20 hover:bg-rose-50/40 border-rose-200/80 border-l-rose-500',
          labelColor: 'text-rose-700',
          label: 'Đăng nhập thất bại',
        };
      case 'LOGOUT':
        return {
          icon: <LogOut className="w-4 h-4 text-slate-700" />,
          iconBox: 'bg-slate-200/80 text-slate-700',
          card: 'bg-slate-50/50 hover:bg-slate-50/90 border-slate-200/80 border-l-slate-400',
          labelColor: 'text-slate-600',
          label: 'Đăng xuất',
        };
      case 'AUTO_LOCK':
        return {
          icon: <Lock className="w-4 h-4 text-amber-800" />,
          iconBox: 'bg-amber-100 text-amber-800',
          card: 'bg-amber-50/20 hover:bg-amber-50/40 border-amber-200/80 border-l-amber-500',
          labelColor: 'text-amber-700',
          label: 'Tự động khóa',
        };
      case 'EXPORT_DATA':
        return {
          icon: <Download className="w-4 h-4 text-blue-700" />,
          iconBox: 'bg-blue-100 text-blue-700',
          card: 'bg-blue-50/20 hover:bg-blue-50/40 border-blue-200/80 border-l-blue-500',
          labelColor: 'text-blue-700',
          label: 'Xuất JSON / CSV',
        };
      case 'EXPORT_STATEMENT':
        return {
          icon: <Download className="w-4 h-4 text-blue-700" />,
          iconBox: 'bg-blue-100 text-blue-700',
          card: 'bg-blue-50/20 hover:bg-blue-50/40 border-blue-200/80 border-l-blue-500',
          labelColor: 'text-blue-700',
          label: 'Xuất bảng kê / QR',
        };
      case 'SHARE_REMINDER':
        return {
          icon: <Share2 className="w-4 h-4 text-emerald-700" />,
          iconBox: 'bg-emerald-100 text-emerald-700',
          card: 'bg-emerald-50/20 hover:bg-emerald-50/40 border-emerald-200/80 border-l-emerald-500',
          labelColor: 'text-emerald-700',
          label: 'Chép / Gửi nhắc nợ',
        };
      case 'VIEW_RECEIPT':
        return {
          icon: <ImageIcon className="w-4 h-4 text-slate-700" />,
          iconBox: 'bg-slate-200/80 text-slate-700',
          card: 'bg-slate-50/50 hover:bg-slate-50/90 border-slate-200/80 border-l-slate-400',
          labelColor: 'text-slate-600',
          label: 'Xem ảnh chứng từ',
        };
      case 'RESTORE_DATA':
        return {
          icon: <History className="w-4 h-4 text-blue-700" />,
          iconBox: 'bg-blue-100 text-blue-700',
          card: 'bg-blue-50/20 hover:bg-blue-50/40 border-blue-200/80 border-l-blue-500',
          labelColor: 'text-blue-700',
          label: 'Khôi phục dữ liệu',
        };
      case 'CLEAR_DATA':
        return {
          icon: <Trash2 className="w-4 h-4 text-rose-700" />,
          iconBox: 'bg-rose-100 text-rose-700',
          card: 'bg-rose-50/20 hover:bg-rose-50/40 border-rose-200/80 border-l-rose-500',
          labelColor: 'text-rose-700',
          label: 'Xóa dữ liệu / Dọn dẹp',
        };
      case 'OPERATION_FAILED':
        return {
          icon: <AlertCircle className="w-4 h-4 text-rose-700" />,
          iconBox: 'bg-rose-100 text-rose-700',
          card: 'bg-rose-50/20 hover:bg-rose-50/40 border-rose-200/80 border-l-rose-500',
          labelColor: 'text-rose-700',
          label: 'Lỗi thao tác',
        };
      default:
        return {
          icon: <ClipboardList className="w-4 h-4 text-slate-700" />,
          iconBox: 'bg-slate-200/80 text-slate-700',
          card: 'bg-slate-50/50 hover:bg-slate-50/90 border-slate-200/80 border-l-slate-400',
          labelColor: 'text-slate-600',
          label: 'Thao tác',
        };
    }
  };

  const METADATA_LABELS: Record<string, string> = {
    recordedAtLocal: 'Giờ thiết bị',
    device: 'Thiết bị / Trình duyệt',
    appMode: 'Chế độ chạy',
    viewport: 'Khung hình',
    online: 'Trạng thái mạng',
    authChannel: 'Kênh xác thực',
    loginMethod: 'Phương thức ĐN',
    transactionId: 'Mã GD',
    partyId: 'Mã cuộc vui',
    debtorId: 'Mã người nợ',
    date: 'Ngày phát sinh',
    type: 'Loại',
    category: 'Phân loại',
    prevBalance: 'Dư nợ trước',
    newBalance: 'Dư nợ sau',
    afterBalance: 'Dư nợ sau xóa',
    projectedBalance: 'Dư nợ dự kiến',
    prevTxCount: 'Số GD trước',
    newTxCount: 'Số GD sau',
    remainingTxCount: 'Số GD còn lại',
    hasBillImage: 'Có ảnh hóa đơn',
    hadBillImage: 'Từng có ảnh hóa đơn',
    isSettled: 'Tất toán 0đ',
    pin: 'Mã PIN',
    source: 'Nguồn tra cứu',
    totalAdd: 'Tổng ghi nợ (+)',
    totalSub: 'Tổng đã trả (-)',
    txCount: 'Tổng số GD',
    splitCount: 'Số bill nhóm',
    totalAmount: 'Tổng tiền bill',
    splitAmountPerPerson: 'Mỗi người',
    totalPeopleCount: 'Tổng số người',
    payerName: 'Người trả trước',
    participants: 'Thành viên',
    addedParticipants: 'Thành viên mới thêm',
    removedParticipants: 'Thành viên đã gỡ',
    databaseId: 'CSDL Google Sheets',
    totalLatencyMs: 'Độ trễ phản hồi',
    clientPingMs: 'Ping trực tiếp',
    direction: 'Hướng đồng bộ',
    filename: 'Tên tệp',
    method: 'Hình thức',
    verificationHash: 'Mã đối soát',
    autoLockTimeout: 'Cấu hình tự khóa',
    elapsedMs: 'Thời gian ẩn (ms)',
    debtorsCount: 'Số người nợ',
    transactionsCount: 'Số giao dịch',
    partiesCount: 'Số cuộc vui',
    auditLogsCount: 'Số nhật ký',
  };

  const formatMetaValue = (key: string, val: any): string => {
    if (val === undefined || val === null || val === '') return '';
    if (typeof val === 'boolean') return val ? 'Có' : 'Không';
    if (Array.isArray(val)) return val.join(', ');
    if (
      typeof val === 'number' &&
      ['prevBalance', 'newBalance', 'afterBalance', 'projectedBalance', 'balance', 'totalAdd', 'totalSub', 'totalAmount', 'splitAmountPerPerson', 'deletedBalance', 'deletedAddTotal', 'deletedSubTotal', 'amount'].includes(key)
    ) {
      return `${formatVND(val)} VNĐ`;
    }
    if (key === 'totalLatencyMs' || key === 'clientPingMs') return `${val} ms`;
    return String(val);
  };

  const spreadsheetUrl = settings.googleSheetUrl;
  const lastSyncDateStr = settings.lastGoogleSheetSyncAt
    ? new Date(settings.lastGoogleSheetSyncAt).toLocaleString('vi-VN')
    : null;

  return (
    <div className="w-full max-w-5xl mx-auto space-y-4 pb-4 animate-in fade-in duration-150">
      {/* 1. SINGLE HEADER BAR (Đồng nhất với trang Cài Đặt) */}
      <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/90 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {onGoBack && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('selection');
                onGoBack();
              }}
              className="p-2 rounded-2xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 transition-colors flex items-center justify-center shrink-0 cursor-pointer shadow-2xs"
              title="Quay lại Tổng quan"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight truncate">
              Nhật Ký Hoạt Động
            </h1>
            <p className="text-xs text-slate-500 mt-0.5 truncate">
              Lưu {auditLogs.length}/500 bản ghi trên máy{lastSyncDateStr ? ` • Sheets: ${lastSyncDateStr}` : ''}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 shrink-0">
          {onRefreshLogs && (
            <button
              type="button"
              disabled={Boolean(remoteSyncStatus?.isSyncing)}
              onClick={async () => {
                triggerHaptic('light');
                const res: any = await onRefreshLogs();
                if (res && typeof res.newCount === 'number' && res.newCount > 0) {
                  showToast(`Đã tải thêm ${res.newCount} nhật ký mới từ các thiết bị khác!`, 'success');
                } else {
                  showToast('Đã đồng bộ nhật ký mới nhất từ máy chủ & Google Sheets!', 'info');
                }
              }}
              className="h-9 px-2.5 sm:px-3 rounded-xl bg-slate-100 hover:bg-slate-200/80 text-slate-700 text-xs font-semibold border border-slate-200/80 shadow-2xs active:scale-95 transition-all cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-60"
              title="Kéo nhật ký mới từ máy chủ & Google Sheets Tab 4"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-slate-600 ${remoteSyncStatus?.isSyncing ? 'animate-spin' : ''}`} />
              <span>{remoteSyncStatus?.isSyncing ? 'Đang tải...' : 'Làm mới'}</span>
            </button>
          )}

          {settings.googleAppsScriptUrl && (
            <button
              type="button"
              disabled={isSyncingSheets}
              onClick={handleMasterSyncToGoogleSheets}
              className="h-9 px-2.5 sm:px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-semibold border border-emerald-200/90 shadow-2xs active:scale-95 transition-all cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-60"
              title="Đồng bộ dữ liệu & nhật ký sang Google Sheets"
            >
              <FileSpreadsheet className={`w-3.5 h-3.5 text-emerald-600 ${isSyncingSheets ? 'animate-pulse' : ''}`} />
              <span>{isSyncingSheets ? 'Đang gửi...' : 'Đồng bộ Sheets'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleExportCsv}
            className="h-9 px-2.5 sm:px-3 rounded-xl bg-slate-100 hover:bg-slate-200/80 text-slate-700 text-xs font-semibold border border-slate-200/80 shadow-2xs active:scale-95 transition-all cursor-pointer inline-flex items-center gap-1.5"
            title="Xuất file CSV 4 bảng (bao gồm Nhật ký)"
          >
            <Download className="w-3.5 h-3.5 text-slate-600" />
            <span>Xuất CSV</span>
          </button>

          {spreadsheetUrl && (
            <a
              href={spreadsheetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="h-9 px-2.5 sm:px-3 rounded-xl bg-slate-100 hover:bg-slate-200/80 text-slate-700 text-xs font-semibold border border-slate-200/80 shadow-2xs active:scale-95 transition-all cursor-pointer inline-flex items-center gap-1.5"
              title="Mở Google Sheets liên kết"
            >
              <ExternalLink className="w-3.5 h-3.5 text-emerald-600" />
              <span className="hidden sm:inline">Mở Sheets</span>
            </a>
          )}

          {auditLogs.length > 0 && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('medium');
                setShowClearConfirm(true);
              }}
              className="h-9 px-2.5 sm:px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold border border-rose-200/90 shadow-2xs active:scale-95 transition-all cursor-pointer inline-flex items-center gap-1.5"
              title="Làm sạch nhật ký trên thiết bị (Google Sheets được bảo toàn)"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
              <span className="hidden sm:inline">Làm sạch</span>
            </button>
          )}
        </div>
      </div>

      {/* Upgrade notice if user still uses old Apps Script v1/v2 */}
      {remoteSyncStatus?.needsAppsScriptUpgrade && (
        <div className="bg-amber-50/90 border border-amber-200 rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 text-xs text-amber-900">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Cần cập nhật mã Google Apps Script v3 để dùng Google Sheets làm CSDL duy nhất &amp; đồng bộ nhật ký 2 chiều</p>
              <p className="text-amber-800/90 mt-0.5 leading-relaxed">
                Apps Script hiện tại đang là bản cũ (chưa hỗ trợ đầy đủ 5 Tab &amp; đọc nhật ký từ Tab 4). Hãy dán lại mã mới v3 trong phần <strong>Cài Đặt &rarr; Đồng Bộ Google Sheets</strong> rồi chọn <strong>Triển khai &rarr; Quản lý các bản triển khai &rarr; Phiên bản mới</strong>.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              triggerHaptic('success');
              navigator.clipboard.writeText(GOOGLE_APPS_SCRIPT_TEMPLATE);
              showToast('Đã sao chép mã Google Apps Script v3 vào bộ nhớ tạm!', 'success');
            }}
            className="px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs shrink-0 cursor-pointer inline-flex items-center gap-1.5 self-start sm:self-center"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Sao chép mã v3</span>
          </button>
        </div>
      )}

      {/* Restore older logs cleared locally if present in Google Sheets */}
      {remoteSyncStatus?.hiddenByClearCount && remoteSyncStatus.hiddenByClearCount > 0 && onRestoreClearedLogs && (
        <div className="bg-slate-50 border border-slate-200/90 rounded-2xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
          <span>
            Đang ẩn <strong>{remoteSyncStatus.hiddenByClearCount}</strong> nhật ký cũ hơn mốc bạn đã làm sạch trên máy này (vẫn còn trên Google Sheets).
          </span>
          <button
            type="button"
            onClick={async () => {
              triggerHaptic('light');
              await onRestoreClearedLogs();
              showToast('Đã khôi phục toàn bộ lịch sử nhật ký từ Google Sheets!', 'success');
            }}
            className="font-bold text-emerald-700 hover:text-emerald-800 hover:underline cursor-pointer"
          >
            Hiện lại từ Google Sheets →
          </button>
        </div>
      )}

      {/* 2. TOOLBAR TÌM KIẾM & BỘ LỌC (Đồng nhất với thanh điều khiển Tổng quan) */}
      <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/90 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm theo người nợ, hành động, số tiền, thiết bị..."
              className="w-full h-9 sm:h-10 pl-9 pr-8 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          {/* Date Filter (Segmented style matching Header/OwnerDashboard) */}
          <div className="flex items-center p-1 bg-slate-100/90 rounded-xl border border-slate-200/80 shrink-0 overflow-x-auto no-scrollbar">
            {(
              [
                { id: 'ALL', label: 'Tất cả' },
                { id: 'TODAY', label: 'Hôm nay' },
                { id: '7_DAYS', label: '7 ngày' },
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
                className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  dateFilter === opt.id
                    ? 'bg-white text-slate-900 shadow-2xs border border-slate-200/60'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Category Filter Segmented Tabs */}
        <div className="flex items-center gap-1 p-1 bg-slate-100/90 rounded-2xl border border-slate-200/80 overflow-x-auto no-scrollbar">
          {(
            [
              { id: 'ALL', label: 'Tất cả', count: auditLogs.length },
              {
                id: 'TRANSACTION',
                label: 'Giao dịch',
                count: auditLogs.filter((l) =>
                  ['ADD_TRANSACTION', 'UPDATE_TRANSACTION', 'DELETE_TRANSACTION', 'SETTLE_DEBT', 'GUEST_REPORT'].includes(l.action)
                ).length,
              },
              {
                id: 'LOOKUP',
                label: 'Tra cứu & Nhắc nợ',
                count: auditLogs.filter((l) =>
                  ['GUEST_LOOKUP', 'LOOKUP_FAILED', 'SHARE_REMINDER', 'VIEW_RECEIPT'].includes(l.action)
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
                label: 'Chia bill',
                count: auditLogs.filter((l) =>
                  ['ADD_PARTY', 'UPDATE_PARTY', 'DELETE_PARTY'].includes(l.action)
                ).length,
              },
              {
                id: 'SECURITY',
                label: 'Bảo mật',
                count: auditLogs.filter((l) =>
                  ['LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT', 'AUTO_LOCK', 'BIOMETRIC_AUTH'].includes(l.action)
                ).length,
              },
              {
                id: 'SYSTEM',
                label: 'Đồng bộ & Cài đặt',
                count: auditLogs.filter((l) =>
                  ['UPDATE_SETTINGS', 'SYNC_SHEETS', 'CLOUD_SYNC', 'RESTORE_DATA', 'CLEAR_DATA', 'EXPORT_DATA', 'EXPORT_STATEMENT'].includes(l.action)
                ).length,
              },
              {
                id: 'ERRORS',
                label: 'Lỗi',
                count: auditLogs.filter((l) =>
                  ['OPERATION_FAILED', 'LOGIN_FAILED', 'LOOKUP_FAILED'].includes(l.action)
                ).length,
              },
            ] as const
          ).map((chip) => {
            const isActive = filterActionGroup === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => {
                  triggerHaptic('selection');
                  setFilterActionGroup(chip.id);
                }}
                className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-white text-slate-900 shadow-xs border border-slate-200/60'
                    : chip.id === 'ERRORS' && chip.count > 0
                    ? 'text-rose-700 hover:bg-rose-50/80'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                }`}
              >
                <span>{chip.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold leading-none ${
                    isActive
                      ? chip.id === 'ERRORS'
                        ? 'bg-rose-600 text-white'
                        : 'bg-emerald-600 text-white'
                      : chip.id === 'ERRORS' && chip.count > 0
                      ? 'bg-rose-100 text-rose-700'
                      : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {chip.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. DANH SÁCH NHẬT KÝ (Đồng bộ phong cách thẻ TransactionRow bên Tổng quan) */}
      <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/90 shadow-xs space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <ClipboardList className="w-4 h-4 text-emerald-600" />
            <span>
              Hiển thị <span className="font-mono text-slate-900">{displayedLogs.length}</span> /{' '}
              <span className="font-mono text-slate-900">{filteredLogs.length}</span> bản ghi khớp bộ lọc
            </span>
          </div>
          <span className="text-[11px] text-slate-400 hidden sm:inline">
            Mới nhất lên đầu • Lưu cục bộ &amp; Sheets Tab 4
          </span>
        </div>

        {filteredLogs.length === 0 ? (
          <div className="py-10 px-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <ClipboardList className="w-6 h-6 stroke-[1.6]" />
            </div>
            <h4 className="text-sm font-bold text-slate-800">Không có bản ghi nào</h4>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Chưa có hoạt động nào khớp với bộ lọc hiện tại. Hãy chọn &quot;Tất cả&quot; hoặc xóa từ khóa tìm kiếm.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {displayedLogs.map((log) => {
              const badge = getActionBadge(log.action);
              const metaEntries = log.metadata
                ? Object.entries(log.metadata).filter(([, v]) => v !== undefined && v !== null && v !== '')
                : [];
              const isMetaExpanded = Boolean(expandedMetaIds[log.id]);

              return (
                <div
                  key={log.id}
                  className={`p-3 sm:p-4 rounded-2xl border border-l-4 transition-all space-y-2 shadow-2xs ${badge.card}`}
                >
                  {/* Row Header: Icon + Title/Meta on Left, Amount + Action Label on Right */}
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-start gap-2.5 min-w-0 flex-1">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${badge.iconBox}`}>
                        {badge.icon}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <h3 className="font-bold text-slate-900 text-xs sm:text-sm leading-snug break-words">
                            {log.title}
                          </h3>
                          {log.debtorName && (
                            <span className="text-[11px] font-bold text-emerald-700">
                              • {log.debtorName}
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 text-[11px] text-slate-500">
                          <span className="font-medium text-slate-600">{log.actor}</span>
                          <span>•</span>
                          <span className="inline-flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-400" />
                            {formatLogTime(log.timestamp)}
                          </span>
                          {log.metadata?.device && (
                            <>
                              <span className="hidden sm:inline">•</span>
                              <span className="hidden sm:inline-flex items-center gap-1 text-slate-400">
                                <Smartphone className="w-3 h-3" />
                                {log.metadata.device}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Amount + Action Tag */}
                    <div className="text-right shrink-0">
                      {log.amount !== undefined && log.amount > 0 && (
                        <div className={`font-black font-mono text-sm sm:text-base tabular-nums tracking-tight ${badge.labelColor}`}>
                          {log.action === 'ADD_TRANSACTION' ? '+' : ''}
                          {formatVND(log.amount)} VNĐ
                        </div>
                      )}
                      <div className={`text-[11px] font-bold ${badge.labelColor}`}>
                        {badge.label}
                      </div>
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-xs text-slate-700 leading-relaxed break-words pl-10.5">
                    {log.description}
                  </p>

                  {/* Before & After Field Diffs */}
                  {(Boolean(log.changes && log.changes.length > 0) || Boolean(log.beforeState || log.afterState)) && (
                    <div className="pl-0 sm:pl-10.5 space-y-2 pt-0.5">
                      {log.changes && log.changes.length > 0 && (
                        <div className="rounded-xl overflow-hidden border border-slate-200/80 bg-white/90 divide-y divide-slate-100 text-xs">
                          {log.changes.map((c, cIdx) => (
                            <div
                              key={cIdx}
                              className="px-3 py-2 flex flex-col sm:flex-row sm:items-start justify-between gap-1.5"
                            >
                              <span className="font-semibold text-slate-600 sm:w-1/3 shrink-0 pt-0.5">
                                {c.fieldLabel}:
                              </span>
                              <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0 font-mono text-[11px] sm:text-xs">
                                <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200/80 break-words whitespace-pre-wrap max-w-full">
                                  {c.before !== undefined && c.before !== null && c.before !== ''
                                    ? String(c.before)
                                    : '(Trống)'}
                                </span>
                                <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                                <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200/80 font-bold break-words whitespace-pre-wrap max-w-full">
                                  {c.after !== undefined && c.after !== null && c.after !== ''
                                    ? String(c.after)
                                    : '(Trống)'}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {(Boolean(log.beforeState || log.afterState) && (!log.changes || log.changes.length === 0 || isMetaExpanded)) && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          {log.beforeState && (
                            <div className="p-2.5 rounded-xl bg-white/90 border border-slate-200/80 space-y-0.5">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                Trước thay đổi
                              </span>
                              <p className="font-mono text-[11px] text-slate-600 break-words leading-relaxed">
                                {typeof log.beforeState === 'object'
                                  ? JSON.stringify(log.beforeState)
                                  : log.beforeState}
                              </p>
                            </div>
                          )}
                          {log.afterState && (
                            <div className="p-2.5 rounded-xl bg-white/90 border border-emerald-200/80 space-y-0.5">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                                Sau thay đổi
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

                  {/* Minimal Footer Row: Metadata Toggle & Log ID */}
                  <div className="pl-0 sm:pl-10.5 pt-1 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                    <div>
                      {metaEntries.length > 0 && (
                        <button
                          type="button"
                          onClick={() => toggleMetadata(log.id)}
                          className="inline-flex items-center gap-1 font-semibold text-slate-500 hover:text-emerald-700 transition-colors cursor-pointer"
                        >
                          {isMetaExpanded ? (
                            <>
                              <ChevronUp className="w-3.5 h-3.5" />
                              <span>Ẩn chi tiết ngữ cảnh ({metaEntries.length})</span>
                            </>
                          ) : (
                            <>
                              <ChevronDown className="w-3.5 h-3.5" />
                              <span>Xem ngữ cảnh &amp; thiết bị ({metaEntries.length})</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={(e) => handleCopyLogId(e, log.id)}
                      className="text-[10px] font-mono text-slate-400 hover:text-slate-700 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md hover:bg-white/80 transition-colors cursor-pointer"
                      title="Sao chép mã kiểm vết"
                    >
                      {copiedId === log.id ? (
                        <>
                          <Check className="w-2.5 h-2.5 text-emerald-600" />
                          <span className="text-emerald-700 font-bold">Đã chép</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-2.5 h-2.5" />
                          <span>#{log.id.slice(0, 12)}</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Expanded Metadata Panel */}
                  {isMetaExpanded && metaEntries.length > 0 && (
                    <div className="sm:ml-10.5 p-2.5 rounded-xl bg-white/90 border border-slate-200/80 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
                      {metaEntries.map(([mKey, mVal]) => (
                        <div key={mKey} className="flex items-baseline justify-between gap-2 border-b border-slate-100 last:border-b-0 pb-1">
                          <span className="text-slate-500 font-semibold shrink-0">
                            {METADATA_LABELS[mKey] || mKey}:
                          </span>
                          <span className="font-mono text-slate-800 font-medium text-right break-all">
                            {formatMetaValue(mKey, mVal)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {filteredLogs.length > visibleCount && (
              <div className="pt-2 flex justify-center">
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setVisibleCount((prev) => prev + 50);
                  }}
                  className="px-5 py-2.5 rounded-2xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold shadow-2xs transition-all cursor-pointer active:scale-95"
                >
                  Xem thêm nhật ký cũ hơn ({filteredLogs.length - visibleCount} bản ghi còn lại)
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 4. FOOTER LƯU TRỮ */}
      <div className="flex items-center gap-2 px-4 py-3 bg-white rounded-2xl border border-slate-200/80 text-xs text-slate-500 shadow-2xs">
        <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
        <span>
          Nhật ký lưu đệm cục bộ và tự động ghi nối tiếp vĩnh viễn sang Google Sheets tại Tab 4 <strong>&quot;Nhật Ký Thao Tác (Logs)&quot;</strong> (Append-Only).
        </span>
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

      {/* Internal Toast Banner when rendered as a standalone page */}
      <AnimatePresence>
        {internalToast && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-20 sm:bottom-6 right-4 sm:right-6 z-50 pointer-events-none"
          >
            <div
              className={`px-4 py-3 rounded-2xl shadow-xl border text-sm font-semibold flex items-center gap-2.5 ${
                internalToast.type === 'success'
                  ? 'bg-emerald-600 text-white border-emerald-500 shadow-emerald-600/20'
                  : 'bg-slate-800 text-white border-slate-700 shadow-slate-900/30'
              }`}
            >
              <span>{internalToast.type === 'success' ? '✓' : 'ℹ'}</span>
              <span>{internalToast.message}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
