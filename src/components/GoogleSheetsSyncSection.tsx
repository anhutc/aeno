import React, { useState, useEffect, useMemo } from 'react';
import {
  FileSpreadsheet,
  ExternalLink,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Download,
  Copy,
  Check,
  ShieldCheck,
  HelpCircle,
  Users,
  Receipt,
  Utensils,
  ClipboardList,
  Database,
  Code,
  Sparkles,
  Link2,
  Trash2,
} from 'lucide-react';
import { AppSettings, Debtor, Transaction, PartySplit } from '../types';
import { loadAuditLogs } from '../utils/storage';
import { formatVND } from '../utils/vietqr';
import {
  syncViaAppsScript,
  GOOGLE_APPS_SCRIPT_TEMPLATE,
  exportGoogleSheetsCsvFile,
  triggerDebouncedAutoSync,
  SyncResult,
} from '../services/googleSheetsService';
import { triggerHaptic } from '../utils/haptic';

interface GoogleSheetsSyncSectionProps {
  debtors: Debtor[];
  transactions: Transaction[];
  parties?: PartySplit[];
  settings: AppSettings;
  onSaveSettings: (newSettings: AppSettings) => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

export const GoogleSheetsSyncSection: React.FC<GoogleSheetsSyncSectionProps> = ({
  debtors,
  transactions,
  parties = [],
  settings,
  onSaveSettings,
  showToast,
}) => {
  const [appsScriptUrlInput, setAppsScriptUrlInput] = useState<string>(
    () => settings.googleAppsScriptUrl || ''
  );
  const [isEditingUrl, setIsEditingUrl] = useState<boolean>(
    () => !settings.googleAppsScriptUrl
  );
  const [sheetUrlInput, setSheetUrlInput] = useState<string>(
    () => settings.googleSheetUrl || ''
  );
  const [isEditingSheetUrl, setIsEditingSheetUrl] = useState<boolean>(false);
  const [copiedSheetLink, setCopiedSheetLink] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isTestingUrl, setIsTestingUrl] = useState(false);
  const [syncStatusStep, setSyncStatusStep] = useState<string>('');
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [isAutoSyncing, setIsAutoSyncing] = useState(false);
  const [scriptCopied, setScriptCopied] = useState<boolean>(false);
  const [showInstructions, setShowInstructions] = useState<boolean>(
    () => !settings.googleAppsScriptUrl
  );

  const isAutoSyncEnabled = settings.autoSyncGoogleSheets !== false;

  useEffect(() => {
    if (settings.googleAppsScriptUrl !== undefined) {
      setAppsScriptUrlInput(settings.googleAppsScriptUrl || '');
    }
  }, [settings.googleAppsScriptUrl]);

  useEffect(() => {
    if (settings.googleSheetUrl !== undefined) {
      setSheetUrlInput(settings.googleSheetUrl || '');
    }
  }, [settings.googleSheetUrl]);

  // Listen to background auto-sync events
  useEffect(() => {
    const handleAutoSyncStart = () => {
      setIsAutoSyncing(true);
    };
    const handleAutoSynced = (e: any) => {
      setIsAutoSyncing(false);
      if (e?.detail) {
        setSyncResult(e.detail);
      }
    };
    const handleAutoSyncError = () => {
      setIsAutoSyncing(false);
    };

    window.addEventListener('googlesheets-autosync-start', handleAutoSyncStart);
    window.addEventListener('googlesheets-autosynced', handleAutoSynced);
    window.addEventListener('googlesheets-autosync-error', handleAutoSyncError);

    return () => {
      window.removeEventListener('googlesheets-autosync-start', handleAutoSyncStart);
      window.removeEventListener('googlesheets-autosynced', handleAutoSynced);
      window.removeEventListener('googlesheets-autosync-error', handleAutoSyncError);
    };
  }, []);

  // Real-time local audit logs count
  const [localAuditLogsCount, setLocalAuditLogsCount] = useState<number>(
    () => loadAuditLogs().length
  );

  useEffect(() => {
    const handleLogChange = () => {
      setLocalAuditLogsCount(loadAuditLogs().length);
    };
    window.addEventListener('audit-log-recorded', handleLogChange);
    window.addEventListener('audit-logs-cleared', handleLogChange);
    return () => {
      window.removeEventListener('audit-log-recorded', handleLogChange);
      window.removeEventListener('audit-logs-cleared', handleLogChange);
    };
  }, []);

