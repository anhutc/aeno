/**
 * ============================================================================
 * GHI CHÚ CHỈNH SỬA / CHANGELOG:
 * - Xóa số điện thoại người nợ: Bỏ tìm kiếm và hiển thị SĐT người nợ trong danh sách tra cứu.
 * - Thêm số điện thoại Chủ Nợ: Hiển thị SĐT Chủ Nợ trong phần thông tin chuyển khoản / liên hệ
 *   giúp con nợ dễ dàng liên lạc hoặc thắc mắc khi xem sao kê.
 * - Tối ưu giao diện: Giao diện tra cứu sao kê trực quan, tương thích di động tối đa.
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Lock,
  Unlock,
  Calendar,
  CreditCard,
  Copy,
  Check,
  Receipt,
  ArrowLeft,
  RefreshCw,
  Eye,
  EyeOff,
  QrCode,
  Megaphone,
  Phone,
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  Image as ImageIcon,
  AlertCircle,
  KeyRound,
} from 'lucide-react';
import { Debtor, Transaction, AppSettings } from '../types';
import { formatVND, generateVietQrUrl } from '../utils/vietqr';
import { getDebtorBalance, getDebtorStatement } from '../utils/storage';
import { apiGuestLookup, subscribeToDebtorTransactions } from '../utils/api';
import { DEFAULT_SETTLED_NOTE, DEFAULT_LOOKUP_INSTRUCTION } from '../utils/textTemplate';

interface GuestPortalProps {
  onViewImage: (url: string, title?: string) => void;
  onGoToOwnerLogin: () => void;
  initialPin?: string | null;
  initialDebtor?: Debtor | null;
  isOwnerAuthenticated?: boolean;
  debtors?: Debtor[];
  allTransactions?: Transaction[];
  appSettings?: AppSettings;
}

export const GuestPortal: React.FC<GuestPortalProps> = ({
  onViewImage,
  onGoToOwnerLogin,
  initialPin,
  initialDebtor,
  isOwnerAuthenticated = false,
  debtors = [],
  allTransactions = [],
  appSettings,
}) => {
  const [pin, setPin] = useState(initialPin || '');
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [showInputPass, setShowInputPass] = useState(false);

  // Loaded once PIN/Pass is successfully verified or directly selected by Owner
  const [debtor, setDebtor] = useState<Debtor | null>(initialDebtor || null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(appSettings || null);

  // Sync settings when appSettings changes from parent
  useEffect(() => {
    if (appSettings) {
      setSettings(appSettings);
    }
  }, [appSettings]);

  // Privacy: Hide debtor PIN/Pass by default on screen
  const [showPin, setShowPin] = useState(false);
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');

  // Copy state
  const [copiedAcc, setCopiedAcc] = useState(false);
  const [copiedMemo, setCopiedMemo] = useState(false);

  // Direct debtor selection without requiring Pass (for authenticated Admin/Owner)
  const handleDirectSelectDebtor = (selected: Debtor) => {
    setDebtor(selected);
    const debtorTxs = allTransactions.filter((t) => t.debtorId === selected.id);
    setTransactions(debtorTxs);
    if (appSettings) setSettings(appSettings);
  };

  // Sync initialDebtor if passed
  useEffect(() => {
    if (initialDebtor) {
      handleDirectSelectDebtor(initialDebtor);
    }
  }, [initialDebtor]);

  // Auto-login if initialPin is provided
  useEffect(() => {
    if (initialPin && initialPin.trim().length >= 2) {
      // If admin is logged in, find in local memory first
      if (isOwnerAuthenticated && debtors.length > 0) {
        const found = debtors.find(
          (d) => d.pin.toLowerCase().trim() === initialPin.toLowerCase().trim()
        );
        if (found) {
          handleDirectSelectDebtor(found);
          return;
        }
      }
      handleLookupByPin(initialPin);
    }
  }, [initialPin, isOwnerAuthenticated, debtors]);

  // Real-time listener: When debtor is viewing statement on mobile, auto-update when owner records changes
  useEffect(() => {
    if (!debtor || isOwnerAuthenticated) return;
    const unsub = subscribeToDebtorTransactions(debtor.id, (updatedTxs) => {
      setTransactions(updatedTxs);
    });
    return () => {
      if (unsub) unsub();
    };
  }, [debtor?.id, isOwnerAuthenticated]);

  const handleLookupByPin = async (inputPass: string) => {
    const clean = inputPass.trim();
    if (!clean || clean.length < 2) {
      setAuthError('Con nợ vui lòng nhập mật khẩu tra cứu hợp lệ.');
      return;
    }

    setIsLoading(true);
    setAuthError('');

    try {
      const res = await apiGuestLookup(clean);
      if (res.success && res.debtor && res.transactions && res.settings) {
        setDebtor(res.debtor);
        setTransactions(res.transactions);
        setSettings(res.settings);

        // Privacy: Clean PIN from URL address bar so it's not stored in browser history
        if (window.location.hash.includes('pin=')) {
          window.history.replaceState(null, '', window.location.pathname + '#guest');
        }
      } else {
        setAuthError(
          res.message || 'Mật khẩu không chính xác hoặc không tồn tại. Vui lòng liên hệ chủ nợ.'
        );
      }
    } catch {
      setAuthError('Có lỗi xảy ra khi kết nối máy chủ. Vui lòng thử lại sau.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleLookupByPin(pin);
  };

  const copyAccountNumber = () => {
    const acc = settings?.accountNumber || appSettings?.accountNumber;
    if (acc) {
      navigator.clipboard.writeText(acc);
      setCopiedAcc(true);
      setTimeout(() => setCopiedAcc(false), 2000);
    }
  };

  // --- 1. NOT LOGGED IN AS A DEBTOR YET ---
  if (!debtor) {
    const currentSettings = settings || appSettings;

    return (
      <div className="min-h-[72vh] flex items-center justify-center p-3 sm:p-4 w-full animate-in fade-in duration-200">
          <div
            id="guest-pin-card"
            className="w-full max-w-lg bg-white/95 backdrop-blur-xl rounded-3xl shadow-xl border border-slate-200/90 overflow-hidden relative"
          >
            {/* Top Header Card - Bright Light Theme */}
            <div className="bg-gradient-to-b from-slate-50 to-white text-slate-900 p-6 sm:p-8 text-center relative border-b border-slate-200/80">
              <div className="w-16 h-16 rounded-3xl bg-emerald-50 text-emerald-600 mx-auto flex items-center justify-center mb-3 shadow-xs border border-emerald-200/80 ring-2 ring-emerald-100">
                <Lock className="w-8 h-8" />
              </div>

              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 mb-2 font-mono">
                👤 TRA CỨU CON NỢ
              </div>

              <h1 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-slate-900 font-display">
                {currentSettings?.appTitle || 'Tra Cứu Sổ Nợ Cá Nhân'}
              </h1>
              <p className="text-xs text-slate-500 mt-2 max-w-sm mx-auto leading-relaxed">
                {currentSettings?.lookupInstructionText || DEFAULT_LOOKUP_INSTRUCTION}
              </p>
            </div>

            {/* Login Form */}
            <form onSubmit={handleFormSubmit} className="p-6 sm:p-8 space-y-5">
              {authError && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl text-xs font-semibold leading-relaxed animate-in fade-in flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{authError}</span>
                </div>
              )}

              <div>
                <label
                  htmlFor="guest-pin-input"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2 text-center"
                >
                  Nhập Mật Khẩu Tra Cứu:
                </label>
                <div className="relative">
                  <input
                    id="guest-pin-input"
                    type={showInputPass ? 'text' : 'password'}
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    placeholder="Ví dụ: 1234 hoặc nam123"
                    autoFocus
                    className="w-full px-5 py-4 text-center text-xl sm:text-2xl font-black font-mono tracking-widest bg-slate-50 border border-slate-300 rounded-2xl text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all shadow-inner"
                  />
                  <button
                    type="button"
                    onClick={() => setShowInputPass(!showInputPass)}
                    className="absolute right-4 top-4.5 text-slate-400 hover:text-slate-600 cursor-pointer p-1.5 rounded-xl hover:bg-slate-200/50 transition-colors"
                    title={showInputPass ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  >
                    {showInputPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500 text-center mt-2.5 leading-relaxed">
                  <KeyRound className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Mật khẩu do ({currentSettings?.ownerName || 'Chủ nợ'}) cấp riêng để bảo vệ quyền riêng tư cá nhân.</span>
                </div>
              </div>

              <button
                type="submit"
                id="submit-guest-pin-btn"
                disabled={isLoading || pin.trim().length < 2}
                className="w-full py-4 px-5 bg-gradient-to-r from-emerald-600 via-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-[0.99] disabled:opacity-50 text-white font-extrabold text-sm rounded-2xl shadow-md transition-all flex items-center justify-center gap-2.5 cursor-pointer shadow-emerald-900/20"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Đang kiểm tra mật khẩu...</span>
                  </>
                ) : (
                  <>
                    <Unlock className="w-4 h-4" />
                    <span>Xem Sao Kê Cá Nhân</span>
                  </>
                )}
              </button>
            </form>

            {/* Footer Navigation Switcher */}
            <div className="p-4.5 bg-slate-50 border-t border-slate-100 text-center">
              <button
                type="button"
                onClick={onGoToOwnerLogin}
                className="text-xs text-slate-600 hover:text-slate-900 font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <span>Bạn là Chủ nợ muốn vào quản lý sổ?</span>
                <span className="font-bold text-amber-700 hover:underline inline-flex items-center gap-1">
                  Đăng nhập tại đây <ArrowLeft className="w-3.5 h-3.5 rotate-180" />
                </span>
              </button>
            </div>
          </div>
        </div>
      );
  }

  // --- 2. DEBTOR STATEMENT VIEW (ONLY THIS GUEST'S TRANSACTIONS) ---
  const activeSettings = appSettings || settings || {
    ownerName: 'Chủ Sổ',
    appTitle: 'Sổ Ghi Nợ',
    defaultMemoPrefix: 'TRA NO',
    bankId: '',
    accountNumber: '',
    accountName: '',
  };

  const currentBalance = getDebtorBalance(debtor.id, transactions);
  const statement = getDebtorStatement(debtor.id, transactions);
  const displayedStatement = sortOrder === 'newest' ? [...statement].reverse() : statement;

  // VietQR Memo
  const suffix = (activeSettings.defaultMemoPrefix ?? 'TRA NO').trim();
  const rawMemo = suffix ? `${debtor.name} ${suffix}` : debtor.name;
  const vietQrMemo = rawMemo
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

  const qrTemplate = activeSettings.vietQrTemplate || 'compact2';

  // Standard Bank Account QR (QR STK Ngân Hàng - amount is undefined so user enters amount directly in their banking app)
  const vietQrUrl =
    activeSettings.bankId && activeSettings.accountNumber
      ? generateVietQrUrl({
          bankId: activeSettings.bankId,
          accountNumber: activeSettings.accountNumber,
          accountName: activeSettings.accountName,
          amount: undefined,
          memo: vietQrMemo,
          template: qrTemplate,
        })
      : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className="max-w-xl w-full mx-auto space-y-4 sm:space-y-5 pb-12"
    >
      {/* Lời nhắn / Thông báo ghim của chủ sổ gửi khách */}
      {activeSettings.guestAnnouncement && (
        <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 text-blue-900 rounded-2xl text-xs flex items-start gap-3 shadow-2xs">
          <div className="w-7 h-7 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
            <Megaphone className="w-4 h-4" />
          </div>
          <div className="flex-1">
            <div className="font-bold uppercase tracking-wider text-[11px] text-blue-800">
              Lời nhắn từ chủ nợ {activeSettings.ownerName}:
            </div>
            <div className="mt-1 text-slate-700 leading-relaxed font-normal whitespace-pre-line">
              {activeSettings.guestAnnouncement}
            </div>
          </div>
        </div>
      )}

      {/* SỔ GIAO DỊCH CÁ NHÂN Card */}
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden">
        {/* Header - Bright Light Theme */}
        <div className="bg-gradient-to-b from-slate-50 to-white text-slate-900 px-5 sm:px-7 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] uppercase tracking-widest text-emerald-700 font-extrabold font-mono">
                👤 SAO KÊ CÁ NHÂN
              </span>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Trực tiếp
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black mt-1 text-slate-900 tracking-tight">
              {debtor.name}
            </h1>
          </div>
          <div className="text-left sm:text-right text-xs text-slate-500">
            {/* Ẩn/Hiện Pass */}
            <div className="inline-flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200 font-mono shadow-2xs">
              <span className="text-slate-500 text-[11px]">Mật khẩu PIN:</span>
              <span className="text-slate-900 font-extrabold text-xs">
                {showPin ? debtor.pin : '••••'}
              </span>
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200/60 transition-colors cursor-pointer"
                title={showPin ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              >
                {showPin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>

        {/* 💰 TỔNG SỐ DƯ HIỆN TẠI */}
        <div className="p-5 sm:p-7 border-b border-slate-200/80">
          <div
            className={`p-6 rounded-3xl border transition-all ${
              currentBalance > 0
                ? 'bg-gradient-to-br from-rose-50/90 via-rose-50/40 to-white border-rose-200 text-rose-950 shadow-xs'
                : currentBalance < 0
                ? 'bg-gradient-to-br from-emerald-50/90 via-emerald-50/40 to-white border-emerald-200 text-emerald-950 shadow-xs'
                : 'bg-slate-50/90 border-slate-200 text-slate-800'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs uppercase font-extrabold tracking-wider opacity-70">
                💰 DƯ NỢ HIỆN TẠI
              </span>
              <span
                className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                  currentBalance > 0
                    ? 'bg-rose-100 text-rose-800 border border-rose-200'
                    : currentBalance < 0
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    : 'bg-slate-200 text-slate-700'
                }`}
              >
                {currentBalance > 0 ? 'Cần thanh toán' : currentBalance < 0 ? 'Chủ nợ trả lại' : 'Hoàn tất'}
              </span>
            </div>

            <div className="text-3xl sm:text-5xl font-black mt-2 tracking-tight font-mono">
              {currentBalance > 0
                ? `+ ${formatVND(currentBalance)}`
                : formatVND(currentBalance)}
            </div>

            <div className="mt-3 text-xs sm:text-sm font-semibold pt-2 border-t border-black/5">
              {currentBalance > 0 ? (
                <span className="text-rose-700 inline-flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-rose-600 animate-pulse"></span>
                  Bạn đang nợ {activeSettings.ownerName}
                </span>
              ) : currentBalance < 0 ? (
                <span className="text-emerald-700 inline-flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                  {activeSettings.ownerName} đang nợ bạn {formatVND(Math.abs(currentBalance))}
                </span>
              ) : (
                <span className="text-slate-600 inline-flex items-center gap-2">
                  <span>✨</span>
                  Đã thanh toán hết, đôi bên không còn dư nợ
                </span>
              )}
            </div>
          </div>
        </div>

        {currentBalance > 0 ? (
          <div className="p-5 sm:p-7 bg-slate-50/70 border-b border-slate-200/80 space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                <CreditCard className="w-4 h-4" />
              </div>
              <div>
                <h2 className="font-extrabold text-sm text-slate-900 uppercase tracking-wide">
                  Thông Tin Chuyển Khoản Trả Nợ
                </h2>
                <p className="text-[11px] text-slate-500">Chuyển trực tiếp qua số tài khoản hoặc quét mã QR tiện lợi</p>
              </div>
            </div>

            {/* Grid for Bank Info and VietQR */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Thông tin tài khoản ngân hàng */}
              <div className="p-5 bg-white rounded-3xl border border-slate-200/90 space-y-3.5 text-xs text-slate-700 shadow-2xs flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
                    <span className="text-slate-500 font-medium">Ngân hàng:</span>
                    <strong className="text-slate-900 font-bold text-sm">{activeSettings.bankName}</strong>
                  </div>

                  <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
                    <div>
                      <span className="text-slate-500 font-medium block text-[11px]">Số tài khoản:</span>
                      <strong className="text-slate-900 font-extrabold font-mono text-base tracking-wider">
                        {activeSettings.accountNumber}
                      </strong>
                    </div>
                    <button
                      type="button"
                      onClick={copyAccountNumber}
                      className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl transition-all font-bold cursor-pointer border border-slate-200/80 shadow-2xs"
                    >
                      {copiedAcc ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>{copiedAcc ? 'Đã chép STK' : 'Sao chép'}</span>
                    </button>
                  </div>

                  <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
                    <span className="text-slate-500 font-medium">Chủ tài khoản:</span>
                    <strong className="text-slate-900 font-bold uppercase">
                      {activeSettings.accountName}
                    </strong>
                  </div>

                  {activeSettings.ownerPhone && (
                    <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
                      <span className="text-slate-500 font-medium">SĐT Chủ Nợ:</span>
                      <a
                        href={`tel:${activeSettings.ownerPhone}`}
                        className="text-emerald-700 font-bold font-mono hover:underline inline-flex items-center gap-1.5"
                        title="Bấm để gọi điện cho Chủ Nợ"
                      >
                        <Phone className="w-3.5 h-3.5" />
                        <span>{activeSettings.ownerPhone}</span>
                      </a>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Số tiền nợ:</span>
                    <strong className="text-rose-600 font-black text-base font-mono">
                      {formatVND(currentBalance)}
                    </strong>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 bg-slate-50/80 -mx-5 -mb-5 p-4 rounded-b-3xl space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-500 text-[11px] font-medium">Nội dung chuyển khoản:</span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(vietQrMemo);
                        setCopiedMemo(true);
                        setTimeout(() => setCopiedMemo(false), 2000);
                      }}
                      className="inline-flex items-center gap-1 text-[11px] text-emerald-700 hover:text-emerald-800 font-bold px-2 py-0.5 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors cursor-pointer"
                    >
                      {copiedMemo ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedMemo ? 'Đã sao chép' : 'Sao chép'}</span>
                    </button>
                  </div>
                  <div className="font-mono font-bold text-xs bg-white px-3 py-2 rounded-xl border border-slate-200 text-slate-900 break-all select-all">
                    {vietQrMemo}
                  </div>
                </div>
              </div>

              {/* MÃ VIETQR STK NGÂN HÀNG */}
              {vietQrUrl && (
                <div className="p-5 bg-white rounded-3xl border border-emerald-200/90 shadow-2xs space-y-3 flex flex-col justify-between">
                  <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-950 uppercase">
                      <QrCode className="w-4 h-4 text-emerald-600" />
                      <span>Mã QR</span>
                    </div>
                    <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-bold">
                      247
                    </span>
                  </div>

                  {/* Image QR display */}
                  <div className="flex flex-col items-center justify-center p-3 bg-gradient-to-b from-slate-50 to-slate-100/60 rounded-2xl border border-slate-200/80">
                    <img
                      src={vietQrUrl}
                      alt="Mã VietQR thanh toán"
                      className="max-h-56 sm:max-h-60 max-w-full object-contain rounded-2xl bg-white p-2.5 shadow-sm border border-slate-200/60"
                      loading="lazy"
                    />
                    <div className="mt-2.5 text-center space-y-0.5">
                      <p className="text-xs font-bold text-slate-800">
                        👉 Mở App ngân hàng quét mã
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Bạn chỉ cần gõ số tiền muốn chuyển ngay trên ứng dụng ngân hàng.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="p-4 sm:p-6 bg-slate-50 border-b border-slate-200 text-center">
            {currentBalance < 0 ? (
              <div className="p-4 bg-emerald-50 text-emerald-800 rounded-2xl border border-emerald-200 text-xs space-y-1">
                <div className="font-bold text-sm">
                  ✨ {activeSettings.ownerName} đang có trách nhiệm trả lại bạn{' '}
                  {formatVND(Math.abs(currentBalance))}
                </div>
                <p>
                  Bạn không cần thanh toán. Hãy gửi số tài khoản của bạn cho{' '}
                  {activeSettings.ownerName} để nhận lại tiền nhé!
                </p>
              </div>
            ) : (
              <div className="p-4 bg-slate-100 text-slate-700 rounded-2xl border border-slate-200 text-xs font-medium leading-relaxed whitespace-pre-line">
                {activeSettings.settledThankYouNote || DEFAULT_SETTLED_NOTE}
              </div>
            )}
          </div>
        )}

        {/* 📜 LỊCH SỬ BIẾN ĐỘNG (CỘNG / TRỪ) - Mobile Optimized */}
        <div className="p-5 sm:p-7">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <h2 className="font-extrabold text-xs sm:text-sm text-slate-900 uppercase tracking-wide flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-500" />
              <span>LỊCH SỬ BIẾN ĐỘNG ({statement.length})</span>
            </h2>
            <div className="flex items-center self-start sm:self-auto bg-slate-100 p-1 rounded-xl text-[11px] font-semibold text-slate-600 border border-slate-200/80">
              <button
                type="button"
                onClick={() => setSortOrder('newest')}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                  sortOrder === 'newest'
                    ? 'bg-white text-slate-900 font-bold shadow-xs'
                    : 'hover:text-slate-900 text-slate-500'
                }`}
                title="Sắp xếp mới nhất lên đầu"
              >
                <ArrowDownWideNarrow className="w-3.5 h-3.5 text-emerald-600" />
                <span>Mới nhất trước</span>
              </button>
              <button
                type="button"
                onClick={() => setSortOrder('oldest')}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                  sortOrder === 'oldest'
                    ? 'bg-white text-slate-900 font-bold shadow-xs'
                    : 'hover:text-slate-900 text-slate-500'
                }`}
                title="Sắp xếp cũ nhất lên đầu"
              >
                <ArrowUpNarrowWide className="w-3.5 h-3.5 text-slate-400" />
                <span>Cũ nhất trước</span>
              </button>
            </div>
          </div>

          {displayedStatement.length === 0 ? (
            <div className="text-center py-10 bg-slate-50/80 rounded-3xl text-slate-400 text-xs border border-dashed border-slate-200">
              Chưa ghi nhận biến động giao dịch nào.
            </div>
          ) : (
            <div className="space-y-3">
              {displayedStatement.map(({ transaction: tx, runningBalance }) => {
                const isAdd = tx.type === 'ADD';
                return (
                  <div
                    key={tx.id}
                    className="p-4 sm:p-4.5 rounded-2xl border border-slate-200/90 bg-white hover:border-slate-300 transition-all shadow-2xs hover:shadow-xs space-y-2.5"
                  >
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <div className="font-semibold text-slate-600 flex items-center gap-2">
                        <span className="font-mono text-[11px] text-slate-500">📅 {tx.date}</span>
                        {tx.category === 'PARTY_SPLIT' && (
                          <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 text-[10px] font-bold border border-amber-200/80">
                            Ăn chia nhóm
                          </span>
                        )}
                        {tx.category === 'PAYMENT_SETTLED' && (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 text-[10px] font-bold border border-emerald-200/80">
                            Đã thanh toán
                          </span>
                        )}
                      </div>
                      {tx.billImage && (
                        <button
                          type="button"
                          onClick={() => onViewImage(tx.billImage!, tx.note)}
                          className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-bold bg-blue-50/90 hover:bg-blue-100 px-2.5 py-1 rounded-xl transition-all cursor-pointer border border-blue-200/60"
                        >
                          <Receipt className="w-3.5 h-3.5" />
                          <span>Hóa đơn</span>
                        </button>
                      )}
                    </div>

                    <div className="font-semibold text-slate-900 text-sm break-words leading-snug">
                      📝 {tx.note}
                    </div>

                    <div className="flex flex-col xs:flex-row xs:items-center justify-between gap-1.5 pt-2 border-t border-slate-100 text-xs">
                      <div>
                        <span className="text-slate-500 font-medium">Biến động: </span>
                        <strong
                          className={`font-mono text-sm tracking-tight ${
                            isAdd ? 'text-rose-600 font-black' : 'text-emerald-600 font-black'
                          }`}
                        >
                          {isAdd ? `+${formatVND(tx.amount)}` : `-${formatVND(tx.amount)}`}
                        </strong>
                      </div>

                      <div className="text-slate-500 font-medium">
                        Dư nợ sau GD:{' '}
                        <strong className="text-slate-900 font-bold font-mono">
                          {runningBalance > 0
                            ? `+${formatVND(runningBalance)}`
                            : formatVND(runningBalance)}
                        </strong>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};
