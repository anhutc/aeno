import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Wallet, WifiOff, RefreshCw, ShieldCheck, Check, Globe, Lock } from 'lucide-react';
import { KineticScanBar, LedgerWaveBars } from './DataPulseLoader';

interface StartupConnectionGateProps {
  status: 'connecting' | 'error';
  isRetrying?: boolean;
  onRetry: () => void;
}

const CONNECTION_STEPS = [
  {
    id: 'channel',
    label: 'Thiết lập đường truyền máy chủ',
    hint: 'Kiểm tra độ ổn định mạng & độ trễ phản hồi',
    icon: Globe,
    thresholdMs: 550,
  },
  {
    id: 'security',
    label: 'Khởi tạo lớp bảo mật truy cập',
    hint: 'Xác nhận chính sách riêng tư & phiên làm việc',
    icon: Lock,
    thresholdMs: 1300,
  },
  {
    id: 'config',
    label: 'Đồng bộ thông tin sổ & cấu hình',
    hint: 'Chuẩn bị cổng đăng nhập chủ sổ và khách',
    icon: ShieldCheck,
    thresholdMs: 2400,
  },
];

export const StartupConnectionGate: React.FC<StartupConnectionGateProps> = ({
  status,
  isRetrying = false,
  onRetry,
}) => {
  const isError = status === 'error';
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (isError && !isRetrying) {
      setElapsedMs(0);
      return;
    }
    const startedAt = Date.now();
    setElapsedMs(0);
    const timer = setInterval(() => {
      setElapsedMs(Date.now() - startedAt);
    }, 150);
    return () => clearInterval(timer);
  }, [isError, isRetrying]);

  const elapsedSecStr = `${(elapsedMs / 1000).toFixed(1)}s`;

  return (
    <div className="relative min-h-dvh w-full flex flex-col items-center justify-center p-4 sm:p-6 bg-[#f8fafc] overflow-hidden select-none">
      {/* Crisp Architectural Grid Backdrop */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.45]"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(148,163,184,0.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.12) 1px, transparent 1px)',
          backgroundSize: '36px 36px',
        }}
      />

      <motion.div
        key={status}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-[440px] bg-white rounded-3xl border border-slate-200/90 shadow-[0_20px_50px_-24px_rgba(15,23,42,0.16)] overflow-hidden"
      >
        {(!isError || isRetrying) && (
          <KineticScanBar tone={isError ? 'amber' : 'emerald'} />
        )}

        <div className="p-6 sm:p-8">
          {!isError ? (
            <div className="space-y-6">
              {/* Top Emblem & Title */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="relative w-13 h-13 shrink-0 flex items-center justify-center">
                    {/* Rotating Architectural Orbital Arc */}
                    <motion.svg
                      viewBox="0 0 56 56"
                      className="absolute inset-0 w-full h-full text-emerald-500/75"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 2.8, repeat: Infinity, ease: 'linear' }}
                    >
                      <circle
                        cx="28"
                        cy="28"
                        r="25"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeDasharray="44 114"
                        strokeLinecap="round"
                      />
                    </motion.svg>
                    <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-sm shadow-emerald-600/25">
                      <Wallet className="w-5 h-5 stroke-[2.2]" />
                    </div>
                  </div>

                  <div className="min-w-0">
                    <h1 className="text-lg sm:text-xl font-extrabold tracking-tight text-slate-900">
                      Đang kết nối dữ liệu
                    </h1>
                    <p className="text-xs sm:text-[13px] text-slate-500 mt-0.5 leading-snug">
                      Hệ thống đang xác lập kênh truyền an toàn
                    </p>
                  </div>
                </div>

                <span className="font-mono tabular-nums text-xs font-semibold text-slate-400 pt-1 shrink-0">
                  {elapsedSecStr}
                </span>
              </div>

              {/* Clean Hairline Step Sequencer (No Nested Card Clutter) */}
              <div className="border-t border-b border-slate-200/80 divide-y divide-slate-100">
                {CONNECTION_STEPS.map((step, index) => {
                  const Icon = step.icon;
                  const isDone = elapsedMs >= step.thresholdMs;
                  const isActive =
                    !isDone &&
                    (index === 0 || elapsedMs >= CONNECTION_STEPS[index - 1].thresholdMs);

                  return (
                    <div
                      key={step.id}
                      className="py-3.5 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                            isDone
                              ? 'bg-emerald-50 text-emerald-700'
                              : isActive
                              ? 'bg-slate-100 text-slate-800'
                              : 'bg-slate-50 text-slate-400'
                          }`}
                        >
                          {isDone ? (
                            <Check className="w-4 h-4 stroke-[2.5]" />
                          ) : (
                            <Icon className="w-4 h-4" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div
                            className={`text-xs sm:text-[13px] font-semibold truncate transition-colors ${
                              isDone
                                ? 'text-slate-900'
                                : isActive
                                ? 'text-slate-800'
                                : 'text-slate-400'
                            }`}
                          >
                            {step.label}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate mt-0.5">
                            {step.hint}
                          </div>
                        </div>
                      </div>

                      <div className="shrink-0 w-10 flex justify-end">
                        {isDone ? (
                          <span className="text-[11px] font-semibold text-emerald-700">
                            Xong
                          </span>
                        ) : isActive ? (
                          <LedgerWaveBars size="xs" tone="emerald" />
                        ) : (
                          <span className="text-[11px] text-slate-300 font-mono">···</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>Tự động mở khóa ngay khi sẵn sàng</span>
                <span className="font-medium text-slate-500">Bảo mật đầu cuối</span>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Outcome 1: Clean Error State */}
              <div className="flex items-start gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200/80 text-rose-600 flex items-center justify-center shrink-0">
                  <WifiOff className="w-6 h-6 stroke-[2]" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-lg sm:text-xl font-extrabold tracking-tight text-slate-900">
                    Chưa thể kết nối máy chủ
                  </h1>
                  <p className="text-xs sm:text-[13px] text-slate-600 mt-1 leading-relaxed">
                    Đường truyền tới hệ thống đang tạm gián đoạn. Dữ liệu sổ nợ vẫn được bảo vệ an toàn.
                  </p>
                </div>
              </div>

              <div className="border-t border-b border-slate-200/80 divide-y divide-slate-100 text-xs text-slate-600">
                <div className="py-2.5 flex items-center justify-between gap-2">
                  <span>Kiểm tra kết nối Wi-Fi hoặc 4G/5G trên thiết bị</span>
                  <span className="font-mono text-[11px] text-slate-400 shrink-0">Bước 01</span>
                </div>
                <div className="py-2.5 flex items-center justify-between gap-2">
                  <span>Nhấn nút bên dưới để thiết lập lại đường truyền</span>
                  <span className="font-mono text-[11px] text-slate-400 shrink-0">Bước 02</span>
                </div>
              </div>

              <div className="space-y-2.5">
                <button
                  type="button"
                  id="btn-startup-retry"
                  onClick={onRetry}
                  disabled={isRetrying}
                  className="w-full min-h-[48px] py-3 px-5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-65 text-white font-bold text-sm sm:text-base rounded-xl shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center gap-2.5 cursor-pointer active:scale-[0.99] whitespace-nowrap"
                >
                  {isRetrying ? (
                    <>
                      <LedgerWaveBars size="sm" tone="light" />
                      <span>Đang kết nối lại... ({elapsedSecStr})</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4 shrink-0" />
                      <span>Thử kết nối lại</span>
                    </>
                  )}
                </button>

                <p className="text-center text-[11.5px] text-slate-400 pt-0.5">
                  Nếu sự cố tiếp diễn, vui lòng liên hệ người quản lý sổ.
                </p>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};