  // Summary statistics of data updated to spreadsheet
  const stats = useMemo(() => {
    let totalReceivable = 0;
    let totalPayable = 0;
    let settledCount = 0;
    let receivableCount = 0;
    let payableCount = 0;

    debtors.forEach((d) => {
      const dBalance = transactions
        .filter((t) => t.debtorId === d.id)
        .reduce((acc, t) => (t.type === 'ADD' ? acc + t.amount : acc - t.amount), 0);
      if (dBalance > 0) {
        totalReceivable += dBalance;
        receivableCount++;
      } else if (dBalance < 0) {
        totalPayable += Math.abs(dBalance);
        payableCount++;
      } else {
        settledCount++;
      }
    });

    const debtTxCount = transactions.filter((t) => t.type === 'ADD').length;
    const paymentTxCount = transactions.filter((t) => t.type === 'SUB').length;
    const totalDebtVolume = transactions
      .filter((t) => t.type === 'ADD')
      .reduce((sum, t) => sum + t.amount, 0);
    const totalPaymentVolume = transactions
      .filter((t) => t.type === 'SUB')
      .reduce((sum, t) => sum + t.amount, 0);

    const totalPartyAmount = parties.reduce((sum, p) => sum + (p.totalAmount || 0), 0);

    return {
      totalReceivable,
      totalPayable,
      receivableCount,
      payableCount,
      settledCount,
      debtTxCount,
      paymentTxCount,
      totalDebtVolume,
      totalPaymentVolume,
      totalPartyAmount,
    };
  }, [debtors, transactions, parties]);

  const handleSaveAppsScriptUrl = async () => {
    triggerHaptic('medium');
    const trimmed = appsScriptUrlInput.trim();
    if (trimmed && !trimmed.startsWith('https://script.google.com/')) {
      showToast(
        'Đường link Google Apps Script phải bắt đầu bằng https://script.google.com/macros/s/...',
        'error'
      );
      return;
    }

    const updatedSettings: AppSettings = {
      ...settings,
      googleAppsScriptUrl: trimmed || undefined,
      autoSyncGoogleSheets: trimmed ? true : settings.autoSyncGoogleSheets,
    };
    await onSaveSettings(updatedSettings);
    setIsEditingUrl(false);

    if (trimmed) {
      showToast('Đã lưu URL Google Apps Script thành công! Đang kích hoạt đồng bộ...', 'success');
      // Trigger instant sync once saved
      executeSync(trimmed);
    } else {
      showToast('Đã xóa liên kết Google Apps Script.', 'success');
    }
  };

  const handleSaveGoogleSheetUrl = async () => {
    const raw = sheetUrlInput.trim();
    if (!raw) {
      await onSaveSettings({
        ...settings,
        googleSheetUrl: undefined,
        googleSheetId: undefined,
      });
      setIsEditingSheetUrl(false);
      showToast('Đã xóa liên kết Google Sheet.', 'info');
      return;
    }

    if (!raw.includes('docs.google.com/spreadsheets')) {
      showToast('Đường link cần có định dạng docs.google.com/spreadsheets', 'error');
      return;
    }

    const match = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    const sheetId = match ? match[1] : undefined;

    await onSaveSettings({
      ...settings,
      googleSheetUrl: raw,
      googleSheetId: sheetId || settings.googleSheetId,
    });
    setIsEditingSheetUrl(false);
    showToast('Đã lưu đường link Google Sheet thành công!', 'success');
  };

  const handleCopySheetUrl = () => {
    if (!settings.googleSheetUrl) return;
    navigator.clipboard.writeText(settings.googleSheetUrl);
    setCopiedSheetLink(true);
    showToast('Đã sao chép link Google Sheet vào bộ nhớ tạm!', 'success');
    setTimeout(() => setCopiedSheetLink(false), 2500);
  };

