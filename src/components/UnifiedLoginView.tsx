import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Wallet,
  Eye,
  EyeOff,
  RefreshCw,
  ShieldCheck,
  AlertCircle,
  KeyRound,
  ArrowRight,
  User,
  Crown,
  Phone,
  CreditCard,
  Copy,
  Check,
  HelpCircle,
} from 'lucide-react';
import { AppSettings, Debtor, Transaction } from '../types';
import { loginOwner, apiGuestLookup } from '../utils/api';
import { loadDebtors, loadTransactions, loadSettings } from '../utils/storage';

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
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [copiedAcc, setCopiedAcc] = useState(false);

  const handleCopyPhone = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (settings.ownerPhone) {
      navigator.clipboard.writeText(settings.ownerPhone);
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

  const handleAuthenticate = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = passcode.trim();
    if (!clean) {
      setError('Vui lòng nhập mã PIN con nợ hoặc mật khẩu chủ nợ');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      // 1. Kiểm tra xem có phải mật khẩu Chủ nợ hay không
      const ownerRes = await loginOwner(clean);
      if (ownerRes.success) {
        setPasscode('');
        onLoginOwnerSuccess();
        return;
      }

      // 2. Nếu không phải chủ nợ, kiểm tra xem có phải mã PIN của Con nợ hay không
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
      const localDebtors = loadDebtors();
      const localFound = localDebtors.find(
        (d) => d.pin.trim().toLowerCase() === clean.toLowerCase()
      );
      if (localFound) {
        const localTxs = loadTransactions().filter((t) => t.debtorId === localFound.id);
        const localSettings = loadSettings();
        setPasscode('');
        onLoginGuestSuccess(localFound, localTxs, localSettings);
        return;
      }

      // 4. Nếu cả 2 đều không khớp
      setError('Mật khẩu hoặc mã PIN không chính xác. Vui lòng kiểm tra lại hoặc liên hệ chủ nợ.');
    } catch {
      setError('Lỗi kết nối máy chủ. Vui lòng kiểm tra lại mạng.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[75vh] flex items-center justify-center p-3 sm:p-4 w-full">
      <motion.div
        id="unified-login-card"
        initial={{ opacity: 0, scale: 0.95, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-slate-200/90 overflow-hidden relative"
      >
        {/* Top Header Card - Phong cách sáng thanh lịch & sang trọng */}
        <div className="bg-gradient-to-b from-slate-50 via-slate-50/80 to-white text-slate-900 p-6 sm:p-7 text-center relative border-b border-slate-100">
          <motion.div
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.08, duration: 0.25 }}
            className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-500 via-teal-500 to-cyan-500 text-white mx-auto flex items-center justify-center mb-3 shadow-md shadow-emerald-500/20 ring-4 ring-emerald-50"
          >
            <Wallet className="w-7 h-7 text-slate-950 stroke-[2.5]" />
          </motion.div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-800 border border-emerald-200 mb-2 font-mono">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>XÁC THỰC THÔNG MINH</span>
          </div>

          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900">
            {settings.appTitle || 'Sổ Ghi Nợ & Chia Tiền'}
          </h1>
        </div>

        {/* Khối Thông Tin Chủ Nợ (Creditor Info) */}
        <div className="mx-5 sm:mx-6 mt-5 p-3.5 sm:p-4 bg-slate-50/90 border border-slate-200/90 rounded-2xl shadow-2xs space-y-3">
          <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-200/80">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-amber-100 border border-amber-200 text-amber-800 flex items-center justify-center shrink-0 shadow-2xs">
                <Crown className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Liên hệ
                </span>
                <span className="text-sm font-black text-slate-900 truncate block">
                  {settings.ownerName || 'Chủ Sổ'}
                </span>
              </div>
            </div>

            {settings.ownerPhone && (
              <div className="flex items-center gap-1.5 shrink-0">
                <a
                  href={`tel:${settings.ownerPhone}`}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  title="Gọi điện cho chủ nợ"
                >
                  <Phone className="w-3 h-3 text-emerald-600" />
                  <span className="font-mono">{settings.ownerPhone}</span>
                </a>
                <button
                  type="button"
                  onClick={handleCopyPhone}
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 rounded-lg transition-colors cursor-pointer"
                  title="Sao chép số điện thoại"
                >
                  {copiedPhone ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Tài khoản ngân hàng nhận chuyển khoản của Chủ Nợ */}
          {(settings.accountNumber || settings.bankName) && (
            <div className="flex items-center justify-between text-[11px] text-slate-600 gap-2 bg-white p-2.5 rounded-xl border border-slate-200/80">
              <div className="flex items-center gap-2 min-w-0">
                <CreditCard className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span className="truncate">
                  {settings.bankName || settings.bankId} • <strong className="font-mono text-slate-900">{settings.accountNumber}</strong>
                  {settings.accountName && (
                    <span className="text-slate-500 ml-1">({settings.accountName})</span>
                  )}
                </span>
              </div>
              <button
                type="button"
                onClick={handleCopyAcc}
                className="px-2 py-0.5 text-[10px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 active:bg-blue-200 rounded-md border border-blue-200 transition-colors cursor-pointer shrink-0 flex items-center gap-1"
                title="Sao chép số tài khoản"
              >
                {copiedAcc ? (
                  <>
                    <Check className="w-3 h-3 text-blue-700" />
                    <span>Đã chép</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>Chép STK</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Single Input Form */}
        <form onSubmit={handleAuthenticate} className="p-5 sm:p-6 space-y-4">
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0, y: -6 }}
                animate={{ opacity: 1, height: 'auto', y: 0 }}
                exit={{ opacity: 0, height: 0, y: -6 }}
                transition={{ duration: 0.2 }}
                className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl text-xs font-semibold leading-relaxed flex items-start gap-2.5 shadow-2xs overflow-hidden"
              >
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{error}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <div>
            <label
              htmlFor="unified-passcode-input"
              className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2 text-center"
            >
              Nhập Mã PIN hoặc Mật Khẩu:
            </label>
            <div className="relative">
              <input
                id="unified-passcode-input"
                type={showPasscode ? 'text' : 'password'}
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="Ví dụ: 1234, nam123..."
                autoFocus
                className="w-full px-5 py-3.5 text-center text-xl sm:text-2xl font-black font-mono tracking-widest bg-slate-50 border border-slate-300 rounded-2xl text-slate-900 placeholder:text-slate-400 placeholder:tracking-normal placeholder:font-normal placeholder:text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all shadow-inner"
              />
              <button
                type="button"
                onClick={() => setShowPasscode(!showPasscode)}
                className="absolute right-3.5 top-3.5 text-slate-400 hover:text-slate-600 cursor-pointer p-1.5 rounded-xl hover:bg-slate-200/60 transition-colors"
                title={showPasscode ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              >
                {showPasscode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Hướng Dẫn Tự Động Nhận Diện Trực Quan */}
          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <div className="p-3 bg-emerald-50/70 border border-emerald-100 rounded-2xl text-[11px] text-emerald-900 space-y-1">
              <div className="font-extrabold flex items-center gap-1 text-emerald-800">
                <User className="w-3.5 h-3.5 text-emerald-600" />
                <span>Người xem</span>
              </div>
              <p className="text-emerald-700 leading-snug">
                Nhập mã PIN cá nhân do Quản lý cấp để xem chi tiết.
              </p>
            </div>

            <div className="p-3 bg-amber-50/70 border border-amber-100 rounded-2xl text-[11px] text-amber-900 space-y-1">
              <div className="font-extrabold flex items-center gap-1 text-amber-800">
                <Crown className="w-3.5 h-3.5 text-amber-600" />
                <span>Quản lý</span>
              </div>
              <p className="text-amber-700 leading-snug">
                Nhập mật khẩu quản lý để ghi nợ, tính toán và quản lý.
              </p>
            </div>
          </div>

          <motion.button
            whileHover={{ scale: 1.015 }}
            whileTap={{ scale: 0.985 }}
            type="submit"
            id="btn-unified-login-submit"
            disabled={isLoading || !passcode.trim()}
            className="w-full py-3.5 px-5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 text-white font-black text-sm rounded-2xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            {isLoading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-white" />
                <span>Đang xác thực thông tin...</span>
              </>
            ) : (
              <>
                <span>Xác Thực &amp; Truy Cập</span>
                <ArrowRight className="w-4 h-4 text-white" />
              </>
            )}
          </motion.button>
        </form>

        {/* Footer Note */}
        <div className="p-3.5 bg-slate-50/90 border-t border-slate-100 text-center text-[11px] text-slate-500 flex items-center justify-center gap-1.5">
          <KeyRound className="w-3.5 h-3.5 text-slate-400" />
          <span>Quên mã PIN? Vui lòng liên hệ trực tiếp quản lý</span>
        </div>
      </motion.div>
    </div>
  );
};
