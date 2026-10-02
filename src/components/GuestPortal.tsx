/**
 * ============================================================================
 * GHI CHÚ CHỈNH SỬA / CHANGELOG:
 * - Giữ lại đầy đủ các thông tin chuyển khoản: Tên ngân hàng, Số tài khoản,
 *   Chủ tài khoản, Số tiền cần chuyển, Mã QR quét thanh toán, SĐT liên hệ.
 * - Loại bỏ hoàn toàn trường "Nội dung chuyển khoản" (cú pháp ghi chú CK) theo yêu cầu.
 * ============================================================================
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Calendar,
  CreditCard,
  Copy,
  Check,
  Receipt,
  Eye,
  EyeOff,
  QrCode,
  Megaphone,
  Phone,
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  User,
  PlusCircle,
  MinusCircle,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  X,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { Debtor, Transaction, AppSettings } from '../types';
import { formatVND, generateVietQrUrl } from '../utils/vietqr';
import { getDebtorBalance, getDebtorStatement, loadSettings } from '../utils/storage';
import { subscribeToDebtorTransactions } from '../utils/api';
import { subscribeToFirestoreData } from '../services/firestoreClient';
import { DEFAULT_SETTLED_NOTE } from '../utils/textTemplate';
import { AnimatedCounter } from './AnimatedCounter';
import { triggerSettledCelebration } from '../utils/confetti';
import { PWAInstallButton } from './PWAInstallButton';

interface GuestPortalProps {
  debtor?: Debtor | null;
  initialDebtor?: Debtor | null;
  onViewImage: (url: string, title?: string) => void;
  onGoToOwnerLogin?: () => void;
  isOwnerAuthenticated?: boolean;
  allTransactions?: Transaction[];
  appSettings?: AppSettings;
}

export const GuestPortal: React.FC<GuestPortalProps> = ({
  debtor: propDebtor,
  initialDebtor,
  onViewImage,
  onGoToOwnerLogin,
  isOwnerAuthenticated = false,
  allTransactions = [],
  appSettings,
}) => {
  const [debtor, setDebtor] = useState<Debtor | null>(propDebtor || initialDebtor || null);
  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    const active = propDebtor || initialDebtor;
    return active ? allTransactions.filter((t) => t.debtorId === active.id) : [];
  });

  // Privacy: Hide debtor PIN/Pass by default on screen
  const [showPin, setShowPin] = useState(false);
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'ADD' | 'SUB'>('ALL');

  // Quick Payment Modal state
  const [showQrModal, setShowQrModal] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);

  // Copy state
  const [copiedAcc, setCopiedAcc] = useState(false);
  const [copiedAmount, setCopiedAmount] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);

  // Sync if prop changes
  useEffect(() => {
    const active = propDebtor || initialDebtor || null;
    setDebtor(active);
    if (active) {
      setTransactions(allTransactions.filter((t) => t.debtorId === active.id));
    }
  }, [propDebtor, initialDebtor, allTransactions]);

  // Local settings state so GuestPortal always reflects the newest settings
  const [liveSettings, setLiveSettings] = useState<AppSettings>(() => {
    return appSettings || loadSettings();
  });

  useEffect(() => {
    if (appSettings) {
      setLiveSettings(appSettings);
    } else {
      setLiveSettings(loadSettings());
    }
  }, [appSettings]);

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

  // Real-time settings listener for guests (if owner updates bank, phone, or name)
  useEffect(() => {
    const unsub = subscribeToFirestoreData({
      onSettings: (newSettings) => {
        if (newSettings) {
          setLiveSettings((prev) => ({ ...prev, ...newSettings }));
        }
      },
    });
    return () => {
      if (unsub) unsub();
    };
  }, []);

  // --- Active Settings ---
  const activeSettings = liveSettings || loadSettings();

  const copyAccountNumber = () => {
    const acc = activeSettings?.accountNumber;
    if (acc) {
      navigator.clipboard.writeText(acc);
      setCopiedAcc(true);
      setTimeout(() => setCopiedAcc(false), 2000);
    }
  };

  const copyAmountToPay = (amt: number) => {
    if (amt > 0) {
      navigator.clipboard.writeText(String(amt));
      setCopiedAmount(true);
      setTimeout(() => setCopiedAmount(false), 2000);
    }
  };

  if (!debtor) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-14 h-14 rounded-3xl bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
          <User className="w-7 h-7" />
        </div>
        <h3 className="text-base font-bold text-slate-800">Không tìm thấy thông tin</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-xs">
          Vui lòng nhập lại mật khẩu tại màn hình chính.
        </p>
        {onGoToOwnerLogin && (
          <button
            type="button"
            onClick={onGoToOwnerLogin}
            className="mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
          >
            Quay lại đăng nhập
          </button>
        )}
      </div>
    );
  }

  const contactPhone = (
    activeSettings.ownerPhone ||
    loadSettings()?.ownerPhone ||
    ''
  ).trim();

  const copyPhoneNumber = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (contactPhone) {
      navigator.clipboard.writeText(contactPhone);
      setCopiedPhone(true);
      setTimeout(() => setCopiedPhone(false), 2000);
    }
  };

  const currentBalance = getDebtorBalance(debtor.id, transactions);
  const statement = getDebtorStatement(debtor.id, transactions);

  // Tự động bắn pháo hoa ăn mừng khi tra cứu nếu đã hết nợ (số dư <= 0)
  const hasCelebratedOnMount = useRef(false);
  useEffect(() => {
    if (!hasCelebratedOnMount.current && currentBalance <= 0) {
      hasCelebratedOnMount.current = true;
      const timer = setTimeout(() => {
        triggerSettledCelebration();
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [currentBalance]);

  // Và tự động bắn nếu vừa được cập nhật real-time từ còn nợ sang hết nợ
  const prevBalanceRef = useRef<number | null>(currentBalance);
  useEffect(() => {
    if (prevBalanceRef.current !== null && prevBalanceRef.current > 0 && currentBalance <= 0) {
      triggerSettledCelebration();
    }
    prevBalanceRef.current = currentBalance;
  }, [currentBalance]);

  // Statistics for quick mobile overview
  const totalAdded = useMemo(() => {
    return transactions
      .filter((t) => t.debtorId === debtor.id && t.type === 'ADD')
      .reduce((sum, t) => sum + t.amount, 0);
  }, [transactions, debtor.id]);

  const totalSubtracted = useMemo(() => {
    return transactions
      .filter((t) => t.debtorId === debtor.id && t.type === 'SUB')
      .reduce((sum, t) => sum + t.amount, 0);
  }, [transactions, debtor.id]);

  const displayedStatement = useMemo(() => {
    let list = [...statement];
    if (typeFilter === 'ADD') {
      list = list.filter((item) => item.transaction.type === 'ADD');
    } else if (typeFilter === 'SUB') {
      list = list.filter((item) => item.transaction.type === 'SUB');
    }
    return sortOrder === 'newest' ? list.reverse() : list;
  }, [statement, typeFilter, sortOrder]);

  const qrTemplate = activeSettings.vietQrTemplate || 'compact2';

  // Standard Bank Account QR (không gài nội dung chuyển khoản)
  const vietQrUrl =
    activeSettings.bankId && activeSettings.accountNumber
      ? generateVietQrUrl({
          bankId: activeSettings.bankId,
          accountNumber: activeSettings.accountNumber,
          accountName: activeSettings.accountName,
          amount: undefined,
          memo: undefined,
          template: qrTemplate,
        })
      : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className={`max-w-xl md:max-w-2xl w-full mx-auto space-y-4 sm:space-y-6 ${
        currentBalance !== 0 ? 'pb-28 sm:pb-24' : 'pb-12'
      }`}
    >
      {/* Lời nhắn / Thông báo ghim của chủ sổ gửi khách */}
      {activeSettings.guestAnnouncement && (
        <div className="p-4 sm:p-5 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 text-blue-900 rounded-2xl text-xs sm:text-sm flex items-start gap-3 shadow-2xs">
          <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
            <Megaphone className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="flex-1">
            <div className="font-bold uppercase tracking-wider text-xs sm:text-sm text-blue-800">
              Lời nhắn từ {activeSettings.ownerName}:
            </div>
            <div className="mt-1 text-slate-700 leading-relaxed font-normal whitespace-pre-line text-xs sm:text-sm">
              {activeSettings.guestAnnouncement}
            </div>
          </div>
        </div>
      )}

      {/* SỔ GIAO DỊCH CÁ NHÂN Card */}
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden">
        {/* Header - Sáng & Tinh tế, tối ưu hàng ngang cho mobile và tablet */}
        <div className="bg-gradient-to-r from-slate-50/90 via-emerald-50/20 to-white text-slate-900 px-4 sm:px-6 py-3.5 sm:py-4 flex items-center justify-between gap-2.5 sm:gap-3 border-b border-slate-200/80">
          <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0">
            <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white font-black text-xs sm:text-base flex items-center justify-center shrink-0 shadow-xs ring-2 ring-emerald-500/10">
              {debtor.name ? debtor.name.trim().charAt(0).toUpperCase() : '👤'}
            </div>
            <div className="min-w-0">
              <span className="text-[10.5px] sm:text-xs uppercase tracking-wider text-emerald-700 font-extrabold font-mono block leading-tight">
                TRA CỨU GIAO DỊCH
              </span>
              <h1 className="text-base sm:text-xl md:text-2xl font-black text-slate-900 tracking-tight truncate leading-tight mt-0.5">
                {debtor.name}
              </h1>
            </div>
          </div>

          {/* Ẩn/Hiện Mật khẩu - Cố định cùng hàng bên phải */}
          <div className="inline-flex items-center gap-1.5 bg-slate-100/90 hover:bg-slate-200/60 px-2.5 sm:px-3 py-1.5 rounded-xl border border-slate-200/90 font-mono shadow-2xs shrink-0 select-none transition-colors">
            <span className="text-slate-500 text-xs sm:text-sm hidden xs:inline font-medium">Mật khẩu:</span>
            <span className="text-slate-500 text-xs xs:hidden font-medium">MK:</span>
            <span className="text-slate-900 font-black text-xs sm:text-sm tracking-wider">
              {showPin ? debtor.pin : '••••'}
            </span>
            <button
              type="button"
              onClick={() => setShowPin(!showPin)}
              className="p-1 text-slate-400 hover:text-slate-700 active:scale-90 rounded-md hover:bg-slate-200/80 transition-all cursor-pointer"
              title={showPin ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
            >
              {showPin ? <EyeOff className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
            </button>
          </div>
        </div>

        {/* 💰 TỔNG SỐ DƯ HIỆN TẠI */}
        <div className="p-5 sm:p-7 border-b border-slate-200/80">
          <div
            className={`p-5 sm:p-7 rounded-3xl border transition-all ${
              currentBalance > 0
                ? 'bg-gradient-to-br from-rose-50/90 via-rose-50/40 to-white border-rose-200 text-rose-950 shadow-xs'
                : currentBalance < 0
                ? 'bg-gradient-to-br from-emerald-50/90 via-emerald-50/40 to-white border-emerald-200 text-emerald-950 shadow-xs'
                : 'bg-slate-50/90 border-slate-200 text-slate-800'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs sm:text-sm uppercase font-extrabold tracking-wider opacity-75">
                💰 DƯ NỢ HIỆN TẠI
              </span>
              <span
                className={`text-xs sm:text-sm font-extrabold px-3 sm:px-3.5 py-1 sm:py-1.5 rounded-full uppercase tracking-wider ${
                  currentBalance > 0
                    ? 'bg-rose-100 text-rose-800'
                    : currentBalance < 0
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-slate-200 text-slate-700'
                }`}
              >
                {currentBalance > 0 ? 'Cần thanh toán' : currentBalance < 0 ? 'Được thanh toán' : 'Hoàn thành'}
              </span>
            </div>

            <div className="mt-2.5 sm:mt-3">
              <div
                className={`text-3xl xs:text-4xl sm:text-5xl font-black font-mono tracking-tight leading-none ${
                  currentBalance > 0
                    ? 'text-rose-600'
                    : currentBalance < 0
                    ? 'text-emerald-600'
                    : 'text-slate-800'
                }`}
              >
                <AnimatedCounter
                  value={Math.abs(currentBalance)}
                  formatter={(val) => {
                    const formatted = formatVND(val);
                    if (currentBalance > 0) return formatted;
                    if (currentBalance < 0) return `+${formatted}`;
                    return formatted;
                  }}
                />
              </div>
            </div>

            <div className="mt-3.5 sm:mt-4 text-xs sm:text-sm md:text-base font-semibold pt-2.5 sm:pt-3 border-t border-black/5 flex flex-wrap items-center justify-between gap-2">
              {currentBalance > 0 ? (
                <span className="text-rose-700 inline-flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-rose-600 animate-pulse"></span>
                  <span>Bạn đang nợ {activeSettings.ownerName}</span>
                </span>
              ) : currentBalance < 0 ? (
                <span className="text-emerald-700 inline-flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                  <span>{activeSettings.ownerName} đang nợ bạn {formatVND(Math.abs(currentBalance))}</span>
                </span>
              ) : (
                <span className="text-slate-600 inline-flex items-center gap-2">
                  <span>✨</span>
                  <span>Đã thanh toán hết, đôi bên không còn dư nợ</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 💳 THÔNG TIN CHUYỂN KHOẢN (ĐÃ LOẠI BỎ TRƯỜNG NỘI DUNG CHUYỂN KHOẢN) */}
        {currentBalance > 0 ? (
          <div className="p-5 sm:p-7 bg-slate-50/70 border-b border-slate-200/80 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold shrink-0">
                <CreditCard className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div>
                <h2 className="font-extrabold text-sm sm:text-base text-slate-900 uppercase tracking-wide">
                  Thông Tin Chuyển Khoản
                </h2>
                <p className="text-xs sm:text-sm text-slate-500">Chuyển trực tiếp qua số tài khoản hoặc quét mã QR</p>
              </div>
            </div>

            {/* Grid for Bank Info and VietQR */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Thông tin tài khoản ngân hàng */}
              <div className="p-5 sm:p-6 bg-white rounded-3xl border border-slate-200/90 space-y-3.5 text-xs sm:text-sm text-slate-700 shadow-2xs flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
                    <span className="text-slate-500 font-medium">Ngân hàng:</span>
                    <strong className="text-slate-900 font-bold text-sm sm:text-base">{activeSettings.bankName}</strong>
                  </div>

                  <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
                    <div>
                      <span className="text-slate-500 font-medium block text-xs sm:text-sm">Số tài khoản:</span>
                      <strong className="text-slate-900 font-extrabold font-mono text-base sm:text-lg tracking-wider">
                        {activeSettings.accountNumber}
                      </strong>
                    </div>
                    <button
                      type="button"
                      onClick={copyAccountNumber}
                      className="inline-flex items-center gap-1 text-xs sm:text-sm px-2.5 sm:px-3 py-1.5 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-800 rounded-xl transition-all font-bold cursor-pointer border border-slate-200/80 shadow-2xs"
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
                    <strong className="text-slate-900 font-bold uppercase text-xs sm:text-sm">
                      {activeSettings.accountName}
                    </strong>
                  </div>

                  <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
                    <span className="text-slate-500 font-medium">SĐT Liên hệ:</span>
                    <a
                      href={`tel:${contactPhone}`}
                      className="text-emerald-700 font-bold font-mono hover:underline inline-flex items-center gap-1.5 text-xs sm:text-sm"
                      title="Bấm để gọi điện liên hệ"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>{contactPhone}</span>
                    </a>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Số tiền cần thanh toán:</span>
                    <strong className="text-rose-600 font-black text-base sm:text-lg font-mono">
                      {formatVND(currentBalance)}
                    </strong>
                  </div>
                </div>
              </div>

              {/* MÃ VIETQR QUÉT NHANH */}
              {vietQrUrl && (
                <div className="p-5 sm:p-6 bg-white rounded-3xl border border-emerald-200/90 shadow-2xs space-y-3 flex flex-col justify-between">
                  <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                    <div className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-emerald-950 uppercase">
                      <QrCode className="w-4 h-4 text-emerald-600" />
                      <span>Mã QR Quét Nhanh</span>
                    </div>
                    <span className="text-xs text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full font-bold">
                      {activeSettings.ownerName}
                    </span>
                  </div>

                  {/* Image QR display */}
                  <div className="flex flex-col items-center justify-center p-3 sm:p-4 bg-gradient-to-b from-slate-50 to-slate-100/60 rounded-2xl border border-slate-200/80">
                    <img
                      src={vietQrUrl}
                      alt="Mã VietQR thanh toán"
                      className="max-h-56 sm:max-h-64 max-w-full object-contain rounded-2xl bg-white p-2.5 shadow-sm border border-slate-200/60"
                      loading="lazy"
                    />
                    <div className="mt-2.5 text-center space-y-0.5">
                      <p className="text-xs sm:text-sm font-bold text-slate-800">
                        👉 Mở App ngân hàng quét mã
                      </p>
                      <p className="text-xs sm:text-sm text-slate-500">
                        Bạn chỉ cần gõ số tiền muốn chuyển ngay trên ứng dụng ngân hàng.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="p-4 sm:p-5 bg-slate-50/70 border-b border-slate-200/80">
            {currentBalance < 0 ? (
              <div className="p-3.5 sm:p-4 bg-emerald-50/80 text-emerald-950 rounded-2xl border border-emerald-200/80 shadow-2xs flex items-center justify-between gap-3 text-xs sm:text-sm">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                    <Sparkles className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-extrabold text-emerald-950 text-xs sm:text-sm truncate">
                      {activeSettings.ownerName} cần hoàn trả lại tiền cho bạn
                    </div>
                    <p className="text-xs sm:text-sm text-emerald-800/80 mt-0.5 leading-relaxed">
                      Vui lòng gửi số tài khoản của bạn cho <strong>{activeSettings.ownerName}</strong> để nhận lại tiền nhé!
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 sm:p-5 bg-slate-100 text-slate-700 rounded-2xl border border-slate-200 text-xs sm:text-sm font-medium leading-relaxed whitespace-pre-line text-center">
                {activeSettings.settledThankYouNote || DEFAULT_SETTLED_NOTE}
              </div>
            )}
          </div>
        )}

        {/* 📜 LỊCH SỬ BIẾN ĐỘNG (CỘNG / TRỪ) - Mobile Optimized Timeline Feed */}
        <div className="p-4 sm:p-7">
          {/* Header section with count & sorting */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3.5">
            <h2 className="font-black text-xs sm:text-sm md:text-base text-slate-900 uppercase tracking-wide flex items-center gap-2">
              <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-slate-600" />
              <span>GIAO DỊCH ({statement.length})</span>
            </h2>
            <div className="flex items-center self-start sm:self-auto bg-slate-100 p-1 rounded-xl text-xs sm:text-sm font-semibold text-slate-600 border border-slate-200/80">
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
                <ArrowDownWideNarrow className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600" />
                <span>Mới nhất</span>
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
                <ArrowUpNarrowWide className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400" />
                <span>Cũ nhất</span>
              </button>
            </div>
          </div>

          {/* 🔘 Segmented Control Bố Cục Đều 3 Cột (Tất cả, Tiền nợ, Đã trả) */}
          <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100/90 rounded-2xl mb-4 text-xs sm:text-sm font-bold border border-slate-200/60">
            <button
              type="button"
              onClick={() => setTypeFilter('ALL')}
              className={`py-2 sm:py-2.5 px-1 rounded-xl transition-all cursor-pointer flex flex-col sm:flex-row items-center justify-center gap-1 text-center ${
                typeFilter === 'ALL'
                  ? 'bg-white text-slate-900 shadow-sm border border-slate-200/80 font-black'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
              }`}
            >
              <span>Tất cả</span>
              <span className={`text-[10.5px] sm:text-xs px-1.5 py-0.2 rounded-full font-mono ${typeFilter === 'ALL' ? 'bg-slate-100 text-slate-800' : 'bg-slate-200/70 text-slate-600'}`}>
                {statement.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setTypeFilter('ADD')}
              className={`py-2 sm:py-2.5 px-1 rounded-xl transition-all cursor-pointer flex flex-col sm:flex-row items-center justify-center gap-1 text-center ${
                typeFilter === 'ADD'
                  ? 'bg-rose-500 text-white shadow-sm font-black'
                  : 'text-rose-700 hover:bg-rose-50/70'
              }`}
            >
              <span className="flex items-center gap-1 truncate">
                <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 hidden sm:inline" />
                <span>Tiền nợ</span>
              </span>
              <span className={`text-[10.5px] sm:text-xs px-1.5 py-0.2 rounded-full font-mono truncate max-w-[90px] ${typeFilter === 'ADD' ? 'bg-white/20 text-white' : 'bg-rose-100 text-rose-800'}`}>
                +{formatVND(totalAdded)}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setTypeFilter('SUB')}
              className={`py-2 sm:py-2.5 px-1 rounded-xl transition-all cursor-pointer flex flex-col sm:flex-row items-center justify-center gap-1 text-center ${
                typeFilter === 'SUB'
                  ? 'bg-emerald-600 text-white shadow-sm font-black'
                  : 'text-emerald-700 hover:bg-emerald-50/70'
              }`}
            >
              <span className="flex items-center gap-1 truncate">
                <TrendingDown className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 hidden sm:inline" />
                <span>Đã trả</span>
              </span>
              <span className={`text-[10.5px] sm:text-xs px-1.5 py-0.2 rounded-full font-mono truncate max-w-[90px] ${typeFilter === 'SUB' ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'}`}>
                -{formatVND(totalSubtracted)}
              </span>
            </button>
          </div>

          {displayedStatement.length === 0 ? (
            <div className="text-center py-10 sm:py-12 bg-slate-50/70 rounded-3xl border border-dashed border-slate-200 text-slate-400">
              <Receipt className="w-10 h-10 mx-auto text-slate-300 mb-2 stroke-1" />
              <p className="text-sm sm:text-base font-semibold text-slate-600">
                {typeFilter === 'ALL'
                  ? 'Chưa có phát sinh giao dịch nào'
                  : typeFilter === 'ADD'
                  ? 'Không có khoản nợ nào'
                  : 'Không có khoản thanh toán nào'}
              </p>
              <p className="text-xs sm:text-sm text-slate-400 mt-1">
                Mọi khoản cộng và trừ sẽ được hiển thị minh bạch tại đây
              </p>
            </div>
          ) : (
            <div className="space-y-3 sm:space-y-3.5">
              {displayedStatement.map((item, idx) => {
                const tx = item.transaction;
                const runningBalance = typeof item.runningBalance === 'number' && !isNaN(item.runningBalance)
                  ? item.runningBalance
                  : (typeof (item as any).balanceAfter === 'number' && !isNaN((item as any).balanceAfter)
                    ? (item as any).balanceAfter
                    : 0);
                const isAdd = tx.type === 'ADD';

                return (
                  <div
                    key={tx.id || idx}
                    className={`p-4 sm:p-5 rounded-2xl border transition-all hover:shadow-xs ${
                      isAdd
                        ? 'bg-rose-50/30 border-rose-100/80 hover:border-rose-200'
                        : 'bg-emerald-50/30 border-emerald-100/80 hover:border-emerald-200'
                    }`}
                  >
                    {/* Top Row: Date, Badge, and Action */}
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-7 h-7 sm:w-8 sm:h-8 rounded-xl flex items-center justify-center shrink-0 ${
                            isAdd
                              ? 'bg-rose-100 text-rose-600'
                              : 'bg-emerald-100 text-emerald-600'
                          }`}
                        >
                          {isAdd ? (
                            <PlusCircle className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                          ) : (
                            <MinusCircle className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                          )}
                        </span>
                        <div>
                          <span
                            className={`text-[10.5px] sm:text-xs font-extrabold uppercase px-2.5 py-0.5 rounded-full ${
                              isAdd
                                ? 'bg-rose-100/80 text-rose-800'
                                : 'bg-emerald-100/80 text-emerald-800'
                            }`}
                          >
                            {isAdd ? 'Ghi nợ' : 'Đã thanh toán'}
                          </span>
                        </div>
                      </div>

                      <div className="text-xs sm:text-sm text-slate-400 font-mono">
                        {tx.date}
                      </div>
                    </div>

                    {/* Middle: Description Note */}
                    <div className="text-xs sm:text-sm md:text-base text-slate-800 font-medium mb-3 pl-9 sm:pl-10">
                      {tx.note ? (
                        <span className="whitespace-pre-line leading-relaxed">{tx.note}</span>
                      ) : (
                        <span className="italic text-slate-400">
                          {isAdd ? 'Ghi nhận khoản nợ' : 'Thanh toán tiền'}
                        </span>
                      )}

                      {/* Attachments / Invoice images preview button */}
                      {tx.imageUrls && tx.imageUrls.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2.5">
                          {tx.imageUrls.map((img, imgIdx) => (
                            <button
                              key={imgIdx}
                              type="button"
                              onClick={() =>
                                onViewImage(
                                  img,
                                  `Hóa đơn: ${tx.note || (isAdd ? 'Ghi nợ' : 'Thanh toán')}`
                                )
                              }
                              className="relative group w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden border border-slate-200 shadow-2xs hover:opacity-90 transition-all cursor-pointer"
                              title="Bấm để xem ảnh hóa đơn phóng to"
                            >
                              <img
                                src={img}
                                alt="Hóa đơn"
                                className="w-full h-full object-cover"
                                loading="lazy"
                              />
                              <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[10px] sm:text-xs font-bold">
                                Xem
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Bottom Row: Amount change & Running Balance indicator */}
                    <div className="flex items-center justify-between gap-2 pt-2 sm:pt-2.5 border-t border-slate-100 text-xs sm:text-sm">
                      <div>
                        <span className="text-slate-500 text-xs sm:text-sm font-medium block xs:inline">Biến động: </span>
                        <strong
                          className={`font-mono text-sm sm:text-base tracking-tight ${
                            isAdd ? 'text-rose-600 font-black' : 'text-emerald-600 font-black'
                          }`}
                        >
                          {isAdd ? `+${formatVND(tx.amount)}` : `-${formatVND(tx.amount)}`}
                        </strong>
                      </div>

                      <div className="text-right">
                        <span className="text-slate-500 text-xs sm:text-sm font-medium block xs:inline">Dư nợ sau GD: </span>
                        <strong
                          className={`font-bold font-mono text-xs sm:text-base ${
                            runningBalance > 0
                              ? 'text-rose-600'
                              : runningBalance < 0
                              ? 'text-emerald-600'
                              : 'text-slate-900'
                          }`}
                        >
                          {runningBalance > 0
                            ? formatVND(runningBalance)
                            : runningBalance < 0
                            ? `+${formatVND(Math.abs(runningBalance))}`
                            : formatVND(0)}
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

      {/* 📱 PWA Install Card for Quick Access */}
      <PWAInstallButton variant="card" />

      {/* ⚡ THANH CỐ ĐỊNH DÍNH ĐÁY CHO MOBILE (Thanh toán khi còn nợ, Liên hệ khi chủ sổ cần trả) */}
      {currentBalance !== 0 && (
        <div
          className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/90 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] px-4 py-2.5 sm:py-3.5 select-none"
          style={{
            paddingBottom: 'max(calc(env(safe-area-inset-bottom, 0px) + 12px), 18px)',
          }}
        >
          <div className="max-w-xl md:max-w-2xl mx-auto flex items-center justify-between gap-2.5 sm:gap-3">
            {currentBalance > 0 ? (
              // Trạng thái 1: Khách nợ chủ sổ -> Cần thanh toán
              <>
                <div className="min-w-0">
                  <span className="text-[10.5px] sm:text-xs text-slate-500 uppercase font-extrabold block leading-tight tracking-wider">
                    Cần thanh toán
                  </span>
                  <span className="font-mono text-base sm:text-xl font-black text-rose-600 tracking-tight truncate block">
                    {formatVND(currentBalance)}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={copyAccountNumber}
                    className="px-2.5 sm:px-3.5 py-2 sm:py-2.5 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-1.5 cursor-pointer border border-slate-200/80 active:scale-95"
                    title="Sao chép số tài khoản ngân hàng"
                  >
                    {copiedAcc ? (
                      <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    )}
                    <span>{copiedAcc ? 'Đã chép STK' : 'Chép STK'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowQrModal(true)}
                    className="px-3 sm:px-4 py-2 sm:py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-xs sm:text-sm font-extrabold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95"
                  >
                    <QrCode className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                    <span>Mã QR</span>
                  </button>
                </div>
              </>
            ) : (
              // Trạng thái 2: Chủ sổ nợ khách -> Hiển thị thông tin liên hệ ngay ở thanh bottom
              <>
                <div className="min-w-0">
                  <span className="text-[10.5px] sm:text-xs text-emerald-700 uppercase font-extrabold block leading-tight tracking-wider flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span>Được thanh toán</span>
                  </span>
                  <span className="font-mono text-base sm:text-xl font-black text-emerald-600 tracking-tight truncate block">
                    +{formatVND(Math.abs(currentBalance))}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                  {contactPhone && (
                    <button
                      type="button"
                      onClick={copyPhoneNumber}
                      className="px-2.5 sm:px-3.5 py-2 sm:py-2.5 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-1.5 cursor-pointer border border-slate-200/80 active:scale-95"
                      title="Sao chép số điện thoại chủ sổ"
                    >
                      {copiedPhone ? (
                        <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      )}
                      <span>{copiedPhone ? 'Đã chép' : 'Chép SĐT'}</span>
                    </button>
                  )}

                  {contactPhone ? (
                    <div className="flex items-center gap-1.5">
                      <a
                        href={`tel:${contactPhone.replace(/\s+/g, '')}`}
                        className="px-3 sm:px-4 py-2 sm:py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-xs sm:text-sm font-extrabold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95"
                        title="Bấm để gọi điện ngay cho chủ sổ"
                      >
                        <Phone className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        <span>Gọi điện</span>
                      </a>
                      <a
                        href={`https://zalo.me/${contactPhone.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 sm:px-3 py-2 sm:py-2.5 bg-blue-50 hover:bg-blue-100 active:bg-blue-200 text-blue-700 border border-blue-200/80 rounded-xl text-xs sm:text-sm font-bold transition-all hidden xs:inline-flex items-center gap-1 active:scale-95"
                        title="Nhắn tin qua Zalo cho chủ sổ"
                      >
                        <span>Zalo</span>
                      </a>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowContactModal(true)}
                      className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>Liên hệ</span>
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 📱 POPUP / BOTTOM SHEET XEM NHANH MÃ QR VÀ CHI TIẾT CHUYỂN KHOẢN */}
      <AnimatePresence>
        {showQrModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs"
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowQrModal(false);
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 16 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="bg-white rounded-3xl border border-slate-200/90 max-w-sm sm:max-w-md w-full p-4 sm:p-6 space-y-4 shadow-2xl relative my-auto"
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2 text-slate-900 font-extrabold text-sm sm:text-base uppercase">
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                    <QrCode className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                  <span>Quét QR Thanh Toán</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowQrModal(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
                  title="Đóng popup"
                >
                  <X className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              </div>

              {/* VietQR Image Container */}
              {vietQrUrl ? (
                <div className="flex flex-col items-center justify-center p-3 bg-slate-50 rounded-2xl border border-slate-200/80">
                  <div className="bg-white p-2.5 rounded-xl shadow-xs border border-slate-200/60 inline-flex items-center justify-center">
                    <img
                      src={vietQrUrl}
                      alt="Mã QR thanh toán"
                      className="w-48 h-48 sm:w-60 sm:h-60 object-contain"
                    />
                  </div>
                  <p className="mt-2.5 text-xs sm:text-sm font-semibold text-slate-600 text-center">
                    Mở ứng dụng ngân hàng và quét mã để thanh toán
                  </p>
                </div>
              ) : (
                <div className="p-4 bg-slate-50 text-slate-500 rounded-2xl text-xs sm:text-sm text-center">
                  Chưa cấu hình tài khoản ngân hàng để tạo mã QR.
                </div>
              )}

              {/* Quick Details & Copy Rows */}
              <div className="space-y-2 text-xs sm:text-sm text-slate-700 bg-slate-50 p-3.5 sm:p-4 rounded-2xl border border-slate-200/70">
                <div className="flex items-center justify-between py-1 border-b border-slate-200/60">
                  <span className="text-slate-500 font-medium">Ngân hàng:</span>
                  <strong className="text-slate-900 font-bold">{activeSettings.bankName}</strong>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-slate-200/60">
                  <span className="text-slate-500 font-medium">Chủ tài khoản:</span>
                  <strong className="text-slate-900 font-bold uppercase">{activeSettings.accountName}</strong>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-slate-200/60">
                  <span className="text-slate-500 font-medium">Số tài khoản:</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={copyAccountNumber}
                      className="px-2 py-0.5 text-xs bg-white border border-slate-200 rounded-md font-bold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                    >
                      {copiedAcc ? 'Đã chép' : 'Chép'}
                    </button>
                    <strong className="font-mono text-slate-900 font-bold tracking-wide">{activeSettings.accountNumber}</strong>
                  </div>
                </div>

                <div className="flex items-center justify-between py-1">
                  <span className="text-slate-500 font-medium">Số tiền cần trả:</span>
                  <div className="flex items-center gap-1.5">
                    <strong className="font-mono text-rose-600 font-black text-sm sm:text-base">{formatVND(currentBalance)}</strong>
                  </div>
                </div>
              </div>

              {/* Close Button */}
              <button
                type="button"
                onClick={() => setShowQrModal(false)}
                className="w-full py-2.5 sm:py-3 bg-slate-900 hover:bg-slate-800 active:bg-black text-white rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer text-center"
              >
                Đóng
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 📱 POPUP / BOTTOM SHEET LIÊN HỆ CHỦ SỔ NHẬN TIỀN */}
      <AnimatePresence>
        {showContactModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs"
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowContactModal(false);
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 16 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="bg-white rounded-3xl border border-slate-200/90 max-w-sm sm:max-w-md w-full p-4 sm:p-6 space-y-4 shadow-2xl relative my-auto"
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2 text-slate-900 font-extrabold text-sm sm:text-base uppercase">
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                    <Phone className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                  <span>Thông Tin Liên Hệ</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowContactModal(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
                  title="Đóng popup"
                >
                  <X className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              </div>

              {/* Amount info */}
              <div className="p-3.5 sm:p-4 bg-emerald-50 rounded-2xl border border-emerald-100 text-center">
                <span className="text-xs sm:text-sm text-emerald-700 font-bold uppercase block">
                  Số tiền bạn được nhận lại
                </span>
                <span className="text-xl sm:text-3xl font-black font-mono text-emerald-700 block mt-0.5">
                  +{formatVND(Math.abs(currentBalance))}
                </span>
                <p className="text-xs sm:text-sm text-slate-600 mt-1">
                  Hãy gửi STK ngân hàng của bạn cho <strong>{activeSettings.ownerName}</strong> để nhận lại tiền nhé!
                </p>
              </div>

              {/* Contact actions */}
              <div className="space-y-2.5">
                {contactPhone ? (
                  <>
                    <div className="flex items-center justify-between p-3 sm:p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80">
                      <div>
                        <span className="text-xs text-slate-400 uppercase font-bold block">SĐT / Zalo Chủ Sổ</span>
                        <strong className="text-sm sm:text-base font-mono font-bold text-slate-900">{contactPhone}</strong>
                      </div>
                      <button
                        type="button"
                        onClick={copyPhoneNumber}
                        className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-xl text-xs sm:text-sm font-bold transition-all shadow-2xs cursor-pointer flex items-center gap-1 active:scale-95"
                      >
                        {copiedPhone ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Đã chép</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Sao chép</span>
                          </>
                        )}
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
                      <a
                        href={`tel:${contactPhone.replace(/\s+/g, '')}`}
                        className="py-2.5 sm:py-3 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-1.5 transition-all shadow-xs active:scale-95"
                      >
                        <Phone className="w-4 h-4" />
                        <span>Gọi điện ngay</span>
                      </a>
                      <a
                        href={`https://zalo.me/${contactPhone.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="py-2.5 sm:py-3 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-1.5 transition-all shadow-xs active:scale-95"
                      >
                        <ExternalLink className="w-4 h-4" />
                        <span>Nhắn Zalo</span>
                      </a>
                    </div>
                  </>
                ) : (
                  <div className="p-3 sm:p-4 bg-slate-50 rounded-2xl border border-slate-200 text-center text-xs sm:text-sm text-slate-500">
                    Chủ sổ chưa cập nhật số điện thoại liên hệ.
                  </div>
                )}
              </div>

              {/* Close Button */}
              <button
                type="button"
                onClick={() => setShowContactModal(false)}
                className="w-full py-2.5 sm:py-3 bg-slate-900 hover:bg-slate-800 active:bg-black text-white rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer text-center"
              >
                Đóng
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