  const handleTestConnection = async () => {
    const url = (settings.googleAppsScriptUrl || appsScriptUrlInput).trim();
    if (!url) {
      showToast('Vui lòng nhập URL Google Apps Script trước khi kiểm tra.', 'error');
      return;
    }
    triggerHaptic('light');
    setIsTestingUrl(true);
    try {
      // Test sending a lightweight payload
      const testRes = await syncViaAppsScript(
        {
          debtors,
          transactions,
          parties,
          settings,
          auditLogs: loadAuditLogs(),
        },
        url
      );
      setSyncResult(testRes);
      showToast('Kết nối Google Apps Script thành công 100%! Bảng tính đã được cập nhật.', 'success');
    } catch (err: any) {
      showToast(`Không thể kết nối: ${err?.message || 'Kiểm tra lại quyền truy cập Anyone trên Apps Script'}`, 'error');
    } finally {
      setIsTestingUrl(false);
    }
  };

  const copyAppsScriptTemplate = () => {
    triggerHaptic('success');
    navigator.clipboard.writeText(GOOGLE_APPS_SCRIPT_TEMPLATE);
    setScriptCopied(true);
    showToast('Đã sao chép toàn bộ mã Google Apps Script!', 'success');
    setTimeout(() => setScriptCopied(false), 3000);
  };

  const handleToggleAutoSync = async () => {
    triggerHaptic('medium');
    if (!settings.googleAppsScriptUrl && !isAutoSyncEnabled) {
      showToast('Vui lòng dán và lưu URL Google Apps Script trước khi bật tự động đồng bộ.', 'error');
      setIsEditingUrl(true);
      return;
    }
    const nextVal = !isAutoSyncEnabled;
    const updatedSettings: AppSettings = {
      ...settings,
      autoSyncGoogleSheets: nextVal,
    };
    await onSaveSettings(updatedSettings);

    if (nextVal && settings.googleAppsScriptUrl) {
      triggerDebouncedAutoSync({
        debtors,
        transactions,
        parties,
        settings: updatedSettings,
        auditLogs: loadAuditLogs(),
      });
    }

    showToast(
      nextVal
        ? 'Đã BẬT tự động đồng bộ ngầm: Mọi biến động (thêm, sửa, xóa) sẽ tự đồng bộ sang Google Sheets sau 2 giây!'
        : 'Đã TẮT tự động đồng bộ Google Sheets.',
      'success'
    );
  };

