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
  ScanFace,
  Fingerprint,
  X,
  Info,
} from 'lucide-react';
import { AppSettings, Debtor, Transaction } from '../types';
import { loginOwner, apiGuestLookup } from '../utils/api';
import { loadDebtors, loadTransactions, loadSettings, saveSettings, recordAuditLog } from '../utils/storage';
import { PWAInstallButton } from './PWAInstallButton';
import {
  isBiometricsAvailable,
  isBiometricsEnrolled,
  authenticateWithBiometrics,
  registerBiometrics,
} from '../utils/webauthn';

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

  // Sinh trắc học (FaceID / Touch ID)
  const [canUseBiometrics, setCanUseBiometrics] = useState(false);
  const [isBiometricEnrolled, setIsBiometricEnrolled] = useState(false);
  const [showEnrollPrompt, setShowEnrollPrompt] = useState(false);
  const [pendingOwnerCode, setPendingOwnerCode] = useState('');
  const [isBiometricLoading, setIsBiometricLoading] = useState(false);

  useEffect(() => {
    isBiometricsAvailable().then((avail) => {
      setCanUseBiometrics(avail);
      setIsBiometricEnrolled(isBiometricsEnrolled());
    });
  }, []);

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

  const displayPhone = (settings.ownerPhone || '').trim();

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

  const handleOwnerSuccess = (code: string) => {
    setPasscode('');
    if (canUseBiometrics && !isBiometricsEnrolled()) {
      setPendingOwnerCode(code);
      setShowEnrollPrompt(true);
    } else {
      onLoginOwnerSuccess();
    }
  };

  const handleBiometricLogin = async () => {
    setIsBiometricLoading(true);
    setError('');
    try {
      const res = await authenticateWithBiometrics();
      if (res.success) {
        if (res.passcode) {
          await executeAuthentication(res.passcode);
        } else {
          onLoginOwnerSuccess();
        }
      } else if (res.message) {
        setError(res.message);
      }
    } catch (err: any) {
      setError(err?.message || 'Lỗi quét FaceID / Vân tay');
    } finally {
      setIsBiometricLoading(false);
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
          handleOwnerSuccess(clean);
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
        const localOwnerPass = (localSettings?.ownerPassword || '').trim();
        const localOwnerPhone = (localSettings?.ownerPhone || '').trim();
        const cleanLower = clean.toLowerCase();
        const cleanPhone = clean.replace(/[\s.-]+/g, '');
        const localPhone = localOwnerPhone.replace(/[\s.-]+/g, '');

        if (
          (localOwnerPass && (clean === localOwnerPass || cleanLower === localOwnerPass.toLowerCase())) ||
          (localPhone && cleanPhone === localPhone)
        ) {
          handleOwnerSuccess(clean);
          return;
        }

        const localDebtors = loadDebtors();
        const localFound = localDebtors.find(
          (d) => d.pin.trim().toLowerCase() === cleanLower
        );
        if (localFound) {
          const localTxs = loadTransactions().filter((t) => t.debtorId === localFound.id);
          const balance = localTxs.reduce((acc, t) => acc + (t.type === 'ADD' ? t.amount : -t.amount), 0);
          const balanceStr = new Intl.NumberFormat('vi-VN').format(balance);
          recordAuditLog({
            action: 'GUEST_LOOKUP',
            actor: `Khách: ${localFound.name}`,
            title: 'Khách tra cứu sổ nợ',
            description: `Khách "${localFound.name}" đã nhập mã tra cứu (PIN: ${localFound.pin}) để xem bảng đối soát công nợ. Dư nợ hiện thời: ${balanceStr} VNĐ (${localTxs.length} giao dịch).`,
            debtorId: localFound.id,
            debtorName: localFound.name,
            amount: balance,
            beforeState: 'Trạng thái khách: Chưa đăng nhập tra cứu',
            afterState: `Đã nhập đúng mã PIN: ${localFound.pin}, đối soát số dư ${balanceStr} VNĐ (${localTxs.length} giao dịch)`,
            changes: [
              { fieldLabel: 'Mã PIN tra cứu', before: 'Chưa nhập', after: `Khớp PIN (${localFound.pin})` },
              { fieldLabel: 'Dư nợ đối soát', before: 'Ẩn', after: `${balanceStr} VNĐ (${localTxs.length} giao dịch)` },
            ],
          });
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
    <div className="relative min-h-[82vh] flex flex-col items-center justify-center p-3 sm:p-5 w-full select-none">
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
        className="w-full max-w-[390px] xs:max-w-[420px] sm:max-w-[440px] bg-white rounded-3xl shadow-xl shadow-slate-200/80 border border-slate-200/90 overflow-hidden"
      >
        {/* 1. Header Tinh Gọn & Rõ Ràng */}
        <div className="pt-6 sm:pt-7 pb-4 sm:pb-5 px-6 sm:px-8 text-center border-b border-slate-100 bg-gradient-to-b from-slate-50/70 to-white">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white mx-auto flex items-center justify-center mb-2.5 sm:mb-3 shadow-md shadow-emerald-500/20 ring-4 ring-emerald-50">
            <Wallet className="w-6 h-6 sm:w-7 sm:h-7 text-white stroke-[2.5]" />
          </div>

          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10.5px] sm:text-xs font-bold uppercase tracking-wider bg-emerald-50 text-emerald-800 border border-emerald-200/80 mb-1.5 font-mono">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>XÁC THỰC TRUY CẬP</span>
          </div>

          <h1 className="text-lg sm:text-xl md:text-2xl font-black tracking-tight text-slate-900 truncate">
            {settings.appTitle || 'Sổ Ghi NỢ & Chia Tiền'}
          </h1>
          {settings.appSubtitle && (
            <p className="text-xs sm:text-sm text-slate-500 mt-1 line-clamp-2 px-2 leading-relaxed">
              {settings.appSubtitle}
            </p>
          )}
        </div>

        {/* 2. Form Nhập Mật Khẩu */}
        <form onSubmit={handleFormSubmit} className="p-5 sm:p-6 space-y-4">
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0, y: -4 }}
                animate={{ opacity: 1, height: 'auto', y: 0 }}
                exit={{ opacity: 0, height: 0, y: -4 }}
                transition={{ duration: 0.18 }}
                className="p-3 sm:p-3.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs sm:text-sm font-semibold flex items-start gap-2 shadow-2xs overflow-hidden leading-relaxed"
              >
                <AlertCircle className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-rose-600 shrink-0 mt-0.5" />
                <span>{error}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="unified-passcode-input"
                className="text-xs sm:text-sm font-bold text-slate-700 flex items-center gap-1.5"
              >
                <Lock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600" />
                <span>Mật khẩu:</span>
              </label>

              {passcode && (
                <button
                  type="button"
                  onClick={handleClearCode}
                  className="inline-flex items-center gap-1 text-slate-400 hover:text-rose-600 text-xs sm:text-sm font-medium cursor-pointer transition-colors"
                >
                  <RotateCcw className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
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
                placeholder="Nhập mật khẩu tra cứu..."
                autoFocus
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                disabled={isLoading}
                className="w-full pl-3.5 sm:pl-4 pr-11 py-3 sm:py-3.5 text-base sm:text-lg font-bold text-slate-900 bg-slate-50 border border-slate-300 rounded-xl placeholder:text-slate-400 placeholder:text-xs sm:placeholder:text-sm placeholder:font-normal focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all shadow-inner"
              />

              <button
                type="button"
                onClick={() => setShowPasscode(!showPasscode)}
                tabIndex={-1}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 sm:p-2 text-slate-400 hover:text-slate-700 cursor-pointer rounded-lg hover:bg-slate-100 transition-colors"
                title={showPasscode ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              >
                {showPasscode ? (
                  <EyeOff className="w-4 h-4 sm:w-5 sm:h-5" />
                ) : (
                  <Eye className="w-4 h-4 sm:w-5 sm:h-5" />
                )}
              </button>
            </div>
          </div>

          {/* Nút Đăng Nhập Đậm Chất & Đồng Bộ */}
          <button
            type="submit"
            id="btn-unified-login-submit"
            disabled={isLoading || !passcode.trim()}
            className="w-full py-3 sm:py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 text-white font-black text-sm sm:text-base rounded-xl shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
          >
            {isLoading ? (
              <>
                <RefreshCw className="w-4 h-4 sm:w-5 sm:h-5 animate-spin text-white" />
                <span>Đang kiểm tra...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-emerald-200" />
                <span>Đăng Nhập</span>
                <ArrowRight className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-white" />
              </>
            )}
          </button>

          {/* Nút Đăng Nhập FaceID / Vân Tay 1-Chạm */}
          {canUseBiometrics && (
            <div className="pt-1">
              <button
                type="button"
                id="btn-faceid-login"
                onClick={isBiometricEnrolled ? handleBiometricLogin : () => {
                  setError('Vui lòng nhập mật khẩu quản lý để đăng nhập và kích hoạt FaceID cho thiết bị này.');
                }}
                disabled={isLoading || isBiometricLoading}
                className="w-full py-2.5 sm:py-3 px-3.5 bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 hover:from-emerald-100 hover:to-teal-100 active:from-emerald-200 active:to-teal-200 border border-emerald-300/80 text-emerald-950 font-bold text-xs sm:text-sm rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99] shadow-2xs"
                title="Đăng nhập bằng FaceID / Vân tay bảo mật"
              >
                {isBiometricLoading ? (
                  <RefreshCw className="w-4 h-4 text-emerald-700 animate-spin" />
                ) : (
                  <ScanFace className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-700 shrink-0" />
                )}
                <span>
                  {isBiometricEnrolled
                    ? 'Đăng Nhập Bằng FaceID / Vân Tay'
                    : 'Kích Hoạt Đăng Nhập FaceID'}
                </span>
              </button>
            </div>
          )}
        </form>

        {/* 3. Khối Thông Tin Tài Khoản Nhận Tiền - Thiết Kế Hài Hòa Tinh Tế (Thanh lịch & Nhẹ nhàng) */}
        {(settings.accountNumber || displayPhone) && (
          <div className="mx-5 sm:mx-6 mb-5 p-3.5 sm:p-4 rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100/70 border border-slate-200/90 text-slate-800 space-y-2.5 sm:space-y-3 shadow-2xs">
            {/* Hàng 1: Ngân hàng & STK */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-emerald-100 border border-emerald-200 text-emerald-800 flex items-center justify-center shrink-0">
                  <CreditCard className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-400 leading-tight">
                    {settings.bankName || settings.bankId || 'Ngân hàng'}
                  </div>
                  <strong className="font-mono text-sm sm:text-base font-black text-slate-900 tracking-wide select-all block truncate mt-0.5">
                    {settings.accountNumber || 'Chưa cập nhật STK'}
                  </strong>
                </div>
              </div>

              {settings.accountNumber && (
                <button
                  type="button"
                  onClick={handleCopyAcc}
                  className="px-2.5 sm:px-3 py-1 sm:py-1.5 text-[11px] sm:text-xs font-bold text-emerald-700 bg-white hover:bg-emerald-50 active:scale-95 rounded-lg border border-slate-200 shadow-2xs transition-all flex items-center gap-1 cursor-pointer shrink-0"
                  title="Sao chép số tài khoản"
                >
                  {copiedAcc ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-600">Đã chép</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Chép STK</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Đường phân cách mảnh */}
            <div className="h-px bg-slate-200/70" />

            {/* Hàng 2: Chủ tài khoản & SĐT liên hệ */}
            <div className="flex items-center justify-between gap-2 text-xs sm:text-sm">
              <div className="flex items-center gap-1.5 min-w-0 text-slate-600">
                <User className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400 shrink-0" />
                <span className="font-bold text-slate-800 uppercase tracking-wide truncate text-[11px] sm:text-xs">
                  {settings.accountName || settings.ownerName || 'Quản lý'}
                </span>
              </div>

              <div className="flex items-center gap-1 shrink-0 bg-white px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-lg border border-slate-200 shadow-2xs">
                <a
                  href={`tel:${displayPhone}`}
                  className="text-emerald-700 hover:text-emerald-800 text-[11px] sm:text-xs font-mono font-bold flex items-center gap-1"
                  title="Gọi điện"
                >
                  <Phone className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-600" />
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

        {/* 4. Footer Tối Giản & Gọn Gàng */}
        <div className="py-2.5 sm:py-3 px-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-2 text-[11px] sm:text-xs">
          <div className="flex items-center gap-1.5 text-slate-400 font-medium truncate">
            <KeyRound className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="truncate">Quên mật khẩu? Liên hệ quản lý</span>
          </div>
          <PWAInstallButton variant="inline" />
        </div>
      </motion.div>

      {/* Modal Đề Xuất Kích Hoạt FaceID Sau Khi Đăng Nhập Quản Lý */}
      {showEnrollPrompt && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/35 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 max-w-sm w-full shadow-2xl text-center space-y-4">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shadow-inner">
              <ScanFace className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">Kích Hoạt FaceID / Vân Tay?</h3>
              <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                Những lần sau, bạn chỉ cần 1 chạm hoặc 1 cái liếc mắt là mở khóa Sổ Ghi Nợ ngay lập tức, không cần gõ lại mật khẩu.
              </p>
            </div>
            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={async () => {
                  setIsBiometricLoading(true);
                  const res = await registerBiometrics(pendingOwnerCode);
                  setIsBiometricLoading(false);
                  setShowEnrollPrompt(false);
                  onLoginOwnerSuccess();
                }}
                disabled={isBiometricLoading}
                className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-xs sm:text-sm rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-emerald-600/20 active:scale-[0.99]"
              >
                {isBiometricLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-white" />
                ) : (
                  <ScanFace className="w-4 h-4 text-white" />
                )}
                <span>Kích Hoạt FaceID Ngay</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowEnrollPrompt(false);
                  onLoginOwnerSuccess();
                }}
                className="w-full py-2.5 px-4 text-slate-500 hover:text-slate-800 font-semibold text-xs cursor-pointer rounded-xl hover:bg-slate-100 transition-colors"
              >
                Để Sau
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
