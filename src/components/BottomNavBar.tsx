import React from 'react';
import {
  LayoutDashboard,
  Users,
  Plus,
  UserPlus,
  Settings,
} from 'lucide-react';
import { triggerHaptic } from '../utils/haptic';

interface BottomNavBarProps {
  currentView: 'OWNER' | 'GUEST' | 'SETTINGS';
  isOwnerAuthenticated: boolean;
  onViewChange: (view: 'OWNER' | 'GUEST' | 'SETTINGS') => void;
  onOpenAddTx: () => void;
  onOpenSplitParty: () => void;
  onOpenAddDebtor: () => void;
}

export const BottomNavBar: React.FC<BottomNavBarProps> = ({
  currentView,
  isOwnerAuthenticated,
  onViewChange,
  onOpenAddTx,
  onOpenSplitParty,
  onOpenAddDebtor,
}) => {
  // Chỉ hiển thị cho Chủ Sổ khi đã đăng nhập
  if (!isOwnerAuthenticated) {
    return null;
  }

  return (
    <nav
      aria-label="Thanh điều hướng nhanh trên di động"
      className="sm:hidden shrink-0 z-30 bg-white/80 backdrop-blur-xl border-t border-slate-200/60 shadow-[0_-4px_24px_rgba(0,0,0,0.06)] pt-1.5 select-none"
      style={{
        paddingBottom: 'max(calc(env(safe-area-inset-bottom, 0px) + 10px), 16px)',
      }}
    >
      <div className="max-w-md mx-auto px-2">
        <div className="grid grid-cols-5 items-center justify-items-center h-14">
          {/* 1. Tổng quan */}
          <button
            type="button"
            onClick={() => {
              triggerHaptic('selection');
              onViewChange('OWNER');
            }}
            className={`flex flex-col items-center justify-center w-full h-full gap-1 active:scale-95 transition-all cursor-pointer ${
              currentView === 'OWNER'
                ? 'text-emerald-700 font-bold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <LayoutDashboard
              className={`w-5 h-5 transition-transform ${
                currentView === 'OWNER' ? 'scale-105 stroke-[2.4]' : 'stroke-[1.8]'
              }`}
            />
            <span className="text-[10px] tracking-tight leading-none">Tổng quan</span>
          </button>

          {/* 2. Chia tiền */}
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onOpenSplitParty();
            }}
            className="flex flex-col items-center justify-center w-full h-full gap-1 text-slate-500 hover:text-emerald-700 active:scale-95 transition-all cursor-pointer"
          >
            <Users className="w-5 h-5 stroke-[1.8]" />
            <span className="text-[10px] tracking-tight leading-none">Chia tiền</span>
          </button>

          {/* 3. NÚT CHÍNH GIỮA: GHI NỢ (+) */}
          <div className="flex flex-col items-center justify-center relative -top-3">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('medium');
                onOpenAddTx();
              }}
              title="Ghi nợ mới"
              aria-label="Ghi nợ mới"
              className="w-12 h-12 rounded-full bg-gradient-to-tr from-emerald-600 via-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-600/35 border-4 border-white flex items-center justify-center active:scale-90 hover:scale-105 transition-all cursor-pointer ring-1 ring-emerald-500/20"
            >
              <Plus className="w-6 h-6 stroke-[2.6]" />
            </button>
            <span className="text-[10px] font-bold text-emerald-800 tracking-tight leading-none mt-0.5">
              Ghi nợ
            </span>
          </div>

          {/* 4. Người mới */}
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onOpenAddDebtor();
            }}
            className="flex flex-col items-center justify-center w-full h-full gap-1 text-slate-500 hover:text-emerald-700 active:scale-95 transition-all cursor-pointer"
          >
            <UserPlus className="w-5 h-5 stroke-[1.8]" />
            <span className="text-[10px] tracking-tight leading-none">Thêm người</span>
          </button>

          {/* 5. Cài đặt */}
          <button
            type="button"
            onClick={() => {
              triggerHaptic('selection');
              onViewChange('SETTINGS');
            }}
            className={`flex flex-col items-center justify-center w-full h-full gap-1 active:scale-95 transition-all cursor-pointer ${
              currentView === 'SETTINGS'
                ? 'text-emerald-700 font-bold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Settings
              className={`w-5 h-5 transition-transform ${
                currentView === 'SETTINGS' ? 'scale-105 stroke-[2.4]' : 'stroke-[1.8]'
              }`}
            />
            <span className="text-[10px] tracking-tight leading-none">Cài đặt</span>
          </button>
        </div>
      </div>
    </nav>
  );
};