  const executeSync = async (customUrl?: string) => {
    const activeUrl = customUrl || settings.googleAppsScriptUrl;
    if (!activeUrl) {
      showToast('Chưa có URL Google Apps Script. Vui lòng thiết lập ở bên dưới.', 'error');
      setIsEditingUrl(true);
      return;
    }

    triggerHaptic('medium');
    setIsSyncing(true);
    setSyncStatusStep('Đang chuẩn bị dữ liệu 4 bảng tính...');

    try {
      setSyncStatusStep('Đang đồng bộ dữ liệu sang Google Sheet qua Google Apps Script Web App...');
      const result = await syncViaAppsScript(
        {
          debtors,
          transactions,
          parties,
          settings,
          auditLogs: loadAuditLogs(),
        },
        activeUrl
      );

      const updatedSettings: AppSettings = {
        ...settings,
        lastGoogleSheetSyncAt: result.updatedAt,
      };
      await onSaveSettings(updatedSettings);
      setSyncResult(result);

      showToast(
        `Đã đồng bộ thành công sang Google Sheets! Nhật ký logs được lưu trữ vĩnh viễn.`,
        'success'
      );
    } catch (err: any) {
      console.error('Apps Script sync error:', err);
      showToast(
        err?.message || 'Lỗi khi gửi dữ liệu sang Google Apps Script. Vui lòng kiểm tra lại URL.',
        'error'
      );
    } finally {
      setIsSyncing(false);
      setSyncStatusStep('');
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
        auditLogs: loadAuditLogs(),
      });
      showToast('Đã tải tệp bảng tính CSV chuẩn 4 bảng (kèm toàn bộ Nhật ký)!', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Lỗi tải tệp CSV', 'error');
    }
  };

  const lastSyncDateStr = settings.lastGoogleSheetSyncAt
    ? new Date(settings.lastGoogleSheetSyncAt).toLocaleString('vi-VN')
    : null;

  const isConnected = Boolean(settings.googleAppsScriptUrl);

  return (
    <div className="bg-white rounded-3xl p-5 sm:p-6 border border-emerald-200/90 shadow-xs space-y-5">
      {/* 1. Header Độc Quyền Google Apps Script Web App */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 shadow-2xs">
            <FileSpreadsheet className="w-5 h-5 text-emerald-700" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-extrabold text-slate-900">
                Đồng Bộ Google Sheets Bằng Google Apps Script
              </h3>
              {isConnected ? (
                <span className="px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 inline-flex items-center gap-1 font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"></span>
                  ĐÃ KẾT NỐI WEB APP
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                  Chưa thiết lập URL
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
              Đồng bộ trực tiếp qua Apps Script Web App — <strong>100% không cần OAuth</strong>, không cần Client ID, hoạt động vĩnh viễn trên mọi tên miền.
            </p>
          </div>
        </div>

        {/* Quick action buttons */}
        <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto">
          {settings.googleSheetUrl && (
            <a
              href={settings.googleSheetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer"
              title="Mở trực tiếp bảng tính Google Sheets trong tab mới"
            >
              <ExternalLink className="w-3.5 h-3.5 text-emerald-600" />
              <span>Mở Google Sheet ↗</span>
            </a>
          )}

          {isConnected && (
            <button
              type="button"
              onClick={() => executeSync()}
              disabled={isSyncing || isTestingUrl}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Đang đồng bộ...' : 'Đồng bộ ngay'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleExportCsv}
            className="px-3 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-all flex items-center gap-1.5 cursor-pointer"
            title="Tải tệp bảng tính CSV dự phòng mở trên Google Sheets"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span className="hidden xs:inline">Tải CSV</span>
          </button>
        </div>
      </div>

      {/* 2. Banner Bảo Toàn Log Vĩnh Viễn Trên Google Sheets (THE PERMANENT LOGS GUARANTEE) */}
      <div className="bg-gradient-to-r from-amber-50/80 via-emerald-50/50 to-teal-50/40 border border-amber-200/90 rounded-2xl p-4 text-xs space-y-2 shadow-2xs">
        <div className="flex items-center gap-2 text-amber-950 font-extrabold text-xs sm:text-sm">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Quy Tắc Bảo Toàn Nhật Ký (Logs) Vĩnh Viễn Trên Google Sheets</span>
        </div>
        <p className="text-slate-700 text-[11.5px] leading-relaxed">
          Tab <strong>&quot;Nhật Ký Thao Tác (Logs)&quot;</strong> trên Google Sheets hoạt động theo cơ chế <strong className="text-emerald-800">Chỉ Ghi Thêm (Append-Only)</strong>. 
          Mọi thao tác tạo mới, sửa đổi, gạch nợ hay thậm chí <strong className="text-rose-700">XÓA GIAO DỊCH</strong>, <strong className="text-rose-700">XÓA NGƯỜI NỢ</strong> hoặc <strong className="text-rose-700">LÀM SẠCH NHẬT KÝ</strong> trên ứng dụng này thì <strong>toàn bộ lịch sử log trên Google Sheets vẫn được lưu trữ vĩnh viễn và không bao giờ bị xóa mất</strong>.
        </p>
      </div>

      {/* 2b. Bảng Tính Google Sheets Đã Liên Kết (MỞ TRỰC TIẾP TRANG TÍNH) */}
      <div className="bg-gradient-to-r from-emerald-50/70 via-teal-50/40 to-slate-50 border border-emerald-300/80 rounded-2xl p-4 sm:p-5 space-y-3.5 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs sm:text-sm font-bold text-slate-900 block">
                Bảng Tính Google Sheets Đã Liên Kết
              </span>
              <span className="text-[11px] text-slate-500 block">
                Bấm nút bên dưới để mở trực tiếp file trang tính trên Google Drive trong tab mới.
              </span>
            </div>
          </div>

          {settings.googleSheetUrl && !isEditingSheetUrl && (
            <div className="flex items-center gap-2">
              <a
                href={settings.googleSheetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Mở Google Sheet (Tab Mới) ↗</span>
              </a>
            </div>
          )}
        </div>

        {isEditingSheetUrl ? (
          <div className="space-y-2">
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="url"
                value={sheetUrlInput}
                onChange={(e) => setSheetUrlInput(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/1R6Hzbif.../edit"
                className="flex-1 px-3.5 py-2.5 text-xs font-mono rounded-xl border border-emerald-300 bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-slate-900"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveGoogleSheetUrl}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-xs font-bold cursor-pointer shadow-xs transition-all shrink-0"
                >
                  Lưu Link Google Sheet
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSheetUrlInput(settings.googleSheetUrl || '');
                    setIsEditingSheetUrl(false);
                  }}
                  className="px-3 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer shrink-0"
                >
                  Hủy
                </button>
              </div>
            </div>
            <p className="text-[10.5px] text-slate-500">
              * Dán link trình duyệt từ thanh địa chỉ của file Google Sheet (dạng <code>https://docs.google.com/spreadsheets/d/.../edit</code>).
            </p>
          </div>
        ) : settings.googleSheetUrl ? (
          <div className="bg-white p-3 sm:p-3.5 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0 flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0"></span>
              <div className="min-w-0">
                <span className="text-[10.5px] uppercase font-bold text-slate-400 block tracking-wider">
                  Đường Dẫn Bảng Tính
                </span>
                <a
                  href={settings.googleSheetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-xs text-emerald-800 hover:text-emerald-950 underline truncate block max-w-sm sm:max-w-md select-all"
                  title="Nhấn để mở trang tính trong tab mới"
                >
                  {settings.googleSheetUrl}
                </a>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
              <a
                href={settings.googleSheetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1 shadow-2xs"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Mở Ngay</span>
              </a>

              <button
                type="button"
                onClick={handleCopySheetUrl}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1"
                title="Sao chép đường link Google Sheet"
              >
                {copiedSheetLink ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                <span>{copiedSheetLink ? 'Đã chép' : 'Sao chép'}</span>
              </button>

              <button
                type="button"
                onClick={() => setIsEditingSheetUrl(true)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold transition-all cursor-pointer"
              >
                Đổi link
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white p-3.5 rounded-xl border border-dashed border-emerald-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs text-slate-600">
              <span className="font-bold text-slate-800 block">Chưa lưu đường link file Google Sheet</span>
              <span className="text-[11px] text-slate-500">
                Thêm link để có nút bấm 1-chạm mở trực tiếp Google Sheet khi cần kiểm tra.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsEditingSheetUrl(true)}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-all shrink-0 flex items-center gap-1.5"
            >
              <Link2 className="w-3.5 h-3.5" />
              <span>Thêm Link Google Sheet</span>
            </button>
          </div>
        )}
      </div>

      {/* 3. Khung Cấu Hình URL Google Apps Script Web App */}
      <div className="bg-slate-50/80 border border-emerald-200/80 rounded-2xl p-4 sm:p-5 space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Link2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="text-xs sm:text-sm font-bold text-slate-800">
              Đường Link Google Apps Script Web App
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowInstructions(!showInstructions)}
              className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 underline flex items-center gap-1 cursor-pointer"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>{showInstructions ? 'Thu gọn hướng dẫn' : 'Xem hướng dẫn tạo link'}</span>
            </button>
          </div>
        </div>

        {/* Input & Save Box */}
        {isEditingUrl ? (
          <div className="space-y-2">
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="url"
                value={appsScriptUrlInput}
                onChange={(e) => setAppsScriptUrlInput(e.target.value)}
                placeholder="https://script.google.com/macros/s/AKfycb.../exec"
                className="flex-1 px-3.5 py-2.5 text-xs font-mono rounded-xl border border-emerald-300 bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-slate-900"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveAppsScriptUrl}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-xs font-bold cursor-pointer shadow-xs transition-all shrink-0"
                >
                  Lưu &amp; Kích Hoạt
                </button>
                {settings.googleAppsScriptUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      setAppsScriptUrlInput(settings.googleAppsScriptUrl || '');
                      setIsEditingUrl(false);
                    }}
                    className="px-3 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer shrink-0"
                  >
                    Hủy
                  </button>
                )}
              </div>
            </div>
            <p className="text-[10.5px] text-slate-500">
              * URL có định dạng kết thúc bằng <code>/exec</code> lấy từ mục Triển khai (Deploy) trong Google Apps Script.
            </p>
          </div>
        ) : (
          <div className="bg-white p-3 sm:p-3.5 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0"></span>
              <div className="min-w-0">
                <span className="text-[10.5px] uppercase font-bold text-slate-400 block tracking-wider">
                  URL Đang Đồng Bộ
                </span>
                <span className="font-mono text-xs text-slate-800 truncate block max-w-sm sm:max-w-md select-all">
                  {settings.googleAppsScriptUrl}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={isTestingUrl || isSyncing}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1 disabled:opacity-50"
                title="Gửi dữ liệu thử nghiệm để kiểm tra kết nối với Google Sheet"
              >
                <RefreshCw className={`w-3 h-3 ${isTestingUrl ? 'animate-spin' : ''}`} />
                <span>{isTestingUrl ? 'Đang thử...' : 'Kiểm tra'}</span>
              </button>

              <button
                type="button"
                onClick={() => setIsEditingUrl(true)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold transition-all cursor-pointer"
              >
                Đổi URL
              </button>

              <button
                type="button"
                onClick={async () => {
                  setAppsScriptUrlInput('');
                  await onSaveSettings({ ...settings, googleAppsScriptUrl: undefined });
                  setIsEditingUrl(true);
                  showToast('Đã xóa liên kết Apps Script.', 'info');
                }}
                className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                title="Xóa liên kết này"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Syncing status indicator */}
        {isSyncing && syncStatusStep && (
          <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs font-medium text-emerald-800 flex items-center gap-2 animate-pulse">
            <RefreshCw className="w-4 h-4 animate-spin text-emerald-600 shrink-0" />
            <span>{syncStatusStep}</span>
          </div>
        )}

        {/* Last sync info */}
        {lastSyncDateStr && (
          <div className="text-[11px] text-slate-500 pt-1 flex items-center justify-between">
            <span>Lần đồng bộ thành công gần nhất: <strong>{lastSyncDateStr}</strong></span>
            {syncResult?.summary && (
              <span className="text-emerald-700 font-semibold">
                Đã ghi {syncResult.summary.debtorsCount} người, {syncResult.summary.transactionsCount} giao dịch
              </span>
            )}
          </div>
        )}
      </div>

      {/* 4. Hướng dẫn 3 Bước Cực Kỳ Đơn Giản & Nút 1-Click Copy Mã */}
      {showInstructions && (
        <div className="bg-emerald-50/60 border border-emerald-200 rounded-2xl p-4 sm:p-5 space-y-3.5 animate-in fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-emerald-200/70 pb-3">
            <div>
              <span className="text-xs sm:text-sm font-extrabold text-emerald-950 flex items-center gap-1.5">
                <Code className="w-4 h-4 text-emerald-700" />
                Hướng Dẫn Cài Đặt Trên Google Sheet (Chỉ Mất 1 Phút)
              </span>
              <p className="text-[11px] text-emerald-800 mt-0.5">
                Sao chép đoạn mã có sẵn bên dưới và dán vào Apps Script của trang tính Google Sheet của bạn.
              </p>
            </div>

            <button
              type="button"
              onClick={copyAppsScriptTemplate}
              className="px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 text-white text-xs font-bold flex items-center gap-1.5 shrink-0 shadow-xs cursor-pointer transition-all active:scale-98"
            >
              {scriptCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{scriptCopied ? 'Đã sao chép mã thành công!' : 'Sao chép mã Apps Script (1-Click)'}</span>
            </button>
          </div>

          <div className="space-y-2 text-xs text-slate-700 bg-white/90 p-3.5 sm:p-4 rounded-xl border border-emerald-200/60">
            <ol className="list-decimal list-inside text-xs space-y-2 text-slate-700 pl-1 leading-relaxed">
              <li>
                Mở file Google Sheet bất kỳ trên Google Drive của bạn ➔ chọn thanh menu: <strong>Tiện ích mở rộng (Extensions) ➔ Apps Script</strong>.
              </li>
              <li>
                Xóa toàn bộ nội dung code cũ trong file <code>Code.gs</code>, bấm nút <strong>&quot;Sao chép mã Apps Script (1-Click)&quot;</strong> ở trên rồi dán vào ➔ Nhấn <strong>Lưu (Ctrl + S)</strong>.
              </li>
              <li>
                Bấm nút <strong>Triển khai (Deploy) ➔ Triển khai mới (New deployment)</strong>:
                <div className="pl-4 pt-1 space-y-1 text-[11.5px] text-slate-600">
                  <div>- Chọn loại: <strong>Ứng dụng web (Web app)</strong></div>
                  <div>- Người thực thi (Execute as): <strong>Tôi (Tài khoản của bạn)</strong></div>
                  <div className="text-emerald-900 font-bold">
                    - Ai có quyền truy cập (Who has access): Chọn <strong>&quot;Bất kỳ ai&quot; (Anyone)</strong>
                  </div>
                  <div>- Bấm <strong>Triển khai</strong> ➔ Cấp quyền tài khoản ➔ Sao chép <strong>URL ứng dụng web</strong> (có dạng <code>https://script.google.com/macros/s/.../exec</code>) và dán vào ô bên trên!</div>
                </div>
              </li>
            </ol>
          </div>
        </div>
      )}

      {/* 5. Cấu Trúc 4 Tab Google Sheet Tự Động Tạo */}
      <div className="bg-white border border-slate-200/90 rounded-3xl p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-black text-slate-900 tracking-tight flex items-center gap-2">
                <span>Cấu Trúc 4 Tab Google Sheet Tự Động Đồng Bộ</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Chuẩn hóa 100%
                </span>
              </h4>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Google Apps Script sẽ tự động sinh và sắp xếp 4 trang tính này trên file Google Sheet của bạn
              </p>
            </div>
          </div>
        </div>

        {/* 4 Tabs Breakdown Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Tab 1: Tổng Hợp Công Nợ */}
          <div className="p-3.5 rounded-2xl bg-emerald-50/50 border border-emerald-200/80 flex flex-col justify-between space-y-2.5">
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-900">
                  <Users className="w-3.5 h-3.5 text-emerald-600" />
                  Tab 1: Tổng Hợp Công Nợ
                </span>
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-lg">
                  {debtors.length} người nợ
                </span>
              </div>
              <div className="mt-2 space-y-1 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Tổng tiền bạn cần thu:</span>
                  <span className="font-extrabold text-emerald-700">{formatVND(stats.totalReceivable)}</span>
                </div>
                {stats.totalPayable > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>Tổng tiền bạn cần trả:</span>
                    <span className="font-bold text-rose-600">{formatVND(stats.totalPayable)}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="text-[10.5px] text-slate-500 border-t border-emerald-200/50 pt-2 flex items-center justify-between">
              <span>Cột: Họ tên, Dư nợ, Trạng thái, Tổng nợ (+), Đã trả (-), Mã PIN</span>
              <span className="text-emerald-700 font-bold">Cập nhật số dư mới nhất</span>
            </div>
          </div>

          {/* Tab 2: Lịch Sử Giao Dịch */}
          <div className="p-3.5 rounded-2xl bg-blue-50/50 border border-blue-200/80 flex flex-col justify-between space-y-2.5">
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-900">
                  <Receipt className="w-3.5 h-3.5 text-blue-600" />
                  Tab 2: Lịch Sử Giao Dịch
                </span>
                <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-lg">
                  {transactions.length} giao dịch
                </span>
              </div>
              <div className="mt-2 space-y-1 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Ghi nợ (+):</span>
                  <span className="font-bold text-blue-700">{stats.debtTxCount} lần ({formatVND(stats.totalDebtVolume)})</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Trả nợ (-):</span>
                  <span className="font-bold text-emerald-700">{stats.paymentTxCount} lần ({formatVND(stats.totalPaymentVolume)})</span>
                </div>
              </div>
            </div>
            <div className="text-[10.5px] text-slate-500 border-t border-blue-200/50 pt-2 flex items-center justify-between">
              <span>Cột: Ngày, Người nợ, Loại (+/-), Số tiền, Nội dung, Cuộc vui</span>
              <span className="text-blue-700 font-bold">Lịch sử chi tiết</span>
            </div>
          </div>

          {/* Tab 3: Các Cuộc Chia Tiền */}
          <div className="p-3.5 rounded-2xl bg-purple-50/50 border border-purple-200/80 flex flex-col justify-between space-y-2.5">
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-purple-900">
                  <Utensils className="w-3.5 h-3.5 text-purple-600" />
                  Tab 3: Các Cuộc Chia Tiền
                </span>
                <span className="text-[10px] font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-lg">
                  {parties.length} cuộc vui
                </span>
              </div>
              <div className="mt-2 space-y-1 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Tổng ngân sách cuộc vui:</span>
                  <span className="font-extrabold text-purple-700">{formatVND(stats.totalPartyAmount)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Phân bổ tiền từng người:</span>
                  <span className="font-medium text-slate-700">Đã tự động tính vào sổ nợ</span>
                </div>
              </div>
            </div>
            <div className="text-[10.5px] text-slate-500 border-t border-purple-200/50 pt-2 flex items-center justify-between">
              <span>Cột: Ngày, Tên tiệc, Tổng tiền, Số người, Tiền/người, Ghi chú</span>
              <span className="text-purple-700 font-bold">Danh sách tiệc</span>
            </div>
          </div>

          {/* Tab 4: Nhật Ký Thao Tác - LƯU VĨNH VIỄN */}
          <div className="p-3.5 rounded-2xl bg-amber-50/60 border border-amber-200/90 flex flex-col justify-between space-y-2.5">
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-950">
                  <ClipboardList className="w-3.5 h-3.5 text-amber-700" />
                  Tab 4: Nhật Ký Thao Tác (Logs)
                </span>
                <span className="text-[10px] font-black text-amber-900 bg-amber-200/80 px-2 py-0.5 rounded-lg border border-amber-300">
                  LƯU VĨNH VIỄN
                </span>
              </div>
              <div className="mt-2 space-y-1 text-xs">
                <div className="flex justify-between items-center text-slate-700">
                  <span>Quy tắc lưu trữ:</span>
                  <span className="font-black text-amber-900 bg-amber-100 px-1.5 py-0.5 rounded text-[10.5px]">
                    Chỉ ghi thêm (Append-Only)
                  </span>
                </div>
                <div className="flex justify-between items-center text-slate-600 text-[11px]">
                  <span>Khi xóa trên ứng dụng:</span>
                  <span className="text-emerald-700 font-extrabold">Không bao giờ mất trên Sheets</span>
                </div>
              </div>
            </div>
            <div className="text-[10.5px] text-slate-600 border-t border-amber-200/60 pt-2 flex items-center justify-between">
              <span>Cột: STT, Thời gian, Người làm, Thao tác, Tiêu đề, Người nợ, Số tiền, Chi tiết, Mã ID</span>
              <span className="text-amber-800 font-black">Bảo toàn trọn đời</span>
            </div>
          </div>
        </div>
      </div>

      {/* 6. Công Tắc Tự Động Đồng Bộ Ngầm (Auto-Sync) */}
      <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-3">
          <div
            className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 transition-colors ${
              isAutoSyncEnabled && isConnected
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-slate-200 text-slate-500'
            }`}
          >
            <RefreshCw
              className={`w-5 h-5 ${isAutoSyncing ? 'animate-spin text-emerald-600' : ''}`}
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-900">
                Tự Động Đồng Bộ Ngầm Sau 2 Giây (Auto-Sync)
              </span>
              {isAutoSyncing ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 animate-pulse">
                  <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                  Đang đồng bộ...
                </span>
              ) : isAutoSyncEnabled && isConnected ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"></span>
                  Đang bật
                </span>
              ) : (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">
                  Đã tắt
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
              Mỗi khi bạn thêm người nợ, ghi nợ, trả nợ hay chia tiền tiệc, hệ thống sẽ tự động cập nhật sang Google Sheets sau 2 giây mà không cần thao tác bấm nút.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
          <button
            type="button"
            onClick={handleToggleAutoSync}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
              isAutoSyncEnabled && isConnected ? 'bg-emerald-600' : 'bg-slate-300'
            }`}
            role="switch"
            aria-checked={isAutoSyncEnabled && isConnected}
            title={isAutoSyncEnabled ? 'Bấm để tắt tự động đồng bộ' : 'Bấm để bật tự động đồng bộ'}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                isAutoSyncEnabled && isConnected ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  );
};
