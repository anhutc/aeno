import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Wallet,
  Settings,
  Eye,
  Lock,
  LogOut,
  Share2,
  Check,
  Cloud,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Database,
  Activity,
  ChevronRight,
  X,
} from 'lucide-react';
import { AppSettings } from '../types';
import { apiGetFirestoreStatus, FirestoreStatusInfo } from '../utils/api';

interface HeaderProps {
  currentView: 'OWNER' | 'GUEST' | 'SETTINGS';
  isOwnerAuthenticated: boolean;
  onViewChange: (view: 'OWNER' | 'GUEST' | 'SETTINGS') => void;
  onOwnerLogout: () => void;
  settings: AppSettings;
  onQuickSync?: () => void;
  isSyncing?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  currentView,
  isOwnerAuthenticated,
  onViewChange,
  onOwnerLogout,
  settings,
  onQuickSync,
  isSyncing = false,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [firestoreStatus, setFirestoreStatus] = useState<FirestoreStatusInfo | null>(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [showStatusPopover, setShowStatusPopover] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const prevSyncingRef = useRef(isSyncing);

  const checkStatus = useCallback(async () => {
    setIsCheckingStatus(true);
    try {
      const res = await apiGetFirestoreStatus();
      setFirestoreStatus(res);
    } catch (err: any) {
      setFirestoreStatus({
        success: false,
        connected: false,
        latencyMs: 0,
        databaseId: '',
        defaultDatabaseId: '',
        projectId: '',
        isCustom: false,
        stats: { debtors: 0, transactions: 0, parties: 0 },
        error: err?.message || 'Không thể kết nối đến Cloud Firestore',
        lastChecked: new Date().toISOString(),
      });
    } finally {
      setIsCheckingStatus(false);
    }
  }, []);

  // Initial check & periodic poll
  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, [checkStatus]);

  // Re-check when sync operation finishes
  useEffect(() => {
    if (prevSyncingRef.current && !isSyncing) {
      checkStatus();
    }
    prevSyncingRef.current = isSyncing;
  }, [isSyncing, checkStatus]);

