import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  LayoutDashboard,
  ClipboardList,
  Settings,
  LogOut,
  ShieldAlert,
} from 'lucide-react';
import { triggerHaptic } from '../utils/haptic';

interface BottomNavBarProps {
  currentView: 'OWNER' | 'GUEST' | 'SETTINGS' | 'LOGS';
  isOwnerAuthenticated: boolean;
  onViewChange: (view: 'OWNER' | 'GUEST' | 'SETTINGS' | 'LOGS') => void;
  onOwnerLogout: () => void;
  logsAlertCount?: number;
}

export const BottomNavBar: React.FC<BottomNavBarProps> = ({
  currentView,
  isOwnerAuthenticated,
  onViewChange,
  onOwnerLogout,
  logsAlertCount = 0,
}) => {
  const [confirmLogoutOpen, setConfirmLogoutOpen] = useState(false);

  if (!isOwnerAuthenticated) {
    return null;
  }

  const navItems: Array<{
    id: 'OWNER' | 'LOGS' | 'SETTINGS';
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badgeCount?: number;
  }> = [
    { id: 'OWNER', label: 'Tổng quan', icon: LayoutDashboard },
    { id: 'LOGS', label: 'Nhật ký', icon: ClipboardList, badgeCount: logsAlertCount },
    { id: 'SETTINGS', label: 'Cài đặt', icon: Settings },
  ];

  return (
    <>
      <nav
        aria-label="Thanh điều hướng trên di động"
        className="sm:hidden shrink-0 z-30 bg-white/95 backdrop-blur-xl border-t border-slate-200/80 shadow-[0_-2px_16px_rgba(15,23,42,0.05)] select-none"
        style={{
          paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 6px)',
        }}
      >
        <div className="max-w-md mx-auto px-2">
          <div className="grid grid-cols-4 items-stretch h-14">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentView === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    triggerHaptic('selection');
                    onViewChange(item.id);
                  }}
                  aria-current={isActive ? 'page' : undefined}
                  className={`relative flex flex-col items-center justify-center min-h-[44px] gap-1 transition-colors cursor-pointer active:scale-95 whitespace-nowrap ${
                    isActive
                      ? 'text-emerald-700 font-semibold'
                      : 'text-slate-500 hover:text-slate-900 font-medium'
                  }`}
                >
                  {isActive && (
                    <motion.span
                      layoutId="mobile-bottom-nav-indicator"
                      transition={{ type: 'spring', stiffness: 520, damping: 38 }}
                      className="absolute top-0 inset-x-4 h-[2.5px] rounded-b-full bg-emerald-600"
                    />
                  )}

                  <span className="relative inline-flex items-center justify-center">
                    <Icon
                      className={`w-[21px] h-[21px] transition-transform ${
                        isActive ? 'stroke-[2.3]' : 'stroke-[1.8]'
                      }`}
                    />
                    {typeof item.badgeCount === 'number' && item.badgeCount > 0 && (
                      <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-600 text-white text-[9px] font-mono font-bold flex items-center justify-center leading-none">
                        {item.badgeCount > 99 ? '99+' : item.badgeCount}
                      </span>
                    )}
                  </span>

                  <span className="text-[11px] leading-none tracking-tight">
                    {item.label}
                  </span>
                </button>
              );
            })}

            {/* 4. Đăng xuất */}
            <button
              type="button"
              onClick={() => {
                triggerHaptic('medium');
                setConfirmLogoutOpen(true);
              }}
              className="relative flex flex-col items-center justify-center min-h-[44px] gap-1 text-slate-500 hover:text-rose-600 active:text-rose-700 font-medium transition-colors cursor-pointer active:scale-95 whitespace-nowrap"
            >
              <LogOut className="w-[21px] h-[21px] stroke-[1.8]" />
              <span className="text-[11px] leading-none tracking-tight">Đăng xuất</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile Bottom Confirmation Sheet for Safe Logout */}
      <AnimatePresence>
        {confirmLogoutOpen && (
          <motion.div
            key="mobile-logout-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onClick={() => setConfirmLogoutOpen(false)}
            className="sm:hidden fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-xs flex items-end justify-center p-3"
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-white rounded-3xl border border-slate-200 shadow-2xl p-5 space-y-4"
              style={{
                paddingBottom: 'max(calc(env(safe-area-inset-bottom, 0px) + 16px), 20px)',
              }}
            >
              <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto -mt-1" />
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-rose-50 border border-rose-200/80 text-rose-600 flex items-center justify-center shrink-0">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-slate-900">
                    Đăng xuất phiên quản trị?
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                    Bạn sẽ quay về màn hình khóa và cần nhập lại mật khẩu để truy cập lại sổ.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setConfirmLogoutOpen(false)}
                  className="min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold transition-colors cursor-pointer"
                >
                  Ở lại
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmLogoutOpen(false);
                    onOwnerLogout();
                  }}
                  className="min-h-[44px] px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Đăng xuất</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
