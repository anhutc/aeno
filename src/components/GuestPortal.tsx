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
} from 'lucide-react';
import { Debtor, Transaction, AppSettings } from '../types';
import { formatVND, generateVietQrUrl } from '../utils/vietqr';
import { getDebtorBalance, getDebtorStatement } from '../utils/storage';
import { subscribeToDebtorTransactions } from '../utils/api';
import { DEFAULT_SETTLED_NOTE } from '../utils/textTemplate';
import { AnimatedCounter } from './AnimatedCounter';
import { triggerSettledCelebration } from '../utils/confetti';

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

  // Copy state
  const [copiedAcc, setCopiedAcc] = useState(false);
  const [copiedAmount, setCopiedAmount] = useState(false);

  // Sync if prop changes
  useEffect(() => {
    const active = propDebtor || initialDebtor || null;
    setDebtor(active);
    if (active) {
      setTransactions(allTransactions.filter((t) => t.debtorId === active.id));
    }
  }, [propDebtor, initialDebtor, allTransactions]);

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

  // --- Active Settings ---
  const activeSettings = appSettings || {
    ownerName: 'Quản lý',
    ownerPhone: '0987654321',
    appTitle: 'Sổ Ghi Nợ & Chia Tiền',
    defaultMemoPrefix: '',
    bankId: '',
    accountNumber: '',
    accountName: '',
  };

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

  const contactPhone = (activeSettings.ownerPhone || '0987654321').trim();

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
      className={`max-w-xl w-full mx-auto space-y-4 sm:space-y-5 ${
        currentBalance > 0 ? 'pb-24' : 'pb-12'
      }`}
    >
      {/* Lời nhắn / Thông báo ghim của chủ sổ gửi khách */}
      {activeSettings.guestAnnouncement && (
        <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 text-blue-900 rounded-2xl text-xs flex items-start gap-3 shadow-2xs">
          <div className="w-7 h-7 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
            <Megaphone className="w-4 h-4" />
          </div>
          <div className="flex-1">
            <div className="font-bold uppercase tracking-wider text-[11px] text-blue-800">
              Lời nhắn từ {activeSettings.ownerName}:
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
                👤 TRA CỨU GIAO DỊCH
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black mt-1 text-slate-900 tracking-tight">
              {debtor.name}
            </h1>
          </div>
          <div className="text-left sm:text-right text-xs text-slate-500">
            {/* Ẩn/Hiện Pass */}
            <div className="inline-flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200 font-mono shadow-2xs">
              <span className="text-slate-500 text-[11px]">Mật khẩu:</span>
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
                className={`text-[11px] font-extrabold px-3 py-1 rounded-full uppercase tracking-wider ${
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

            <div className="mt-2">
              <div
                className={`text-3xl sm:text-4xl font-black font-mono tracking-tight leading-none ${
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
                    if (currentBalance > 0) return `+${formatted}`;
                    if (currentBalance < 0) return `-${formatted}`;
                    return formatted;
                  }}
                />
              </div>
            </div>

            <div className="mt-3 text-xs sm:text-sm font-semibold pt-2 border-t border-black/5 flex flex-wrap items-center justify-between gap-2">
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

        {/* 💳 THÔNG TIN CHUYỂN KHOẢN (ĐÃ LOẠI BỎ TRƯỜNG NỘI DUNG CHUYỂN KHOẢN) */}
        {currentBalance > 0 ? (
          <div className="p-5 sm:p-7 bg-slate-50/70 border-b border-slate-200/80 space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                <CreditCard className="w-4 h-4" />
              </div>
              <div>
                <h2 className="font-extrabold text-sm text-slate-900 uppercase tracking-wide">
                  Thông Tin Chuyển Khoản
                </h2>
                <p className="text-[11px] text-slate-500">Chuyển trực tiếp qua số tài khoản hoặc quét mã QR</p>
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

                  <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
                    <span className="text-slate-500 font-medium">SĐT Liên hệ:</span>
                    <a
                      href={`tel:${contactPhone}`}
                      className="text-emerald-700 font-bold font-mono hover:underline inline-flex items-center gap-1.5"
                      title="Bấm để gọi điện liên hệ"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>{contactPhone}</span>
                    </a>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Số tiền cần thanh toán:</span>
                    <strong className="text-rose-600 font-black text-base font-mono">
                      {formatVND(currentBalance)}
                    </strong>
                  </div>
                </div>
              </div>

              {/* MÃ VIETQR QUÉT NHANH */}
              {vietQrUrl && (
                <div className="p-5 bg-white rounded-3xl border border-emerald-200/90 shadow-2xs space-y-3 flex flex-col justify-between">
                  <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-950 uppercase">
                      <QrCode className="w-4 h-4 text-emerald-600" />
                      <span>Mã QR</span>
                    </div>
                    <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-bold">
                      {activeSettings.ownerName}
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
          <div className="p-4 sm:p-6 bg-slate-50 border-b border-slate-200">
            {currentBalance < 0 ? (
              <div className="p-5 bg-gradient-to-br from-emerald-50 via-teal-50/50 to-white text-emerald-950 rounded-2xl border border-emerald-200 shadow-2xs space-y-3.5">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                    <Phone className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <div className="font-extrabold text-sm sm:text-base text-emerald-900 leading-tight">
                      ✨ {activeSettings.ownerName} đang có trách nhiệm trả lại bạn {formatVND(Math.abs(currentBalance))}
                    </div>
                    <p className="text-xs text-emerald-800/80 mt-1 leading-relaxed">
                      Vui lòng gửi số tài khoản của bạn cho <strong>{activeSettings.ownerName}</strong> để nhận lại tiền nhé!
                    </p>
                  </div>
                </div>

                {/* Khối thông tin liên hệ trực tiếp Chủ Sổ */}
                <div className="pt-3 border-t border-emerald-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div>
                    <span className="text-slate-500 font-medium block text-[11px]">Thông tin liên hệ {activeSettings.ownerName}:</span>
                    <div className="font-bold text-slate-800 flex items-center gap-1.5 mt-0.5">
                      <span>SĐT / Zalo: </span>
                      <strong className="font-mono text-emerald-800 text-sm tracking-wide">{contactPhone}</strong>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <a
                      href={`tel:${contactPhone}`}
                      className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl font-bold transition-all shadow-xs inline-flex items-center gap-1.5 cursor-pointer text-xs"
                      title="Bấm để gọi điện trực tiếp"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>Gọi điện ngay</span>
                    </a>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 bg-slate-100 text-slate-700 rounded-2xl border border-slate-200 text-xs font-medium leading-relaxed whitespace-pre-line text-center">
                {activeSettings.settledThankYouNote || DEFAULT_SETTLED_NOTE}
              </div>
            )}
          </div>
        )}

        {/* 📜 LỊCH SỬ BIẾN ĐỘNG (CỘNG / TRỪ) - Mobile Optimized Timeline Feed */}
        <div className="p-4 sm:p-7">
          {/* Header section with count & sorting */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
            <h2 className="font-black text-xs sm:text-sm text-slate-900 uppercase tracking-wide flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-600" />
              <span>GIAO DỊCH ({statement.length})</span>
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
                <ArrowUpNarrowWide className="w-3.5 h-3.5 text-slate-400" />
                <span>Cũ nhất</span>
              </button>
            </div>
          </div>

          {/* 🔘 Segmented Control Bố Cục Đều 3 Cột (Tất cả, Tiền nợ, Đã trả) */}
          <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100/90 rounded-2xl mb-4 text-xs font-bold border border-slate-200/60">
            <button
              type="button"
              onClick={() => setTypeFilter('ALL')}
              className={`py-2 px-1 rounded-xl transition-all cursor-pointer flex flex-col sm:flex-row items-center justify-center gap-1 text-center ${
                typeFilter === 'ALL'
                  ? 'bg-white text-slate-900 shadow-sm border border-slate-200/80 font-black'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
              }`}
            >
              <span>Tất cả</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${typeFilter === 'ALL' ? 'bg-slate-100 text-slate-800' : 'bg-slate-200/70 text-slate-600'}`}>
                {statement.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setTypeFilter('ADD')}
              className={`py-2 px-1 rounded-xl transition-all cursor-pointer flex flex-col sm:flex-row items-center justify-center gap-1 text-center ${
                typeFilter === 'ADD'
                  ? 'bg-rose-500 text-white shadow-sm font-black'
                  : 'text-rose-700 hover:bg-rose-50/70'
              }`}
            >
              <span className="flex items-center gap-1 truncate">
                <TrendingUp className="w-3.5 h-3.5 shrink-0 hidden sm:inline" />
                <span>Tiền nợ</span>
              </span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono truncate max-w-[90px] ${typeFilter === 'ADD' ? 'bg-white/20 text-white' : 'bg-rose-100 text-rose-800'}`}>
                +{formatVND(totalAdded)}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setTypeFilter('SUB')}
              className={`py-2 px-1 rounded-xl transition-all cursor-pointer flex flex-col sm:flex-row items-center justify-center gap-1 text-center ${
                typeFilter === 'SUB'
                  ? 'bg-emerald-600 text-white shadow-sm font-black'
                  : 'text-emerald-700 hover:bg-emerald-50/70'
              }`}
            >
              <span className="flex items-center gap-1 truncate">
                <TrendingDown className="w-3.5 h-3.5 shrink-0 hidden sm:inline" />
                <span>Đã trả</span>
              </span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono truncate max-w-[90px] ${typeFilter === 'SUB' ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'}`}>
                -{formatVND(totalSubtracted)}
              </span>
            </button>
          </div>

          {displayedStatement.length === 0 ? (
            <div className="text-center py-10 sm:py-12 bg-slate-50/70 rounded-3xl border border-dashed border-slate-200 text-slate-400">
              <Receipt className="w-10 h-10 mx-auto text-slate-300 mb-2 stroke-1" />
              <p className="text-sm font-semibold text-slate-600">
                {typeFilter === 'ALL'
                  ? 'Chưa có phát sinh giao dịch nào'
                  : typeFilter === 'ADD'
                  ? 'Không có khoản nợ nào'
                  : 'Không có khoản thanh toán nào'}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                Mọi khoản cộng và trừ sẽ được hiển thị minh bạch tại đây
              </p>
            </div>
          ) : (
            <div className="space-y-3">
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
                    className={`p-4 rounded-2xl border transition-all hover:shadow-xs ${
                      isAdd
                        ? 'bg-rose-50/30 border-rose-100/80 hover:border-rose-200'
                        : 'bg-emerald-50/30 border-emerald-100/80 hover:border-emerald-200'
                    }`}
                  >
                    {/* Top Row: Date, Badge, and Action */}
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${
                            isAdd
                              ? 'bg-rose-100 text-rose-600'
                              : 'bg-emerald-100 text-emerald-600'
                          }`}
                        >
                          {isAdd ? (
                            <PlusCircle className="w-4 h-4" />
                          ) : (
                            <MinusCircle className="w-4 h-4" />
                          )}
                        </span>
                        <div>
                          <span
                            className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full ${
                              isAdd
                                ? 'bg-rose-100/80 text-rose-800'
                                : 'bg-emerald-100/80 text-emerald-800'
                            }`}
                          >
                            {isAdd ? 'Ghi nợ' : 'Đã thanh toán'}
                          </span>
                        </div>
                      </div>

                      <div className="text-[11px] text-slate-400 font-mono">
                        {tx.date}
                      </div>
                    </div>

                    {/* Middle: Description Note */}
                    <div className="text-xs sm:text-sm text-slate-800 font-medium mb-3 pl-9">
                      {tx.note ? (
                        <span className="whitespace-pre-line leading-relaxed">{tx.note}</span>
                      ) : (
                        <span className="italic text-slate-400">
                          {isAdd ? 'Ghi nhận khoản nợ' : 'Thanh toán tiền'}
                        </span>
                      )}

                      {/* Attachments / Invoice images preview button */}
                      {tx.imageUrls && tx.imageUrls.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
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
                              className="relative group w-14 h-14 rounded-xl overflow-hidden border border-slate-200 shadow-2xs hover:opacity-90 transition-all cursor-pointer"
                              title="Bấm để xem ảnh hóa đơn phóng to"
                            >
                              <img
                                src={img}
                                alt="Hóa đơn"
                                className="w-full h-full object-cover"
                                loading="lazy"
                              />
                              <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[10px] font-bold">
                                Xem
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Bottom Row: Amount change & Running Balance indicator */}
                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
                      <div>
                        <span className="text-slate-500 text-[11px] font-medium block xs:inline">Biến động: </span>
                        <strong
                          className={`font-mono text-sm tracking-tight ${
                            isAdd ? 'text-rose-600 font-black' : 'text-emerald-600 font-black'
                          }`}
                        >
                          {isAdd ? `+${formatVND(tx.amount)}` : `-${formatVND(tx.amount)}`}
                        </strong>
                      </div>

                      <div className="text-right">
                        <span className="text-slate-500 text-[11px] font-medium block xs:inline">Dư nợ sau GD: </span>
                        <strong className="text-slate-900 font-bold font-mono text-xs sm:text-sm">
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

      {/* ⚡ THANH CỐ ĐỊNH THANH TOÁN DÍNH ĐÁY CHO MOBILE */}
      {currentBalance > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/90 shadow-2xl px-4 py-3 sm:py-3.5">
          <div className="max-w-xl mx-auto flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="text-[10px] text-slate-500 uppercase font-bold block leading-tight">
                Cần thanh toán
              </span>
              <span className="font-mono text-base sm:text-lg font-black text-rose-600 tracking-tight truncate block">
                {formatVND(currentBalance)}
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={copyAccountNumber}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border border-slate-200/80 active:scale-95"
                title="Sao chép số tài khoản ngân hàng"
              >
                {copiedAcc ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>{copiedAcc ? 'Đã chép STK' : 'Chép STK'}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowQrModal(true)}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95"
              >
                <QrCode className="w-4 h-4" />
                <span>Mã QR</span>
              </button>
            </div>
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
              className="bg-white rounded-3xl border border-slate-200/90 max-w-sm w-full p-4 sm:p-5 space-y-3.5 shadow-2xl relative my-auto"
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
                <div className="flex items-center gap-2 text-slate-900 font-extrabold text-sm uppercase">
                  <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                    <QrCode className="w-4 h-4" />
                  </div>
                  <span>Quét QR Thanh Toán</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowQrModal(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
                  title="Đóng popup"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* VietQR Image Container */}
              {vietQrUrl ? (
                <div className="flex flex-col items-center justify-center p-2.5 bg-slate-50 rounded-2xl border border-slate-200/80">
                  <div className="bg-white p-2 rounded-xl shadow-xs border border-slate-200/60 inline-flex items-center justify-center">
                    <img
                      src={vietQrUrl}
                      alt="Mã QR thanh toán"
                      className="w-48 h-48 sm:w-52 sm:h-52 object-contain"
                    />
                  </div>
                  <p className="mt-2 text-[11.5px] font-semibold text-slate-600 text-center">
                    Mở ứng dụng ngân hàng và quét mã để thanh toán
                  </p>
                </div>
              ) : (
                <div className="p-4 bg-slate-50 text-slate-500 rounded-2xl text-xs text-center">
                  Chưa cấu hình tài khoản ngân hàng để tạo mã QR.
                </div>
              )}

              {/* Quick Details & Copy Rows */}
              <div className="space-y-1.5 text-xs text-slate-700 bg-slate-50 p-3 rounded-2xl border border-slate-200/70">
                <div className="flex items-center justify-between py-1 border-b border-slate-200/60">
                  <span className="text-slate-500">Ngân hàng:</span>
                  <strong className="text-slate-900 font-bold">{activeSettings.bankName}</strong>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-slate-200/60">
                  <span className="text-slate-500">Chủ tài khoản:</span>
                  <strong className="text-slate-900 font-bold uppercase">{activeSettings.accountName}</strong>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-slate-200/60">
                  <span className="text-slate-500">Số tài khoản:</span>
                  <div className="flex items-center gap-1.5">
                    <strong className="font-mono text-slate-900 font-bold tracking-wide">{activeSettings.accountNumber}</strong>
                    <button
                      type="button"
                      onClick={copyAccountNumber}
                      className="px-2 py-0.5 text-[10.5px] bg-white border border-slate-200 rounded-md font-bold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                    >
                      {copiedAcc ? 'Đã chép' : 'Chép'}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between py-1">
                  <span className="text-slate-500">Số tiền cần trả:</span>
                  <div className="flex items-center gap-1.5">
                    <strong className="font-mono text-rose-600 font-black">{formatVND(currentBalance)}</strong>
                    <button
                      type="button"
                      onClick={() => copyAmountToPay(currentBalance)}
                      className="px-2 py-0.5 text-[10.5px] bg-white border border-slate-200 rounded-md font-bold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                    >
                      {copiedAmount ? 'Đã chép' : 'Chép'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Close Button */}
              <button
                type="button"
                onClick={() => setShowQrModal(false)}
                className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 active:bg-black text-white rounded-xl text-xs font-bold transition-all cursor-pointer text-center"
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
