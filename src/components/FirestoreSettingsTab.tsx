import React, { useState, useEffect, useCallback } from 'react';
import {
  Cloud,
  Database,
  CheckCircle2,
  Zap,
  Key,
  X,
  ShieldCheck,
  FileText,
  ArrowRight,
  Trash2,
  Download,
  Archive,
  Upload,
  Link2,
  Copy,
  Check,
  RefreshCw,
} from 'lucide-react';
import { Debtor, Transaction, PartySplit, AppSettings } from '../types';
import {
  apiGetSheetsStatus,
  apiTestSheetsConnection,
  apiConfigureSheets,
  apiGetFirestoreBackups,
  apiCreateFirestoreBackup,
  apiRestoreFirestoreBackup,
  apiCleanOrphanTransactions,
  BackupItem,
  FirestoreStatusInfo,
} from '../utils/api';
import { GoogleSheetsSyncSection } from './GoogleSheetsSyncSection';
import { recordAuditLog } from '../utils/storage';

export interface FirestoreSettingsTabProps {
  debtors: Debtor[];
  transactions: Transaction[];
  settings: AppSettings;
  parties?: PartySplit[];
  onDataReload: () => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onSwitchToSecurityTab?: () => void;
  onSaveSettings?: (newSettings: AppSettings) => void;
  onImportJsonFile?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onOpenClearAllModal?: () => void;
}

