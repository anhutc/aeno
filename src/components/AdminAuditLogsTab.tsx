import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ClipboardList,
  Search,
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
  ChevronsUpDown,
  TrendingUp,
  ShieldAlert,
  Monitor,
  Globe,
  Wifi,
} from 'lucide-react';
import { AuditLog, Debtor, Transaction, PartySplit, AppSettings } from '../types';
import { formatVND } from '../utils/vietqr';
import { triggerHaptic } from '../utils/haptic';
import {
  syncViaAppsScript,
  exportGoogleSheetsCsvFile,
  GOOGLE_APPS_SCRIPT_TEMPLATE,
} from '../services/googleSheetsService';
import { clearAuditLogs, getAuditEnvironmentContext, isAutoSyncAuditLog } from '../utils/storage';
import { apiClearRemoteAuditLogs } from '../utils/api';
import { LedgerWaveBars } from './DataPulseLoader';

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

const TRANSACTION_ACTIONS = ['ADD_TRANSACTION', 'UPDATE_TRANSACTION', 'DELETE_TRANSACTION', 'SETTLE_DEBT', 'GUEST_REPORT'];
const LOOKUP_ACTIONS = ['GUEST_LOOKUP', 'LOOKUP_FAILED', 'SHARE_REMINDER', 'VIEW_RECEIPT'];
const DEBTOR_ACTIONS = ['ADD_DEBTOR', 'UPDATE_DEBTOR', 'DELETE_DEBTOR'];
const PARTY_ACTIONS = ['ADD_PARTY', 'UPDATE_PARTY', 'DELETE_PARTY'];
const SECURITY_ACTIONS = ['LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT', 'AUTO_LOCK', 'BIOMETRIC_AUTH'];
const SYSTEM_ACTIONS = ['UPDATE_SETTINGS', 'CLOUD_SYNC', 'RESTORE_DATA', 'CLEAR_DATA', 'EXPORT_DATA', 'EXPORT_STATEMENT'];
const ERROR_ACTIONS = ['OPERATION_FAILED', 'LOGIN_FAILED', 'LOOKUP_FAILED'];

const METADATA_LABELS: Record<string, string> = {
  recordedAtLocal: 'Giờ thiết bị',
  device: 'Thiết bị / Trình duyệt',
  deviceType: 'Loại thiết bị',
  osName: 'Hệ điều hành',
  browserName: 'Trình duyệt',
  appMode: 'Chế độ chạy',
  viewport: 'Khung hình',
  screenResolution: 'Độ phân giải màn hình',
  timezone: 'Múi giờ',
  language: 'Ngôn ngữ',
  networkInfo: 'Kết nối mạng',
  online: 'Trạng thái mạng',
  touchSupport: 'Cảm ứng / Chuột',
  hardwareSummary: 'Cấu hình phần cứng',
  pageOrigin: 'Đường dẫn truy cập',
  referrer: 'Nguồn chuyển tới',
  clientIp: 'Địa chỉ IP',
  locationHint: 'Vị trí / Khu vực',
  authLatencyMs: 'Thời gian xác thực',
  serverOrigin: 'Máy chủ tiếp nhận',
  serverTime: 'Giờ máy chủ (UTC)',
  lookupTime: 'Thời điểm tra cứu',
  authChannel: 'Kênh xác thực',
  loginMethod: 'Phương thức ĐN',
  transactionId: 'Mã giao dịch',
  partyId: 'Mã cuộc vui',
  debtorId: 'Mã người nợ',
  debtorPin: 'Mã PIN người nợ',
  date: 'Ngày phát sinh',
  type: 'Loại biến động',
  category: 'Phân loại',
  note: 'Ghi chú',
  prevBalance: 'Dư nợ trước',
  newBalance: 'Dư nợ sau',
  afterBalance: 'Dư nợ sau xóa',
  projectedBalance: 'Dư nợ dự kiến',
  currentBalance: 'Dư nợ hiện tại',
  balance: 'Dư nợ hiện tại',
  totalAddAfter: 'Tổng ghi nợ sau GD',
  totalSubAfter: 'Tổng đã trả sau GD',
  deletedBalance: 'Dư nợ đã xóa',
  deletedAddTotal: 'Tổng nợ đã xóa',
  deletedSubTotal: 'Tổng trả đã xóa',
  deletedTxCount: 'Số GD đã xóa',
  recentTxSummary: 'GD gần nhất trước xóa',
  prevTxCount: 'Số GD trước',
  newTxCount: 'Số GD sau',
  remainingTxCount: 'Số GD còn lại',
  hasBillImage: 'Có ảnh hóa đơn',
  hadBillImage: 'Từng có ảnh hóa đơn',
  isSettled: 'Tất toán 0đ',
  settledStatus: 'Trạng thái nợ',
  latestTxDate: 'Giao dịch gần nhất',
  pin: 'Mã PIN',
  source: 'Nguồn tra cứu',
  totalAdd: 'Tổng ghi nợ (+)',
  totalSub: 'Tổng đã trả (-)',
  txCount: 'Tổng số GD',
  splitCount: 'Số bill nhóm',
  totalAmount: 'Tổng tiền bill',
  splitAmountPerPerson: 'Mỗi người',
  totalPeopleCount: 'Tổng số người',
  includeMe: 'Gồm chủ sổ',
  payerType: 'Kiểu người trả',
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
  ownerName: 'Chủ sổ',
  bankName: 'Ngân hàng',
  accountNumber: 'Số tài khoản',
  generatedTxCount: 'GD sinh ra',
  removedTxCount: 'GD đã gỡ',
  fieldsChangedCount: 'Số trường sửa',
  changedFields: 'Các mục đã sửa',
  changedCount: 'Số mục thay đổi',
  bankId: 'Mã ngân hàng',
  mode: 'Chế độ',
  channel: 'Kênh thực hiện',
  maskedInput: 'Mã nhập (ẩn)',
  inputLength: 'Độ dài mã nhập',
  reason: 'Lý do',
  error: 'Chi tiết lỗi',
  amount: 'Số tiền',
  silent: 'Chạy nền im lặng',
};

const ENVIRONMENT_KEYS = new Set([
  'recordedAtLocal',
  'clientIp',
  'locationHint',
  'device',
  'deviceType',
  'osName',
  'browserName',
  'appMode',
  'viewport',
  'screenResolution',
  'timezone',
  'language',
  'networkInfo',
  'online',
  'touchSupport',
  'hardwareSummary',
  'pageOrigin',
  'referrer',
  'serverOrigin',
  'serverTime',
  'lookupTime',
  'authLatencyMs',
  'authChannel',
  'loginMethod',
  'source',
  'databaseId',
  'totalLatencyMs',
  'clientPingMs',
  'direction',
  'autoLockTimeout',
  'elapsedMs',
  'verificationHash',
  'method',
  'filename',
]);

