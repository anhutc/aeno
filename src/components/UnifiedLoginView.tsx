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
} from 'lucide-react';
import { AppSettings, Debtor, Transaction } from '../types';
import { loginOwner, apiGuestLookup } from '../utils/api';
import { loadDebtors, loadTransactions, loadSettings, recordAuditLog } from '../utils/storage';
import { PWAInstallButton } from './PWAInstallButton';
import {
  isBiometricsAvailable,
  isBiometricsEnrolled,
  authenticateWithBiometrics,
} from '../utils/webauthn';

interface UnifiedLoginViewProps {
  settings: AppSettings;
  cloudStatus?: {
    checked?: boolean;
    configured?: boolean;
    connected?: boolean;
    needsUpgrade?: boolean;
    error: string | null;
    errorCode?: string | null;
  };
  onRefreshCloudStatus?: () => Promise<void> | void;
  onLoginOwnerSuccess: () => void;
  onLoginGuestSuccess: (debtor: Debtor, transactions: Transaction[], settings: AppSettings) => void;
}

export const UnifiedLoginView: React.FC<UnifiedLoginViewProps> = ({
  settings,
  cloudStatus,
  onRefreshCloudStatus,
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
  const [isBiometricLoading, setIsBiometricLoading] = useState(false);

  // Trạng thái thử kết nối lại máy chủ
  const [isRetryingCloud, setIsRetryingCloud] = useState(false);

  const isCheckingInitialCloud = cloudStatus?.checked === false;
  const isCloudDisconnected = Boolean(
    cloudStatus?.checked && (cloudStatus?.configured === false || cloudStatus?.connected === false || cloudStatus?.error)
  );
  const isLoginBlockedByCloud = isCheckingInitialCloud || isCloudDisconnected;

  useEffect(() => {
    isBiometricsAvailable().then((avail) => {
      setCanUseBiometrics(avail);
      setIsBiometricEnrolled(isBiometricsEnrolled());
    });
  }, []);

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

  const handleOwnerSuccess = () => {
    setPasscode('');
    onLoginOwnerSuccess();
  };

  const handleBiometricLogin = async () => {
    setIsBiometricLoading(true);
    setError('');
    try {
      const res = await authenticateWithBiometrics();
      if (res.success) {
        if (res.passcode) {
          await executeAuthentication(res.passcode, 'FACE_ID');
        } else {
          recordAuditLog({
            action: 'BIOMETRIC_AUTH',
            actor: `Chủ Sổ (${settings.ownerName || 'Admin'})`,
            title: 'Đăng nhập bằng FaceID / Vân tay',
            description: 'Chủ sổ đã mở khóa nhanh thành công bằng sinh trắc học (FaceID / Touch ID) trên thiết bị này.',
            beforeState: 'Màn hình khóa đăng nhập',
            afterState: 'Đã xác thực phiên quản trị qua Sinh trắc học',
            changes: [{ fieldLabel: 'Phương thức xác thực', before: 'Khóa', after: 'FaceID / Touch ID' }],
          });
          onLoginOwnerSuccess();
        }
      } else if (res.message) {
        recordAuditLog({
          action: 'LOGIN_FAILED',
          actor: 'Chủ Sổ (Admin)',
          title: 'Sinh trắc học thất bại',
          description: `Xác thực FaceID / Vân tay thất bại: ${res.message}`,
          beforeState: 'Yêu cầu quét FaceID / Vân tay',
          afterState: 'Thất bại',
          changes: [{ fieldLabel: 'Sinh trắc học', before: 'Đang quét', after: `Thất bại (${res.message})` }],
          metadata: { method: 'FACE_ID', reason: res.message },
        });
        setError(res.message);
      }
    } catch (err: any) {
      recordAuditLog({
        action: 'OPERATION_FAILED',
        actor: 'Chủ Sổ (Admin)',
        title: 'Lỗi sinh trắc học',
        description: `Lỗi quét FaceID / Vân tay: ${err?.message || 'Thiết bị không hỗ trợ hoặc bị hủy'}`,
        beforeState: 'Yêu cầu quét FaceID / Vân tay',
        afterState: 'Lỗi',
        changes: [{ fieldLabel: 'Sinh trắc học', before: 'Đang quét', after: 'Lỗi' }],
        metadata: { method: 'FACE_ID', error: err?.message },
      });
      setError(err?.message || 'Lỗi quét FaceID / Vân tay');
    } finally {
      setIsBiometricLoading(false);
    }
  };

  const executeAuthentication = useCallback(
    async (codeToVerify: string, methodHint?: 'PASSWORD' | 'FACE_ID') => {
      if (isCheckingInitialCloud) {
        setError('Đang kết nối hệ thống, vui lòng chờ giây lát...');
        return;
      }
      if (isCloudDisconnected) {
        setError('Hệ thống đang tạm gián đoạn kết nối. Vui lòng thử lại sau hoặc liên hệ quản lý.');
        return;
      }
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
        const ownerRes = await loginOwner(clean, methodHint);
        if (ownerRes.success) {
          handleOwnerSuccess();
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

        const rawErrCode =
          (guestRes as any)?.errorCode === 'SHEETS_NOT_CONFIGURED' ||
          ownerRes.errorCode === 'SHEETS_NOT_CONFIGURED'
            ? 'SHEETS_NOT_CONFIGURED'
            : (guestRes as any)?.errorCode === 'SHEETS_LEGACY_SCRIPT' ||
              ownerRes.errorCode === 'SHEETS_LEGACY_SCRIPT'
            ? 'SHEETS_LEGACY_SCRIPT'
            : (guestRes as any)?.errorCode === 'SHEETS_UNAVAILABLE' ||
              ownerRes.errorCode === 'SHEETS_UNAVAILABLE'
            ? 'SHEETS_UNAVAILABLE'
            : undefined;

        // 3. Dự phòng tra cứu bộ nhớ cục bộ CHỈ KHI không bị lỗi cấu hình/kết nối Google Sheets từ máy chủ
        const localSettings = loadSettings();
        const localDebtors = loadDebtors();
        const hasLocalCache = Boolean(localSettings?.isInitialized || localDebtors.length > 0);
        const cleanLower = clean.toLowerCase();

        if (!rawErrCode && hasLocalCache) {
          const localOwnerPass = (localSettings?.ownerPassword || '').trim();
          const localOwnerPhone = (localSettings?.ownerPhone || '').trim();
          const cleanPhone = clean.replace(/[\s.-]+/g, '');
          const localPhone = localOwnerPhone.replace(/[\s.-]+/g, '');

          const isPhoneMatch = Boolean(localPhone && cleanPhone === localPhone);
          if (
            (localOwnerPass && (clean === localOwnerPass || cleanLower === localOwnerPass.toLowerCase())) ||
            isPhoneMatch
          ) {
            const authMethod =
              methodHint === 'FACE_ID'
                ? 'FaceID / Sinh trắc học'
                : isPhoneMatch
                ? 'Số điện thoại chủ sổ'
                : 'Mật khẩu quản trị';
            recordAuditLog({
              action: methodHint === 'FACE_ID' ? 'BIOMETRIC_AUTH' : 'LOGIN_SUCCESS',
              actor: `Chủ Sổ (${localSettings?.ownerName || 'Admin'})`,
              title: methodHint === 'FACE_ID' ? 'Đăng nhập FaceID (Offline Cache)' : 'Đăng nhập quản trị (Offline Cache)',
              description: `Chủ sổ đã đăng nhập thành công qua ${authMethod} từ bộ nhớ cục bộ.`,
              beforeState: 'Chưa đăng nhập',
              afterState: `Đã mở khóa phiên quản trị (${authMethod})`,
              changes: [{ fieldLabel: 'Phương thức', before: 'Khóa', after: authMethod }],
              metadata: { authChannel: 'Local Cache', loginMethod: authMethod },
            });
            handleOwnerSuccess();
            return;
          }

          const localFound = localDebtors.find(
            (d) => d.pin.trim().toLowerCase() === cleanLower
          );
          if (localFound) {
            const localTxs = loadTransactions().filter((t) => t.debtorId === localFound.id);
            const addTotal = localTxs.filter((t) => t.type === 'ADD').reduce((a, t) => a + t.amount, 0);
            const subTotal = localTxs.filter((t) => t.type === 'SUB').reduce((a, t) => a + t.amount, 0);
            const balance = addTotal - subTotal;
            const balanceStr = new Intl.NumberFormat('vi-VN').format(balance);
            recordAuditLog({
              action: 'GUEST_LOOKUP',
              actor: `Khách: ${localFound.name}`,
              title: `Khách tra cứu sổ nợ: ${localFound.name}`,
              description: `Khách "${localFound.name}" đã nhập mã tra cứu (PIN: ${localFound.pin}) để xem bảng đối soát công nợ (Offline Cache). Dư nợ hiện thời: ${balanceStr} VNĐ (${localTxs.length} giao dịch).`,
              debtorId: localFound.id,
              debtorName: localFound.name,
              amount: balance,
              beforeState: 'Trạng thái khách: Chưa đăng nhập tra cứu',
              afterState: `Đã nhập đúng mã PIN: ${localFound.pin}, đối soát số dư ${balanceStr} VNĐ (${localTxs.length} giao dịch)`,
              changes: [
                { fieldLabel: 'Mã PIN tra cứu', before: 'Chưa nhập', after: `Khớp PIN (${localFound.pin})` },
                { fieldLabel: 'Nguồn dữ liệu', before: '-', after: 'Bộ nhớ cục bộ (Offline)' },
                { fieldLabel: 'Dư nợ đối soát', before: 'Ẩn', after: `${balanceStr} VNĐ (${localTxs.length} giao dịch)` },
              ],
              metadata: {
                pin: localFound.pin,
                source: 'Offline Cache',
                balance,
                totalAdd: addTotal,
                totalSub: subTotal,
                txCount: localTxs.length,
              },
            });
            setPasscode('');
            onLoginGuestSuccess(localFound, localTxs, localSettings || settings);
            return;
          }
        }

        // 4. Nếu hệ thống mất kết nối hoặc chưa sẵn sàng, hiển thị thông báo an toàn (không lộ thông tin máy chủ)
        if (rawErrCode) {
          const safeUnavailableMsg =
            'Hệ thống đang tạm gián đoạn kết nối. Vui lòng thử lại sau hoặc liên hệ quản lý.';

          recordAuditLog({
            action: 'OPERATION_FAILED',
            actor: 'Hệ thống',
            title: 'Tạm gián đoạn kết nối khi xác thực',
            description: 'Không thể kết nối máy chủ để xác thực truy cập.',
            beforeState: 'Gửi yêu cầu xác thực',
            afterState: 'Tạm gián đoạn kết nối',
            changes: [{ fieldLabel: 'Trạng thái kết nối', before: 'Đang kiểm tra', after: 'Gián đoạn' }],
          });
          setError(safeUnavailableMsg);
          setIsShaking(true);
          setTimeout(() => setIsShaking(false), 500);
          return;
        }

        // 5. Nếu CSDL kết nối bình thường nhưng mã không khớp
        const masked = clean.length > 2 ? `${clean.slice(0, 1)}***${clean.slice(-1)}` : '***';
        recordAuditLog({
          action: 'LOOKUP_FAILED',
          actor: 'Khách / Người dùng',
          title: 'Đăng nhập / Tra cứu thất bại',
          description: `Đã nhập mã không hợp lệ "${masked}" (độ dài ${clean.length} ký tự — sai mật khẩu quản trị hoặc mã PIN tra cứu không tồn tại).`,
          beforeState: 'Chưa xác thực',
          afterState: 'Từ chối đăng nhập (Sai mã)',
          changes: [{ fieldLabel: 'Kết quả đối chiếu', before: 'Chờ xác thực', after: `Thất bại (${masked})` }],
          metadata: { maskedInput: masked, inputLength: clean.length },
        });
        setError('Mã tra cứu hoặc mật khẩu không chính xác. Vui lòng kiểm tra lại hoặc liên hệ quản lý.');
        setIsShaking(true);
        setTimeout(() => setIsShaking(false), 500);
      } catch (err: any) {
        recordAuditLog({
          action: 'OPERATION_FAILED',
          actor: 'Khách / Người dùng',
          title: 'Lỗi kết nối khi xác thực',
          description: `Không thể kết nối máy chủ xác thực: ${err?.message || 'Lỗi mạng'}`,
          beforeState: 'Gửi yêu cầu xác thực',
          afterState: 'Lỗi mạng',
          changes: [{ fieldLabel: 'Kết nối mạng', before: 'Đang kết nối', after: 'Lỗi kết nối' }],
        });
        setError('Lỗi kết nối máy chủ. Vui lòng kiểm tra lại mạng.');
        setIsShaking(true);
        setTimeout(() => setIsShaking(false), 500);
      } finally {
        setIsLoading(false);
      }
    },
    [onLoginOwnerSuccess, onLoginGuestSuccess, settings, isCheckingInitialCloud, isCloudDisconnected, cloudStatus?.error]
  );

  const handleRetryCloudCheck = async () => {
    if (!onRefreshCloudStatus || isRetryingCloud) return;
    setIsRetryingCloud(true);
    setError('');
    try {
      await onRefreshCloudStatus();
    } finally {
      setIsRetryingCloud(false);
    }
  };

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
        <form onSubmit={handleFormSubmit} autoComplete="off" data-lpignore="true" data-1p-ignore="true" className="p-5 sm:p-6 space-y-4">
          {isCheckingInitialCloud && (
            <div className="p-3 sm:p-3.5 bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs flex items-center gap-2.5">
              <RefreshCw className="w-4 h-4 text-emerald-600 animate-spin shrink-0" />
              <div>
                <p className="font-bold text-slate-800">Đang kết nối hệ thống...</p>
                <p className="text-[11px] text-slate-500">Vui lòng chờ giây lát trong khi kiểm tra sẵn sàng.</p>
              </div>
            </div>
          )}

          {!isCheckingInitialCloud && isCloudDisconnected && (
            <div className="p-3 sm:p-3.5 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs space-y-2.5">
              <div className="flex items-start gap-2.5 leading-relaxed">
                <AlertCircle className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-amber-600 shrink-0 mt-0.5" />
                <div className="flex-1 space-y-1">
                  <p className="font-bold">Hệ thống đang tạm gián đoạn kết nối</p>
                  <p className="text-[11.5px] text-amber-800/90 leading-snug">
                    Không thể kết nối tới máy chủ lúc này. Vui lòng thử kết nối lại sau ít phút hoặc liên hệ quản lý.
                  </p>
                </div>
              </div>

              <div className="pt-1.5 border-t border-amber-200/70 flex items-center justify-end">
                <button
                  type="button"
                  onClick={handleRetryCloudCheck}
                  disabled={isRetryingCloud}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-amber-100/70 border border-amber-300 text-[11px] font-bold text-amber-900 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${isRetryingCloud ? 'animate-spin' : ''}`} />
                  <span>{isRetryingCloud ? 'Đang thử...' : 'Thử kết nối lại'}</span>
                </button>
              </div>
            </div>
          )}

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
                autoComplete="new-password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                data-lpignore="true"
                data-1p-ignore="true"
                disabled={isLoading || isLoginBlockedByCloud}
                className="w-full pl-3.5 sm:pl-4 pr-11 py-3 sm:py-3.5 text-base sm:text-lg font-bold text-slate-900 bg-slate-50 border border-slate-300 rounded-xl placeholder:text-slate-400 placeholder:text-xs sm:placeholder:text-sm placeholder:font-normal focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all shadow-inner disabled:opacity-60"
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
            disabled={isLoading || isLoginBlockedByCloud || !passcode.trim()}
            className="w-full py-3 sm:py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 text-white font-black text-sm sm:text-base rounded-xl shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
          >
            {isLoading ? (
              <>
                <RefreshCw className="w-4 h-4 sm:w-5 sm:h-5 animate-spin text-white" />
                <span>Đang kiểm tra...</span>
              </>
            ) : isCheckingInitialCloud ? (
              <>
                <RefreshCw className="w-4 h-4 sm:w-5 sm:h-5 animate-spin text-white" />
                <span>Đang kết nối...</span>
              </>
            ) : isCloudDisconnected ? (
              <>
                <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                <span>Tạm ngưng kết nối</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-emerald-200" />
                <span>Đăng Nhập</span>
                <ArrowRight className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-white" />
              </>
            )}
          </button>

          {/* Nút Đăng Nhập FaceID / Vân Tay 1-Chạm (chỉ hiển thị khi đã kích hoạt trong Cài Đặt) */}
          {canUseBiometrics && isBiometricEnrolled && (
            <div className="pt-1">
              <button
                type="button"
                id="btn-faceid-login"
                onClick={handleBiometricLogin}
                disabled={isLoading || isBiometricLoading || isLoginBlockedByCloud}
                className="w-full py-2.5 sm:py-3 px-3.5 bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 hover:from-emerald-100 hover:to-teal-100 active:from-emerald-200 active:to-teal-200 border border-emerald-300/80 text-emerald-950 font-bold text-xs sm:text-sm rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99] shadow-2xs disabled:opacity-50"
                title="Đăng nhập bằng FaceID / Vân tay bảo mật"
              >
                {isBiometricLoading ? (
                  <RefreshCw className="w-4 h-4 text-emerald-700 animate-spin" />
                ) : (
                  <ScanFace className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-700 shrink-0" />
                )}
                <span>Đăng Nhập Bằng FaceID / Vân Tay</span>
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
    </div>
  );
};
