import React, { useState, useEffect, useMemo } from 'react';
import {
  FileSpreadsheet,
  ExternalLink,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  LogOut,
  Download,
  Copy,
  Check,
  Key,
  ShieldAlert,
  ShieldCheck,
  FolderSync,
  HelpCircle,
  X,
  Users,
  Receipt,
  Utensils,
  ClipboardList,
  Database,
  Layers,
  ArrowUpRight,
  Lock,
  Globe,
  Settings2,
  Code,
} from 'lucide-react';
import { AppSettings, Debtor, Transaction, PartySplit } from '../types';
import { loadAuditLogs } from '../utils/storage';
import { formatVND } from '../utils/vietqr';
import {
  initGoogleAuth,
  signInWithGoogle,
  signOutGoogle,
  syncDatabaseToGoogleSheets,
  syncViaAppsScript,
  GOOGLE_APPS_SCRIPT_TEMPLATE,
  getGoogleAccessToken,
  getCurrentGoogleUser,
  setManualAccessToken,
  exportGoogleSheetsCsvFile,
  getCurrentDomain,
  triggerDebouncedAutoSync,
  getActiveOAuthClientId,
  setCustomOAuthClientId,
  SyncResult,
  GoogleUserProfile,
} from '../services/googleSheetsService';

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
  const [googleUser, setGoogleUser] = useState<GoogleUserProfile | null>(() => getCurrentGoogleUser());
  const [hasToken, setHasToken] = useState<boolean>(() => Boolean(getGoogleAccessToken()));
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatusStep, setSyncStatusStep] = useState<string>('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [isAutoSyncing, setIsAutoSyncing] = useState(false);
  const isAutoSyncEnabled = settings.autoSyncGoogleSheets !== false;

  // Custom Google OAuth Client ID State (Fixes origin_mismatch on Vercel)
  const [customClientIdInput, setCustomClientIdInput] = useState<string>(() => settings.customGoogleClientId || '');
  const [activeClientId, setActiveClientId] = useState<string>(() => getActiveOAuthClientId(settings));
  const [showClientIdConfig, setShowClientIdConfig] = useState(false);
  const [vercelOriginCopied, setVercelOriginCopied] = useState(false);

  // Google Apps Script Webhook State (Zero-OAuth sync - Không cần Client ID)
  const [appsScriptUrlInput, setAppsScriptUrlInput] = useState<string>(() => settings.googleAppsScriptUrl || '');
  const [showAppsScriptConfig, setShowAppsScriptConfig] = useState<boolean>(() => Boolean(settings.googleAppsScriptUrl));
  const [scriptCopied, setScriptCopied] = useState<boolean>(false);

  useEffect(() => {
    if (settings.customGoogleClientId !== undefined) {
      setCustomClientIdInput(settings.customGoogleClientId || '');
      setActiveClientId(getActiveOAuthClientId(settings));
    }
  }, [settings.customGoogleClientId]);

  useEffect(() => {
    if (settings.googleAppsScriptUrl !== undefined) {
      setAppsScriptUrlInput(settings.googleAppsScriptUrl || '');
    }
  }, [settings.googleAppsScriptUrl]);

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

  // Domain Authorization Help Modal State
  const [domainModalOpen, setDomainModalOpen] = useState(false);
  const [domainCopied, setDomainCopied] = useState(false);
  const [vercelDomainCopied, setVercelDomainCopied] = useState(false);
  const activeHostname = typeof window !== 'undefined' ? window.location.hostname : 'aeno.vercel.app';

  // Manual Token Input State
  const [showManualTokenInput, setShowManualTokenInput] = useState(false);
  const [manualToken, setManualToken] = useState('');
  const [manualEmail, setManualEmail] = useState('');

  // Real-time local audit logs count
  const [localAuditLogsCount, setLocalAuditLogsCount] = useState<number>(() => loadAuditLogs().length);

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

    const totalAddAmount = transactions
      .filter((t) => t.type === 'ADD')
      .reduce((sum, t) => sum + t.amount, 0);
    const totalSubAmount = transactions
      .filter((t) => t.type === 'SUB')
      .reduce((sum, t) => sum + t.amount, 0);

    const totalPartyAmount = parties.reduce((sum, p) => sum + (p.totalAmount || 0), 0);

    return {
      totalReceivable,
      totalPayable,
      receivableCount,
      payableCount,
      settledCount,
      totalAddAmount,
      totalSubAmount,
      totalPartyAmount,
    };
  }, [debtors, transactions, parties]);

  useEffect(() => {
    const unsubscribe = initGoogleAuth(
      (user, token) => {
        setGoogleUser(user);
        setHasToken(Boolean(token));
      },
      () => {
        setGoogleUser(null);
        setHasToken(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const handleGoogleSignIn = async () => {
    setIsSigningIn(true);
    try {
      const res = await signInWithGoogle(settings);
      setGoogleUser(res.user);
      setHasToken(true);
      showToast(`Đã kết nối tài khoản Google: ${res.user.email || res.user.displayName}`, 'success');

      // Auto-enable Auto-Sync once Google is connected and trigger debounced sync
      const updatedSettings: AppSettings = {
        ...settings,
        autoSyncGoogleSheets: true,
      };
      await onSaveSettings(updatedSettings);

      triggerDebouncedAutoSync({
        debtors,
        transactions,
        parties,
        settings: updatedSettings,
        auditLogs: loadAuditLogs(),
      });
    } catch (err: any) {
      if (err?.code === 'popup_closed' || err?.code === 'auth/popup-closed-by-user') {
        console.info('Google sign-in popup was closed by user.');
        showToast('Bạn đã đóng cửa sổ đăng nhập Google.', 'info');
        return;
      }
      console.error('Sign-in failed:', err);
      const errLower = String(err?.message || '').toLowerCase();
      if (
        err?.code === 'origin_mismatch' ||
        errLower.includes('origin_mismatch') ||
        errLower.includes('origin mismatch')
      ) {
        setDomainModalOpen(true);
        showToast(
          'Lỗi 400: origin_mismatch. Tên miền https://aeno.vercel.app chưa được thêm vào Google Cloud Console.',
          'error'
        );
      } else if (err?.code === 'auth/unauthorized-domain' || errLower.includes('unauthorized-domain')) {
        setDomainModalOpen(true);
        showToast('Tên miền chưa được thêm vào Firebase Authorized Domains.', 'error');
      } else if (err?.code === 'access_denied') {
        showToast(
          'Đã chặn quyền truy cập (Lỗi uỷ quyền): Cần thêm tài khoản vào Test Users trong Google Cloud Console.',
          'error'
        );
        setDomainModalOpen(true);
      } else {
        showToast(err?.message || 'Không thể đăng nhập Google. Vui lòng thử lại.', 'error');
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleGoogleSignOut = async () => {
    try {
      await signOutGoogle();
      setGoogleUser(null);
      setHasToken(false);
      showToast('Đã đăng xuất tài khoản Google.', 'success');
    } catch {
      showToast('Lỗi khi đăng xuất Google', 'error');
    }
  };

  const handleTriggerSync = () => {
    if (!hasToken && !settings.googleAppsScriptUrl) {
      handleGoogleSignIn();
      return;
    }
    setShowConfirmModal(true);
  };

  const executeSync = async () => {
    setShowConfirmModal(false);
    setIsSyncing(true);
    setSyncStatusStep('Đang chuẩn bị dữ liệu đồng bộ...');

    try {
      let result: SyncResult;
      if (settings.googleAppsScriptUrl && !hasToken) {
        setSyncStatusStep('Đang gửi dữ liệu sang Google Sheet qua Google Apps Script Web App (Không cần OAuth)...');
        result = await syncViaAppsScript(
          {
            debtors,
            transactions,
            parties,
            settings,
            auditLogs: loadAuditLogs(),
          },
          settings.googleAppsScriptUrl
        );
      } else {
        setSyncStatusStep('Đang kết nối Google Drive & tạo cấu trúc 4 tab (kèm Nhật ký thao tác)...');
        result = await syncDatabaseToGoogleSheets({
          debtors,
          transactions,
          parties,
          settings,
          auditLogs: loadAuditLogs(),
        });
      }

      setSyncResult(result);
      setSyncStatusStep('Đang hoàn tất lưu thông tin...');

      // Save Google Sheet URL & ID into settings
      const updatedSettings: AppSettings = {
        ...settings,
        googleSheetId: result.spreadsheetId !== 'apps_script' ? result.spreadsheetId : settings.googleSheetId,
        googleSheetUrl: result.spreadsheetUrl || settings.googleSheetUrl,
        lastGoogleSheetSyncAt: result.updatedAt,
      };
      await onSaveSettings(updatedSettings);

      showToast('Đã đồng bộ thành công toàn bộ dữ liệu lên Google Sheets!', 'success');
    } catch (err: any) {
      console.error('Error syncing to Google Sheets:', err);
      if (err?.code === 'auth/unauthorized-domain' || String(err?.message || '').includes('unauthorized-domain')) {
        setDomainModalOpen(true);
      } else {
        showToast(err?.message || 'Lỗi khi đồng bộ lên Google Sheets', 'error');
      }
    } finally {
      setIsSyncing(false);
      setSyncStatusStep('');
    }
  };

  const handleApplyManualToken = () => {
    if (!manualToken.trim()) {
      showToast('Vui lòng nhập Access Token Google', 'error');
      return;
    }
    setManualAccessToken(manualToken.trim(), manualEmail.trim() || undefined);
    setHasToken(true);
    setShowManualTokenInput(false);
    showToast('Đã áp dụng Access Token Google thành công!', 'success');
  };

  const handleExportCsv = () => {
    try {
      exportGoogleSheetsCsvFile({
        debtors,
        transactions,
        parties,
        settings,
      });
      showToast('Đã tải xuống tệp dữ liệu chuẩn Google Sheets!', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Lỗi xuất tệp dữ liệu', 'error');
    }
  };

  const copyDomainToClipboard = () => {
    navigator.clipboard.writeText(activeHostname);
    setDomainCopied(true);
    showToast(`Đã sao chép tên miền: ${activeHostname}`, 'success');
    setTimeout(() => setDomainCopied(false), 3000);
  };

  const copyVercelDomainToClipboard = () => {
    navigator.clipboard.writeText('aeno.vercel.app');
    setVercelDomainCopied(true);
    showToast('Đã sao chép tên miền: aeno.vercel.app (cho Firebase Console)', 'success');
    setTimeout(() => setVercelDomainCopied(false), 3000);
  };

  const copyVercelOriginToClipboard = () => {
    navigator.clipboard.writeText('https://aeno.vercel.app');
    setVercelOriginCopied(true);
    showToast('Đã sao chép URI nguồn: https://aeno.vercel.app (cho Google Cloud Console)', 'success');
    setTimeout(() => setVercelOriginCopied(false), 3000);
  };

  const handleSaveCustomClientId = async () => {
    const trimmed = customClientIdInput.trim();
    setCustomOAuthClientId(trimmed);
    const updatedSettings: AppSettings = {
      ...settings,
      customGoogleClientId: trimmed || undefined,
    };
    await onSaveSettings(updatedSettings);
    setActiveClientId(getActiveOAuthClientId(updatedSettings));
    showToast(
      trimmed
        ? 'Đã lưu Google OAuth Client ID cho Vercel thành công!'
        : 'Đã xóa Client ID riêng và dùng Client ID mặc định.',
      'success'
    );
  };

  const handleSaveAppsScriptUrl = async () => {
    const trimmed = appsScriptUrlInput.trim();
    if (trimmed && !trimmed.startsWith('https://script.google.com/')) {
      showToast('Đường link Google Apps Script phải bắt đầu bằng https://script.google.com/macros/s/...', 'error');
      return;
    }
    const updatedSettings: AppSettings = {
      ...settings,
      googleAppsScriptUrl: trimmed || undefined,
      autoSyncGoogleSheets: trimmed ? true : settings.autoSyncGoogleSheets,
    };
    await onSaveSettings(updatedSettings);
    showToast(
      trimmed
        ? 'Đã kết nối Google Apps Script thành công! Bạn có thể đồng bộ ngay.'
        : 'Đã xóa liên kết Google Apps Script.',
      'success'
    );
  };

  const copyAppsScriptTemplate = () => {
    navigator.clipboard.writeText(GOOGLE_APPS_SCRIPT_TEMPLATE);
    setScriptCopied(true);
    showToast('Đã sao chép toàn bộ mã Google Apps Script!', 'success');
    setTimeout(() => setScriptCopied(false), 3000);
  };

  const handleToggleAutoSync = async () => {
    if (!hasToken && !isAutoSyncEnabled) {
      showToast('Vui lòng kết nối tài khoản Google trước khi bật tự động đồng bộ.', 'error');
      handleGoogleSignIn();
      return;
    }
    const nextVal = !isAutoSyncEnabled;
    const updatedSettings: AppSettings = {
      ...settings,
      autoSyncGoogleSheets: nextVal,
    };
    await onSaveSettings(updatedSettings);

    if (nextVal && hasToken) {
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
        ? 'Đã BẬT tự động đồng bộ ngầm: Mọi giao dịch mới sẽ tự lưu sang Google Sheets sau 2 giây!'
        : 'Đã TẮT tự động đồng bộ Google Sheets.',
      'success'
    );
  };

  const handleTestAutoSync = () => {
    if (!hasToken) {
      showToast('Vui lòng kết nối tài khoản Google trước khi thử nghiệm Auto-Sync.', 'error');
      handleGoogleSignIn();
      return;
    }
    showToast('Đang kích hoạt Auto-Sync ngầm (chờ 2s debounce)...', 'info');
    triggerDebouncedAutoSync({
      debtors,
      transactions,
      parties,
      settings: { ...settings, autoSyncGoogleSheets: true },
      auditLogs: loadAuditLogs(),
    });
  };

  const spreadsheetUrl = settings.googleSheetUrl || syncResult?.spreadsheetUrl;
  const lastSyncDateStr = settings.lastGoogleSheetSyncAt
    ? new Date(settings.lastGoogleSheetSyncAt).toLocaleString('vi-VN')
    : null;

  return (
    <div className="bg-white rounded-3xl p-5 sm:p-6 border border-emerald-200/80 shadow-xs space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
            <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-extrabold text-slate-900">
                Đồng Bộ Google Sheets &amp; Google Drive
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                100% Cloud
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Lưu trữ đám mây chuẩn Google Sheets, trực quan hóa mọi số liệu nợ và lịch sử giao dịch.
            </p>
          </div>
        </div>

        {/* Google Auth Status Badge / Sign in button */}
        <div className="flex items-center gap-2 flex-wrap">
          {googleUser && hasToken ? (
            <div className="flex items-center gap-2 bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1.5 rounded-2xl text-xs font-semibold">
              {googleUser.photoURL ? (
                <img
                  src={googleUser.photoURL}
                  alt={googleUser.displayName || 'Google User'}
                  className="w-5 h-5 rounded-full border border-emerald-300"
                />
              ) : (
                <div className="w-5 h-5 rounded-full bg-emerald-600 text-white text-[10px] flex items-center justify-center font-bold">
                  {(googleUser.displayName || googleUser.email || 'G')[0].toUpperCase()}
                </div>
              )}
              <span className="max-w-[130px] sm:max-w-[180px] truncate">
                {googleUser.displayName || googleUser.email}
              </span>
              <button
                type="button"
                onClick={handleGoogleSignOut}
                title="Đăng xuất tài khoản Google"
                className="p-1 hover:bg-emerald-200/60 rounded-lg text-emerald-700 transition-colors ml-1 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isSigningIn}
                className="px-3.5 py-2 rounded-2xl text-xs font-bold border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 shadow-xs flex items-center gap-2 cursor-pointer transition-all disabled:opacity-50"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 48 48">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                  <path fill="none" d="M0 0h48v48H0z" />
                </svg>
                <span>{isSigningIn ? 'Đang kết nối...' : 'Đăng nhập Google'}</span>
              </button>

              <button
                type="button"
                onClick={() => setDomainModalOpen(true)}
                title="Hướng dẫn ủy quyền tên miền"
                className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <HelpCircle className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Cloud-first reassurance note */}
      <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 text-xs text-slate-600 flex items-start gap-2.5">
        <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-slate-800">
            Dữ liệu lưu 100% trên Cloud Firestore &amp; Đồng bộ sang Google Sheets
          </p>
          <p className="text-slate-500 text-[11px] leading-relaxed">
            Hệ thống không ghi dữ liệu vào tệp cục bộ trên máy chủ. Bạn có thể đồng bộ trực tiếp lên Google Drive hoặc tải tệp Excel/CSV chuẩn 4 tab (bao gồm Nhật ký thao tác) để mở ngay trên Google Sheets.
          </p>
        </div>
      </div>

      {/* Active Spreadsheet Status Card */}
      {spreadsheetUrl ? (
        <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-emerald-700 shrink-0" />
              <span className="text-xs font-bold text-emerald-950 truncate">
                {syncResult?.title || `[AENO] Sổ Nợ & Đối Soát - ${settings.ownerName || 'Chủ Sổ'}`}
              </span>
            </div>
            {lastSyncDateStr && (
              <span className="text-[11px] text-emerald-700 font-medium">
                Đồng bộ gần nhất: {lastSyncDateStr}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 py-1 text-center text-xs">
            <div className="bg-white/80 rounded-xl p-2 border border-emerald-100">
              <div className="text-[10px] text-slate-500 font-medium">Tab 1: Công Nợ</div>
              <div className="text-sm font-extrabold text-emerald-700 mt-0.5">
                {debtors.length} người
              </div>
            </div>
            <div className="bg-white/80 rounded-xl p-2 border border-emerald-100">
              <div className="text-[10px] text-slate-500 font-medium">Tab 2: Lịch Sử</div>
              <div className="text-sm font-extrabold text-emerald-700 mt-0.5">
                {transactions.length} giao dịch
              </div>
            </div>
            <div className="bg-white/80 rounded-xl p-2 border border-emerald-100">
              <div className="text-[10px] text-slate-500 font-medium">Tab 3: Chia Bill</div>
              <div className="text-sm font-extrabold text-emerald-700 mt-0.5">
                {parties.length} cuộc vui
              </div>
            </div>
            <div className="bg-white/80 rounded-xl p-2 border border-emerald-100">
              <div className="text-[10px] text-slate-500 font-medium">Tab 4: Nhật Ký Logs</div>
              <div className="text-sm font-extrabold text-teal-700 mt-0.5">
                {syncResult?.summary?.auditLogsCount || 'Đầy đủ'} bản ghi
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <a
              href={spreadsheetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-xs"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Mở Google Sheets</span>
            </a>

            <button
              type="button"
              onClick={handleTriggerSync}
              disabled={isSyncing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-emerald-100/70 border border-emerald-300 text-emerald-800 text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Đang đồng bộ...' : 'Đồng bộ lại'}</span>
            </button>

            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-all cursor-pointer ml-auto"
              title="Tải tệp bảng tính mở trên Google Sheets"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Tải file Sheets (CSV)</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="border border-dashed border-slate-200 rounded-2xl p-4 text-center space-y-3 bg-slate-50/50">
          <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
            <FolderSync className="w-5 h-5 text-slate-500" />
          </div>
          <div className="space-y-1">
            <p className="text-xs font-bold text-slate-700">Chưa có bảng tính trên Google Drive</p>
            <p className="text-[11px] text-slate-500 max-w-md mx-auto">
              Nhấn nút bên dưới để tạo bảng tính Google Sheets tự động, lưu toàn bộ {debtors.length} người nợ và {transactions.length} giao dịch một cách có cấu trúc và dễ xem.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleTriggerSync}
              disabled={isSyncing}
              className="px-4 py-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Đang tạo & đồng bộ...' : 'Đồng Bộ Lên Google Sheets Ngay'}</span>
            </button>

            <button
              type="button"
              onClick={handleExportCsv}
              className="px-3.5 py-2 rounded-2xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Tải File Mở Trực Tiếp Trên Sheets</span>
            </button>
          </div>
        </div>
      )}

      {/* THỐNG KÊ DỮ LIỆU CẬP NHẬT BẢNG TÍNH (4 TAB ĐỒNG BỘ) */}
      <div className="bg-white border border-slate-200/90 rounded-3xl p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 tracking-tight flex items-center gap-2">
                <span>Thống Kê Dữ Liệu Cập Nhật Bảng Tính</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  4 Tab Chuẩn
                </span>
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Cấu trúc bảng tính Google Sheets và các số liệu sẵn sàng đồng bộ hoặc đang lưu trữ
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="text-[11px] font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-xl">
              Tổng quan 4 Sheet
            </span>
          </div>
        </div>

        {/* 4 Tabs Breakdown Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Tab 1: Sổ Công Nợ */}
          <div className="p-3.5 rounded-2xl bg-emerald-50/50 border border-emerald-200/80 flex flex-col justify-between space-y-2.5">
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-900">
                  <Users className="w-3.5 h-3.5 text-emerald-600" />
                  Tab 1: Sổ Công Nợ
                </span>
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-lg">
                  {debtors.length} người nợ
                </span>
              </div>
              <div className="mt-2 space-y-1 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Phải thu từ khách:</span>
                  <span className="font-extrabold text-emerald-700">{formatVND(stats.totalReceivable)}</span>
                </div>
                {stats.totalPayable > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>Phải trả lại khách:</span>
                    <span className="font-bold text-rose-600">{formatVND(stats.totalPayable)}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="text-[10px] text-slate-400 border-t border-emerald-200/50 pt-2 flex items-center justify-between">
              <span>Cột: Mã, Tên, SĐT, Dư nợ, Trạng thái, Cập nhật, Ghi chú</span>
              <span className="text-emerald-700 font-semibold">Ghi đè mới nhất</span>
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
                  <span>Phát sinh nợ (+):</span>
                  <span className="font-bold text-blue-700">{stats.debtTxCount} lượt ({formatVND(stats.totalDebtVolume)})</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Đã thu/trả (-):</span>
                  <span className="font-bold text-emerald-700">{stats.paymentTxCount} lượt ({formatVND(stats.totalPaymentVolume)})</span>
                </div>
              </div>
            </div>
            <div className="text-[10px] text-slate-400 border-t border-blue-200/50 pt-2 flex items-center justify-between">
              <span>Cột: Mã GD, Thời gian, Tên, Loại (+/-), Số tiền, Phương thức</span>
              <span className="text-blue-700 font-semibold">Dòng thời gian</span>
            </div>
          </div>

          {/* Tab 3: Chia Tiền Cuộc Vui */}
          <div className="p-3.5 rounded-2xl bg-purple-50/50 border border-purple-200/80 flex flex-col justify-between space-y-2.5">
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-purple-900">
                  <Utensils className="w-3.5 h-3.5 text-purple-600" />
                  Tab 3: Chia Tiền Cuộc Vui
                </span>
                <span className="text-[10px] font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-lg">
                  {parties.length} cuộc vui
                </span>
              </div>
              <div className="mt-2 space-y-1 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Tổng ngân sách chi tiêu:</span>
                  <span className="font-extrabold text-purple-700">{formatVND(stats.totalPartyAmount)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Trạng thái chia bill:</span>
                  <span className="font-medium text-slate-700">Đã phân bổ vào sổ nợ</span>
                </div>
              </div>
            </div>
            <div className="text-[10px] text-slate-400 border-t border-purple-200/50 pt-2 flex items-center justify-between">
              <span>Cột: Mã tiệc, Tiêu đề, Tổng tiền, Số người, Tiền/người, Người ứng</span>
              <span className="text-purple-700 font-semibold">Danh sách tiệc</span>
            </div>
          </div>

          {/* Tab 4: Nhật Ký Logs - Append-Only */}
          <div className="p-3.5 rounded-2xl bg-amber-50/60 border border-amber-200/90 flex flex-col justify-between space-y-2.5">
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-950">
                  <ClipboardList className="w-3.5 h-3.5 text-amber-700" />
                  Tab 4: Nhật Ký Thao Tác & Kiểm Vết
                </span>
                <span className="text-[10px] font-black text-amber-800 bg-amber-100 px-2 py-0.5 rounded-lg border border-amber-300">
                  {localAuditLogsCount} bản ghi app
                </span>
              </div>
              <div className="mt-2 space-y-1 text-xs">
                <div className="flex justify-between items-center text-slate-700">
                  <span>Cơ chế bảo toàn Sheets:</span>
                  <span className="font-black text-amber-900 bg-amber-200/70 px-1.5 py-0.5 rounded text-[10px]">
                    Chỉ ghi thêm (Append-Only)
                  </span>
                </div>
                <div className="flex justify-between items-center text-slate-600 text-[11px]">
                  <span>Làm sạch trên app:</span>
                  <span className="text-emerald-700 font-bold">Không làm mất log Sheets</span>
                </div>
              </div>
            </div>
            <div className="text-[10px] text-slate-500 border-t border-amber-200/60 pt-2 flex items-center justify-between">
              <span>Cột: Mã ID, Thời gian, Thao tác, Chi tiết, Trước (Before), Sau (After), Người làm</span>
              <span className="text-amber-800 font-black">Không bao giờ xóa</span>
            </div>
          </div>
        </div>

        {/* Append-Only Protection Banner */}
        <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3 text-xs text-slate-600 flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div className="text-[11px] leading-relaxed">
            <span className="font-bold text-slate-800">Quy tắc bảo vệ Nhật ký trên Google Sheets: </span>
            Khi bạn sử dụng tính năng <span className="font-semibold text-rose-700">&quot;Làm sạch nhật ký&quot;</span> trong tab Nhật Ký để giải phóng bộ nhớ ứng dụng, các bản ghi cũ trên Google Sheets (Tab 4) <span className="font-bold text-emerald-700">vẫn được lưu trữ vĩnh viễn và không bao giờ bị xóa</span>. Mỗi lần đồng bộ, hệ thống tự động đối chiếu ID và chỉ ghi thêm (append) các bản ghi mới.
          </div>
        </div>
      </div>

      {/* Auto-Sync Toggle Control (Proposal 9) */}
      <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-3">
          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 transition-colors ${
            isAutoSyncEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'
          }`}>
            <RefreshCw className={`w-5 h-5 ${isAutoSyncing ? 'animate-spin text-emerald-600' : ''}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-900">
                Tự Động Đồng Bộ Ngầm (Auto-Sync)
              </span>
              {isAutoSyncing ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 animate-pulse">
                  <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                  Đang đồng bộ ngầm...
                </span>
              ) : isAutoSyncEnabled ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"></span>
                  Đang bật (Debounce 2s)
                </span>
              ) : (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">
                  Đã tắt
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
              Tự động lưu thay đổi mới nhất (thêm giao dịch, trả nợ, chia bill) lên Google Sheets sau 2 giây mà không cần bấm thủ công.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
          <button
            type="button"
            onClick={handleTestAutoSync}
            disabled={isAutoSyncing}
            className="px-2.5 py-1.5 rounded-xl text-[11px] font-bold border border-emerald-300 bg-white hover:bg-emerald-50 text-emerald-800 transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Kích hoạt thử nghiệm chu trình Auto-Sync (debounce 2 giây)"
          >
            <RefreshCw className={`w-3 h-3 ${isAutoSyncing ? 'animate-spin text-emerald-600' : ''}`} />
            <span>Thử Auto-Sync</span>
          </button>

          <button
            type="button"
            onClick={handleToggleAutoSync}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              isAutoSyncEnabled ? 'bg-emerald-600' : 'bg-slate-300'
            }`}
            role="switch"
            aria-checked={isAutoSyncEnabled}
            title={isAutoSyncEnabled ? 'Nhấn để tắt tự động đồng bộ' : 'Nhấn để bật tự động đồng bộ'}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                isAutoSyncEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Advanced Settings Row: Google Apps Script Web App, Custom Client ID for Vercel & Manual Token */}
      <div className="pt-1 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          {/* Apps Script Zero-OAuth Sync Button */}
          <button
            type="button"
            onClick={() => {
              setShowAppsScriptConfig(!showAppsScriptConfig);
              setShowClientIdConfig(false);
            }}
            className={`text-[11px] font-bold transition-all inline-flex items-center gap-1.5 cursor-pointer px-3 py-1.5 rounded-xl border ${
              settings.googleAppsScriptUrl
                ? 'bg-emerald-100 text-emerald-900 border-emerald-300 shadow-2xs'
                : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
            }`}
          >
            <Code className="w-3.5 h-3.5 text-emerald-600" />
            <span>{showAppsScriptConfig ? 'Ẩn Apps Script' : 'Đồng bộ qua Apps Script (Khuyên dùng - Không cần OAuth)'}</span>
            {settings.googleAppsScriptUrl ? (
              <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-emerald-600 text-white font-extrabold">Đã bật</span>
            ) : (
              <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-emerald-200 text-emerald-800 font-bold">Dễ nhất</span>
            )}
          </button>

          {/* Client ID Toggle */}
          <button
            type="button"
            onClick={() => {
              setShowClientIdConfig(!showClientIdConfig);
              setShowAppsScriptConfig(false);
            }}
            className="text-[11px] text-slate-600 hover:text-slate-800 font-medium transition-colors inline-flex items-center gap-1.5 cursor-pointer bg-slate-100 hover:bg-slate-200/80 px-2.5 py-1.5 rounded-xl border border-slate-200"
          >
            <Settings2 className="w-3.5 h-3.5" />
            <span>{showClientIdConfig ? 'Ẩn Client ID' : 'OAuth Client ID'}</span>
            {settings.customGoogleClientId && (
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            )}
          </button>
        </div>

        <button
          type="button"
          onClick={() => setShowManualTokenInput(!showManualTokenInput)}
          className="text-[11px] text-slate-400 hover:text-slate-700 font-medium transition-colors inline-flex items-center gap-1 cursor-pointer ml-auto"
        >
          <Key className="w-3 h-3" />
          <span>{showManualTokenInput ? 'Ẩn token' : 'Token tạm thời'}</span>
        </button>
      </div>

      {/* Google Apps Script Web App Configuration Box (Zero-OAuth, No origin_mismatch) */}
      {showAppsScriptConfig && (
        <div className="bg-emerald-50/60 border border-emerald-200 rounded-2xl p-4 space-y-3 animate-in fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-emerald-200/60 pb-2.5">
            <div>
              <span className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                <Code className="w-4 h-4 text-emerald-600" />
                Đồng Bộ Google Sheets Bằng Google Apps Script (100% Không Lỗi origin_mismatch)
              </span>
              <p className="text-[11px] text-emerald-800/80 mt-0.5">
                Không cần tạo Google Cloud Project, không cần Client ID, không bao giờ bị Google chặn trên bất kỳ tên miền nào!
              </p>
            </div>
            <button
              type="button"
              onClick={copyAppsScriptTemplate}
              className="px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold flex items-center gap-1.5 shrink-0 shadow-xs cursor-pointer"
            >
              {scriptCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{scriptCopied ? 'Đã sao chép mã Script' : 'Sao chép mã Apps Script'}</span>
            </button>
          </div>

          <div className="space-y-1.5 text-xs text-slate-700 bg-white/80 p-3 rounded-xl border border-emerald-200/60">
            <p className="font-bold text-slate-800 text-[11px]">3 Bước đơn giản trên Google Sheet của bạn (chỉ mất 1 phút):</p>
            <ol className="list-decimal list-inside text-[11px] space-y-1 text-slate-600 pl-1 leading-relaxed">
              <li>Mở Google Sheet trên Drive của bạn &gt; chọn <strong>Tiện ích mở rộng (Extensions) &gt; Apps Script</strong>.</li>
              <li>Xóa hết nội dung cũ, bấm nút <strong>&quot;Sao chép mã Apps Script&quot;</strong> ở trên rồi dán vào &gt; Nhấn <strong>Lưu (Ctrl+S)</strong>.</li>
              <li>Bấm <strong>Triển khai (Deploy) &gt; Triển khai mới (New deployment)</strong> &gt; Chọn <strong>Ứng dụng web (Web app)</strong>:
                <br />
                <span className="pl-4 text-[10px] text-emerald-800 font-semibold block mt-0.5">
                  - Ai có quyền truy cập (Who has access): Chọn <strong>&quot;Bất kỳ ai&quot; (Anyone)</strong>.
                </span>
                <span className="pl-4 text-[10px] text-slate-500 block">
                  - Bấm Triển khai &gt; Sao chép <strong>URL ứng dụng web</strong> (dạng <code>https://script.google.com/macros/s/.../exec</code>) và dán vào ô bên dưới:
                </span>
              </li>
            </ol>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-slate-700 block">Dán URL ứng dụng web Google Apps Script của bạn vào đây:</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={appsScriptUrlInput}
                onChange={(e) => setAppsScriptUrlInput(e.target.value)}
                placeholder="https://script.google.com/macros/s/AKfycb.../exec"
                className="flex-1 px-3 py-2 text-xs font-mono rounded-xl border border-emerald-300 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              <button
                type="button"
                onClick={handleSaveAppsScriptUrl}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold cursor-pointer shrink-0 shadow-xs"
              >
                Lưu URL
              </button>
            </div>
          </div>

          {settings.googleAppsScriptUrl && (
            <div className="flex items-center justify-between text-xs pt-1">
              <span className="text-emerald-700 font-bold flex items-center gap-1 text-[11px]">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Đã kết nối Apps Script: Sẵn sàng đồng bộ 4 tab tự động!
              </span>
              <button
                type="button"
                onClick={() => {
                  setAppsScriptUrlInput('');
                  const updated: AppSettings = { ...settings, googleAppsScriptUrl: undefined };
                  onSaveSettings(updated);
                  showToast('Đã xóa liên kết Apps Script', 'info');
                }}
                className="text-[10px] text-slate-400 hover:text-rose-600 underline cursor-pointer"
              >
                Hủy liên kết này
              </button>
            </div>
          )}
        </div>
      )}

      {/* Custom Google Client ID Configuration Box */}
      {showClientIdConfig && (
        <div className="bg-slate-50 border border-emerald-200 rounded-2xl p-4 space-y-3 animate-in fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
            <div>
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Globe className="w-4 h-4 text-emerald-600" />
                Google OAuth Client ID cho tên miền triển khai
              </span>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Dùng khi chạy trên <span className="font-bold text-slate-700">https://aeno.vercel.app</span> để khắc phục hoàn toàn <span className="text-rose-600 font-bold">Lỗi 400: origin_mismatch</span>.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDomainModalOpen(true)}
              className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 underline flex items-center gap-1 cursor-pointer shrink-0"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>Xem hướng dẫn 4 bước</span>
            </button>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <label className="font-semibold text-slate-700">Client ID từ Google Cloud Console của bạn:</label>
              {activeClientId && (
                <span className="text-[10px] text-slate-500 font-mono truncate max-w-[200px]">
                  Hiện tại: {activeClientId.slice(0, 16)}...
                </span>
              )}
            </div>
            <input
              type="text"
              value={customClientIdInput}
              onChange={(e) => setCustomClientIdInput(e.target.value)}
              placeholder="Dán Client ID dạng: 123456789-xxxxxxxx.apps.googleusercontent.com"
              className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
            <div className="text-[10px] text-slate-500">
              {settings.customGoogleClientId ? (
                <span className="text-emerald-700 font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  Đang dùng Client ID tùy chỉnh (Lưu trên máy &amp; đám mây)
                </span>
              ) : (
                <span>Chưa cài đặt Client ID riêng (Đang dùng mặc định của hệ thống)</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {settings.customGoogleClientId && (
                <button
                  type="button"
                  onClick={() => {
                    setCustomClientIdInput('');
                    handleSaveCustomClientId();
                  }}
                  className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-600 text-xs font-semibold cursor-pointer"
                >
                  Khôi phục mặc định
                </button>
              )}
              <button
                type="button"
                onClick={handleSaveCustomClientId}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold cursor-pointer shadow-xs"
              >
                Lưu Client ID
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Token Input Box */}
      {showManualTokenInput && (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-2.5 animate-in fade-in">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700">Dán Google OAuth Access Token tạm thời</span>
            <span className="text-[10px] text-slate-400">Chỉ lưu trong RAM, không lưu ổ đĩa</span>
          </div>
          <input
            type="text"
            value={manualToken}
            onChange={(e) => setManualToken(e.target.value)}
            placeholder="Dán token bắt đầu bằng ya29...."
            className="w-full px-3 py-1.5 text-xs font-mono rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
          <div className="flex items-center gap-2 justify-end">
            <button
              type="button"
              onClick={handleApplyManualToken}
              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold cursor-pointer"
            >
              Áp dụng token
            </button>
          </div>
        </div>
      )}

      {/* Syncing Progress Indicator */}
      {isSyncing && syncStatusStep && (
        <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-200 text-xs font-medium text-emerald-800 flex items-center gap-2 animate-pulse">
          <RefreshCw className="w-4 h-4 animate-spin text-emerald-600 shrink-0" />
          <span>{syncStatusStep}</span>
        </div>
      )}

      {/* Comprehensive Domain & OAuth Configuration Guidance Modal */}
      {domainModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl p-5 sm:p-6 max-w-xl w-full shadow-2xl border border-slate-100 space-y-4 max-h-[92vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                  <ShieldAlert className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h4 className="text-sm font-extrabold text-slate-900">
                    Khắc Phục Lỗi Đăng Nhập Google Trên aeno.vercel.app
                  </h4>
                  <p className="text-xs text-rose-600 font-bold">
                    Lỗi 400: origin_mismatch (Không thể đăng nhập)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDomainModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Explanation */}
            <div className="bg-rose-50/70 border border-rose-200/80 rounded-2xl p-3.5 text-xs text-rose-950 space-y-1.5">
              <p className="font-bold flex items-center gap-1.5 text-rose-800">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                Bạn không cần tự tạo Client ID! Hãy chọn 1 trong 3 cách dễ dàng sau:
              </p>
              <p className="text-[11px] leading-relaxed text-rose-900/90">
                Lỗi <code>origin_mismatch</code> xảy ra vì Google chặn đăng nhập từ tên miền mới <code>https://aeno.vercel.app</code> khi chưa khai báo quyền. Bạn không cần vào Google Cloud Console phức tạp, hãy áp dụng giải pháp bên dưới:
              </p>
            </div>

            {/* SOLUTION 1: GOOGLE APPS SCRIPT (RECOMMENDED - ZERO OAUTH) */}
            <div className="bg-emerald-50/80 border-2 border-emerald-300 rounded-2xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-black text-emerald-950 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-black">1</span>
                  Cách 1 (Khuyên Dùng): Đồng Bộ Qua Google Apps Script
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-200 text-emerald-900">
                  Không cần OAuth
                </span>
              </div>
              <p className="text-[11px] text-emerald-800 leading-relaxed">
                Chỉ cần mở Google Sheet &gt; Tiện ích mở rộng &gt; Apps Script &gt; Dán đoạn mã có sẵn &gt; Triển khai ứng dụng web và dán link vào ứng dụng là đồng bộ 100% tự động vĩnh viễn!
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={copyAppsScriptTemplate}
                  className="px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  {scriptCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{scriptCopied ? 'Đã sao chép mã script' : 'Sao chép mã Apps Script (1-Click)'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDomainModalOpen(false);
                    setShowAppsScriptConfig(true);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-white border border-emerald-300 hover:bg-emerald-100 text-emerald-900 text-xs font-bold cursor-pointer"
                >
                  Dán link Web App tại đây &rarr;
                </button>
              </div>
            </div>

            {/* SOLUTION 2: PRE-AUTHORIZED PREVIEW LINK */}
            <div className="bg-blue-50/70 border border-blue-200 rounded-2xl p-3.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-black text-blue-950 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-black">2</span>
                  Cách 2: Đăng Nhập 1 Lần Qua Đường Link Đã Cấp Phép Sẵn
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">
                  Chung Database
                </span>
              </div>
              <p className="text-[11px] text-blue-900/80 leading-relaxed">
                Đường link xem trước AI Studio bên dưới đã được Google uỷ quyền sẵn. Vì cả 2 trang web dùng chung cơ sở dữ liệu Cloud Firestore, bạn chỉ cần mở link này lên và bấm <strong>Đăng nhập Google</strong> 1 lần, Google Sheet sẽ được tạo và dùng chung cho cả Vercel:
              </p>
              <div className="pt-1">
                <a
                  href="https://ais-pre-dbguopx4atmnkvwv5o33rk-599901176434.asia-east1.run.app"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Mở Link Xem Trước Đã Cấp Phép OAuth</span>
                </a>
              </div>
            </div>

            {/* SOLUTION 3: INSTANT CSV EXPORT */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs text-slate-700 flex items-center justify-between gap-2">
              <div>
                <p className="font-bold text-slate-800">Cách 3: Tải file Sheets (CSV) mở ngay lập tức</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Tải tệp bảng tính CSV chuẩn 4 tab để mở trực tiếp trên Google Sheets.
                </p>
              </div>
              <button
                type="button"
                onClick={handleExportCsv}
                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shrink-0 flex items-center gap-1 cursor-pointer shadow-xs"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Tải tệp Sheets</span>
              </button>
            </div>

            {/* Modal Footer */}
            <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDomainModalOpen(false)}
                className="px-4 py-2 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer transition-all"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* User Confirmation Modal (MANDATORY per Workspace Integration Skill) */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-xl border border-slate-100 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h4 className="text-sm font-extrabold text-slate-900">
                  Xác nhận đồng bộ lên Google Sheets?
                </h4>
                <p className="text-xs text-slate-500">
                  Cập nhật bảng tính trên Google Drive của bạn
                </p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-2xl p-3.5 text-xs text-slate-600 space-y-2 border border-slate-200/80">
              <p className="font-semibold text-slate-800">Nội dung sẽ được cập nhật lên bảng tính:</p>
              <ul className="space-y-1 text-[11px] list-disc list-inside text-slate-600">
                <li>
                  <strong className="text-slate-700">Tổng Hợp Công Nợ:</strong> {debtors.length} người nợ và số dư hiện tại
                </li>
                <li>
                  <strong className="text-slate-700">Lịch Sử Giao Dịch:</strong> {transactions.length} giao dịch chi tiết
                </li>
                <li>
                  <strong className="text-slate-700">Các Cuộc Chia Tiền:</strong> {parties.length} cuộc vui chia bill
                </li>
              </ul>
              <p className="text-[10px] text-slate-500 pt-1">
                Thao tác này sẽ ghi đè các hàng tương ứng trên Google Sheets để phản ánh chính xác trạng thái mới nhất từ Sổ nợ.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 rounded-2xl border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-bold cursor-pointer transition-all"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={executeSync}
                className="px-4 py-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer shadow-xs transition-all flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Đồng ý đồng bộ</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
