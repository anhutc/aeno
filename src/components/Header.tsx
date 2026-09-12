import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Wallet,
  Settings,
  LogOut,
  Share2,
  Copy,
  Check,
  Cloud,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Database,
  Activity,
  ChevronRight,
  X,
  User,
  LayoutDashboard,
  ArrowLeft,
} from 'lucide-react';
import { AppSettings, Debtor } from '../types';
import { apiGetFirestoreStatus, FirestoreStatusInfo } from '../utils/api';

interface HeaderProps {
  currentView: 'OWNER' | 'GUEST' | 'SETTINGS';
  isOwnerAuthenticated: boolean;
  onViewChange: (view: 'OWNER' | 'GUEST' | 'SETTINGS') => void;
  onOwnerLogout: () => void;
  settings: AppSettings;
  activeGuestDebtor?: Debtor | null;
  onGuestLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentView,
  isOwnerAuthenticated,
  onViewChange,
  onOwnerLogout,
  settings,
  activeGuestDebtor,
  onGuestLogout,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [firestoreStatus, setFirestoreStatus] = useState<FirestoreStatusInfo | null>(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [showStatusPopover, setShowStatusPopover] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

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
    const interval = setInterval(checkStatus, 30000);
    return () => clearInterval(interval);
  }, [checkStatus]);

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
    const url = `${window.location.origin}${window.location.pathname}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <header className="sticky top-0 z-40 backdrop-blur-xl bg-white/95 border-b border-slate-200/90 text-slate-800 shadow-xs">
      <div className="max-w-6xl mx-auto px-3 sm:px-6">
        {/* Main Header Bar */}
        <div className="h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-4">
          {/* Logo & Title */}
          <div
            onClick={() => {
              if (isOwnerAuthenticated) {
                onViewChange('OWNER');
              }
            }}
            className="flex items-center gap-2.5 sm:gap-3 cursor-pointer min-w-0 group"
          >
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-gradient-to-tr from-emerald-500 via-teal-500 to-cyan-500 flex items-center justify-center text-white shadow-md shadow-emerald-500/20 ring-2 ring-emerald-100 group-hover:scale-105 transition-transform shrink-0">
              <Wallet className="w-4 h-4 sm:w-5 sm:h-5 text-slate-950 stroke-[2.5]" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2 flex-nowrap min-w-0">
                <h1 className="font-extrabold text-xs sm:text-base leading-tight tracking-tight truncate max-w-[120px] xs:max-w-[180px] sm:max-w-none text-slate-900 group-hover:text-emerald-700 transition-colors">
                  {settings.appTitle || 'Sổ Ghi Nợ & Chia Tiền'}
                </h1>

                {/* Live Cloud Firestore Connection Status Badge (Tone sáng sạch sẽ) */}
                <div className="relative inline-block shrink-0" ref={popoverRef} onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={isOwnerAuthenticated ? () => setShowStatusPopover((prev) => !prev) : undefined}
                    title={
                      !isOwnerAuthenticated
                        ? firestoreStatus?.connected
                          ? 'Đã kết nối trực tuyến an toàn'
                          : 'Đang hoạt động ngoại tuyến'
                        : isCheckingStatus
                        ? 'Đang kiểm tra kết nối Cloud Firestore...'
                        : firestoreStatus?.connected
                        ? `Cloud Firestore: Đã kết nối • Bấm để xem chi tiết`
                        : `Cloud Firestore: ${firestoreStatus?.error || 'Mất kết nối'} • Bấm để kiểm tra lại`
                    }
                    className={`inline-flex items-center gap-1 sm:gap-1.5 px-2 py-0.5 sm:px-2.5 sm:py-0.5 rounded-full text-[10px] sm:text-[11px] font-semibold shrink-0 transition-all border shadow-2xs select-none ${
                      isOwnerAuthenticated ? 'cursor-pointer' : 'cursor-default'
                    } ${
                      isCheckingStatus
                        ? 'bg-sky-50 text-sky-700 border-sky-200'
                        : firestoreStatus?.connected
                        ? isOwnerAuthenticated
                          ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200/80 hover:border-emerald-300'
                          : 'bg-emerald-50 text-emerald-800 border-emerald-200/80'
                        : 'bg-rose-50 text-rose-700 border-rose-200'
                    }`}
                  >
                    <Cloud className="w-3 h-3 shrink-0 text-current opacity-90 hidden xs:inline" />

                    {isCheckingStatus ? (
                      <RefreshCw className="w-2.5 h-2.5 animate-spin text-sky-600 shrink-0" />
                    ) : firestoreStatus?.connected ? (
                      <span className="relative flex h-2 w-2 shrink-0">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600"></span>
                      </span>
                    ) : (
                      <span className="relative flex h-2 w-2 shrink-0">
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-600"></span>
                      </span>
                    )}

                    <span className="whitespace-nowrap">
                      {isCheckingStatus ? (
                        <>
                          <span className="hidden sm:inline">Kiểm tra...</span>
                          <span className="sm:hidden">Kiểm tra</span>
                        </>
                      ) : firestoreStatus?.connected ? (
                        <>
                          <span className="hidden sm:inline">Cloud Live</span>
                          <span className="sm:hidden">Live</span>
                          {isOwnerAuthenticated && firestoreStatus.latencyMs > 0 && (
                            <span className="hidden lg:inline text-[9px] font-mono opacity-80 ml-0.5">
                              ({firestoreStatus.latencyMs}ms)
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          <span className="hidden sm:inline">Offline</span>
                          <span className="sm:hidden">Offline</span>
                        </>
                      )}
                    </span>
                  </button>

                  {/* Status Detail Popover / Modal (Tone sáng) - CHỈ DÀNH CHO CHỦ NỢ ĐÃ XÁC THỰC */}
                  {showStatusPopover && isOwnerAuthenticated && (
                    <div
                      className="absolute left-0 top-full mt-2 w-80 bg-white border border-slate-200 rounded-2xl shadow-xl p-4 text-slate-800 z-50 animate-in fade-in zoom-in-95 duration-150"
                    >
                      <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
                        <div className="flex items-center gap-2 min-w-0">
                          <div
                            className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                              isCheckingStatus
                                ? 'bg-sky-50 text-sky-600'
                                : firestoreStatus?.connected
                                ? 'bg-emerald-50 text-emerald-600'
                                : 'bg-rose-50 text-rose-600'
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
                            <h4 className="font-bold text-xs leading-tight truncate text-slate-900">
                              Cloud Firestore
                            </h4>
                            <span
                              className={`text-[10px] block truncate font-semibold ${
                                isCheckingStatus
                                  ? 'text-sky-600'
                                  : firestoreStatus?.connected
                                  ? 'text-emerald-700'
                                  : 'text-rose-700'
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
                          className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Metadata Details */}
                      <div className="py-2.5 space-y-2 text-[11px]">
                        <div className="flex items-center justify-between gap-2 text-slate-600">
                          <span className="flex items-center gap-1">
                            <Database className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            Database ID:
                          </span>
                          <span
                            className="font-mono text-[10px] bg-slate-100 px-2 py-0.5 rounded border border-slate-200 max-w-[150px] truncate text-slate-800"
                            title={firestoreStatus?.databaseId || '(default)'}
                          >
                            {firestoreStatus?.databaseId || '(default)'}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-2 text-slate-600">
                          <span className="flex items-center gap-1">
                            <Activity className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            Độ trễ phản hồi:
                          </span>
                          <span
                            className={`font-semibold font-mono ${
                              !firestoreStatus?.connected
                                ? 'text-rose-600'
                                : (firestoreStatus?.latencyMs ?? 0) < 800
                                ? 'text-emerald-700'
                                : 'text-amber-700'
                            }`}
                          >
                            {firestoreStatus?.connected ? `${firestoreStatus.latencyMs} ms` : 'Không phản hồi'}
                          </span>
                        </div>

                        {firestoreStatus?.connected && firestoreStatus.stats && (
                          <div className="flex items-center justify-between gap-2 text-slate-600">
                            <span>Dữ liệu trên Cloud:</span>
                            <span className="text-slate-900 font-bold">
                              {firestoreStatus.stats.debtors} người nợ • {firestoreStatus.stats.transactions} giao dịch
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Popover Action Buttons */}
                      <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => checkStatus()}
                          disabled={isCheckingStatus}
                          className="flex-1 py-1.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          <RefreshCw className={`w-3 h-3 ${isCheckingStatus ? 'animate-spin text-sky-600' : ''}`} />
                          <span>Kiểm tra lại</span>
                        </button>

                        {isOwnerAuthenticated && (
                          <button
                            type="button"
                            onClick={() => {
                              setShowStatusPopover(false);
                              onViewChange('SETTINGS');
                            }}
                            className="flex-1 py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                          >
                            <span>Cài Đặt</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <p className="text-[10px] sm:text-[11px] text-slate-500 hidden xs:block truncate max-w-xs sm:max-w-md">
                {isOwnerAuthenticated
                  ? currentView === 'SETTINGS'
                    ? 'Cài đặt tài khoản ngân hàng, VietQR & Đồng bộ Cloud'
                    : settings.appSubtitle || `Quản lý bởi: ${settings.ownerName}`
                  : activeGuestDebtor
                  ? `Đang xem sao kê cá nhân của ${activeGuestDebtor.name}`
                  : 'Sổ ghi nợ bảo mật • Tra cứu cá nhân & Quản lý sổ'}
              </p>
            </div>
          </div>

          {/* Navigation Controls: Only Shown when Authenticated (Eliminates the duplicate 2 menus!) */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Owner Navigation Mode (Only active after Owner logs in) */}
            {isOwnerAuthenticated && (
              <div className="flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200/80 shrink-0">
                <button
                  type="button"
                  id="nav-owner-mode-btn"
                  onClick={() => onViewChange('OWNER')}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    currentView === 'OWNER'
                      ? 'bg-white text-slate-900 shadow-2xs border border-slate-200/60'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <LayoutDashboard className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="hidden xs:inline">Sổ Nợ</span>
                </button>

                <button
                  type="button"
                  id="nav-settings-mode-btn"
                  onClick={() => onViewChange('SETTINGS')}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    currentView === 'SETTINGS'
                      ? 'bg-white text-slate-900 shadow-2xs border border-slate-200/60'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Settings className="w-3.5 h-3.5 text-blue-600" />
                  <span className="hidden xs:inline">Cài Đặt</span>
                </button>
              </div>
            )}

            {/* Debtor Mode Badge & Back/Exit (When a debtor is viewing their statement) */}
            {!isOwnerAuthenticated && activeGuestDebtor && (
              <div className="flex items-center gap-2">
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-800">
                  <User className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{activeGuestDebtor.name}</span>
                </div>
                {onGuestLogout && (
                  <button
                    type="button"
                    onClick={onGuestLogout}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold border border-slate-200 transition-colors cursor-pointer shadow-2xs"
                    title="Thoát tra cứu sao kê cá nhân"
                  >
                    <ArrowLeft className="w-3.5 h-3.5 text-slate-500" />
                    <span>Thoát</span>
                  </button>
                )}
              </div>
            )}

            {/* Nút sao chép link tra cứu ở Header */}
            <button
              type="button"
              onClick={copyGuestLink}
              title="Sao chép đường dẫn tra cứu gửi cho bạn bè"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 rounded-xl text-xs font-semibold border border-slate-200 transition-all shadow-2xs cursor-pointer"
            >
              {copiedLink ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700 font-bold">Đã chép link</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-600" />
                  <span className="hidden xs:inline">Sao chép link</span>
                </>
              )}
            </button>

            {/* Owner Logout Button */}
            {isOwnerAuthenticated && (
              <button
                type="button"
                onClick={onOwnerLogout}
                title="Khóa sổ & Đăng xuất quản trị"
                className="p-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl transition-all border border-rose-200/80 cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