const MONEY_KEYS = new Set([
  'prevBalance',
  'newBalance',
  'afterBalance',
  'projectedBalance',
  'currentBalance',
  'balance',
  'totalAdd',
  'totalSub',
  'totalAddAfter',
  'totalSubAfter',
  'totalAmount',
  'splitAmountPerPerson',
  'deletedBalance',
  'deletedAddTotal',
  'deletedSubTotal',
  'amount',
]);

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
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [expandAllDetails, setExpandAllDetails] = useState(false);
  const [visibleCount, setVisibleCount] = useState<number>(50);

  const toggleDetails = (id: string) => {
    triggerHaptic('selection');
    setExpandedIds((prev) => {
      const current = expandAllDetails ? prev[id] !== false : Boolean(prev[id]);
      return { ...prev, [id]: !current };
    });
  };

  const handleToggleExpandAll = () => {
    triggerHaptic('selection');
    const next = !expandAllDetails;
    setExpandAllDetails(next);
    setExpandedIds({});
  };

  useEffect(() => {
    setVisibleCount(50);
  }, [filterActionGroup, dateFilter, searchQuery]);

  // Exclude Google Sheets Apps Script sync logs (auto or manual) from display & metrics
  const visibleAuditLogs = useMemo(() => {
    return auditLogs.filter((l) => !isAutoSyncAuditLog(l));
  }, [auditLogs]);

  // Pre-compute summary KPI stats across all visible logs
  const kpiStats = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    let todayCount = 0;
    let txEventsCount = 0;
    let txVolume = 0;
    let securityLookupCount = 0;
    let errorCount = 0;

    for (const log of visibleAuditLogs) {
      const ts = new Date(log.timestamp).getTime();
      if (!Number.isNaN(ts) && ts >= startOfToday) {
        todayCount++;
      }
      if (TRANSACTION_ACTIONS.includes(log.action)) {
        txEventsCount++;
        if (typeof log.amount === 'number' && log.amount > 0) {
          txVolume += log.amount;
        }
      }
      if (SECURITY_ACTIONS.includes(log.action) || LOOKUP_ACTIONS.includes(log.action)) {
        securityLookupCount++;
      }
      if (ERROR_ACTIONS.includes(log.action)) {
        errorCount++;
      }
    }

    return {
      total: visibleAuditLogs.length,
      todayCount,
      txEventsCount,
      txVolume,
      securityLookupCount,
      errorCount,
    };
  }, [visibleAuditLogs]);

  // Filter logic
  const filteredLogs = useMemo(() => {
    let result = [...visibleAuditLogs];

    if (filterActionGroup === 'TRANSACTION') {
      result = result.filter((l) => TRANSACTION_ACTIONS.includes(l.action));
    } else if (filterActionGroup === 'LOOKUP') {
      result = result.filter((l) => LOOKUP_ACTIONS.includes(l.action));
    } else if (filterActionGroup === 'DEBTOR') {
      result = result.filter((l) => DEBTOR_ACTIONS.includes(l.action));
    } else if (filterActionGroup === 'PARTY') {
      result = result.filter((l) => PARTY_ACTIONS.includes(l.action));
    } else if (filterActionGroup === 'SECURITY') {
      result = result.filter((l) => SECURITY_ACTIONS.includes(l.action));
    } else if (filterActionGroup === 'SYSTEM') {
      result = result.filter((l) => SYSTEM_ACTIONS.includes(l.action));
    } else if (filterActionGroup === 'ERRORS') {
      result = result.filter((l) => ERROR_ACTIONS.includes(l.action));
    }

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

    const getTimeMs = (ts?: string) => {
      if (!ts) return -Infinity;
      const ms = Date.parse(ts);
      return Number.isNaN(ms) ? -Infinity : ms;
    };

    return result.sort((a, b) => {
      const msA = getTimeMs(a.timestamp);
      const msB = getTimeMs(b.timestamp);
      if (msB !== msA) return msB - msA;
      return (b.timestamp || '').localeCompare(a.timestamp || '');
    });
  }, [visibleAuditLogs, filterActionGroup, dateFilter, searchQuery]);

  const displayedLogs = useMemo(() => {
    return filteredLogs.slice(0, visibleCount);
  }, [filteredLogs, visibleCount]);

  // Group displayed logs by calendar date for clear timeline scanning (Map ensures unique dateKey)
  const groupedLogsByDay = useMemo(() => {
    const groupMap = new Map<string, { dateKey: string; dateLabel: string; items: AuditLog[] }>();
    const now = new Date();
    const todayStr = now.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const yesterday = new Date(now.getTime() - 86400000);
    const yesterdayStr = yesterday.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });

    for (const log of displayedLogs) {
      let dateStr = 'Khác';
      try {
        const d = new Date(log.timestamp);
        if (!Number.isNaN(d.getTime())) {
          dateStr = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
        }
      } catch {
        dateStr = 'Khác';
      }

      let dateLabel = dateStr;
      if (dateStr === todayStr) dateLabel = `Hôm nay (${dateStr})`;
      else if (dateStr === yesterdayStr) dateLabel = `Hôm qua (${dateStr})`;

      const existing = groupMap.get(dateStr);
      if (existing) {
        existing.items.push(log);
      } else {
        groupMap.set(dateStr, { dateKey: dateStr, dateLabel, items: [log] });
      }
    }
    return Array.from(groupMap.values());
  }, [displayedLogs]);

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
          auditLogs: visibleAuditLogs,
        },
        settings.googleAppsScriptUrl,
        { skipAuditLog: true }
      );

      const updatedSettings: AppSettings = {
        ...settings,
        googleSheetId: result.spreadsheetId,
        googleSheetUrl: result.spreadsheetUrl,
        lastGoogleSheetSyncAt: result.updatedAt,
      };
      await onSaveSettings(updatedSettings);

      showToast(
        'Đã đồng bộ toàn bộ 5 Tab (Công Nợ, Giao Dịch, Chia Bill, Nhật Ký, Cài Đặt) sang Google Sheets!',
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
        auditLogs: visibleAuditLogs,
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

  const handleClearLogs = async () => {
    triggerHaptic('medium');
    const clearedCount = visibleAuditLogs.length;
    const clearedAtIso = new Date().toISOString();
    const env = getAuditEnvironmentContext();

    // 1. Clear local logs & cancel any pending delayed pushes immediately
    clearAuditLogs(clearedAtIso);
    setShowClearConfirm(false);
    showToast('Đã làm sạch toàn bộ nhật ký trên ứng dụng (Lịch sử Google Sheets vẫn được bảo toàn)', 'success');

    // 2. Sync clear watermark to server & Google Sheets Tab 5 so old logs do not return on refresh/other devices
    try {
      await apiClearRemoteAuditLogs(clearedAtIso, {
        action: 'CLEAR_DATA',
        actor: `Chủ Sổ (${settings.ownerName || 'Admin'})`,
        title: 'Làm sạch nhật ký trên ứng dụng',
        description: `Chủ sổ đã làm sạch ${clearedCount} nhật ký hiển thị trên ứng dụng từ ${env.device}. Toàn bộ lịch sử trên Google Sheets vẫn được lưu giữ vĩnh viễn.`,
        beforeState: `${clearedCount} bản ghi trên ứng dụng`,
        afterState: '0 bản ghi trên ứng dụng (Google Sheets bảo toàn)',
        changes: [
          { fieldLabel: 'Nhật ký ứng dụng', before: `${clearedCount} bản ghi`, after: 'Đã làm sạch' },
          { fieldLabel: 'Google Sheets Tab 4', before: 'Bảo toàn', after: 'Chỉ ghi thêm (Append-Only)' },
        ],
        metadata: {
          ...env,
          clearedCount,
        },
      });
    } catch {
      // Local watermark still prevents old logs from reappearing on this device
    }
  };

  const formatLogExactTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      if (Number.isNaN(d.getTime())) return isoString;
      return d.toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  const getActionMeta = (action: string) => {
    switch (action) {
      case 'ADD_TRANSACTION':
        return {
          icon: <PlusCircle className="w-4 h-4 text-emerald-700" />,
          iconBg: 'bg-emerald-50 border-emerald-200/80 text-emerald-700',
          accentText: 'text-emerald-700',
          label: 'Ghi nợ (+)',
        };
      case 'UPDATE_TRANSACTION':
        return {
          icon: <Edit3 className="w-4 h-4 text-blue-700" />,
          iconBg: 'bg-blue-50 border-blue-200/80 text-blue-700',
          accentText: 'text-blue-700',
          label: 'Cập nhật / Thu (-)',
        };
      case 'DELETE_TRANSACTION':
        return {
          icon: <Trash2 className="w-4 h-4 text-rose-700" />,
          iconBg: 'bg-rose-50 border-rose-200/80 text-rose-700',
          accentText: 'text-rose-700',
          label: 'Xóa giao dịch',
        };
      case 'SETTLE_DEBT':
        return {
          icon: <CheckCircle2 className="w-4 h-4 text-emerald-700" />,
          iconBg: 'bg-emerald-50 border-emerald-200/80 text-emerald-700',
          accentText: 'text-emerald-700',
          label: 'Tất toán 0đ',
        };
      case 'ADD_DEBTOR':
        return {
          icon: <UserPlus className="w-4 h-4 text-emerald-700" />,
          iconBg: 'bg-emerald-50 border-emerald-200/80 text-emerald-700',
          accentText: 'text-emerald-700',
          label: 'Thêm người nợ',
        };
      case 'UPDATE_DEBTOR':
        return {
          icon: <KeyRound className="w-4 h-4 text-amber-700" />,
          iconBg: 'bg-amber-50 border-amber-200/80 text-amber-700',
          accentText: 'text-amber-700',
          label: 'Sửa người nợ',
        };
      case 'DELETE_DEBTOR':
        return {
          icon: <UserX className="w-4 h-4 text-rose-700" />,
          iconBg: 'bg-rose-50 border-rose-200/80 text-rose-700',
          accentText: 'text-rose-700',
          label: 'Xóa người nợ',
        };
      case 'ADD_PARTY':
        return {
          icon: <Users className="w-4 h-4 text-amber-700" />,
          iconBg: 'bg-amber-50 border-amber-200/80 text-amber-700',
          accentText: 'text-amber-700',
          label: 'Chia bill nhóm',
        };
      case 'UPDATE_PARTY':
        return {
          icon: <Edit3 className="w-4 h-4 text-amber-700" />,
          iconBg: 'bg-amber-50 border-amber-200/80 text-amber-700',
          accentText: 'text-amber-700',
          label: 'Sửa chia bill',
        };
      case 'DELETE_PARTY':
        return {
          icon: <Trash2 className="w-4 h-4 text-rose-700" />,
          iconBg: 'bg-rose-50 border-rose-200/80 text-rose-700',
          accentText: 'text-rose-700',
          label: 'Xóa chia bill',
        };
      case 'UPDATE_SETTINGS':
        return {
          icon: <Settings className="w-4 h-4 text-slate-700" />,
          iconBg: 'bg-slate-100 border-slate-200 text-slate-700',
          accentText: 'text-slate-700',
          label: 'Cài đặt hệ thống',
        };
      case 'SYNC_SHEETS':
        return {
          icon: <FileSpreadsheet className="w-4 h-4 text-emerald-700" />,
          iconBg: 'bg-emerald-50 border-emerald-200/80 text-emerald-700',
          accentText: 'text-emerald-700',
          label: 'Đồng bộ Sheets',
        };
      case 'CLOUD_SYNC':
        return {
          icon: <Cloud className="w-4 h-4 text-blue-700" />,
          iconBg: 'bg-blue-50 border-blue-200/80 text-blue-700',
          accentText: 'text-blue-700',
          label: 'Đồng bộ Cloud',
        };
      case 'GUEST_LOOKUP':
        return {
          icon: <Eye className="w-4 h-4 text-blue-700" />,
          iconBg: 'bg-blue-50 border-blue-200/80 text-blue-700',
          accentText: 'text-blue-700',
          label: 'Khách tra cứu',
        };
      case 'LOOKUP_FAILED':
        return {
          icon: <AlertCircle className="w-4 h-4 text-amber-700" />,
          iconBg: 'bg-amber-50 border-amber-200/80 text-amber-700',
          accentText: 'text-amber-700',
          label: 'Tra cứu sai PIN',
        };
      case 'GUEST_REPORT':
        return {
          icon: <CheckCircle2 className="w-4 h-4 text-amber-700" />,
          iconBg: 'bg-amber-50 border-amber-200/80 text-amber-700',
          accentText: 'text-amber-700',
          label: 'Khách báo CK',
        };
      case 'LOGIN_SUCCESS':
        return {
          icon: <ShieldCheck className="w-4 h-4 text-emerald-700" />,
          iconBg: 'bg-emerald-50 border-emerald-200/80 text-emerald-700',
          accentText: 'text-emerald-700',
          label: 'Đăng nhập',
        };
      case 'BIOMETRIC_AUTH':
        return {
          icon: <ScanFace className="w-4 h-4 text-emerald-700" />,
          iconBg: 'bg-emerald-50 border-emerald-200/80 text-emerald-700',
          accentText: 'text-emerald-700',
          label: 'Sinh trắc học',
        };
      case 'LOGIN_FAILED':
        return {
          icon: <AlertCircle className="w-4 h-4 text-rose-700" />,
          iconBg: 'bg-rose-50 border-rose-200/80 text-rose-700',
          accentText: 'text-rose-700',
          label: 'Đăng nhập lỗi',
        };
      case 'LOGOUT':
        return {
          icon: <LogOut className="w-4 h-4 text-slate-700" />,
          iconBg: 'bg-slate-100 border-slate-200 text-slate-700',
          accentText: 'text-slate-600',
          label: 'Đăng xuất',
        };
      case 'AUTO_LOCK':
        return {
          icon: <Lock className="w-4 h-4 text-amber-700" />,
          iconBg: 'bg-amber-50 border-amber-200/80 text-amber-700',
          accentText: 'text-amber-700',
          label: 'Tự động khóa',
        };
      case 'EXPORT_DATA':
      case 'EXPORT_STATEMENT':
        return {
          icon: <Download className="w-4 h-4 text-blue-700" />,
          iconBg: 'bg-blue-50 border-blue-200/80 text-blue-700',
          accentText: 'text-blue-700',
          label: action === 'EXPORT_DATA' ? 'Xuất dữ liệu' : 'Xuất bảng kê',
        };
      case 'SHARE_REMINDER':
        return {
          icon: <Share2 className="w-4 h-4 text-emerald-700" />,
          iconBg: 'bg-emerald-50 border-emerald-200/80 text-emerald-700',
          accentText: 'text-emerald-700',
          label: 'Gửi nhắc nợ',
        };
      case 'VIEW_RECEIPT':
        return {
          icon: <ImageIcon className="w-4 h-4 text-slate-700" />,
          iconBg: 'bg-slate-100 border-slate-200 text-slate-700',
          accentText: 'text-slate-600',
          label: 'Xem chứng từ',
        };
      case 'RESTORE_DATA':
        return {
          icon: <History className="w-4 h-4 text-blue-700" />,
          iconBg: 'bg-blue-50 border-blue-200/80 text-blue-700',
          accentText: 'text-blue-700',
          label: 'Khôi phục',
        };
      case 'CLEAR_DATA':
        return {
          icon: <Trash2 className="w-4 h-4 text-rose-700" />,
          iconBg: 'bg-rose-50 border-rose-200/80 text-rose-700',
          accentText: 'text-rose-700',
          label: 'Dọn dữ liệu',
        };
      case 'OPERATION_FAILED':
        return {
          icon: <AlertCircle className="w-4 h-4 text-rose-700" />,
          iconBg: 'bg-rose-50 border-rose-200/80 text-rose-700',
          accentText: 'text-rose-700',
          label: 'Lỗi thao tác',
        };
      default:
        return {
          icon: <ClipboardList className="w-4 h-4 text-slate-700" />,
          iconBg: 'bg-slate-100 border-slate-200 text-slate-700',
          accentText: 'text-slate-600',
          label: 'Thao tác',
        };
    }
  };

  const formatMetaValue = (key: string, val: any): string => {
    if (val === undefined || val === null || val === '') return '';
    if (typeof val === 'boolean') return val ? 'Có' : 'Không';
    if (Array.isArray(val)) return val.join(', ');
    if (typeof val === 'number' && MONEY_KEYS.has(key)) {
      return `${formatVND(val)} VNĐ`;
    }
    if (key === 'type') {
      if (val === 'ADD') return 'Ghi nợ thêm (+)';
      if (val === 'SUB') return 'Thanh toán / Trừ (-)';
    }
    if (key === 'category') {
      if (val === 'SINGLE' || val === 'DIRECT') return 'Giao dịch trực tiếp';
      if (val === 'PARTY_SPLIT') return 'Chia bill nhóm';
      if (val === 'PAYMENT_SETTLED') return 'Tất toán';
      if (val === 'SELF_REPORTED') return 'Khách tự báo CK';
    }
    if (key === 'totalLatencyMs' || key === 'clientPingMs' || key === 'authLatencyMs') return `${val} ms`;
    if (key === 'serverTime' || key === 'lookupTime') {
      try {
        const d = new Date(String(val));
        if (!Number.isNaN(d.getTime())) return d.toLocaleString('vi-VN');
      } catch {
        // ignore
      }
    }
    return String(val);
  };

  const extractBalanceDelta = (log: AuditLog): { before: number; after: number; diff: number } | null => {
    const m = log.metadata;
    if (!m || typeof m !== 'object') return null;
    const before = typeof m.prevBalance === 'number' ? m.prevBalance : null;
    const after =
      typeof m.newBalance === 'number'
        ? m.newBalance
        : typeof m.afterBalance === 'number'
        ? m.afterBalance
        : typeof m.projectedBalance === 'number'
        ? m.projectedBalance
        : null;
    if (before === null || after === null) return null;
    return { before, after, diff: after - before };
  };

  const spreadsheetUrl = settings.googleSheetUrl;
  const lastSyncDateStr = settings.lastGoogleSheetSyncAt
    ? new Date(settings.lastGoogleSheetSyncAt).toLocaleString('vi-VN')
    : null;

  const filterChips = useMemo(
    () =>
      [
        { id: 'ALL', label: 'Tất cả', count: visibleAuditLogs.length },
        {
          id: 'TRANSACTION',
          label: 'Giao dịch',
          count: visibleAuditLogs.filter((l) => TRANSACTION_ACTIONS.includes(l.action)).length,
        },
        {
          id: 'LOOKUP',
          label: 'Tra cứu & Nhắc nợ',
          count: visibleAuditLogs.filter((l) => LOOKUP_ACTIONS.includes(l.action)).length,
        },
        {
          id: 'DEBTOR',
          label: 'Người nợ',
          count: visibleAuditLogs.filter((l) => DEBTOR_ACTIONS.includes(l.action)).length,
        },
        {
          id: 'PARTY',
          label: 'Chia bill',
          count: visibleAuditLogs.filter((l) => PARTY_ACTIONS.includes(l.action)).length,
        },
        {
          id: 'SECURITY',
          label: 'Bảo mật',
          count: visibleAuditLogs.filter((l) => SECURITY_ACTIONS.includes(l.action)).length,
        },
        {
          id: 'SYSTEM',
          label: 'Hệ thống',
          count: visibleAuditLogs.filter((l) => SYSTEM_ACTIONS.includes(l.action)).length,
        },
        {
          id: 'ERRORS',
          label: 'Lỗi',
          count: visibleAuditLogs.filter((l) => ERROR_ACTIONS.includes(l.action)).length,
        },
      ] as const,
    [visibleAuditLogs]
  );

  return (
    <div className="w-full max-w-5xl mx-auto space-y-4 pb-6 animate-in fade-in duration-150">
      {/* 1. HEADER & ACTION BAR */}
      <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {onGoBack && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('selection');
                onGoBack();
              }}
              className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 transition-colors flex items-center justify-center shrink-0 cursor-pointer"
              title="Quay lại Tổng quan"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight truncate">
              Nhật Ký Kiểm Vết Hệ Thống
            </h1>
            <p className="text-xs text-slate-500 mt-0.5 truncate font-mono tabular-nums">
              {visibleAuditLogs.length} bản ghi đang lưu{lastSyncDateStr ? ` · Đồng bộ: ${lastSyncDateStr}` : ''}
            </p>
          </div>
        </div>

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
              className="h-9 px-3 rounded-xl bg-slate-100 hover:bg-slate-200/80 text-slate-700 text-xs font-semibold border border-slate-200/80 active:scale-95 transition-all cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-60 whitespace-nowrap"
              title="Kéo nhật ký mới từ máy chủ & Google Sheets Tab 4"
            >
              {remoteSyncStatus?.isSyncing ? (
                <LedgerWaveBars size="xs" tone="slate" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5 text-slate-600" />
              )}
              <span>{remoteSyncStatus?.isSyncing ? 'Đang đồng bộ' : 'Làm mới'}</span>
            </button>
          )}

          {settings.googleAppsScriptUrl && (
            <button
              type="button"
              disabled={isSyncingSheets}
              onClick={handleMasterSyncToGoogleSheets}
              className="h-9 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs active:scale-95 transition-all cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-60 whitespace-nowrap"
              title="Đồng bộ dữ liệu & nhật ký sang Google Sheets"
            >
              {isSyncingSheets ? (
                <LedgerWaveBars size="xs" tone="light" />
              ) : (
                <FileSpreadsheet className="w-3.5 h-3.5" />
              )}
              <span>{isSyncingSheets ? 'Đang gửi...' : 'Đồng bộ Sheets'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleExportCsv}
            className="h-9 px-3 rounded-xl bg-slate-100 hover:bg-slate-200/80 text-slate-700 text-xs font-semibold border border-slate-200/80 active:scale-95 transition-all cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap"
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
              className="h-9 px-3 rounded-xl bg-slate-100 hover:bg-slate-200/80 text-slate-700 text-xs font-semibold border border-slate-200/80 active:scale-95 transition-all cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap"
              title="Mở Google Sheets liên kết"
            >
              <ExternalLink className="w-3.5 h-3.5 text-emerald-600" />
              <span className="hidden sm:inline">Mở Sheets</span>
            </a>
          )}

          {visibleAuditLogs.length > 0 && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('medium');
                setShowClearConfirm(true);
              }}
              className="h-9 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold border border-rose-200/90 active:scale-95 transition-all cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap"
              title="Làm sạch nhật ký trên thiết bị (Google Sheets được bảo toàn)"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
              <span className="hidden sm:inline">Làm sạch</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. KPI SUMMARY STRIP */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-slate-200/80 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Tổng sự kiện</span>
            <ClipboardList className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-xl sm:text-2xl font-extrabold font-mono tabular-nums text-slate-900">
            {kpiStats.total}
          </div>
          <div className="text-[11px] text-emerald-700 font-medium font-mono tabular-nums">
            Hôm nay: +{kpiStats.todayCount} bản ghi
          </div>
        </div>

        <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-slate-200/80 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Biến động tài chính</span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-xl sm:text-2xl font-extrabold font-mono tabular-nums text-emerald-700">
            {kpiStats.txEventsCount}
          </div>
          <div className="text-[11px] text-slate-500 font-mono tabular-nums truncate">
            Tổng lưu lượng: {formatVND(kpiStats.txVolume)} VNĐ
          </div>
        </div>

        <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-slate-200/80 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Tra cứu &amp; Bảo mật</span>
            <ShieldCheck className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-xl sm:text-2xl font-extrabold font-mono tabular-nums text-slate-900">
            {kpiStats.securityLookupCount}
          </div>
          <div className="text-[11px] text-slate-500 truncate">
            Đăng nhập, khóa phiên, xem sao kê
          </div>
        </div>

        <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-slate-200/80 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Cảnh báo &amp; Lỗi</span>
            <ShieldAlert className={`w-4 h-4 ${kpiStats.errorCount > 0 ? 'text-rose-600' : 'text-emerald-600'}`} />
          </div>
          <div
            className={`text-xl sm:text-2xl font-extrabold font-mono tabular-nums ${
              kpiStats.errorCount > 0 ? 'text-rose-600' : 'text-emerald-700'
            }`}
          >
            {kpiStats.errorCount}
          </div>
          <div className={`text-[11px] font-medium ${kpiStats.errorCount > 0 ? 'text-rose-600' : 'text-slate-500'}`}>
            {kpiStats.errorCount > 0 ? 'Cần kiểm tra chi tiết bên dưới' : 'Hệ thống vận hành ổn định'}
          </div>
        </div>
      </div>

      {/* Upgrade / Hidden Cleared Notices */}
      {remoteSyncStatus?.needsAppsScriptUpgrade && (
        <div className="bg-amber-50/90 border border-amber-200 rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 text-xs text-amber-900">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Cần cập nhật mã Google Apps Script v3 để đồng bộ nhật ký 2 chiều</p>
              <p className="text-amber-800/90 mt-0.5 leading-relaxed">
                Hãy dán lại mã mới v3 trong phần <strong>Cài Đặt &rarr; Đồng Bộ Google Sheets</strong> rồi triển khai phiên bản mới.
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
            className="px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs shrink-0 cursor-pointer inline-flex items-center gap-1.5 self-start sm:self-center whitespace-nowrap"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Sao chép mã v3</span>
          </button>
        </div>
      )}

      {remoteSyncStatus?.hiddenByClearCount && remoteSyncStatus.hiddenByClearCount > 0 && onRestoreClearedLogs && (
        <div className="bg-white border border-slate-200/80 rounded-2xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
          <span>
            Đang ẩn <strong className="font-mono">{remoteSyncStatus.hiddenByClearCount}</strong> nhật ký cũ hơn mốc đã làm sạch (vẫn lưu bảo toàn trên Google Sheets).
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
            Khôi phục từ Google Sheets &rarr;
          </button>
        </div>
      )}

      {/* 3. SEARCH & SEGMENTED FILTERS */}
      <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/80 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm theo tên người nợ, người thao tác, số tiền, mã GD, thiết bị..."
              className="w-full h-10 pl-9 pr-8 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                aria-label="Xóa từ khóa tìm kiếm"
              >
                ✕
              </button>
            )}
          </div>

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
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
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

        {/* Category Filter Tabs (Clean typography, unboxed inline tabular count) */}
        <div className="flex items-center gap-1 p-1 bg-slate-100/90 rounded-xl border border-slate-200/80 overflow-x-auto no-scrollbar">
          {filterChips.map((chip) => {
            const isActive = filterActionGroup === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => {
                  triggerHaptic('selection');
                  setFilterActionGroup(chip.id);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-white text-slate-900 shadow-2xs border border-slate-200/60'
                    : chip.id === 'ERRORS' && chip.count > 0
                    ? 'text-rose-700 hover:bg-rose-50/80'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                }`}
              >
                <span>{chip.label}</span>
                <span
                  className={`font-mono tabular-nums text-[11px] ${
                    isActive
                      ? chip.id === 'ERRORS'
                        ? 'text-rose-600'
                        : 'text-emerald-700'
                      : 'text-slate-400'
                  }`}
                >
                  ({chip.count})
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. TIMELINE LOG LIST */}
      <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
            <ClipboardList className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              Hiển thị <span className="font-mono tabular-nums text-slate-900 font-bold">{displayedLogs.length}</span> /{' '}
              <span className="font-mono tabular-nums text-slate-900 font-bold">{filteredLogs.length}</span> bản ghi
            </span>
          </div>

          {filteredLogs.length > 0 && (
            <button
              type="button"
              onClick={handleToggleExpandAll}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200/80 text-xs font-semibold text-slate-700 transition-colors cursor-pointer whitespace-nowrap"
            >
              <ChevronsUpDown className="w-3.5 h-3.5 text-slate-500" />
              <span>{expandAllDetails ? 'Thu gọn chi tiết' : 'Mở rộng tất cả chi tiết'}</span>
            </button>
          )}
        </div>

        {filteredLogs.length === 0 ? (
          <div className="py-12 px-4 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
              <ClipboardList className="w-6 h-6 stroke-[1.6]" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-slate-800">Không tìm thấy bản ghi phù hợp</h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Chưa có hoạt động nào khớp với điều kiện tìm kiếm hoặc bộ lọc thời gian hiện tại.
              </p>
            </div>
            {(filterActionGroup !== 'ALL' || dateFilter !== 'ALL' || searchQuery.trim() !== '') && (
              <button
                type="button"
                onClick={() => {
                  setFilterActionGroup('ALL');
                  setDateFilter('ALL');
                  setSearchQuery('');
                }}
                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer transition-colors"
              >
                Đặt lại bộ lọc
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {groupedLogsByDay.map((group) => (
              <section key={group.dateKey} className="space-y-2.5">
                {/* Day Section Divider */}
                <div className="flex items-center justify-between text-xs font-bold text-slate-600 pb-1.5 border-b border-slate-100">
                  <span>{group.dateLabel}</span>
                  <span className="font-mono tabular-nums text-[11px] font-medium text-slate-400">
                    {group.items.length} sự kiện
                  </span>
                </div>

                {/* Entries for this day */}
                <div className="divide-y divide-slate-100 border border-slate-200/80 rounded-2xl overflow-hidden bg-white">
                  {group.items.map((log, logIdx) => {
                    const meta = getActionMeta(log.action);
                    const isExpanded =
                      expandAllDetails
                        ? expandedIds[log.id] !== false
                        : Boolean(expandedIds[log.id]);

                    const balanceDelta = extractBalanceDelta(log);
                    const metaEntries = log.metadata
                      ? Object.entries(log.metadata).filter(([, v]) => v !== undefined && v !== null && v !== '')
                      : [];
                    const businessMeta = metaEntries.filter(([k]) => !ENVIRONMENT_KEYS.has(k));
                    const envMeta = metaEntries.filter(([k]) => ENVIRONMENT_KEYS.has(k));
                    const hasExpandableDetail =
                      metaEntries.length > 0 ||
                      Boolean(log.beforeState) ||
                      Boolean(log.afterState);

                    return (
                      <article
                        key={log.id ? `${log.id}-${logIdx}` : `${group.dateKey}-${logIdx}`}
                        className="p-3.5 sm:p-4 hover:bg-slate-50/70 transition-colors space-y-2.5"
                      >
                        {/* Layer 1: Primary Header & Financial Impact */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 min-w-0 flex-1">
                            <div
                              className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 mt-0.5 ${meta.iconBg}`}
                            >
                              {meta.icon}
                            </div>

                            <div className="min-w-0 flex-1">
                              <h3 className="font-bold text-slate-900 text-xs sm:text-sm leading-snug break-words">
                                {log.title}
                              </h3>

                              {/* Unboxed Typographic Metadata Strip */}
                              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-1 text-[11px] text-slate-500">
                                <span className={`font-semibold ${meta.accentText}`}>{meta.label}</span>
                                <span aria-hidden="true">·</span>
                                <span className="font-medium text-slate-700">{log.actor}</span>
                                {log.debtorName && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span className="font-semibold text-slate-800">{log.debtorName}</span>
                                  </>
                                )}
                                <span aria-hidden="true">·</span>
                                <span className="inline-flex items-center gap-1 font-mono tabular-nums text-slate-500">
                                  <Clock className="w-3 h-3 text-slate-400" />
                                  {formatLogExactTime(log.timestamp)}
                                </span>
                                {log.metadata?.device && (
                                  <>
                                    <span aria-hidden="true" className="hidden sm:inline">·</span>
                                    <span className="hidden sm:inline-flex items-center gap-1 text-slate-400">
                                      <Smartphone className="w-3 h-3" />
                                      {log.metadata.device}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Right: Financial Amount & Expand Button */}
                          <div className="flex items-start gap-2 shrink-0">
                            {log.amount !== undefined && log.amount > 0 && (
                              <div className="text-right">
                                <div className={`font-extrabold font-mono text-xs sm:text-sm tabular-nums tracking-tight ${meta.accentText}`}>
                                  {log.action === 'ADD_TRANSACTION' ? '+' : ''}
                                  {formatVND(log.amount)} VNĐ
                                </div>
                                {balanceDelta && (
                                  <div className="text-[10px] font-mono tabular-nums text-slate-400">
                                    Dư sau: {formatVND(balanceDelta.after)}đ
                                  </div>
                                )}
                              </div>
                            )}

                            {hasExpandableDetail && (
                              <button
                                type="button"
                                onClick={() => toggleDetails(log.id)}
                                className="w-8 h-8 rounded-lg hover:bg-slate-200/60 text-slate-500 flex items-center justify-center cursor-pointer transition-colors"
                                aria-expanded={isExpanded}
                                aria-label={isExpanded ? 'Thu gọn chi tiết' : 'Mở rộng chi tiết'}
                              >
                                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Layer 2: Narrative Description, At-a-Glance Access Context & Structured Table */}
                        <div className="sm:pl-12 space-y-2.5">
                          <p className="text-xs sm:text-[13px] text-slate-700 leading-relaxed break-words">
                            {log.description}
                          </p>

                          {/* At-a-Glance Quick Context Grid (IP, Device, Network, PIN, Timezone) */}
                          {(log.metadata?.clientIp ||
                            log.metadata?.device ||
                            log.metadata?.networkInfo ||
                            log.metadata?.pin ||
                            log.metadata?.debtorPin) && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1.5 px-3 py-2 rounded-xl bg-slate-50/90 border border-slate-200/70 text-[11px]">
                              {log.metadata?.clientIp && (
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <Globe className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                                  <span className="text-slate-500 shrink-0">IP:</span>
                                  <span className="font-mono font-semibold text-slate-800 truncate">
                                    {log.metadata.clientIp}
                                    {log.metadata.locationHint ? ` (${log.metadata.locationHint})` : ''}
                                  </span>
                                </div>
                              )}
                              {log.metadata?.device && (
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <Smartphone className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                  <span className="text-slate-500 shrink-0">Thiết bị:</span>
                                  <span className="font-medium text-slate-800 truncate">
                                    {log.metadata.device}
                                    {log.metadata.appMode === 'PWA (Đã cài đặt)' ? ' · PWA' : ''}
                                  </span>
                                </div>
                              )}
                              {log.metadata?.networkInfo && (
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <Wifi className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                                  <span className="text-slate-500 shrink-0">Mạng:</span>
                                  <span className="font-mono text-slate-700 truncate">
                                    {log.metadata.networkInfo}
                                    {typeof log.metadata.authLatencyMs === 'number'
                                      ? ` · ${log.metadata.authLatencyMs}ms`
                                      : ''}
                                  </span>
                                </div>
                              )}
                              {(log.metadata?.pin || log.metadata?.debtorPin) && (
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <KeyRound className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                  <span className="text-slate-500 shrink-0">PIN:</span>
                                  <span className="font-mono font-semibold text-slate-800 truncate">
                                    {log.metadata.pin || log.metadata.debtorPin}
                                  </span>
                                </div>
                              )}
                              {log.metadata?.timezone && (
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                  <span className="text-slate-500 shrink-0">Múi giờ:</span>
                                  <span className="font-mono text-slate-700 truncate">
                                    {log.metadata.timezone}
                                  </span>
                                </div>
                              )}
                              {log.metadata?.screenResolution && (
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <Monitor className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                  <span className="text-slate-500 shrink-0">Màn hình:</span>
                                  <span className="font-mono text-slate-700 truncate">
                                    {log.metadata.screenResolution}
                                  </span>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Inline Balance Progression Strip */}
                          {balanceDelta && (
                            <div className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200/70 text-xs font-mono tabular-nums">
                              <span className="text-slate-500 font-sans font-semibold">Biến động dư nợ:</span>
                              <span className="text-slate-600">{formatVND(balanceDelta.before)} VNĐ</span>
                              <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span className="font-bold text-slate-900">{formatVND(balanceDelta.after)} VNĐ</span>
                              {balanceDelta.diff !== 0 && (
                                <span
                                  className={`text-[11px] font-bold ${
                                    balanceDelta.diff > 0 ? 'text-rose-600' : 'text-emerald-700'
                                  }`}
                                >
                                  ({balanceDelta.diff > 0 ? '+' : ''}
                                  {formatVND(balanceDelta.diff)} VNĐ)
                                </span>
                              )}
                            </div>
                          )}

                          {/* Structured Field-by-Field Table (Clean Spec Row for new entries, Diff Row for edits) */}
                          {log.changes && log.changes.length > 0 && (
                            <div className="rounded-xl overflow-hidden border border-slate-200/80 bg-white divide-y divide-slate-100 text-xs">
                              {log.changes.map((c, cIdx) => {
                                const rawBefore = c.before !== undefined && c.before !== null ? String(c.before).trim() : '';
                                const isPlaceholderBefore =
                                  !rawBefore ||
                                  rawBefore === '-' ||
                                  rawBefore === '(Trống)' ||
                                  rawBefore === '(Chưa có)' ||
                                  rawBefore === '(Chưa cấp)' ||
                                  rawBefore === 'Chưa nhập' ||
                                  rawBefore === 'Chưa xác thực' ||
                                  rawBefore === 'Chưa có' ||
                                  rawBefore === 'Không có' ||
                                  rawBefore === 'Ẩn' ||
                                  rawBefore === 'Khóa';

                                return (
                                  <div
                                    key={cIdx}
                                    className="px-3 py-2 grid grid-cols-1 sm:grid-cols-12 gap-1 sm:gap-3 items-baseline hover:bg-slate-50/50"
                                  >
                                    <span className="sm:col-span-4 font-semibold text-slate-600">
                                      {c.fieldLabel}
                                    </span>
                                    <div className="sm:col-span-8 flex flex-wrap items-center gap-1.5 font-mono text-[11px] sm:text-xs min-w-0">
                                      {isPlaceholderBefore ? (
                                        <span className="text-slate-900 font-semibold break-words">
                                          {c.after !== undefined && c.after !== null && c.after !== ''
                                            ? String(c.after)
                                            : '(Trống)'}
                                        </span>
                                      ) : (
                                        <>
                                          <span className="text-rose-700/90 line-through decoration-rose-400/70 break-words">
                                            {rawBefore}
                                          </span>
                                          <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                                          <span className="text-emerald-800 font-bold break-words">
                                            {c.after !== undefined && c.after !== null && c.after !== ''
                                              ? String(c.after)
                                              : '(Trống)'}
                                          </span>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* Action Footer: Forensic Toggle & Full Audit ID */}
                          <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 text-[11px] text-slate-400">
                            <div>
                              {hasExpandableDetail && (
                                <button
                                  type="button"
                                  onClick={() => toggleDetails(log.id)}
                                  className="inline-flex items-center gap-1 font-semibold text-slate-500 hover:text-emerald-700 transition-colors cursor-pointer py-1"
                                >
                                  {isExpanded ? (
                                    <>
                                      <ChevronUp className="w-3.5 h-3.5" />
                                      <span>Thu gọn hồ sơ kiểm vết</span>
                                    </>
                                  ) : (
                                    <>
                                      <ChevronDown className="w-3.5 h-3.5" />
                                      <span>
                                        Chi tiết kiểm vết &amp; thiết bị ({metaEntries.length + (log.beforeState || log.afterState ? 1 : 0)} mục)
                                      </span>
                                    </>
                                  )}
                                </button>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={(e) => handleCopyLogId(e, log.id)}
                              className="text-[11px] font-mono tabular-nums text-slate-400 hover:text-slate-700 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md hover:bg-slate-100 transition-colors cursor-pointer"
                              title={`Sao chép mã kiểm vết đầy đủ: ${log.id}`}
                            >
                              {copiedId === log.id ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-600" />
                                  <span className="text-emerald-700 font-bold">Đã chép mã</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  <span>#{log.id.slice(0, 14)}</span>
                                </>
                              )}
                            </button>
                          </div>

                          {/* Layer 3: Expanded Full Forensic Inspector */}
                          {isExpanded && hasExpandableDetail && (
                            <div className="pt-2 border-t border-slate-100 space-y-3 text-xs">
                              {/* Before / After State Snapshots */}
                              {(log.beforeState || log.afterState) && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                  {log.beforeState && (
                                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/70 space-y-1">
                                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                        Trạng thái trước
                                      </div>
                                      <p className="font-mono text-[11px] text-slate-700 break-words leading-relaxed">
                                        {typeof log.beforeState === 'object'
                                          ? JSON.stringify(log.beforeState, null, 2)
                                          : log.beforeState}
                                      </p>
                                    </div>
                                  )}
                                  {log.afterState && (
                                    <div className="p-2.5 rounded-xl bg-emerald-50/40 border border-emerald-200/70 space-y-1">
                                      <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                                        Trạng thái sau
                                      </div>
                                      <p className="font-mono text-[11px] font-semibold text-emerald-900 break-words leading-relaxed">
                                        {typeof log.afterState === 'object'
                                          ? JSON.stringify(log.afterState, null, 2)
                                          : log.afterState}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Business Audit Fields + Environment Telemetry Split */}
                              {(businessMeta.length > 0 || envMeta.length > 0) && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  {businessMeta.length > 0 && (
                                    <div className="p-3 rounded-xl bg-slate-50/70 border border-slate-200/70 space-y-1.5">
                                      <div className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5 pb-1 border-b border-slate-200/70">
                                        <ClipboardList className="w-3.5 h-3.5 text-emerald-600" />
                                        <span>Thông số nghiệp vụ &amp; đối soát</span>
                                      </div>
                                      <div className="divide-y divide-slate-200/50 text-[11px]">
                                        {businessMeta.map(([mKey, mVal]) => (
                                          <div key={mKey} className="py-1 flex items-baseline justify-between gap-2">
                                            <span className="text-slate-500 font-medium shrink-0">
                                              {METADATA_LABELS[mKey] || mKey}:
                                            </span>
                                            <span className="font-mono text-slate-800 font-semibold text-right break-all">
                                              {formatMetaValue(mKey, mVal)}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  <div className="p-3 rounded-xl bg-slate-50/70 border border-slate-200/70 space-y-1.5">
                                    <div className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5 pb-1 border-b border-slate-200/70">
                                      <Monitor className="w-3.5 h-3.5 text-blue-600" />
                                      <span>Môi trường &amp; thiết bị thực hiện</span>
                                    </div>
                                    <div className="divide-y divide-slate-200/50 text-[11px]">
                                      <div className="py-1 flex items-baseline justify-between gap-2">
                                        <span className="text-slate-500 font-medium shrink-0">Thời gian ISO:</span>
                                        <span className="font-mono text-slate-800 text-right break-all">
                                          {new Date(log.timestamp).toLocaleString('vi-VN')}
                                        </span>
                                      </div>
                                      <div className="py-1 flex items-baseline justify-between gap-2">
                                        <span className="text-slate-500 font-medium shrink-0">Mã kiểm vết:</span>
                                        <span className="font-mono text-slate-800 text-right break-all">
                                          {log.id}
                                        </span>
                                      </div>
                                      {envMeta.map(([mKey, mVal]) => (
                                        <div key={mKey} className="py-1 flex items-baseline justify-between gap-2">
                                          <span className="text-slate-500 font-medium shrink-0">
                                            {METADATA_LABELS[mKey] || mKey}:
                                          </span>
                                          <span className="font-mono text-slate-800 font-semibold text-right break-all">
                                            {formatMetaValue(mKey, mVal)}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}

            {filteredLogs.length > visibleCount && (
              <div className="pt-2 flex justify-center">
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setVisibleCount((prev) => prev + 50);
                  }}
                  className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200/80 text-slate-800 border border-slate-200 text-xs font-semibold transition-all cursor-pointer active:scale-95"
                >
                  Xem thêm nhật ký cũ hơn ({filteredLogs.length - visibleCount} bản ghi còn lại)
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 5. FOOTER */}
      <div className="flex items-center gap-2.5 px-4 py-3 bg-white rounded-2xl border border-slate-200/80 text-xs text-slate-500 shadow-2xs">
        <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
        <span>
          Nhật ký lưu đệm cục bộ và ghi nối tiếp bảo toàn sang Google Sheets tại Tab 4 <strong>&quot;Nhật Ký Thao Tác (Logs)&quot;</strong> (Append-Only).
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

      {/* Internal Toast Banner */}
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