  // Close popover on click outside
  useEffect(() => {
    if (!showStatusPopover) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShowStatusPopover(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showStatusPopover]);

  const copyGuestLink = () => {
    const url = `${window.location.origin}${window.location.pathname}#guest`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-40 shadow-md">
      <div className="max-w-6xl mx-auto px-3 sm:px-6">
        {/* Main Header Bar */}
        <div className="h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-3">
          {/* Logo & Title */}
          <div
            onClick={() => onViewChange('GUEST')}
            className="flex items-center gap-2.5 sm:gap-3 cursor-pointer min-w-0"
          >
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-md shadow-emerald-900/30 shrink-0">
              <Wallet className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2 flex-nowrap min-w-0">
                <h1 className="font-bold text-xs sm:text-base leading-tight tracking-tight truncate max-w-[110px] xs:max-w-[160px] sm:max-w-none">
                  {settings.appTitle || 'Sổ Ghi Nợ & Chia Tiền'}
                </h1>

                {/* Live Cloud Firestore Connection Status Badge */}
                <div className="relative inline-block shrink-0" ref={popoverRef} onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => setShowStatusPopover((prev) => !prev)}
                    title={
                      isCheckingStatus
                        ? 'Đang kiểm tra kết nối Cloud Firestore...'
                        : firestoreStatus?.connected
                        ? `Cloud Firestore: Đã kết nối (${firestoreStatus.databaseId || 'mặc định'}) • Độ trễ: ${firestoreStatus.latencyMs}ms • Bấm để xem chi tiết`
                        : `Cloud Firestore: ${firestoreStatus?.error || 'Mất kết nối'} • Bấm để kiểm tra lại`
                    }
                    className={`inline-flex items-center gap-1 sm:gap-1.5 px-2 py-0.5 sm:px-2.5 sm:py-0.5 rounded-full text-[10px] sm:text-[11px] font-semibold shrink-0 cursor-pointer transition-all border shadow-xs select-none ${
                      isCheckingStatus
                        ? 'bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 border-sky-500/30'
                        : firestoreStatus?.connected
                        ? 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border-emerald-500/30 hover:border-emerald-400/50'
                        : 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border-rose-500/40 animate-pulse'
                    }`}
                  >
                    <Cloud className="w-3 h-3 shrink-0 text-current opacity-90 hidden xs:inline" />

                    {isCheckingStatus ? (
                      <RefreshCw className="w-2.5 h-2.5 animate-spin text-sky-300 shrink-0" />
                    ) : firestoreStatus?.connected ? (
                      <span className="relative flex h-2 w-2 shrink-0">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      </span>
                    ) : (
                      <span className="relative flex h-2 w-2 shrink-0">
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                      </span>
                    )}

                    <span className="whitespace-nowrap">
                      {isCheckingStatus ? (
                        <>
                          <span className="hidden sm:inline">Kiểm tra Cloud...</span>
                          <span className="sm:hidden">Kiểm tra</span>
                        </>
                      ) : firestoreStatus?.connected ? (
                        <>
                          <span className="hidden sm:inline">Cloud Firestore</span>
                          <span className="sm:hidden">Cloud</span>
                          {firestoreStatus.latencyMs > 0 && (
                            <span className="hidden lg:inline text-[9px] font-mono opacity-80 ml-0.5">
                              ({firestoreStatus.latencyMs}ms)
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          <span className="hidden sm:inline">Firestore Offline</span>
                          <span className="sm:hidden">Offline</span>
                        </>
                      )}
                    </span>
                  </button>

                  {/* Status Detail Popover / Modal */}
                  {showStatusPopover && (
                    <>
                      {/* Mobile Dialog Backdrop (Centered on screens < sm) */}
                      <div
                        className="sm:hidden fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150"
                        onClick={() => setShowStatusPopover(false)}
                      >
                        <div
                          className="w-full max-w-xs bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-4 text-slate-100 animate-in zoom-in-95 duration-150 space-y-3"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {/* Header */}
                          <div className="flex items-center justify-between pb-2.5 border-b border-slate-800">
                            <div className="flex items-center gap-2 min-w-0">
                              <div
                                className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                                  isCheckingStatus
                                    ? 'bg-sky-500/20 text-sky-400'
                                    : firestoreStatus?.connected
                                    ? 'bg-emerald-500/20 text-emerald-400'
                                    : 'bg-rose-500/20 text-rose-400'
                                }`}
                              >
                                {isCheckingStatus ? (
                                  <RefreshCw className="w-4 h-4 animate-spin" />
                                ) : firestoreStatus?.connected ? (
                                  <CheckCircle2 className="w-4 h-4" />
                                ) : (
                                  <AlertCircle className="w-4 h-4" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <h4 className="font-bold text-xs leading-tight truncate text-white">
                                  Cloud Firestore
                                </h4>
                                <span
                                  className={`text-[10px] block truncate font-medium ${
                                    isCheckingStatus
                                      ? 'text-sky-300'
                                      : firestoreStatus?.connected
                                      ? 'text-emerald-400'
                                      : 'text-rose-400'
                                  }`}
                                >
                                  {isCheckingStatus
                                    ? 'Đang kiểm tra tín hiệu...'
                                    : firestoreStatus?.connected
                                    ? '🟢 Đang kết nối trực tiếp (Live)'
                                    : '🔴 Mất kết nối / Dữ liệu cục bộ'}
                                </span>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => setShowStatusPopover(false)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>

                          {/* Metadata */}
                          <div className="space-y-2 text-xs">
                            <div className="flex items-center justify-between gap-2 text-slate-300">
                              <span className="text-slate-400 flex items-center gap-1">
                                <Database className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                                Database ID:
                              </span>
                              <span
                                className="font-mono text-[11px] bg-slate-800 px-2 py-0.5 rounded border border-slate-700 max-w-[160px] truncate text-slate-200"
                                title={firestoreStatus?.databaseId || '(default)'}
                              >
                                {firestoreStatus?.databaseId || '(default)'}
                              </span>
                            </div>

                            <div className="flex items-center justify-between gap-2 text-slate-300">
                              <span className="text-slate-400 flex items-center gap-1">
                                <Activity className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                                Phản hồi:
                              </span>
                              <span
                                className={`font-semibold font-mono ${
                                  !firestoreStatus?.connected
                                    ? 'text-rose-400'
                                    : (firestoreStatus?.latencyMs ?? 0) < 800
                                    ? 'text-emerald-400'
                                    : 'text-amber-400'
                                }`}
                              >
                                {firestoreStatus?.connected ? `${firestoreStatus.latencyMs} ms` : 'Không phản hồi'}
                              </span>
                            </div>

                            {firestoreStatus?.connected && firestoreStatus.stats && (
                              <div className="flex items-center justify-between gap-2 text-slate-300">
                                <span className="text-slate-400">Trên Cloud:</span>
                                <span className="text-slate-200 font-medium text-[11px]">
                                  {firestoreStatus.stats.debtors} người nợ • {firestoreStatus.stats.transactions} giao dịch
                                </span>
                              </div>
                            )}

                            {!firestoreStatus?.connected && firestoreStatus?.error && (
                              <div className="mt-1 p-2 rounded-xl bg-rose-950/70 border border-rose-800/70 text-rose-200 text-[11px] leading-relaxed break-words">
                                <p className="font-semibold text-rose-300 mb-0.5">Chi tiết lỗi:</p>
                                {firestoreStatus.error}
                              </div>
                            )}
                          </div>

                          {/* Actions */}
                          <div className="pt-2 border-t border-slate-800 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => checkStatus()}
                              disabled={isCheckingStatus}
                              className="flex-1 py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                            >
                              <RefreshCw className={`w-3.5 h-3.5 ${isCheckingStatus ? 'animate-spin text-sky-400' : ''}`} />
                              <span>{isCheckingStatus ? 'Đang kiểm tra...' : 'Kiểm tra lại'}</span>
                            </button>

                            {isOwnerAuthenticated && (
                              <button
                                type="button"
                                onClick={() => {
                                  setShowStatusPopover(false);
                                  onViewChange('SETTINGS');
                                }}
                                className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                              >
                                <span>Cài Đặt</span>
                                <ChevronRight className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Desktop Popover (sm:block) */}
                      <div
                        className="hidden sm:block absolute left-0 top-full mt-2 w-80 bg-slate-900/98 backdrop-blur-md border border-slate-700/80 rounded-2xl shadow-2xl p-3.5 text-slate-100 z-50 animate-in fade-in zoom-in-95 duration-150"
                      >
                        {/* Popover Header */}
                        <div className="flex items-center justify-between pb-2.5 border-b border-slate-800">
                          <div className="flex items-center gap-2 min-w-0">
                            <div
                              className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                                isCheckingStatus
                                  ? 'bg-sky-500/20 text-sky-400'
                                  : firestoreStatus?.connected
                                  ? 'bg-emerald-500/20 text-emerald-400'
                                  : 'bg-rose-500/20 text-rose-400'
                              }`}
                            >
                              {isCheckingStatus ? (
                                <RefreshCw className="w-4 h-4 animate-spin" />
                              ) : firestoreStatus?.connected ? (
                                <CheckCircle2 className="w-4 h-4" />
                              ) : (
                                <AlertCircle className="w-4 h-4" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <h4 className="font-bold text-xs leading-tight truncate text-white">
                                Cloud Firestore
                              </h4>
                              <span
                                className={`text-[10px] block truncate ${
                                  isCheckingStatus
                                    ? 'text-sky-300'
                                    : firestoreStatus?.connected
                                    ? 'text-emerald-400 font-semibold'
                                    : 'text-rose-400 font-semibold'
                                }`}
                              >
                                {isCheckingStatus
                                  ? 'Đang kiểm tra tín hiệu...'
                                  : firestoreStatus?.connected
                                  ? 'Đang kết nối trực tiếp (Live)'
                                  : 'Mất kết nối / Dữ liệu cục bộ'}
                              </span>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => setShowStatusPopover(false)}
                            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Metadata Details */}
                        <div className="py-2.5 space-y-2 text-[11px]">
                          <div className="flex items-center justify-between gap-2 text-slate-300">
                            <span className="text-slate-400 flex items-center gap-1">
                              <Database className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                              Database ID:
                            </span>
                            <span
                              className="font-mono text-[10px] bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-700/60 max-w-[150px] truncate text-slate-200"
                              title={firestoreStatus?.databaseId || '(default)'}
                            >
                              {firestoreStatus?.databaseId || '(default)'}
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-2 text-slate-300">
                            <span className="text-slate-400 flex items-center gap-1">
                              <Activity className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                              Độ trễ phản hồi:
                            </span>
                            <span
                              className={`font-semibold font-mono ${
                                !firestoreStatus?.connected
                                  ? 'text-rose-400'
                                  : (firestoreStatus?.latencyMs ?? 0) < 800
                                  ? 'text-emerald-400'
                                  : 'text-amber-400'
                              }`}
                            >
                              {firestoreStatus?.connected ? `${firestoreStatus.latencyMs} ms` : 'Không phản hồi'}
                            </span>
                          </div>

                          {firestoreStatus?.connected && firestoreStatus.stats && (
                            <div className="flex items-center justify-between gap-2 text-slate-300">
                              <span className="text-slate-400">Dữ liệu trên Cloud:</span>
                              <span className="text-slate-200 font-medium">
                                {firestoreStatus.stats.debtors} người nợ • {firestoreStatus.stats.transactions} giao dịch
                              </span>
                            </div>
                          )}

                          {firestoreStatus?.lastChecked && (
                            <div className="flex items-center justify-between gap-2 text-slate-400 text-[10px] pt-1 border-t border-slate-800/60">
                              <span>Lần kiểm tra cuối:</span>
                              <span className="font-mono">
                                {new Date(firestoreStatus.lastChecked).toLocaleTimeString('vi-VN')}
                              </span>
                            </div>
                          )}

                          {/* Error message box if any */}
                          {!firestoreStatus?.connected && firestoreStatus?.error && (
                            <div className="mt-1 p-2 rounded-xl bg-rose-950/60 border border-rose-800/60 text-rose-200 text-[11px] leading-relaxed break-words">
                              <p className="font-semibold text-rose-300 mb-0.5">Chi tiết lỗi:</p>
                              {firestoreStatus.error}
                            </div>
                          )}
                        </div>

                        {/* Popover Action Buttons */}
                        <div className="pt-2 border-t border-slate-800 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => checkStatus()}
                            disabled={isCheckingStatus}
                            className="flex-1 py-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                          >
                            <RefreshCw className={`w-3 h-3 ${isCheckingStatus ? 'animate-spin text-sky-400' : ''}`} />
                            <span>{isCheckingStatus ? 'Đang kiểm tra...' : 'Kiểm tra lại'}</span>
                          </button>

                          {isOwnerAuthenticated && (
                            <button
                              type="button"
                              onClick={() => {
                                setShowStatusPopover(false);
                                onViewChange('SETTINGS');
                              }}
                              className="flex-1 py-1.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                            >
                              <span>Mở Cài Đặt</span>
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <p className="text-[10px] sm:text-[11px] text-slate-400 hidden xs:block truncate max-w-xs sm:max-w-md">
                {currentView === 'OWNER'
                  ? settings.appSubtitle || `Quản lý bởi: ${settings.ownerName}`
                  : currentView === 'SETTINGS'
                  ? 'Cài đặt ngân hàng, VietQR & Máy chủ đồng bộ'
                  : 'Tra cứu an toàn bằng mật khẩu cá nhân'}
              </p>
            </div>
          </div>

          {/* Desktop Center Mode Switcher (hidden on mobile, shown on sm+) */}
          <div className="hidden sm:flex items-center bg-slate-800/90 p-1 rounded-xl border border-slate-700 shrink-0">
            <button
              type="button"
              id="nav-guest-mode-btn"
              onClick={() => onViewChange('GUEST')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                currentView === 'GUEST'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Con Nợ</span>
            </button>

            <button
              type="button"
              id="nav-owner-mode-btn"
              onClick={() => onViewChange('OWNER')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                currentView === 'OWNER'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {isOwnerAuthenticated? '' : <Lock className="w-3.5 h-3.5 text-amber-400" />}
              <span>{isOwnerAuthenticated ? '👑 ' : ''}Chủ Nợ</span>
            </button>

            {isOwnerAuthenticated && (
              <button
                type="button"
                id="nav-settings-mode-btn"
                onClick={() => onViewChange('SETTINGS')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  currentView === 'SETTINGS'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Settings className="w-3.5 h-3.5" />
                <span>Cài Đặt</span>
              </button>
            )}
          </div>

          {/* Right side Actions */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Quick link sharing button */}
            <button
              type="button"
              onClick={copyGuestLink}
              title="Sao chép đường dẫn tra cứu gửi cho bạn bè"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-medium border border-slate-700 transition-colors cursor-pointer"
            >
              {copiedLink ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Share2 className="w-3.5 h-3.5 text-slate-400" />
              )}
              <span className="hidden md:inline">{copiedLink ? 'Đã sao chép' : 'Chia sẻ'}</span>
            </button>

            {isOwnerAuthenticated && onQuickSync && (
              <button
                type="button"
                onClick={onQuickSync}
                disabled={isSyncing}
                title="Lưu và đồng bộ ngay toàn bộ dữ liệu lên Cloud Firestore"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-950/80 hover:bg-emerald-900/90 text-emerald-300 hover:text-white rounded-xl text-xs font-semibold border border-emerald-700/60 transition-colors cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                <span className="hidden lg:inline">{isSyncing ? 'Đang lưu...' : 'Lưu Cloud'}</span>
              </button>
            )}

            {isOwnerAuthenticated && (
              <button
                type="button"
                onClick={onOwnerLogout}
                title="Khóa sổ & Đăng xuất quản trị"
                className="p-1.5 sm:p-2 bg-slate-800 hover:bg-rose-900/60 text-slate-400 hover:text-rose-300 rounded-xl transition-colors border border-slate-700 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Mobile View Switcher Tab Bar (visible on mobile < sm) */}
        <div className="sm:hidden pb-2.5 pt-0.5">
          <div
            className={`grid gap-1 p-1 bg-slate-800/95 rounded-xl border border-slate-700 ${
              isOwnerAuthenticated ? 'grid-cols-3' : 'grid-cols-2'
            }`}
          >
            <button
              type="button"
              id="nav-guest-mode-btn-mobile"
              onClick={() => onViewChange('GUEST')}
              className={`flex items-center justify-center gap-1 py-2 px-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer truncate ${
                currentView === 'GUEST'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Eye className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Con Nợ</span>
            </button>

            <button
              type="button"
              id="nav-owner-mode-btn-mobile"
              onClick={() => onViewChange('OWNER')}
              className={`flex items-center justify-center gap-1 py-2 px-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer truncate ${
                currentView === 'OWNER'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="truncate">Chủ Nợ</span>
            </button>

            {isOwnerAuthenticated && (
              <button
                type="button"
                id="nav-settings-mode-btn-mobile"
                onClick={() => onViewChange('SETTINGS')}
                className={`flex items-center justify-center gap-1 py-2 px-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer truncate ${
                  currentView === 'SETTINGS'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Settings className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Cài Đặt</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
