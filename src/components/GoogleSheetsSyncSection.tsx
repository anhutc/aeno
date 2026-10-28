import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { AppSettings, Debtor, Transaction, PartySplit } from '../types';
import {
  initGoogleAuth,
  signInWithGoogle,
  signOutGoogle,
  syncDatabaseToGoogleSheets,
  getGoogleAccessToken,
  getCurrentGoogleUser,
  setManualAccessToken,
  exportGoogleSheetsCsvFile,
  getCurrentDomain,
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
  const isAutoSyncEnabled = settings.autoSyncGoogleSheets ?? false;

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
  const activeHostname = typeof window !== 'undefined' ? window.location.hostname : 'ais-dev-dbguopx4atmnkvwv5o33rk-599901176434.asia-east1.run.app';

  // Manual Token Input State
  const [showManualTokenInput, setShowManualTokenInput] = useState(false);
  const [manualToken, setManualToken] = useState('');
  const [manualEmail, setManualEmail] = useState('');

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
      const res = await signInWithGoogle();
      setGoogleUser(res.user);
      setHasToken(true);
      showToast(`Đã kết nối tài khoản Google: ${res.user.email || res.user.displayName}`, 'success');
    } catch (err: any) {
      console.error('Sign-in failed:', err);
      if (err?.code === 'auth/unauthorized-domain' || String(err?.message || '').includes('unauthorized-domain')) {
        setDomainModalOpen(true);
      } else if (err?.code === 'access_denied') {
        showToast('Đã chặn quyền truy cập (Lỗi uỷ quyền): Cần cấu hình Test Users trong Google Cloud Console.', 'error');
        setDomainModalOpen(true);
      } else if (err?.code === 'popup_closed') {
        showToast('Bạn đã đóng cửa sổ đăng nhập Google.', 'error');
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
    if (!hasToken) {
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
      setSyncStatusStep('Đang kết nối Google Drive & tạo cấu trúc 3 tab...');
      const result = await syncDatabaseToGoogleSheets({
        debtors,
        transactions,
        parties,
        settings,
      });

      setSyncResult(result);
      setSyncStatusStep('Đang hoàn tất lưu thông tin...');

      // Save Google Sheet URL & ID into settings
      const updatedSettings: AppSettings = {
        ...settings,
        googleSheetId: result.spreadsheetId,
        googleSheetUrl: result.spreadsheetUrl,
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
    showToast(
      nextVal
        ? 'Đã BẬT tự động đồng bộ ngầm: Mọi giao dịch mới sẽ tự lưu sang Google Sheets sau 2 giây!'
        : 'Đã TẮT tự động đồng bộ Google Sheets.',
      'success'
    );
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
            Hệ thống không ghi dữ liệu vào tệp cục bộ trên máy chủ. Bạn có thể đồng bộ trực tiếp lên Google Drive hoặc tải tệp Excel/CSV chuẩn 3 tab để mở ngay trên Google Sheets.
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

          <div className="grid grid-cols-3 gap-2 py-1 text-center text-xs">
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

      {/* Manual Token Option Toggle */}
      <div className="pt-1 text-right">
        <button
          type="button"
          onClick={() => setShowManualTokenInput(!showManualTokenInput)}
          className="text-[11px] text-slate-400 hover:text-emerald-700 font-medium transition-colors inline-flex items-center gap-1 cursor-pointer"
        >
          <Key className="w-3 h-3" />
          <span>{showManualTokenInput ? 'Ẩn nhập token thủ công' : 'Tùy chọn nâng cao: Nhập Access Token Google'}</span>
        </button>
      </div>

      {/* Manual Token Input Box */}
      {showManualTokenInput && (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-2.5 animate-in fade-in">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700">Dán Google OAuth Access Token</span>
            <span className="text-[10px] text-slate-400">Token chỉ lưu trong RAM, không lưu ổ đĩa</span>
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

      {/* Domain Authorization Help Modal (Fixes auth/unauthorized-domain) */}
      {domainModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl p-5 sm:p-6 max-w-lg w-full shadow-2xl border border-slate-100 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                  <ShieldAlert className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h4 className="text-sm font-extrabold text-slate-900">
                    Ủy Quyền Tên Miền Firebase &amp; Google
                  </h4>
                  <p className="text-xs text-slate-500">
                    Khắc phục lỗi: auth/unauthorized-domain &amp; Lỗi uỷ quyền
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

            <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-3.5 text-xs text-amber-900 space-y-2">
              <p className="font-semibold">
                Do ứng dụng chạy trên miền xem trước bảo mật Cloud Run, Firebase yêu cầu thêm tên miền này vào danh sách được ủy quyền 1 lần duy nhất:
              </p>
              <div className="flex items-center justify-between gap-2 bg-white/90 p-2 rounded-xl border border-amber-200 font-mono text-[11px] text-slate-800">
                <span className="truncate">{activeHostname}</span>
                <button
                  type="button"
                  onClick={copyDomainToClipboard}
                  className="px-2.5 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-800 text-[10px] font-bold flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  {domainCopied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  <span>{domainCopied ? 'Đã sao chép' : 'Sao chép'}</span>
                </button>
              </div>
            </div>

            <div className="space-y-2 text-xs text-slate-600">
              <p className="font-bold text-slate-800">3 bước thực hiện trên Firebase Console (chỉ mất 30 giây):</p>
              <ol className="space-y-1.5 list-decimal list-inside text-[11px] text-slate-600 pl-1">
                <li>
                  Nhấn nút <strong>"Mở Firebase Console"</strong> bên dưới.
                </li>
                <li>
                  Vào mục <strong>Authentication &gt; Settings &gt; Authorized domains</strong>.
                </li>
                <li>
                  Nhấn <strong>Add domain</strong> &gt; Dán tên miền vừa sao chép &gt; Nhấn <strong>Save</strong>.
                </li>
              </ol>
            </div>

            <div className="bg-emerald-50/80 border border-emerald-200/80 rounded-2xl p-3 text-xs text-emerald-900 flex items-center justify-between gap-2">
              <div>
                <p className="font-bold">Cách xem ngay trên Google Sheets mà không cần cài đặt:</p>
                <p className="text-[11px] text-emerald-700 mt-0.5">
                  Tải tệp CSV chuẩn 3 tab và nhập trực tiếp vào Google Sheets.
                </p>
              </div>
              <button
                type="button"
                onClick={handleExportCsv}
                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shrink-0 flex items-center gap-1 cursor-pointer shadow-xs"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Tải tệp</span>
              </button>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDomainModalOpen(false)}
                className="px-4 py-2 rounded-2xl border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-bold cursor-pointer transition-all"
              >
                Đóng
              </button>
              <a
                href="https://console.firebase.google.com/project/gen-lang-client-0583644686/authentication/settings"
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold cursor-pointer shadow-xs transition-all flex items-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Mở Firebase Console</span>
              </a>
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
