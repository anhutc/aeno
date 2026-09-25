import React, { useState } from 'react';
import {
  Wallet,
  Settings,
  LogOut,
  Copy,
  Check,
  User,
  LayoutDashboard,
  ArrowLeft,
} from 'lucide-react';
import { AppSettings, Debtor } from '../types';

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
          
          {/* LEFT: Branding (Tên ứng dụng & Biểu tượng) */}
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div
              onClick={() => {
                if (isOwnerAuthenticated) {
                  onViewChange('OWNER');
                }
              }}
              className="flex items-center gap-2.5 sm:gap-3 cursor-pointer min-w-0 group select-none"
              title={isOwnerAuthenticated ? 'Về trang quản lý' : settings.appTitle || 'OK Sổ Ghi Nợ'}
            >
              {/* App Icon */}
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-emerald-600 via-teal-600 to-emerald-500 flex items-center justify-center text-white shadow-xs shadow-emerald-500/20 ring-1 ring-emerald-500/20 group-hover:scale-105 active:scale-95 transition-all shrink-0">
                <Wallet className="w-5 h-5 text-white stroke-[2.2]" />
              </div>

              {/* Title & Subtitle */}
              <div className="min-w-0">
                <h1 className="font-bold text-base sm:text-lg text-slate-900 tracking-tight truncate group-hover:text-emerald-700 transition-colors leading-tight">
                  {settings.appTitle || 'OK Sổ Ghi Nợ'}
                </h1>
                <p className="text-[11px] text-slate-500 hidden sm:block truncate max-w-xs sm:max-w-sm lg:max-w-md mt-0.5 leading-none">
                  {isOwnerAuthenticated
                    ? currentView === 'SETTINGS'
                      ? 'Cài đặt & Đồng bộ Cloud'
                      : settings.appSubtitle || `Quản lý sổ nợ • Chủ sổ: ${settings.ownerName}`
                    : activeGuestDebtor
                    ? `Sao kê tài khoản: ${activeGuestDebtor.name}`
                    : settings.appSubtitle || 'Ghi chép sổ nợ & tra cứu sao kê'}
                </p>
              </div>
            </div>
          </div>

          {/* RIGHT: Navigation & Action Controls */}
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

            {/* OWNER MODE: Unified Switcher & Logout */}
            {isOwnerAuthenticated && (
              <>
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

                {/* Owner Logout Button */}
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
