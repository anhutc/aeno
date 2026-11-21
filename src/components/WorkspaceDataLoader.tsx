import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { LogOut, RefreshCw, WifiOff, Check } from 'lucide-react';
import { KineticScanBar, LedgerWaveBars } from './DataPulseLoader';

interface WorkspaceDataLoaderProps {
  onCancelSession: () => void;
}

const WORKSPACE_PHASES = [
  'Đang tải danh sách công nợ & mã tra cứu...',
  'Đang đối soát toàn bộ giao dịch mới nhất...',
  'Đang tổng hợp bảng chia bill & cài đặt sổ...',
];

export const WorkspaceDataLoader: React.FC<WorkspaceDataLoaderProps> = ({
  onCancelSession,
}) => {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      setElapsedMs(Date.now() - startedAt);
    }, 200);
    return () => clearInterval(timer);
  }, []);

  const phaseIndex = Math.min(
    WORKSPACE_PHASES.length - 1,
    Math.floor(elapsedMs / 1300)
  );
  const elapsedSecStr = `${(elapsedMs / 1000).toFixed(1)}s`;

  return (
    <motion.div
      key="view-workspace-loading"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-4 select-none"
      aria-busy="true"
      aria-label="Đang đồng bộ không gian làm việc"
    >
      {/* Top Unified Live Sync Header Strip */}
      <div className="bg-white rounded-2xl border border-slate-200/85 shadow-2xs overflow-hidden">
        <KineticScanBar tone="emerald" />
        <div className="px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-200/70 flex items-center justify-center shrink-0">
              <LedgerWaveBars size="sm" tone="emerald" />
            </div>
            <div className="min-w-0">
              <div className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                {WORKSPACE_PHASES[phaseIndex]}
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                <span>Đồng bộ thời gian thực</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums text-slate-600">
                  {elapsedSecStr}
                </span>
                <span aria-hidden="true" className="hidden sm:inline">·</span>
                <span className="hidden sm:inline-flex items-center gap-1 text-emerald-700 font-medium">
                  <Check className="w-3 h-3" />
                  Bảo vệ dữ liệu an toàn
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onCancelSession}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:text-rose-600 hover:bg-rose-50 border border-slate-200/80 transition-colors cursor-pointer shrink-0 whitespace-nowrap"
          >
            <LogOut className="w-3.5 h-3.5 shrink-0" />
            <span>Hủy phiên</span>
          </button>
        </div>
      </div>

      {/* Hero Summary Blueprint (Exact Match to OwnerDashboard Geometry) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 relative overflow-hidden bg-white rounded-3xl border border-slate-200/85 p-5 sm:p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div className="h-3 w-36 rounded bg-slate-200/80" />
            <div className="h-6 w-24 rounded-lg bg-slate-100" />
          </div>
          <div className="space-y-2.5">
            <div className="h-10 sm:h-11 w-56 sm:w-64 rounded-xl bg-slate-200/85" />
            <div className="h-3 w-44 rounded bg-slate-100" />
          </div>
          <div className="space-y-2 pt-3 border-t border-slate-100">
            <div className="flex justify-between">
              <div className="h-3 w-28 rounded bg-emerald-100/80" />
              <div className="h-3 w-28 rounded bg-rose-100/80" />
            </div>
            <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden flex">
              <div className="w-3/5 h-full bg-emerald-200/75" />
              <div className="w-2/5 h-full bg-rose-200/65" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
            <div className="py-2 flex flex-col items-center gap-1.5">
              <div className="h-2.5 w-20 rounded bg-slate-200/75" />
              <div className="h-4 w-10 rounded bg-slate-200" />
            </div>
            <div className="py-2 flex flex-col items-center gap-1.5 border-l border-slate-100">
              <div className="h-2.5 w-20 rounded bg-slate-200/75" />
              <div className="h-4 w-10 rounded bg-slate-200" />
            </div>
          </div>
          <div className="pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-white/75 to-transparent -skew-x-12 animate-ledger-shimmer" />
        </div>

        <div className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
          {[
            { bg: 'bg-white border-slate-200/85', accent: 'bg-emerald-100/90' },
            { bg: 'bg-white border-slate-200/85', accent: 'bg-rose-100/90' },
          ].map((card, i) => (
            <div
              key={i}
              className={`relative overflow-hidden rounded-3xl border p-5 flex flex-col justify-between min-h-[132px] ${card.bg}`}
            >
              <div className="flex items-center justify-between">
                <div className="h-3 w-32 rounded bg-slate-200/80" />
                <div className="w-7 h-7 rounded-lg bg-slate-100" />
              </div>
              <div className={`h-8 w-40 rounded-xl ${card.accent}`} />
              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <div className="h-2.5 w-28 rounded bg-slate-200/70" />
                <div className="h-2.5 w-14 rounded bg-slate-200/70" />
              </div>
              <div
                className="pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-white/80 to-transparent -skew-x-12 animate-ledger-shimmer"
                style={{ animationDelay: `${i * 180}ms` }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Quick Action Strip Blueprint */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {[0, 1, 2].map((idx) => (
          <div
            key={idx}
            className="relative overflow-hidden h-15 rounded-2xl bg-white border border-slate-200/85 p-3 flex items-center gap-3"
          >
            <div className="w-8 h-8 rounded-xl bg-slate-100 shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-2.5 w-3/4 rounded bg-slate-200/85" />
              <div className="hidden sm:block h-2 w-1/2 rounded bg-slate-100" />
            </div>
            <div
              className="pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-white/80 to-transparent -skew-x-12 animate-ledger-shimmer"
              style={{ animationDelay: `${idx * 120}ms` }}
            />
          </div>
        ))}
      </div>

      {/* Ledger Rows Blueprint */}
      <div className="bg-white rounded-3xl border border-slate-200/85 p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
          <div className="flex gap-2">
            <div className="h-8 w-24 rounded-lg bg-slate-100" />
            <div className="h-8 w-24 rounded-lg bg-slate-50" />
            <div className="h-8 w-20 rounded-lg bg-slate-50 hidden sm:block" />
          </div>
          <div className="h-8 w-36 sm:w-52 rounded-lg bg-slate-100" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {[0, 1, 2, 3, 4, 5].map((idx) => (
            <div
              key={idx}
              className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 space-y-3"
            >
              <div className="flex items-center justify-between gap-2.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 shrink-0" />
                  <div className="space-y-1.5">
                    <div className="h-3.5 w-24 rounded bg-slate-200/85" />
                    <div className="h-2.5 w-16 rounded bg-slate-100" />
                  </div>
                </div>
                <div className="h-5 w-20 rounded-md bg-emerald-100/70" />
              </div>
              <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full w-2/3 bg-emerald-200/75" />
              </div>
              <div
                className="pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-white/80 to-transparent -skew-x-12 animate-ledger-shimmer"
                style={{ animationDelay: `${idx * 90}ms` }}
              />
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
};

interface WorkspaceConnectionErrorProps {
  isRetrying?: boolean;
  onRetry: () => void;
  onLogout: () => void;
}

export const WorkspaceConnectionError: React.FC<WorkspaceConnectionErrorProps> = ({
  isRetrying = false,
  onRetry,
  onLogout,
}) => {
  return (
    <motion.div
      key="view-workspace-error"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className="min-h-[68vh] flex items-center justify-center py-6"
    >
      <div className="w-full max-w-[440px] bg-white rounded-3xl border border-slate-200/90 shadow-[0_20px_50px_-24px_rgba(15,23,42,0.14)] overflow-hidden">
        {isRetrying && <KineticScanBar tone="amber" />}
        <div className="p-6 sm:p-8 space-y-6">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200/80 text-amber-600 flex items-center justify-center shrink-0">
              <WifiOff className="w-6 h-6 stroke-[2]" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-slate-900">
                Tạm gián đoạn đồng bộ dữ liệu
              </h2>
              <p className="text-xs sm:text-[13px] text-slate-600 mt-1 leading-relaxed">
                Hệ thống tạm khóa chỉnh sửa để đảm bảo không lệch số liệu giữa các thiết bị. Vui lòng kết nối lại khi mạng ổn định.
              </p>
            </div>
          </div>

          <div className="border-t border-b border-slate-200/80 divide-y divide-slate-100 text-xs text-slate-600">
            <div className="py-2.5 flex items-center justify-between gap-2">
              <span>Dữ liệu công nợ hiện có được bảo toàn an toàn</span>
              <span className="font-semibold text-emerald-700 shrink-0">An toàn</span>
            </div>
            <div className="py-2.5 flex items-center justify-between gap-2">
              <span>Thử kết nối lại để tiếp tục quản lý sổ</span>
              <span className="font-mono text-[11px] text-slate-400 shrink-0">Sẵn sàng</span>
            </div>
          </div>

          <div className="space-y-2">
            <button
              type="button"
              onClick={onRetry}
              disabled={isRetrying}
              className="w-full min-h-[46px] py-3 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-65 text-white font-bold text-sm rounded-xl shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-[0.99] whitespace-nowrap"
            >
              {isRetrying ? (
                <>
                  <LedgerWaveBars size="sm" tone="light" />
                  <span>Đang đồng bộ lại...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 shrink-0" />
                  <span>Thử kết nối lại</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onLogout}
              className="w-full py-2.5 px-4 text-rose-600 hover:bg-rose-50 font-semibold text-xs sm:text-sm rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              <span>Đăng xuất</span>
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