export const FirestoreSettingsTab: React.FC<FirestoreSettingsTabProps> = ({
  debtors,
  transactions,
  settings,
  parties = [],
  onDataReload,
  showToast,
  onSaveSettings,
  onImportJsonFile,
  onOpenClearAllModal,
}) => {
  // Live Status State
  const [status, setStatus] = useState<FirestoreStatusInfo | null>(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date>(() => new Date());

  // Modals
  const [isCloudSourceModalOpen, setIsCloudSourceModalOpen] = useState(false);

  // Google Sheets & Vercel Env Setup State (inside CloudSourceModal)
  const [modalScriptUrl, setModalScriptUrl] = useState(settings.googleAppsScriptUrl || '');
  const [modalSheetUrl, setModalSheetUrl] = useState(settings.googleSheetUrl || '');
  const [isTestingTargetSheets, setIsTestingTargetSheets] = useState(false);
  const [testTargetFeedback, setTestTargetFeedback] = useState<{
    success: boolean;
    latencyMs?: number;
    message: string;
  } | null>(null);
  const [isApplyingSheets, setIsApplyingSheets] = useState(false);
  const [copiedVercelEnv, setCopiedVercelEnv] = useState(false);

  // Snapshot Backups State (inside CloudSourceModal)
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [isLoadingBackups, setIsLoadingBackups] = useState(false);
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);
  const [restoringFilename, setRestoringFilename] = useState<string | null>(null);

  // Active sub-tab inside CloudSourceModal
  const [sourceModalTab, setSourceModalTab] = useState<'DATABASE' | 'BOT_API' | 'SNAPSHOTS'>('DATABASE');

  useEffect(() => {
    setModalScriptUrl(settings.googleAppsScriptUrl || '');
  }, [settings.googleAppsScriptUrl]);

  useEffect(() => {
    setModalSheetUrl(settings.googleSheetUrl || '');
  }, [settings.googleSheetUrl]);

  // Fetch backups list
  const fetchBackups = useCallback(async () => {
    setIsLoadingBackups(true);
    try {
      const res = await apiGetFirestoreBackups();
      if (res.success) {
        setBackups(res.backups);
      }
    } catch {
      // ignore
    } finally {
      setIsLoadingBackups(false);
    }
  }, []);

  // Initial fetch and status check
  const checkStatus = useCallback(async () => {
    setIsCheckingStatus(true);
    try {
      const serverStatus = await apiGetSheetsStatus();
      setStatus(serverStatus);
    } catch (err: any) {
      console.warn('Lỗi kiểm tra trạng thái Google Sheets:', err?.message);
    } finally {
      setIsCheckingStatus(false);
    }
  }, []);

  useEffect(() => {
    checkStatus();
    fetchBackups();
  }, [checkStatus, fetchBackups]);

  // Ping Test button handler
  const handlePingTest = async () => {
    setIsCheckingStatus(true);
    const t0 = performance.now();
    try {
      const [serverStatus, testRes] = await Promise.all([
        apiGetSheetsStatus(),
        apiTestSheetsConnection(),
      ]);
      const dt = Math.round(performance.now() - t0);
      setStatus({
        ...serverStatus,
        connected: Boolean(testRes.success),
        latencyMs: testRes.latencyMs || dt,
        version: testRes.version ?? serverStatus.version,
        needsUpgrade: Boolean(testRes.needsUpgrade),
        error: testRes.error || serverStatus.error,
      });
      setLastSyncTime(new Date());
      recordAuditLog({
        action: testRes.success ? 'CLOUD_SYNC' : 'OPERATION_FAILED',
        actor: 'Chủ Sổ (Admin)',
        title: 'Kiểm tra kết nối (Ping) Google Sheets Cloud',
        description: testRes.success
          ? `Kiểm tra kết nối Google Sheets (Apps Script v${testRes.version || 3}): Online, độ trễ ${testRes.latencyMs || dt} ms.`
          : `Kiểm tra kết nối Google Sheets thất bại: ${testRes.error || 'Chưa cấu hình hoặc mất kết nối'}`,
        beforeState: 'Kiểm tra Google Sheets Cloud',
        afterState: testRes.success ? `Online (${testRes.latencyMs || dt} ms)` : 'Offline / Lỗi kết nối',
        changes: [
          { fieldLabel: 'CSDL Cloud', before: '-', after: `Google Sheets (Apps Script v${testRes.version || 3})` },
          { fieldLabel: 'Độ trễ phản hồi', before: '-', after: `${testRes.latencyMs || dt} ms` },
          { fieldLabel: 'Trạng thái', before: '-', after: testRes.success ? 'Hoạt động tốt' : (testRes.error || 'Mất kết nối') },
        ],
        metadata: {
          databaseId: 'google-sheets-cloud',
          totalLatencyMs: testRes.latencyMs || dt,
          connected: testRes.success,
        },
      });
      if (testRes.success) {
        showToast(`⚡ Kết nối Google Sheets thành công! Độ trễ: ${testRes.latencyMs || dt} ms`, 'success');
      } else {
        showToast(testRes.error || 'Không thể kết nối Google Sheets. Kiểm tra lại Apps Script URL.', 'error');
      }
    } catch {
      recordAuditLog({
        action: 'OPERATION_FAILED',
        actor: 'Chủ Sổ (Admin)',
        title: 'Ping Google Sheets Cloud thất bại',
        description: 'Không thể kết nối máy chủ để kiểm tra Google Sheets.',
        beforeState: 'Kiểm tra kết nối Cloud',
        afterState: 'Thất bại',
      });
      showToast('Không thể kết nối máy chủ để kiểm tra Google Sheets.', 'error');
    } finally {
      setIsCheckingStatus(false);
    }
  };

  // Quét & Dọn Dẹp Giao Dịch Mồ Côi Cloud
  const [isCleaningOrphans, setIsCleaningOrphans] = useState(false);
  const handleCleanOrphans = async () => {
    setIsCleaningOrphans(true);
    try {
      const res = await apiCleanOrphanTransactions();
      if (res.success) {
        if (res.removedCount > 0) {
          showToast(`Đã dọn dẹp ${res.removedCount} giao dịch mồ côi thành công!`, 'success');
          onDataReload();
          fetchBackups();
        } else {
          showToast('Dữ liệu Cloud hoàn hảo! Không có giao dịch rác hay mồ côi nào.', 'success');
        }
      } else {
        showToast(res.message || 'Lỗi khi quét dữ liệu', 'error');
      }
    } catch {
      showToast('Lỗi kết nối khi quét dọn dữ liệu', 'error');
    } finally {
      setIsCleaningOrphans(false);
    }
  };

  // Xuất tệp sao lưu JSON chuẩn Cloud (đã tự động bảo mật, không xuất mật khẩu quản trị)
  const handleExportJson = () => {
    const validDebtorIds = new Set(debtors.map((d) => d.id));
    const cleanTransactions = transactions.filter((t) => validDebtorIds.has(t.debtorId));

    // Tuyệt đối không xuất mật khẩu quản lý ra file JSON tải về
    const { ownerPassword, reminderMessageTemplate, shareMessageTemplate, ...safeSettings } = (settings || {}) as any;

    const fullBackup = {
      appName: settings.appTitle || 'OK Sổ Ghi Nợ',
      schemaVersion: 3,
      databaseId: status?.databaseId || 'google-sheets-cloud',
      exportedAt: new Date().toISOString(),
      stats: {
        debtorsCount: debtors.length,
        transactionsCount: cleanTransactions.length,
        partiesCount: (parties || []).length,
      },
      debtors,
      transactions: cleanTransactions,
      parties: parties || [],
      settings: safeSettings,
    };

    const blob = new Blob([JSON.stringify(fullBackup, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const filename = `so-no-cloud-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    recordAuditLog({
      action: 'EXPORT_DATA',
      actor: 'Chủ Sổ (Admin)',
      title: 'Xuất tệp sao lưu JSON từ Google Sheets',
      description: `Đã xuất tệp sao lưu "${filename}" (${debtors.length} người nợ, ${cleanTransactions.length} giao dịch, ${(parties || []).length} cuộc vui; Nguồn: Google Sheets Cloud).`,
      beforeState: `CSDL: ${fullBackup.databaseId}`,
      afterState: `Đã xuất tệp ${filename}`,
      changes: [
        { fieldLabel: 'Tệp xuất ra', before: '-', after: filename },
        { fieldLabel: 'Số lượng bản ghi', before: '-', after: `${debtors.length} người nợ · ${cleanTransactions.length} GD · ${(parties || []).length} cuộc vui` },
      ],
      metadata: {
        filename,
        databaseId: fullBackup.databaseId,
        debtorsCount: debtors.length,
        transactionsCount: cleanTransactions.length,
        partiesCount: (parties || []).length,
      },
    });
    showToast(`Đã xuất tệp sao lưu (${debtors.length} người nợ, ${cleanTransactions.length} giao dịch, mật khẩu quản lý được bảo mật riêng)!`, 'success');
  };

  const handleTestTargetSheets = async () => {
    const trimmed = modalScriptUrl.trim();
    if (!trimmed.startsWith('https://script.google.com/')) {
      setTestTargetFeedback({
        success: false,
        message: 'URL Apps Script phải bắt đầu bằng https://script.google.com/macros/s/...',
      });
      return;
    }

    setIsTestingTargetSheets(true);
    setTestTargetFeedback(null);
    try {
      const res = await apiTestSheetsConnection({ appsScriptUrl: trimmed });
      setTestTargetFeedback({
        success: res.success,
        latencyMs: res.latencyMs,
        message: res.success
          ? `✅ Kết nối Google Sheets (Apps Script v${res.version || 3}) thành công! Độ trễ: ${res.latencyMs} ms`
          : `❌ Không thể kết nối: ${res.error || 'Vui lòng kiểm tra quyền Anyone và mã Apps Script v3'}`,
      });
    } catch (err: any) {
      setTestTargetFeedback({
        success: false,
        message: `Lỗi: ${err?.message || 'Không thể kiểm tra kết nối'}`,
      });
    } finally {
      setIsTestingTargetSheets(false);
    }
  };

  const handleApplyTargetSheets = async () => {
    const trimmed = modalScriptUrl.trim();
    if (!trimmed.startsWith('https://script.google.com/')) {
      showToast('URL Apps Script phải bắt đầu bằng https://script.google.com/macros/s/...', 'error');
      return;
    }

    setIsApplyingSheets(true);
    try {
      const res = await apiConfigureSheets(trimmed, modalSheetUrl.trim() || undefined);
      if (res.success) {
        if (onSaveSettings) {
          onSaveSettings({
            ...settings,
            googleAppsScriptUrl: trimmed,
            ...(modalSheetUrl.trim() ? { googleSheetUrl: modalSheetUrl.trim() } : {}),
            autoSyncGoogleSheets: true,
          });
        }
        showToast(res.message || 'Đã kết nối nguồn Google Sheets v3 thành công!', 'success');
        setLastSyncTime(new Date());
        await checkStatus();
        await fetchBackups();
        onDataReload();
        setIsCloudSourceModalOpen(false);
      } else {
        showToast(res.message || 'Không thể cấu hình Google Sheets URL này.', 'error');
      }
    } catch (err: any) {
      showToast(`Lỗi cấu hình: ${err?.message}`, 'error');
    } finally {
      setIsApplyingSheets(false);
    }
  };

  // Snapshot Backups Handlers
  const handleCreateBackup = async () => {
    setIsCreatingBackup(true);
    try {
      const res = await apiCreateFirestoreBackup(`Thủ công - ${new Date().toLocaleTimeString('vi-VN')}`);
      if (res.success) {
        showToast('Đã tạo bản sao lưu snapshot thành công!', 'success');
        await fetchBackups();
      } else {
        showToast('Không thể tạo bản sao lưu.', 'error');
      }
    } catch {
      showToast('Lỗi tạo sao lưu.', 'error');
    } finally {
      setIsCreatingBackup(false);
    }
  };

  const handleRestoreBackup = async (filename: string) => {
    setRestoringFilename(filename);
    try {
      const res = await apiRestoreFirestoreBackup(filename);
      if (res.success) {
        showToast('Đã khôi phục dữ liệu từ bản sao lưu thành công!', 'success');
        setLastSyncTime(new Date());
        await checkStatus();
        onDataReload();
      } else {
        showToast('Lỗi khôi phục sao lưu.', 'error');
      }
    } catch {
      showToast('Lỗi khi khôi phục sao lưu.', 'error');
    } finally {
      setRestoringFilename(null);
    }
  };

  // Time formatter for "Lần đồng bộ gần nhất" (e.g. 13:39:24 4/9/2026)
  const formatSyncTime = (date: Date) => {
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    const h = pad(date.getHours());
    const m = pad(date.getMinutes());
    const s = pad(date.getSeconds());
    const d = date.getDate();
    const mo = date.getMonth() + 1;
    const y = date.getFullYear();
    return `${h}:${m}:${s} ${d}/${mo}/${y}`;
  };

  const isConfigured = Boolean(settings.googleAppsScriptUrl || status?.configured);
  const isOnline = status ? Boolean(status.connected) : isConfigured;
  const activeDbLabel = status?.databaseId || (isConfigured ? `Google Sheets (v${status?.version || 3})` : 'Chưa cấu hình URL');
  const activeSourceLabel = status?.source === 'env'
    ? 'Vercel / Env Var'
    : status?.source === 'settings' || status?.source === 'header'
    ? 'Cài đặt ứng dụng'
    : isConfigured
    ? 'Apps Script Web App'
    : 'Chưa kết nối';

  const latencyDisplay = status?.latencyMs
    ? `⚡ ${status.latencyMs} ms`
    : isOnline
    ? '⚡ Sẵn sàng'
    : 'Chưa kết nối';

  const vercelEnvSnippet = `GOOGLE_APPS_SCRIPT_URL=${(modalScriptUrl || settings.googleAppsScriptUrl || 'https://script.google.com/macros/s/.../exec').trim()}${
    (modalSheetUrl || settings.googleSheetUrl || '').trim()
      ? `\nGOOGLE_SHEET_URL=${(modalSheetUrl || settings.googleSheetUrl || '').trim()}`
      : ''
  }`;

  return (
    <div className="space-y-5">
      {/* =========================================================================
          TOP HEADER: GOOGLE SHEETS CLOUD & QUẢN TRỊ DỮ LIỆU
         ========================================================================= */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900 flex items-center gap-2">
            <Cloud className="w-4 h-4 text-emerald-600" />
            <span>Cơ Sở Dữ Liệu Google Sheets &amp; Google Drive</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Toàn bộ dữ liệu (5 Tab) và ảnh hóa đơn (Google Drive) được lưu trữ 100% trên Google Sheets — không giới hạn đọc/ghi mỗi ngày.
          </p>
        </div>

        {/* Status Readiness Badge */}
        <div className="flex items-center gap-1.5">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${
              isCheckingStatus && !status
                ? 'bg-slate-100 text-slate-700 border-slate-300'
                : isOnline
                ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                : 'bg-rose-100 text-rose-800 border-rose-300'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isCheckingStatus && !status
                  ? 'bg-slate-400 animate-pulse'
                  : isOnline
                  ? 'bg-emerald-500 animate-pulse'
                  : 'bg-rose-500'
              }`}
            ></span>
            <span>
              {isCheckingStatus && !status
                ? 'Đang kiểm tra...'
                : isOnline
                ? 'Google Sheets Online'
                : isConfigured
                ? 'Google Sheets Offline'
                : 'Chưa cấu hình URL'}
            </span>
          </span>
        </div>
      </div>

      {status && !status.connected && status.error && (
        <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-1">
          <div className="font-bold flex items-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span>Chi tiết trạng thái kết nối Google Sheets:</span>
          </div>
          <p className="text-[11.5px] text-amber-800 leading-relaxed">{status.error}</p>
        </div>
      )}

      {/* =========================================================================
          GOOGLE SHEETS & DRIVE SYNC SECTION (100% PURE CLOUD)
         ========================================================================= */}
      <GoogleSheetsSyncSection
        debtors={debtors}
        transactions={transactions}
        parties={parties}
        settings={settings}
        onSaveSettings={(newSettings) => {
          if (onSaveSettings) {
            onSaveSettings(newSettings);
          }
        }}
        showToast={showToast}
      />

      {/* Card 1: Thông Tin Hạ Tầng Google Sheets Cloud */}
      <div className="bg-slate-50/80 border border-slate-200/90 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-800">
            <Database className="w-4 h-4 text-blue-600" />
            <span>Thông Tin Hạ Tầng Google Sheets Cloud</span>
          </div>
            <button
              type="button"
              onClick={handlePingTest}
              disabled={isCheckingStatus}
              className="px-3 py-1.5 bg-white hover:bg-slate-100 active:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl border border-slate-200 shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
            >
              <Zap className={`w-3.5 h-3.5 text-amber-500 ${isCheckingStatus ? 'animate-spin' : ''}`} />
              <span>{isCheckingStatus ? 'Đang kiểm tra...' : 'Kiểm tra kết nối (Ping Test)'}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
            {/* Col 1: CSDL */}
            <div className="bg-white rounded-xl p-3 border border-slate-200/80 shadow-2xs">
              <div className="text-[11px] text-slate-500 font-medium">Cơ sở dữ liệu (CSDL)</div>
              <div className="text-xs font-bold text-slate-900 truncate mt-0.5 font-mono">
                {activeDbLabel}
              </div>
            </div>

            {/* Col 2: Nguồn cấu hình */}
            <div className="bg-white rounded-xl p-3 border border-slate-200/80 shadow-2xs">
              <div className="text-[11px] text-slate-500 font-medium">Nguồn kết nối</div>
              <div className="text-xs font-bold text-slate-800 truncate mt-0.5 font-mono">
                {activeSourceLabel}
              </div>
            </div>

            {/* Col 3: Last Sync */}
            <div className="bg-white rounded-xl p-3 border border-slate-200/80 shadow-2xs">
              <div className="text-[11px] text-slate-500 font-medium">Lần kiểm tra gần nhất</div>
              <div className="text-xs font-bold text-slate-800 truncate mt-0.5">
                {formatSyncTime(lastSyncTime)}
              </div>
            </div>

            {/* Col 4: Latency */}
            <div className="bg-white rounded-xl p-3 border border-slate-200/80 shadow-2xs">
              <div className="text-[11px] text-slate-500 font-medium">Độ trễ phản hồi (Latency)</div>
              <div className="text-xs font-bold text-emerald-600 truncate mt-0.5 flex items-center gap-1">
                <span>{latencyDisplay}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Row 1: 3 Action Cards (Nguồn Dữ Liệu & Vercel, Đồng bộ 5 Tab + Drive, Kiểm tra) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {/* Card A: Cấu Hình Vercel Env & Bot API */}
          <div className="border border-purple-200/90 bg-purple-50/40 hover:bg-purple-50/70 rounded-2xl p-4 flex flex-col justify-between transition-all">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-purple-950">
                  <Database className="w-4 h-4 text-purple-600" />
                  <span>Nguồn Sheets &amp; Vercel Env</span>
                </div>
                <span className="bg-purple-100 text-purple-800 text-[10px] px-2 py-0.5 rounded-md font-semibold border border-purple-200">
                  Apps Script v{status?.version || 3}
                </span>
              </div>
              <p className="text-xs text-slate-600 min-h-[38px] mt-2 leading-relaxed">
                Đổi URL Google Apps Script, lấy biến môi trường Vercel (đa thiết bị) hoặc kết nối Bot Zalo / Telegram.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsCloudSourceModalOpen(true)}
              className="mt-3 w-full bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white font-bold text-xs py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
            >
              <Key className="w-3.5 h-3.5" />
              <span>Cấu Hình Cloud &amp; Vercel</span>
            </button>
          </div>

          {/* Card B: Lưu trữ 5 Tab + Drive Ảnh */}
          <div className="border border-emerald-200/90 bg-emerald-50/40 hover:bg-emerald-50/70 rounded-2xl p-4 flex flex-col justify-between transition-all">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-emerald-950">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Không Giới Hạn Đọc/Ghi</span>
                </div>
                <span className="bg-emerald-100 text-emerald-800 text-[10px] px-2 py-0.5 rounded-md font-semibold border border-emerald-200 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  5 Tab + Drive
                </span>
              </div>
              <p className="text-xs text-slate-600 min-h-[38px] mt-2 leading-relaxed">
                Mọi thao tác ghi nợ, trả tiền, ảnh hóa đơn và nhật ký lưu thẳng vào Google Sheets &amp; Google Drive của bạn.
              </p>
            </div>
            <div className="mt-3 py-2 px-3 bg-emerald-100/60 rounded-xl flex items-center justify-between text-xs text-emerald-900 font-medium border border-emerald-200/80">
              <span className="flex items-center gap-1.5">
                <Cloud className="w-3.5 h-3.5 text-emerald-600" />
                <span>Dữ liệu thuộc về bạn 100%</span>
              </span>
            </div>
          </div>

          {/* Card C: Kiểm tra kết nối & Tải lại */}
          <div className="border border-blue-200/90 bg-blue-50/40 hover:bg-blue-50/70 rounded-2xl p-4 flex flex-col justify-between transition-all">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-blue-950">
                  <ShieldCheck className="w-4 h-4 text-blue-600" />
                  <span>Kiểm Tra &amp; Nạp Lại Dữ Liệu</span>
                </div>
                <span className="bg-blue-100 text-blue-800 text-[10px] px-2 py-0.5 rounded-md font-semibold border border-blue-200">
                  Chống xung đột
                </span>
              </div>
              <p className="text-xs text-slate-600 min-h-[38px] mt-2 leading-relaxed">
                Sử dụng LockService của Google Apps Script đảm bảo nhiều điện thoại ghi cùng lúc không bị mất dữ liệu.
              </p>
            </div>
            <button
              type="button"
              onClick={handlePingTest}
              disabled={isCheckingStatus}
              className="mt-3 w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-xs py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              <Zap className={`w-3.5 h-3.5 ${isCheckingStatus ? 'animate-spin' : ''}`} />
              <span>{isCheckingStatus ? 'Đang kiểm tra...' : 'Kiểm tra kết nối ngay'}</span>
            </button>
          </div>
        </div>

      {/* Card 2: Quản Trị Dữ Liệu & Sao Lưu Sổ Nợ Toàn Diện */}
      <div className="bg-slate-50/80 border border-slate-200/90 rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-800">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Quản Trị Dữ Liệu &amp; Sao Lưu Sổ Nợ</span>
          </div>
          <span className="text-[11px] text-slate-500 font-medium">
            Hiện có: <strong className="text-slate-800">{debtors.length}</strong> người nợ • <strong className="text-slate-800">{transactions.length}</strong> giao dịch • <strong className="text-slate-800">{parties?.length || 0}</strong> cuộc vui
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Action 1: Xuất Backup JSON */}
          <div className="bg-white border border-slate-200/90 rounded-xl p-3.5 flex flex-col justify-between hover:border-emerald-300 transition-all shadow-2xs">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900">Xuất File Sao Lưu (.JSON)</span>
                <Download className="w-4 h-4 text-emerald-600" />
              </div>
              <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                Tải tệp JSON lưu trữ an toàn (tự động loại trừ mật khẩu quản trị).
              </p>
            </div>
            <button
              type="button"
              onClick={handleExportJson}
              className="mt-3 w-full bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-xs py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Tải File JSON</span>
            </button>
          </div>

          {/* Action 2: Khôi Phục Từ File JSON */}
          {onImportJsonFile && (
            <label className="bg-white border border-slate-200/90 rounded-xl p-3.5 flex flex-col justify-between hover:border-blue-300 transition-all shadow-2xs cursor-pointer group">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 group-hover:text-blue-700">Khôi Phục Từ File JSON</span>
                  <Upload className="w-4 h-4 text-blue-600" />
                </div>
                <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                  Nạp tệp JSON đã sao lưu trước đây để phục hồi lại dữ liệu.
                </p>
              </div>
              <div className="mt-3 w-full bg-blue-600 group-hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-xs py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-colors">
                <Upload className="w-3.5 h-3.5" />
                <span>Nạp Tệp Phục Hồi</span>
              </div>
              <input
                type="file"
                accept=".json"
                onChange={onImportJsonFile}
                className="hidden"
              />
            </label>
          )}

          {/* Action 3: Quét dọn mồ côi */}
          <div className="bg-white border border-slate-200/90 rounded-xl p-3.5 flex flex-col justify-between hover:border-amber-300 transition-all shadow-2xs">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900">Quét &amp; Dọn Dữ Liệu Rác</span>
                <Trash2 className="w-4 h-4 text-amber-500" />
              </div>
              <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                Tự động tìm kiếm các giao dịch mồ côi hoặc sai lệch để làm sạch Cloud.
              </p>
            </div>
            <button
              type="button"
              onClick={handleCleanOrphans}
              disabled={isCleaningOrphans}
              className="mt-3 w-full bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white font-bold text-xs py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            >
              <ShieldCheck className={`w-3.5 h-3.5 ${isCleaningOrphans ? 'animate-spin' : ''}`} />
              <span>{isCleaningOrphans ? 'Đang Quét...' : 'Quét Dọn Rác'}</span>
            </button>
          </div>

          {/* Action 4: Xóa sạch tất cả dữ liệu */}
          {onOpenClearAllModal && (
            <div className="bg-white border border-slate-200/90 rounded-xl p-3.5 flex flex-col justify-between hover:border-rose-300 transition-all shadow-2xs">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900">Xóa Sạch Tất Cả Ghi Chép</span>
                  <Trash2 className="w-4 h-4 text-rose-600" />
                </div>
                <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                  Xóa toàn bộ người nợ và lịch sử giao dịch để làm mới sổ về trạng thái trống.
                </p>
              </div>
              <button
                type="button"
                onClick={onOpenClearAllModal}
                className="mt-3 w-full bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-bold text-xs py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Làm Mới Sổ Trống</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* =========================================================================
          MODAL 1: NGUỒN DỮ LIỆU ĐÁM MÂY & HƯỚNG DẪN TÍCH HỢP (CLOUD SOURCE MODAL)
         ========================================================================= */}
      {isCloudSourceModalOpen && (
        <div
          id="cloud-source-modal-backdrop"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-150"
        >
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-2xl w-full p-5 sm:p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Cấu Hình Google Sheets Cloud &amp; Vercel
                  </h3>
                  <p className="text-xs text-slate-500">
                    Quản lý đường dẫn Apps Script v3, biến môi trường Vercel và tích hợp Bot API
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCloudSourceModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Sub-tab navigation inside modal */}
            <div className="flex gap-2 p-1 bg-slate-100 rounded-xl">
              <button
                type="button"
                onClick={() => setSourceModalTab('DATABASE')}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  sourceModalTab === 'DATABASE'
                    ? 'bg-white text-purple-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Google Sheets &amp; Vercel
              </button>
              <button
                type="button"
                onClick={() => setSourceModalTab('BOT_API')}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  sourceModalTab === 'BOT_API'
                    ? 'bg-white text-purple-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Kết Nối Bot Zalo / Telegram
              </button>
              <button
                type="button"
                onClick={() => setSourceModalTab('SNAPSHOTS')}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  sourceModalTab === 'SNAPSHOTS'
                    ? 'bg-white text-purple-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Bản Sao Lưu Snapshot ({backups.length})
              </button>
            </div>

            {/* Tab Content 1: Google Sheets & Vercel Env */}
            {sourceModalTab === 'DATABASE' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Link2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>URL Google Apps Script Web App (v3):</span>
                  </label>
                  <input
                    type="url"
                    value={modalScriptUrl}
                    onChange={(e) => setModalScriptUrl(e.target.value)}
                    placeholder="https://script.google.com/macros/s/.../exec"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-mono focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700">
                    Link File Google Sheet (Tùy chọn để mở nhanh):
                  </label>
                  <input
                    type="url"
                    value={modalSheetUrl}
                    onChange={(e) => setModalSheetUrl(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/.../edit"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-mono focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div className="p-3.5 bg-slate-900 text-slate-100 rounded-2xl space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-emerald-300">
                      Biến Môi Trường Vercel (để mọi thiết bị tự kết nối):
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(vercelEnvSnippet);
                        setCopiedVercelEnv(true);
                        showToast('Đã sao chép biến môi trường Vercel!', 'success');
                        setTimeout(() => setCopiedVercelEnv(false), 2500);
                      }}
                      className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white inline-flex items-center gap-1 cursor-pointer"
                    >
                      {copiedVercelEnv ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedVercelEnv ? 'Đã chép' : 'Sao chép'}</span>
                    </button>
                  </div>
                  <pre className="text-[11px] font-mono text-slate-200 overflow-x-auto whitespace-pre-wrap break-all">
                    {vercelEnvSnippet}
                  </pre>
                  <p className="text-[10.5px] text-slate-400">
                    Vào Vercel Dashboard &rarr; Settings &rarr; Environment Variables &rarr; Dán biến trên rồi Redeploy là mọi máy đều tự kết nối ngay!
                  </p>
                </div>

                {testTargetFeedback && (
                  <div
                    className={`p-3 rounded-xl text-xs font-medium ${
                      testTargetFeedback.success
                        ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                        : 'bg-rose-50 text-rose-900 border border-rose-200'
                    }`}
                  >
                    {testTargetFeedback.message}
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={handleTestTargetSheets}
                    disabled={isTestingTargetSheets}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                  >
                    {isTestingTargetSheets ? 'Đang kiểm tra...' : 'Kiểm Tra Kết Nối'}
                  </button>

                  <button
                    type="button"
                    onClick={handleApplyTargetSheets}
                    disabled={isApplyingSheets}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    {isApplyingSheets ? 'Đang lưu...' : 'Lưu & Kết Nối Google Sheets'}
                  </button>
                </div>
              </div>
            )}

            {/* Tab Content 2: Bot Zalo / Telegram API */}
            {sourceModalTab === 'BOT_API' && (
              <div className="space-y-3 text-xs text-slate-700">
                <p className="leading-relaxed">
                  Bạn có thể tích hợp Bot Telegram, Zalo hoặc ứng dụng di động để tự động thêm giao dịch, tra cứu số dư và lưu trực tiếp vào Google Sheets:
                </p>

                <div className="p-3.5 bg-slate-900 text-slate-200 rounded-2xl font-mono text-[11px] space-y-2">
                  <div className="text-slate-400"># 1. Lấy danh sách người nợ &amp; số dư:</div>
                  <div className="text-emerald-400">GET /api/debtors</div>
                  <div className="text-slate-400 mt-2"># 2. Thêm một khoản nợ hoặc trả bớt (Yêu cầu token):</div>
                  <div className="text-emerald-400">POST /api/owner/transaction</div>
                  <div className="text-slate-400">Header: x-owner-token: &lt;Mật khẩu Quản lý của bạn&gt;</div>
                  <div className="text-slate-300">
                    {JSON.stringify({ debtorId: 'debtor-id', amount: 50000, type: 'ADD', note: 'Ăn trưa' })}
                  </div>
                  <div className="text-slate-400 mt-2"># 3. Đồng bộ bộ dữ liệu JSON:</div>
                  <div className="text-emerald-400">POST /api/sheets/upload-json</div>
                </div>

                <p className="text-[11px] text-slate-500 italic">
                  * Gợi ý: Khi viết Bot Zalo/Telegram, bạn chỉ cần gửi HTTP POST tới endpoint trên với mật khẩu chủ sổ trong header là dữ liệu sẽ tự lưu lên Google Sheets.
                </p>
              </div>
            )}

            {/* Tab Content 3: Snapshots */}
            {sourceModalTab === 'SNAPSHOTS' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">Danh Sách Snapshot Đã Lưu:</span>
                  <button
                    type="button"
                    onClick={handleCreateBackup}
                    disabled={isCreatingBackup}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs"
                  >
                    {isCreatingBackup ? 'Đang tạo...' : '+ Tạo Snapshot Ngay'}
                  </button>
                </div>

                {isLoadingBackups ? (
                  <div className="p-6 text-center text-slate-500 text-xs">
                    Đang tải danh sách snapshot...
                  </div>
                ) : backups.length === 0 ? (
                  <div className="p-6 text-center text-slate-500 text-xs border border-dashed border-slate-200 rounded-xl">
                    Chưa có bản snapshot sao lưu nào được tạo.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {backups.map((b) => {
                      const dCount = b.debtorCount ?? (b as any).debtorsCount ?? 0;
                      const tCount = b.transactionCount ?? (b as any).transactionsCount ?? 0;
                      const ts = b.timestamp || (b as any).createdAt;
                      return (
                        <div
                          key={b.filename}
                          className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-xs"
                        >
                          <div>
                            <div className="font-bold text-slate-900">{b.label || b.filename}</div>
                            <div className="text-[11px] text-slate-500">
                              {dCount} người nợ • {tCount} giao dịch • {ts ? new Date(ts).toLocaleString('vi-VN') : '-'}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRestoreBackup(b.filename)}
                            disabled={restoringFilename === b.filename}
                            className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg text-xs cursor-pointer"
                          >
                            {restoringFilename === b.filename ? 'Đang nạp...' : 'Khôi Phục'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
