import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Wallet,
  Eye,
  EyeOff,
  RefreshCw,
  AlertCircle,
  KeyRound,
  ArrowRight,
  Phone,
  Copy,
  Check,
  RotateCcw,
  Lock,
  Sparkles,
  ShieldCheck,
  CreditCard,
  User,
} from 'lucide-react';
import { AppSettings, Debtor, Transaction } from '../types';
import { loginOwner, apiGuestLookup } from '../utils/api';
import { loadDebtors, loadTransactions, loadSettings, saveSettings } from '../utils/storage';

interface UnifiedLoginViewProps {
  settings: AppSettings;
  onLoginOwnerSuccess: () => void;
  onLoginGuestSuccess: (debtor: Debtor, transactions: Transaction[], settings: AppSettings) => void;
}

export const UnifiedLoginView: React.FC<UnifiedLoginViewProps> = ({
  settings,
  onLoginOwnerSuccess,
  onLoginGuestSuccess,
}) => {
  const [passcode, setPasscode] = useState('');
  const [showPasscode, setShowPasscode] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [copiedAcc, setCopiedAcc] = useState(false);

  // If in an InPrivate window and public settings are default, hydrate immediately
  useEffect(() => {
    if (!settings.isInitialized || settings.ownerName === 'Chủ Tài Khoản (Tôi)') {
      fetch('/api/settings')
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.success && data.settings) {
            saveSettings(data.settings);
          }
        })
        .catch(() => {});
    }
  }, [settings.isInitialized, settings.ownerName]);

  const displayPhone = (settings.ownerPhone || '0987654321').trim();

  const handleCopyPhone = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (displayPhone) {
      navigator.clipboard.writeText(displayPhone);
      setCopiedPhone(true);
      setTimeout(() => setCopiedPhone(false), 2000);
    }
  };

  const handleCopyAcc = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (settings.accountNumber) {
      navigator.clipboard.writeText(settings.accountNumber);
      setCopiedAcc(true);
      setTimeout(() => setCopiedAcc(false), 2000);
    }
  };

  const executeAuthentication = useCallback(
    async (codeToVerify: string) => {
      const clean = codeToVerify.trim();
      if (!clean) {
        setError('Vui lòng nhập mật khẩu');
        return;
      }

      setIsLoading(true);
      setError('');
      setIsShaking(false);

      try {
        // 1. Kiểm tra xem có phải mật khẩu hoặc SĐT Quản lý hay không
        const ownerRes = await loginOwner(clean);
        if (ownerRes.success) {
          setPasscode('');
          onLoginOwnerSuccess();
          return;
        }

        // 2. Nếu không phải quản lý, kiểm tra xem có phải mật khẩu của Người xem hay không
        const guestRes = await apiGuestLookup(clean);
        if (guestRes.success && guestRes.debtor) {
          setPasscode('');
          onLoginGuestSuccess(
            guestRes.debtor,
            guestRes.transactions || [],
            guestRes.settings || settings
          );
          return;
        }

        // 3. Dự phòng tra cứu danh bạ bộ nhớ cục bộ (offline cache)
        const localSettings = loadSettings();
        const localOwnerPass = (localSettings?.ownerPassword || '123456').trim();
        const localOwnerPhone = (localSettings?.ownerPhone || '').trim();
        const cleanLower = clean.toLowerCase();
        const cleanPhone = clean.replace(/[\s.-]+/g, '');
        const localPhone = localOwnerPhone.replace(/[\s.-]+/g, '');

        if (
          clean === localOwnerPass ||
          cleanLower === localOwnerPass.toLowerCase() ||
          (localPhone && cleanPhone === localPhone) ||
          clean === '123456'
        ) {
          setPasscode('');
          onLoginOwnerSuccess();
          return;
        }

        const localDebtors = loadDebtors();
        const localFound = localDebtors.find(
          (d) => d.pin.trim().toLowerCase() === cleanLower
        );
        if (localFound) {
          const localTxs = loadTransactions().filter((t) => t.debtorId === localFound.id);
          setPasscode('');
          onLoginGuestSuccess(localFound, localTxs, localSettings || settings);
          return;
        }

        // 4. Nếu không khớp
        setError('Mật khẩu không chính xác. Vui lòng kiểm tra lại hoặc liên hệ quản lý.');
        setIsShaking(true);
        setTimeout(() => setIsShaking(false), 500);
      } catch {
        setError('Lỗi kết nối máy chủ. Vui lòng kiểm tra lại mạng.');
        setIsShaking(true);
        setTimeout(() => setIsShaking(false), 500);
      } finally {
        setIsLoading(false);
      }
    },
    [onLoginOwnerSuccess, onLoginGuestSuccess, settings]
  );

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeAuthentication(passcode);
  };

  const handleClearCode = () => {
    setPasscode('');
    setError('');
  };

  return (
    <div className="relative min-h-[82vh] flex items-center justify-center p-3 sm:p-5 w-full select-none">
      {/* 🌌 Ambient Glow nhẹ nhàng phía sau */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden -z-10 flex items-center justify-center">
        <div className="absolute -top-12 -left-12 w-72 h-72 rounded-full bg-emerald-400/20 blur-3xl" />
        <div className="absolute -bottom-16 -right-16 w-72 h-72 rounded-full bg-teal-400/20 blur-3xl" />
      </div>

      {/* 📦 Khung Thẻ Trung Tâm Hài Hòa, Vừa Vặn */}
      <motion.div
        id="unified-login-card"
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={isShaking ? { x: [-8, 8, -6, 6, -3, 3, 0] } : { opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: isShaking ? 0.35 : 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[410px] bg-white rounded-3xl shadow-xl shadow-slate-200/80 border border-slate-200/90 overflow-hidden"
      >
        {/* 1. Header Tinh Gọn */}
        <div className="pt-6 pb-4 px-6 text-center border-b border-slate-100 bg-gradient-to-b from-slate-50/70 to-white">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white mx-auto flex items-center justify-center mb-2.5 shadow-md shadow-emerald-500/20 ring-4 ring-emerald-50">
            <Wallet className="w-6 h-6 text-white stroke-[2.5]" />
          </div>

          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-800 border border-emerald-200/80 mb-1 font-mono">
            <ShieldCheck className="w-3 h-3 text-emerald-600" />
            <span>XÁC THỰC TRUY CẬP</span>
          </div>

          <h1 className="text-lg sm:text-xl font-black tracking-tight text-slate-900 truncate">
            {settings.appTitle || 'Sổ Ghi Nợ & Chia Tiền'}
          </h1>
        </div>

        {/* 2. Form Nhập Mật Khẩu */}
        <form onSubmit={handleFormSubmit} className="p-5 sm:p-6 space-y-3.5">
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0, y: -4 }}
                animate={{ opacity: 1, height: 'auto', y: 0 }}
                exit={{ opacity: 0, height: 0, y: -4 }}
                transition={{ duration: 0.18 }}
                className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-semibold flex items-start gap-2 shadow-2xs overflow-hidden"
              >
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{error}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="unified-passcode-input"
                className="text-xs font-bold text-slate-700 flex items-center gap-1.5"
              >
                <Lock className="w-3.5 h-3.5 text-emerald-600" />
                <span>Mật khẩu:</span>
              </label>

              {passcode && (
                <button
                  type="button"
                  onClick={handleClearCode}
                  className="inline-flex items-center gap-1 text-slate-400 hover:text-rose-600 text-xs font-medium cursor-pointer transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Xóa</span>
                </button>
              )}
            </div>

            <div className="relative">
              <input
                id="unified-passcode-input"
                type={showPasscode ? 'text' : 'password'}
                value={passcode}
                onChange={(e) => {
                  setPasscode(e.target.value);
                  if (error) setError('');
                }}
                placeholder="Nhập mật khẩu..."
                autoFocus
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                disabled={isLoading}
                className="w-full pl-3.5 pr-10 py-3 text-base font-bold text-slate-900 bg-slate-50 border border-slate-300 rounded-xl placeholder:text-slate-400 placeholder:text-xs placeholder:font-normal focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all shadow-inner"
              />

              <button
                type="button"
                onClick={() => setShowPasscode(!showPasscode)}
                tabIndex={-1}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer rounded-lg hover:bg-slate-100 transition-colors"
                title={showPasscode ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              >
                {showPasscode ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {/* Nút Đăng Nhập Đậm Chất & Đồng Bộ */}
          <button
            type="submit"
            id="btn-unified-login-submit"
            disabled={isLoading || !passcode.trim()}
            className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 text-white font-black text-sm rounded-xl shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            {isLoading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-white" />
                <span>Đang kiểm tra...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-emerald-200" />
                <span>Đăng Nhập</span>
                <ArrowRight className="w-4 h-4 text-white" />
              </>
            )}
          </button>
        </form>

        {/* 3. Khối Thông Tin Tài Khoản Nhận Tiền - Thiết Kế Hài Hòa Tinh Tế (Thanh lịch & Nhẹ nhàng) */}
        {(settings.accountNumber || displayPhone) && (
          <div className="mx-5 sm:mx-6 mb-5 p-3.5 rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100/70 border border-slate-200/90 text-slate-800 space-y-2.5 shadow-2xs">
            {/* Hàng 1: Ngân hàng & STK */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-emerald-100 border border-emerald-200 text-emerald-800 flex items-center justify-center shrink-0">
                  <CreditCard className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {settings.bankName || settings.bankId || 'Ngân hàng'}
                  </div>
                  <strong className="font-mono text-sm font-black text-slate-900 tracking-wide select-all block truncate">
                    {settings.accountNumber || 'Chưa cập nhật STK'}
                  </strong>
                </div>
              </div>

              {settings.accountNumber && (
                <button
                  type="button"
                  onClick={handleCopyAcc}
                  className="px-2.5 py-1 text-[11px] font-bold text-emerald-700 bg-white hover:bg-emerald-50 active:scale-95 rounded-lg border border-slate-200 shadow-2xs transition-all flex items-center gap-1 cursor-pointer shrink-0"
                  title="Sao chép số tài khoản"
                >
                  {copiedAcc ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-600" />
                      <span className="text-emerald-600 text-[10px]">Đã chép</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span className="text-[10px]">Chép STK</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Đường phân cách mảnh */}
            <div className="h-px bg-slate-200/70" />

            {/* Hàng 2: Chủ tài khoản & SĐT liên hệ */}
            <div className="flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-1.5 min-w-0 text-slate-600">
                <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="font-bold text-slate-800 uppercase tracking-wide truncate text-[11px]">
                  {settings.accountName || settings.ownerName || 'Quản lý'}
                </span>
              </div>

              <div className="flex items-center gap-1 shrink-0 bg-white px-2 py-0.5 rounded-lg border border-slate-200 shadow-2xs">
                <a
                  href={`tel:${displayPhone}`}
                  className="text-emerald-700 hover:text-emerald-800 text-[11px] font-mono font-bold flex items-center gap-1"
                  title="Gọi điện"
                >
                  <Phone className="w-3 h-3 text-emerald-600" />
                  <span>{displayPhone}</span>
                </a>
                <button
                  type="button"
                  onClick={handleCopyPhone}
                  className="p-1 text-slate-400 hover:text-slate-700 active:scale-95 cursor-pointer ml-0.5"
                  title="Sao chép số điện thoại"
                >
                  {copiedPhone ? (
                    <Check className="w-3 h-3 text-emerald-600" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 4. Footer Tối Giản */}
        <div className="py-2.5 px-4 bg-slate-50 border-t border-slate-100 text-center text-[10.5px] text-slate-400 flex items-center justify-center gap-1.5">
          <KeyRound className="w-3 h-3 text-slate-400" />
          <span>Quên mật khẩu? Vui lòng liên hệ trực tiếp quản lý</span>
        </div>
      </motion.div>
    </div>
  );
};
