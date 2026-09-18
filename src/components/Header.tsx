import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Wallet,
  Settings,
  LogOut,
  Copy,
  Check,
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
  Lock,
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
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 text-slate-800 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-all">
      <div className="max-w-6xl mx-auto px-3 sm:px-6">
        <div className="h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-4">
          
          {/* LEFT: Branding & Dynamic Live Status */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 sm:flex-initial">
            <div
              onClick={() => {
                if (isOwnerAuthenticated) {
                  onViewChange('OWNER');
                }
              }}
              className="flex items-center gap-2 sm:gap-3 cursor-pointer min-w-0 group select-none"
              title={isOwnerAuthenticated ? 'Về trang quản lý Sổ Nợ' : settings.appTitle || 'OK Sổ Ghi Nợ'}
            >
              {/* App Icon */}
              <div className="w-8.5 h-8.5 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-emerald-600 via-teal-600 to-emerald-500 flex items-center justify-center text-white shadow-xs shadow-emerald-500/20 ring-1 ring-emerald-500/20 group-hover:scale-105 active:scale-95 transition-all shrink-0">
                <Wallet className="w-4 h-4 sm:w-5 sm:h-5 text-white stroke-[2.2]" />
              </div>

              {/* Title & Micro Subtitle */}
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <h1 className="font-bold text-sm sm:text-base text-slate-900 tracking-tight truncate max-w-[105px] xs:max-w-[150px] sm:max-w-[200px] md:max-w-none group-hover:text-emerald-700 transition-colors">
                    {settings.appTitle || 'OK Sổ Ghi Nợ'}
                  </h1>

                  {/* Status Indicator Chip */}
                  <div className="relative inline-flex items-center shrink-0" ref={popoverRef} onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={isOwnerAuthenticated ? () => setShowStatusPopover((prev) => !prev) : undefined}
                      title={
                        !isOwnerAuthenticated
                          ? firestoreStatus?.connected
                            ? 'Dữ liệu trực tuyến an toàn'
                            : 'Chế độ ngoại tuyến'
                          : isCheckingStatus
                          ? 'Đang kiểm tra kết nối Firestore...'
                          : firestoreStatus?.connected
                          ? 'Cloud Firestore: Đã kết nối • Bấm để xem chi tiết'
                          : 'Cloud Firestore: Mất kết nối • Bấm để kiểm tra lại'
                      }
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-semibold select-none border transition-all ${
                        isOwnerAuthenticated ? 'cursor-pointer hover:shadow-xs' : 'cursor-default'
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
                      {isCheckingStatus ? (
                        <RefreshCw className="w-2.5 h-2.5 animate-spin text-sky-600 shrink-0" />
                      ) : firestoreStatus?.connected ? (
                        <span className="relative flex h-2 w-2 shrink-0">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600"></span>
                        </span>
                      ) : (
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-600 shrink-0"></span>
                      )}

                      <span className="whitespace-nowrap">
                        {isCheckingStatus ? (
                          <>
                            <span className="hidden sm:inline">Kiểm tra</span>
                            <span className="sm:hidden text-[9px]">Check</span>
                          </>
                        ) : firestoreStatus?.connected ? (
                          <>
                            <span className="hidden sm:inline">Cloud Live</span>
                            <span className="sm:hidden text-[9px] font-bold">Live</span>
                            {isOwnerAuthenticated && firestoreStatus.latencyMs > 0 && (
                              <span className="hidden lg:inline text-[9px] font-mono opacity-70 ml-0.5">
                                ({firestoreStatus.latencyMs}ms)
                              </span>
                            )}
                          </>
                        ) : (
                          <>
                            <span className="hidden sm:inline">Offline</span>
                            <span className="sm:hidden text-[9px] font-bold">Off</span>
                          </>
                        )}
                      </span>
                    </button>

                    {/* Popover Status Modal */}
                    {showStatusPopover && isOwnerAuthenticated && (
                      <div className="absolute left-0 sm:left-auto top-full mt-2 w-76 sm:w-80 bg-white border border-slate-200/90 rounded-2xl shadow-xl p-4 text-slate-800 z-50 animate-in fade-in zoom-in-95">
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
                                  : 'Mất kết nối'}
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

                        {/* Metadata details */}
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

                        {/* Popover action buttons */}
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

                          <button
                            type="button"
                            onClick={() => {
                              setShowStatusPopover(false);
                              onViewChange('SETTINGS');
                            }}
                            className="flex-1 py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer shadow-xs"
                          >
                            <span>Cài Đặt</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Subtitle on Desktop */}
                <p className="text-[11px] text-slate-500 hidden sm:block truncate max-w-xs sm:max-w-sm lg:max-w-md mt-0.5">
                  {isOwnerAuthenticated
                    ? currentView === 'SETTINGS'
                      ? 'Cài đặt ngân hàng, VietQR & Đồng bộ Cloud'
                      : settings.appSubtitle || `Quản lý sổ nợ • Chủ sổ: ${settings.ownerName}`
                    : activeGuestDebtor
                    ? `Sao kê tài khoản cá nhân của ${activeGuestDebtor.name}`
                    : settings.appSubtitle || 'Ghi chép sổ nợ, tra cứu bằng mã PIN & thanh toán VietQR'}
                </p>
              </div>
            </div>
          </div>

          {/* RIGHT: Cohesive Unified Navigation & Action Controls */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            
            {/* Copy Link Button */}
            <button
              type="button"
              onClick={copyGuestLink}
              title="Sao chép đường dẫn tra cứu"
              className={`h-9 px-2.5 sm:px-3 rounded-xl text-xs font-semibold transition-all border shadow-2xs cursor-pointer flex items-center justify-center gap-1.5 active:scale-95 shrink-0 ${
                copiedLink
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-slate-100 hover:bg-slate-200/80 active:bg-slate-300 text-slate-700 border-slate-200/80'
              } ${activeGuestDebtor ? 'hidden sm:inline-flex' : 'inline-flex'}`}
            >
              {copiedLink ? (
                <>
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="hidden sm:inline">Đã sao chép</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-slate-600 shrink-0" />
                  <span className="hidden sm:inline">Sao chép</span>
                </>
              )}
            </button>

            {/* OWNER MODE: Unified Segmented Switcher & Logout */}
            {isOwnerAuthenticated && (
              <>
                {/* Segmented View Switcher: Mobile shows clean icons, Desktop shows icon + label */}
                <div className="flex items-center bg-slate-100/90 p-0.5 sm:p-1 rounded-xl border border-slate-200/80 shrink-0">
                  <button
                    type="button"
                    id="nav-owner-mode-btn"
                    onClick={() => onViewChange('OWNER')}
                    title="Trang quản lý"
                    aria-label="Tổng quan"
                    className={`flex items-center justify-center gap-1.5 h-8 sm:h-auto px-2.5 sm:px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      currentView === 'OWNER'
                        ? 'bg-white text-slate-900 shadow-2xs border border-slate-200/60'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <LayoutDashboard className={`w-4 h-4 shrink-0 ${currentView === 'OWNER' ? 'text-emerald-600' : 'text-slate-500'}`} />
                    <span className="hidden sm:inline">Tổng quan</span>
                  </button>

                  <button
                    type="button"
                    id="nav-settings-mode-btn"
                    onClick={() => onViewChange('SETTINGS')}
                    title="Cài đặt hệ thống"
                    aria-label="Cài Đặt"
                    className={`flex items-center justify-center gap-1.5 h-8 sm:h-auto px-2.5 sm:px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      currentView === 'SETTINGS'
                        ? 'bg-white text-slate-900 shadow-2xs border border-slate-200/60'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Settings className={`w-4 h-4 shrink-0 ${currentView === 'SETTINGS' ? 'text-blue-600' : 'text-slate-500'}`} />
                    <span className="hidden sm:inline">Cài Đặt</span>
                  </button>
                </div>

                {/* Owner Logout / Lock Button */}
                <button
                  type="button"
                  onClick={onOwnerLogout}
                  title="Đăng xuất quản lý"
                  aria-label="Đăng xuất"
                  className="h-9 px-2.5 sm:px-3 rounded-xl bg-slate-100/80 hover:bg-rose-50 text-slate-600 hover:text-rose-600 active:bg-rose-100 border border-slate-200/80 hover:border-rose-200 transition-all flex items-center justify-center gap-1.5 text-xs font-semibold cursor-pointer shadow-2xs active:scale-95 shrink-0"
                >
                  <LogOut className="w-4 h-4 text-inherit shrink-0" />
                  <span className="hidden sm:inline">Đăng xuất</span>
                </button>
              </>
            )}

            {/* DEBTOR STATEMENT MODE: Active Debtor chip & Exit */}
            {!isOwnerAuthenticated && activeGuestDebtor && (
              <div className="flex items-center gap-1.5 sm:gap-2">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-50 border border-emerald-200/90 rounded-xl text-xs font-bold text-emerald-800 max-w-[120px] sm:max-w-[180px] truncate shadow-2xs">
                  <User className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="truncate">{activeGuestDebtor.name}</span>
                </div>

                {onGuestLogout && (
                  <button
                    type="button"
                    onClick={onGuestLogout}
                    className="h-9 px-2.5 sm:px-3 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 rounded-xl text-xs font-semibold border border-slate-200 transition-all cursor-pointer shadow-2xs shrink-0 flex items-center justify-center gap-1.5"
                    title="Thoát tra cứu sao kê cá nhân"
                    aria-label="Thoát"
                  >
                    <ArrowLeft className="w-4 h-4 text-slate-500 shrink-0" />
                    <span className="hidden sm:inline">Thoát</span>
                  </button>
                )}
              </div>
            )}

          </div>
        </div>
      </div>
    </header>
  );
};
