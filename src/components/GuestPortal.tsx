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
import {
  Lock,
  Unlock,
  Calendar,
  CreditCard,
  Copy,
  Check,
  Receipt,
  ShieldCheck,
  ArrowLeft,
  RefreshCw,
  Eye,
  EyeOff,
  QrCode,
  Megaphone,
  Users,
  UserPlus,
  Phone,
  RotateCcw,
  Search,
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  Image as ImageIcon,
} from 'lucide-react';
import { Debtor, Transaction, AppSettings } from '../types';
import { formatVND, generateVietQrUrl } from '../utils/vietqr';
import { getDebtorBalance, getDebtorStatement } from '../utils/storage';
import { apiGuestLookup, subscribeToDebtorTransactions } from '../utils/api';
import { DEFAULT_SETTLED_NOTE, DEFAULT_LOOKUP_INSTRUCTION } from '../utils/textTemplate';
import { ConfirmResetSampleModal } from './ConfirmResetSampleModal';

interface GuestPortalProps {
  onViewImage: (url: string, title?: string) => void;
  onGoToOwnerLogin: () => void;
  initialPin?: string | null;
  initialDebtor?: Debtor | null;
  isOwnerAuthenticated?: boolean;
  debtors?: Debtor[];
  allTransactions?: Transaction[];
  appSettings?: AppSettings;
  onOpenAddDebtor?: () => void;
  onDataReload?: () => void;
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
  onOpenAddDebtor,
  onDataReload,
}) => {
  const [pin, setPin] = useState(initialPin || '');
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showInputPass, setShowInputPass] = useState(false);
  const [isConfirmResetOpen, setIsConfirmResetOpen] = useState(false);

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

  const handleLogout = () => {
    setDebtor(null);
    setTransactions([]);
    setSettings(null);
    setPin('');
    setAuthError('');
    setShowPin(false);
  };

  const handleRefreshStatement = async () => {
    if (!debtor) return;
    setIsLoading(true);
    const res = await apiGuestLookup(debtor.pin);
    if (res.success && res.transactions) {
      setTransactions(res.transactions);
    }
    setIsLoading(false);
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
        {/* If user is Admin/Owner */}
        {isOwnerAuthenticated ? (
          debtors && debtors.length > 0 ? (
            <div
              id="owner-guest-preview-chooser"
              className="w-full max-w-xl bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden relative"
            >
            {/* Admin Banner */}
            <div className="bg-slate-900 text-white p-6 sm:p-7 text-center relative border-b border-slate-800">
              <button
                type="button"
                onClick={onGoToOwnerLogin}
                className="absolute left-4 top-5 p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors text-xs flex items-center gap-1.5 font-medium cursor-pointer"
                title="Quay lại giao diện chủ nợ"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden xs:inline">Quản Lý Sổ</span>
              </button>

              <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center mb-3 shadow-inner">
                <Users className="w-7 h-7" />
              </div>

              <h1 className="text-lg sm:text-xl font-bold uppercase tracking-wider text-white">
                Tra Cứu Nhanh
              </h1>
              <p className="text-xs text-slate-400 mt-1.5 max-w-sm mx-auto leading-relaxed">
                Chọn con nợ trong danh sách để xem chi tiết.
              </p>
            </div>

            <div className="p-4 sm:p-6 space-y-4">
              {authError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-medium">
                  {authError}
                </div>
              )}

              {/* Danh sách người nợ để tra cứu nhanh */}
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-3">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                    Chọn con nợ({debtors.length}):
                  </label>
                  {debtors.length > 3 && (
                    <div className="relative w-full sm:w-64">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Tìm tên..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-100 border border-slate-300 rounded-xl text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-96 overflow-y-auto pr-1">
                  {debtors
                    .filter((d) => {
                      if (!searchQuery.trim()) return true;
                      const q = searchQuery.toLowerCase().trim();
                      return (
                        d.name.toLowerCase().includes(q) ||
                        (d.pin && d.pin.toLowerCase().includes(q))
                      );
                    })
                    .map((d) => {
                      const balance = allTransactions ? getDebtorBalance(d.id, allTransactions) : 0;
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => handleDirectSelectDebtor(d)}
                          className="p-3.5 bg-slate-50 hover:bg-emerald-50 hover:border-emerald-300 border border-slate-200 rounded-2xl text-left transition-all flex items-center justify-between gap-3 group cursor-pointer"
                        >
                          <div className="min-w-0">
                            <div className="font-bold text-sm text-slate-900 group-hover:text-emerald-700 truncate">
                              {d.name}
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5 font-mono truncate">
                              Mật khẩu: {d.pin}
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <div
                              className={`text-xs font-black font-mono ${
                                balance > 0
                                  ? 'text-rose-600'
                                  : balance < 0
                                  ? 'text-emerald-600'
                                  : 'text-slate-400'
                              }`}
                            >
                              {balance > 0 ? `+${formatVND(balance)}` : formatVND(balance)}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* ADMIN EMPTY STATE: When debtor list is empty, DO NOT ask for password! */
          <div
            id="owner-empty-guest-preview"
            className="w-full max-w-xl bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden relative"
          >
            <div className="bg-slate-900 text-white p-6 sm:p-7 text-center relative border-b border-slate-800">
              <button
                type="button"
                onClick={onGoToOwnerLogin}
                className="absolute left-4 top-5 p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors text-xs flex items-center gap-1.5 font-medium cursor-pointer"
                title="Quay lại giao diện chủ nợ"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden xs:inline">Chủ Nợ</span>
              </button>

              <div className="w-14 h-14 rounded-2xl bg-amber-500/20 text-amber-400 mx-auto flex items-center justify-center mb-3 shadow-inner">
                <Users className="w-7 h-7" />
              </div>

              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 mb-2">
                👑 Chủ Nợ
              </div>

              <h1 className="text-lg sm:text-xl font-bold uppercase tracking-wider text-white">
                Chưa Có Ai Nợ Bạn
              </h1>
              <p className="text-xs text-slate-400 mt-1.5 max-w-md mx-auto leading-relaxed">
                Danh sách nợ của bạn hiện đang trống (0 người nợ).
              </p>
            </div>

            <div className="p-6 sm:p-8 text-center space-y-5">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-600 leading-relaxed max-w-md mx-auto">
                Con nợ tra cứu cần có mật khẩu riêng để xem sao kê. Bạn có thể thêm con nợ mới ngay bây giờ, hoặc nạp lại bộ dữ liệu mẫu ban đầu để xem giao diện con nợ.
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-1">
                {onOpenAddDebtor && (
                  <button
                    type="button"
                    onClick={onOpenAddDebtor}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Thêm Con Nợ</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setIsConfirmResetOpen(true)}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Nạp Dữ Liệu Mẫu</span>
                </button>

                <button
                  type="button"
                  onClick={onGoToOwnerLogin}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Chủ Nợ</span>
                </button>
              </div>
            </div>
          </div>
        )
      ) : (
        /* REGULAR GUEST LOGIN FORM (When not logged in as Admin) */
        <div
          id="guest-pin-card"
          className="w-full max-w-xl bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden relative"
        >
            {/* Header */}
            <div className="bg-slate-900 text-white p-6 sm:p-7 text-center relative border-b border-slate-800">
              <button
                type="button"
                onClick={onGoToOwnerLogin}
                className="absolute right-4 top-5 p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors text-xs flex items-center gap-1.5 font-medium cursor-pointer"
                title="Khu vực dành cho chủ nợ"
              >
                <span className="hidden xs:inline">Chủ Nợ</span>
                <ArrowLeft className="w-4 h-4 rotate-180" />
              </button>

              <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center mb-3 shadow-inner">
                <Lock className="w-7 h-7" />
              </div>
              <h1 className="text-lg sm:text-xl font-bold uppercase tracking-wider text-white">
                {currentSettings?.appTitle || 'Tra Cứu Sổ Nợ Cá Nhân'}
              </h1>
              <p className="text-xs text-slate-400 mt-1.5 max-w-sm mx-auto leading-relaxed">
                {currentSettings?.lookupInstructionText || DEFAULT_LOOKUP_INSTRUCTION}
              </p>
            </div>

            <form onSubmit={handleFormSubmit} className="p-6 sm:p-7 space-y-4">
              {authError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-semibold leading-relaxed animate-in fade-in">
                  {authError}
                </div>
              )}

              <div>
                <label
                  htmlFor="guest-pin-input"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 text-center"
                >
                  Nhập Mật Khẩu Của Bạn:
                </label>
                <div className="relative">
                  <input
                    id="guest-pin-input"
                    type={showInputPass ? 'text' : 'password'}
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    placeholder="Ví dụ: nam123 hoặc 1234"
                    autoFocus
                    className="w-full px-4 py-3.5 text-center text-lg sm:text-xl font-bold font-mono tracking-wider bg-slate-50 border border-slate-300 rounded-2xl text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all shadow-inner"
                  />
                  <button
                    type="button"
                    onClick={() => setShowInputPass(!showInputPass)}
                    className="absolute right-3.5 top-4 text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                    title={showInputPass ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  >
                    {showInputPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 text-center mt-2 leading-relaxed">
                  Mật khẩu được ({currentSettings?.ownerName || 'Chủ nợ'}) cấp riêng cho bạn để bảo vệ quyền riêng tư cá nhân.
                </p>
              </div>

              <button
                type="submit"
                id="submit-guest-pin-btn"
                disabled={isLoading || pin.trim().length < 2}
                className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 text-white font-bold text-sm rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Đang kiểm tra mật khẩu...</span>
                  </>
                ) : (
                  <>
                    <Unlock className="w-4 h-4" />
                    <span>Tra Cứu Nợ</span>
                  </>
                )}
              </button>
            </form>

            <div className="p-4 bg-slate-50 border-t border-slate-100 text-center">
              <button
                type="button"
                onClick={onGoToOwnerLogin}
                className="text-xs text-slate-600 hover:text-slate-900 font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <span>Bạn là Chủ nợ muốn vào quản lý? Đăng nhập tại đây</span>
                <ArrowLeft className="w-3.5 h-3.5 rotate-180" />
              </button>
            </div>
          </div>
        )}

        {/* Confirmation modal to reload sample data if invoked from empty state */}
        <ConfirmResetSampleModal
          isOpen={isConfirmResetOpen}
          onClose={() => setIsConfirmResetOpen(false)}
          onSuccess={() => {
            if (onDataReload) onDataReload();
          }}
        />
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
    <div className="max-w-xl w-full mx-auto space-y-4 sm:space-y-5 pb-12 animate-in fade-in duration-200">
      {/* OWNER PREVIEW TOOLBAR (When Owner is inspecting a debtor's view) - Fully Mobile Responsive */}
      {isOwnerAuthenticated && debtors && debtors.length > 0 && (
        <div className="p-3 sm:p-4 bg-slate-900 text-white rounded-2xl sm:rounded-3xl shadow-md border border-slate-800 space-y-2.5 animate-in fade-in">
          {/* Header Row: Status badge & Return button */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs shrink-0">
                👑
              </div>
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wider text-emerald-400 font-bold">
                  Chủ Nợ
                </div>
                <div className="text-xs sm:text-sm font-bold text-white truncate">
                  Đang xem: <span className="text-emerald-300">{debtor.name}</span>{' '}
                  <span className="text-slate-400 text-xs font-mono font-normal">
                    ({debtor.pin})
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Switcher Row: Full width on mobile for ease of selecting */}
          <div className="flex items-center gap-2 pt-1 border-t border-slate-800/80">
            <div className="flex-1 min-w-0">
              <select
                value={debtor.id}
                onChange={(e) => {
                  const target = debtors.find((d) => d.id === e.target.value);
                  if (target) handleDirectSelectDebtor(target);
                }}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs font-semibold focus:ring-1 focus:ring-emerald-400 cursor-pointer truncate"
              >
                {debtors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} - Mật khẩu: {d.pin}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Top Banner / Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={handleLogout}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Quay lại</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRefreshStatement}
            title="Làm mới sao kê"
            className="p-2 bg-white border border-slate-300 text-slate-600 hover:text-slate-900 rounded-xl text-xs cursor-pointer shadow-2xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200 font-medium shrink-0">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">Phiên tra cứu bảo mật</span>
            <span className="xs:hidden">Bảo mật</span>
          </div>
        </div>
      </div>

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
      <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="bg-slate-900 text-white px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-widest text-emerald-400 font-bold">
                👤 THÔNG TIN TRA CỨU
              </span>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                Trực tiếp
              </span>
            </div>
            <h1 className="text-lg sm:text-xl font-bold mt-0.5">
              {debtor.name}
            </h1>
          </div>
          <div className="text-left sm:text-right text-xs text-slate-400 space-y-0.5">
            {/* Ẩn/Hiện Pass */}
            <div className="flex items-center sm:justify-end gap-1.5 font-mono">
              <span className="text-slate-400">Mật khẩu:</span>
              <span className="text-emerald-400 font-bold">
                {showPin ? debtor.pin : '••••'}
              </span>
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="p-0.5 text-slate-400 hover:text-white rounded transition-colors cursor-pointer"
                title={showPin ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              >
                {showPin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>

        {/* 💰 TỔNG SỐ DƯ HIỆN TẠI */}
        <div className="p-4 sm:p-6 border-b border-slate-200">
          <div
            className={`p-5 rounded-2xl border transition-all ${
              currentBalance > 0
                ? 'bg-rose-50/80 border-rose-200 text-rose-950'
                : currentBalance < 0
                ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
                : 'bg-slate-50 border-slate-200 text-slate-800'
            }`}
          >
            <div className="text-xs uppercase font-bold tracking-wider opacity-75">
              💰 SỐ NỢ HIỆN TẠI:
            </div>
            <div className="text-3xl sm:text-4xl font-black mt-1 tracking-tight font-mono">
              {currentBalance > 0
                ? `+ ${formatVND(currentBalance)}`
                : formatVND(currentBalance)}
            </div>

            <div className="mt-2 text-xs sm:text-sm font-semibold">
              {currentBalance > 0 ? (
                <span className="text-rose-700 inline-flex items-center gap-1.5">
                  🔴 Bạn đang nợ {activeSettings.ownerName}
                </span>
              ) : currentBalance < 0 ? (
                <span className="text-emerald-700 inline-flex items-center gap-1.5">
                  🟢 {activeSettings.ownerName} đang nợ bạn{' '}
                  {formatVND(Math.abs(currentBalance))}
                </span>
              ) : (
                <span className="text-slate-500 inline-flex items-center gap-1.5">
                  ⚪ Đã thanh toán hết, đôi bên không nợ nhau
                </span>
              )}
            </div>
          </div>
        </div>

        {currentBalance > 0 ? (
          <div className="p-4 sm:p-6 bg-slate-50 border-b border-slate-200 space-y-4">
            <div className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-emerald-600" />
              <h2 className="font-bold text-sm text-slate-900 uppercase tracking-wide">
                Thông Tin Chuyển Khoản Trả Nợ
              </h2>
            </div>

            {/* Thông tin tài khoản ngân hàng */}
            <div className="p-4 bg-white rounded-2xl border border-slate-200 space-y-2.5 text-xs text-slate-700 shadow-2xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <span className="text-slate-400">Ngân hàng:</span>{' '}
                  <strong className="text-slate-900 font-bold">{activeSettings.bankName}</strong>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-slate-400">Số tài khoản:</span>{' '}
                    <strong className="text-slate-900 font-bold font-mono text-sm">
                      {activeSettings.accountNumber}
                    </strong>
                  </div>
                  <button
                    type="button"
                    onClick={copyAccountNumber}
                    className="inline-flex items-center gap-1 text-[11px] px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors font-semibold cursor-pointer"
                  >
                    {copiedAcc ? (
                      <Check className="w-3 h-3 text-emerald-600" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                    <span>{copiedAcc ? 'Đã chép' : 'Sao chép'}</span>
                  </button>
                </div>
                <div>
                  <span className="text-slate-400">Chủ tài khoản:</span>{' '}
                  <strong className="text-slate-900 font-bold">
                    {activeSettings.accountName}
                  </strong>
                </div>
                {activeSettings.ownerPhone && (
                  <div>
                    <span className="text-slate-400">SĐT Chủ Nợ:</span>{' '}
                    <a
                      href={`tel:${activeSettings.ownerPhone}`}
                      className="text-emerald-700 font-bold font-mono hover:underline inline-flex items-center gap-1"
                      title="Bấm để gọi điện cho Chủ Nợ"
                    >
                      <Phone className="w-3 h-3" />
                      <span>{activeSettings.ownerPhone}</span>
                    </a>
                  </div>
                )}
                <div>
                  <span className="text-slate-400">Số tiền nợ:</span>{' '}
                  <strong className="text-rose-600 font-bold text-sm font-mono">
                    {formatVND(currentBalance)}
                  </strong>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="truncate">
                  <span className="text-slate-400">Nội dung CK:</span>{' '}
                  <strong className="text-slate-900 font-mono font-bold">
                    {vietQrMemo}
                  </strong>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(vietQrMemo);
                    setCopiedMemo(true);
                    setTimeout(() => setCopiedMemo(false), 2000);
                  }}
                  className="inline-flex items-center gap-1 text-[11px] text-emerald-700 hover:text-emerald-800 font-semibold px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors cursor-pointer shrink-0 self-start sm:self-auto"
                >
                  {copiedMemo ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedMemo ? 'Đã chép nội dung' : 'Chép nội dung CK'}</span>
                </button>
              </div>
            </div>

            {/* MÃ VIETQR STK NGÂN HÀNG (Chỉ để là QR STK ngân hàng, xóa các lựa chọn chế độ số tiền) */}
            {vietQrUrl && (
              <div className="p-4 sm:p-5 bg-white rounded-2xl border border-emerald-300 shadow-sm space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-900 uppercase">
                    <QrCode className="w-4 h-4 text-emerald-600" />
                    <span>Mã VietQR STK Ngân Hàng</span>
                  </div>
                  <span className="text-[11px] text-slate-500">
                    Quét nhanh bằng mọi App Ngân Hàng
                  </span>
                </div>

                {/* Image QR display */}
                <div className="flex flex-col items-center justify-center p-3 sm:p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <img
                    src={vietQrUrl}
                    alt="Mã VietQR thanh toán"
                    className="max-h-64 sm:max-h-72 max-w-full object-contain rounded-xl bg-white p-2 shadow-sm"
                    loading="lazy"
                  />
                  <div className="mt-2.5 text-center space-y-1">
                    <p className="text-xs font-semibold text-slate-700 leading-relaxed">
                      👉 Mở App ngân hàng quét mã QR này: <strong>STK &amp; Nội dung đã được điền sẵn</strong>.
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Bạn chỉ cần gõ số tiền muốn chuyển ngay trên ứng dụng ngân hàng.
                    </p>
                  </div>
                </div>
              </div>
            )}
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
        <div className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3.5">
            <h2 className="font-bold text-xs sm:text-sm text-slate-900 uppercase tracking-wide flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-500" />
              <span>LỊCH SỬ BIẾN ĐỘNG ({statement.length})</span>
            </h2>
            <div className="flex items-center self-start sm:self-auto bg-slate-100 p-0.5 rounded-lg text-[11px] font-medium text-slate-600">
              <button
                type="button"
                onClick={() => setSortOrder('newest')}
                className={`px-2 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1 ${
                  sortOrder === 'newest'
                    ? 'bg-white text-slate-900 font-bold shadow-xs'
                    : 'hover:text-slate-900 text-slate-500'
                }`}
                title="Sắp xếp mới nhất lên đầu"
              >
                <ArrowDownWideNarrow className="w-3 h-3 text-emerald-600" />
                <span>Mới nhất trước</span>
              </button>
              <button
                type="button"
                onClick={() => setSortOrder('oldest')}
                className={`px-2 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1 ${
                  sortOrder === 'oldest'
                    ? 'bg-white text-slate-900 font-bold shadow-xs'
                    : 'hover:text-slate-900 text-slate-500'
                }`}
                title="Sắp xếp cũ nhất lên đầu"
              >
                <ArrowUpNarrowWide className="w-3 h-3 text-slate-400" />
                <span>Cũ nhất trước</span>
              </button>
            </div>
          </div>

          {displayedStatement.length === 0 ? (
            <div className="text-center py-8 bg-slate-50 rounded-2xl text-slate-400 text-xs border border-dashed border-slate-200">
              Chưa ghi nhận biến động giao dịch nào.
            </div>
          ) : (
            <div className="space-y-2.5">
              {displayedStatement.map(({ transaction: tx, runningBalance }) => {
                const isAdd = tx.type === 'ADD';
                return (
                  <div
                    key={tx.id}
                    className="p-3.5 sm:p-4 rounded-2xl border border-slate-200 bg-white hover:border-slate-300 transition-colors shadow-2xs space-y-2"
                  >
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <div className="font-semibold text-slate-600 flex items-center gap-1.5">
                        <span>📅 {tx.date}</span>
                        {tx.category === 'PARTY_SPLIT' && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-medium">
                            Chia tiền nhóm
                          </span>
                        )}
                        {tx.category === 'PAYMENT_SETTLED' && (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-medium">
                            Đã thanh toán
                          </span>
                        )}
                      </div>
                      {tx.billImage && (
                        <button
                          type="button"
                          onClick={() => onViewImage(tx.billImage!, tx.note)}
                          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-semibold cursor-pointer"
                        >
                          <Receipt className="w-3.5 h-3.5" />
                          <span>Xem hóa đơn</span>
                        </button>
                      )}
                    </div>

                    <div className="font-medium text-slate-900 text-sm break-words">
                      📝 {tx.note}
                    </div>

                    <div className="flex flex-col xs:flex-row xs:items-center justify-between gap-1 pt-1.5 border-t border-slate-100 text-xs">
                      <div>
                        <span className="text-slate-500">Biến động: </span>
                        <strong
                          className={`font-mono ${
                            isAdd ? 'text-rose-600 font-bold' : 'text-emerald-600 font-bold'
                          }`}
                        >
                          {isAdd ? `+${formatVND(tx.amount)}` : `-${formatVND(tx.amount)}`}
                        </strong>
                      </div>

                      <div className="text-slate-500 font-medium">
                        Số dư sau GD:{' '}
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
    </div>
  );
};
