/**
 * ============================================================================
 * GHI CHÚ CHỈNH SỬA / CHANGELOG:
 * - Khắc phục lỗi chức năng xóa không hoạt động: Thay thế window.confirm() bằng
 *   hộp thoại xác nhận nội bộ ConfirmDeleteDebtorModal.
 * - Thêm cấu hình Số Điện Thoại Chủ Nợ (ownerPhone) trong Tab 1 (Ngân Hàng & Chủ Nợ)
 *   với input chuyên dụng, icon điện thoại và tự động đồng bộ thời gian thực.
 * - Xóa bỏ tìm kiếm và hiển thị trường SĐT (phone) của con nợ trong danh sách dữ liệu.
 * - Hỗ trợ biến {sdt_chu_no} và {ownerPhone} trong bộ xem trước tin nhắn mẫu.
 * ============================================================================
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Save,
  Check,
  CreditCard,
  QrCode,
  Sliders,
  Cloud,
  Copy,
  AlertCircle,
  CheckCircle2,
  Lock,
  Eye,
  EyeOff,
  Sparkles,
  MessageSquare,
  ArrowLeft,
} from 'lucide-react';
import { AppSettings, Debtor, Transaction, PartySplit } from '../types';
import { POPULAR_BANKS, generateVietQrUrl } from '../utils/vietqr';
import {
  loadDebtors,
  loadTransactions,
  loadParties,
  loadSettings,
} from '../utils/storage';
import {
  DEFAULT_APP_TITLE,
  DEFAULT_APP_SUBTITLE,
  DEFAULT_LOOKUP_GUIDE,
  DEFAULT_REMINDER_TEMPLATE,
  DEFAULT_SHARE_MESSAGE,
  DEFAULT_GUEST_ANNOUNCEMENT,
  DEFAULT_SETTLED_NOTE,
  DEFAULT_LOOKUP_INSTRUCTION,
  TEMPLATE_TAG_DESCRIPTIONS,
  renderMessageTemplate,
  TemplateVariables,
} from '../utils/textTemplate';
import { ConfirmClearSampleModal } from './ConfirmClearSampleModal';
import { ConfirmResetSampleModal } from './ConfirmResetSampleModal';
import { FirestoreSettingsTab } from './FirestoreSettingsTab';

export type SettingsTabType = 'BANK' | 'CLOUD' | 'TEXTS' | 'FIRESTORE' | 'DATA';

interface SettingsViewProps {
  settings: AppSettings;
  debtors?: Debtor[];
  transactions?: Transaction[];
  parties?: PartySplit[];
  onSaveSettings: (settings: AppSettings) => void;
  onDataReload: () => void;
  onGoBack?: () => void;
  initialTab?: SettingsTabType;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  debtors = [],
  transactions = [],
  parties = [],
  onSaveSettings,
  onDataReload,
  onGoBack,
  initialTab = 'BANK',
}) => {
  const [activeTab, setActiveTab] = useState<'BANK' | 'CLOUD' | 'TEXTS'>(() => {
    if (initialTab === 'FIRESTORE' || initialTab === 'DATA' || initialTab === 'CLOUD') return 'CLOUD';
    if (initialTab === 'TEXTS') return 'TEXTS';
    return 'BANK';
  });

  // Normalize incoming settings
  const normalizeSettings = (s: Partial<AppSettings> = {}): AppSettings => ({
    ownerName: s.ownerName || 'Chủ Sổ',
    ownerPhone: s.ownerPhone || '',
    bankId: s.bankId || 'MB',
    bankName: s.bankName || 'MB Bank',
    accountNumber: s.accountNumber || '',
    accountName: s.accountName || '',
    defaultMemoPrefix: s.defaultMemoPrefix || 'TRA NO',
    ownerPassword: s.ownerPassword || 'admin123',
    appTitle: s.appTitle || DEFAULT_APP_TITLE,
    appSubtitle: s.appSubtitle || DEFAULT_APP_SUBTITLE,
    shareMessageTemplate: s.shareMessageTemplate || DEFAULT_SHARE_MESSAGE,
    lookupGuideTemplate: s.lookupGuideTemplate || s.shareMessageTemplate || DEFAULT_LOOKUP_GUIDE,
    reminderMessageTemplate: s.reminderMessageTemplate || DEFAULT_REMINDER_TEMPLATE,
    guestAnnouncement:
      s.guestAnnouncement !== undefined
        ? s.guestAnnouncement
        : DEFAULT_GUEST_ANNOUNCEMENT,
    settledThankYouNote: s.settledThankYouNote || DEFAULT_SETTLED_NOTE,
    lookupInstructionText: s.lookupInstructionText || DEFAULT_LOOKUP_INSTRUCTION,
    defaultQrMode: s.defaultQrMode || 'MANUAL_AMOUNT',
    vietQrTemplate: s.vietQrTemplate || 'compact2',
  });

  const [formData, setFormData] = useState<AppSettings>(() => normalizeSettings(settings));
  const lastSavedSettingsRef = useRef<AppSettings>(normalizeSettings(settings));

  // Determine whether user has modified any field
  const isDirty = useMemo(() => {
    const s = lastSavedSettingsRef.current;
    if (!s) return false;
    return (
      (formData.ownerName || '') !== (s.ownerName || '') ||
      (formData.ownerPhone || '') !== (s.ownerPhone || '') ||
      (formData.bankId || '') !== (s.bankId || '') ||
      (formData.accountNumber || '') !== (s.accountNumber || '') ||
      (formData.accountName || '') !== (s.accountName || '') ||
      (formData.defaultMemoPrefix || '') !== (s.defaultMemoPrefix || '') ||
      (formData.ownerPassword || '') !== (s.ownerPassword || '') ||
      (formData.vietQrTemplate || 'compact2') !== (s.vietQrTemplate || 'compact2') ||
      (formData.defaultQrMode || 'MANUAL_AMOUNT') !== (s.defaultQrMode || 'MANUAL_AMOUNT') ||
      (formData.appTitle || DEFAULT_APP_TITLE) !== (s.appTitle || DEFAULT_APP_TITLE) ||
      (formData.appSubtitle || DEFAULT_APP_SUBTITLE) !== (s.appSubtitle || DEFAULT_APP_SUBTITLE) ||
      (formData.lookupInstructionText || DEFAULT_LOOKUP_INSTRUCTION) !==
        (s.lookupInstructionText || DEFAULT_LOOKUP_INSTRUCTION) ||
      (formData.lookupGuideTemplate || '') !== (s.lookupGuideTemplate || '') ||
      (formData.shareMessageTemplate || '') !== (s.shareMessageTemplate || '') ||
      (formData.reminderMessageTemplate || '') !== (s.reminderMessageTemplate || '') ||
      (formData.guestAnnouncement || '') !== (s.guestAnnouncement || '') ||
      (formData.settledThankYouNote || DEFAULT_SETTLED_NOTE) !==
        (s.settledThankYouNote || DEFAULT_SETTLED_NOTE)
    );
  }, [formData]);

  // Sync formData whenever parent settings prop changes IF AND ONLY IF user has not typed unsaved edits
  useEffect(() => {
    if (settings && !isDirty) {
      const normalized = normalizeSettings(settings);
      setFormData(normalized);
      lastSavedSettingsRef.current = normalized;
    }
  }, [settings, isDirty]);

  // Warn user before unload if dirty
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  // UI helpers & state
  const [showPassword, setShowPassword] = useState(false);
  const [copiedAcc, setCopiedAcc] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [isConfirmClearOpen, setIsConfirmClearOpen] = useState(false);
  const [isConfirmResetOpen, setIsConfirmResetOpen] = useState(false);

  // Tab 3 (Messages & Templates) Sub-Tab state
  const [activeTemplateTab, setActiveTemplateTab] = useState<'LOOKUP' | 'REMINDER'>('LOOKUP');

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 4000);
  };

  const handleBankChange = (bankId: string) => {
    const found = POPULAR_BANKS.find((b) => b.id === bankId);
    setFormData({
      ...formData,
      bankId,
      bankName: found ? found.shortName : bankId,
    });
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    await onSaveSettings(formData);
    const normalized = normalizeSettings(formData);
    lastSavedSettingsRef.current = normalized;
    showToast('Đã lưu tất cả cài đặt và đồng bộ toàn hệ thống thành công!', 'success');
  };

  const handleDiscardChanges = () => {
    if (lastSavedSettingsRef.current) {
      setFormData({ ...lastSavedSettingsRef.current });
      showToast('Đã khôi phục cài đặt về giá trị đã lưu gần nhất!', 'success');
    }
  };

  const handleSafeGoBack = () => {
    if (isDirty) {
      if (
        !window.confirm(
          'Bạn đang có thay đổi chưa lưu. Bạn có chắc muốn rời đi mà không lưu không?'
        )
      ) {
        return;
      }
    }
    onGoBack?.();
  };

  // Synchronized data reload handler that also refreshes settings form data
  const handleDataReloadAndSync = () => {
    onDataReload();
    const fresh = loadSettings();
    if (fresh) {
      const norm = normalizeSettings(fresh);
      setFormData(norm);
      lastSavedSettingsRef.current = norm;
    }
  };

  // Export JSON backup with full data snapshot
  const handleExportData = () => {
    const activeDebtors = debtors && debtors.length > 0 ? debtors : loadDebtors();
    const activeTransactions = transactions && transactions.length > 0 ? transactions : loadTransactions();
    const activeParties = parties && parties.length > 0 ? parties : loadParties();

    const fullBackup = {
      appName: 'Sổ Ghi Nợ & Chia Tiền',
      version: 1,
      exportedAt: new Date().toISOString(),
      stats: {
        debtorsCount: activeDebtors.length,
        transactionsCount: activeTransactions.length,
        partiesCount: activeParties.length,
      },
      debtors: activeDebtors,
      transactions: activeTransactions,
      parties: activeParties,
      settings: formData,
    };
    const blob = new Blob([JSON.stringify(fullBackup, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `so-no-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Đã xuất tệp sao lưu (${activeDebtors.length} người nợ, ${activeTransactions.length} giao dịch)!`, 'success');
  };

  // Clear sample data handler
  const handleClearSampleData = () => {
    setIsConfirmClearOpen(true);
  };

  // Reset sample data handler
  const handleResetDefaults = () => {
    setIsConfirmResetOpen(true);
  };

  // Copy Account number helper
  const handleCopyAccount = () => {
    if (formData.accountNumber) {
      navigator.clipboard.writeText(formData.accountNumber);
      setCopiedAcc(true);
      setTimeout(() => setCopiedAcc(false), 2000);
      showToast('Đã sao chép số tài khoản!', 'success');
    }
  };

  // Tab 3 tag insertion helper
  const handleInsertTag = (tag: string, templateType: 'LOOKUP' | 'REMINDER') => {
    if (templateType === 'LOOKUP') {
      const current = formData.lookupGuideTemplate || formData.shareMessageTemplate || DEFAULT_LOOKUP_GUIDE;
      setFormData({
        ...formData,
        lookupGuideTemplate: current + ` ${tag} `,
        shareMessageTemplate: current + ` ${tag} `,
      });
    } else {
      const current = formData.reminderMessageTemplate || DEFAULT_REMINDER_TEMPLATE;
      setFormData({
        ...formData,
        reminderMessageTemplate: current + ` ${tag} `,
      });
    }
  };

  // Realistic sample previews for texting
  const sampleDebtorPreview: TemplateVariables = {
    name: 'Nguyễn Văn Nam',
    pin: 'nam123',
    pass: 'nam123',
    balance: '550.000 đ',
    url: `${window.location.origin}${window.location.pathname}#guest`,
    owner: formData.ownerName || 'Chủ Sổ',
    ownerPhone: formData.ownerPhone || '0988888888',
    bank: formData.bankName || 'MB Bank',
    account: formData.accountNumber || '0987654321',
    accountName: formData.accountName || 'NGUYEN VAN B',
    ten_nguoi_no: 'Nguyễn Văn Nam',
    so_du: '550.000 đ',
    so_du_so: '550000',
    link_tra_cuu: `${window.location.origin}${window.location.pathname}#guest`,
    ten_chu_so: formData.ownerName || 'Chủ Sổ',
    sdt_chu_no: formData.ownerPhone || '0988888888',
    ten_ngan_hang: formData.bankName || 'MB Bank',
    stk: formData.accountNumber || '0987654321',
    ten_chu_tk: formData.accountName || 'NGUYEN VAN B',
  };

  const liveLookupPreview = renderMessageTemplate(
    formData.lookupGuideTemplate || formData.shareMessageTemplate || DEFAULT_LOOKUP_GUIDE,
    sampleDebtorPreview
  );

  const liveReminderPreview = renderMessageTemplate(
    formData.reminderMessageTemplate || DEFAULT_REMINDER_TEMPLATE,
    sampleDebtorPreview
  );

  // Live generated VietQR URL for Tab 1 preview
  const liveVietQrUrl = useMemo(() => {
    if (!formData.bankId || !formData.accountNumber) return '';
    const memoSuffix = (formData.defaultMemoPrefix ?? 'TRA NO').trim();
    const memoText = memoSuffix ? `NGUYEN VAN A ${memoSuffix}` : 'NGUYEN VAN A';
    return generateVietQrUrl({
      bankId: formData.bankId,
      accountNumber: formData.accountNumber,
      accountName: formData.accountName,
      memo: memoText,
      template: formData.vietQrTemplate || 'compact2',
    });
  }, [formData.bankId, formData.accountNumber, formData.accountName, formData.defaultMemoPrefix, formData.vietQrTemplate]);

  return (
    <div className="w-full max-w-4xl mx-auto space-y-4 pb-16 animate-in fade-in duration-150">
      {/* Page Header */}
      <div className="bg-white rounded-3xl p-4 sm:p-6 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {onGoBack && (
            <button
              type="button"
              onClick={handleSafeGoBack}
              className="p-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 transition-colors flex items-center justify-center shrink-0 cursor-pointer shadow-xs"
              title="Quay lại giao diện sổ nợ chính"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 text-emerald-700 flex items-center justify-center shrink-0">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
              Cài Đặt Hệ Thống &amp; Dữ Liệu
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Tùy biến VietQR ngân hàng, đồng bộ Cloud Firestore và các mẫu tin nhắn hệ thống
            </p>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          {isDirty ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-50 text-amber-800 border border-amber-300 animate-pulse">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span>Có thay đổi chưa lưu</span>
            </span>
          ) : (
            <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium text-slate-500 bg-slate-50 border border-slate-200">
              <Check className="w-3.5 h-3.5 text-emerald-600" />
              <span>Đã lưu mới nhất</span>
            </span>
          )}

          {isDirty && (
            <button
              type="button"
              onClick={handleDiscardChanges}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              title="Hủy các thay đổi vừa gõ và khôi phục về trạng thái đã lưu ban đầu"
            >
              Khôi phục
            </button>
          )}

          <button
            type="button"
            onClick={() => handleSave()}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>Lưu Cài Đặt</span>
          </button>
        </div>
      </div>

      {/* Toast alert banner */}
      {message && (
        <div
          className={`p-3.5 rounded-2xl text-xs font-bold flex items-center justify-between shadow-xs transition-all ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
              : 'bg-rose-50 text-rose-800 border border-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {message.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{message.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setMessage(null)}
            className="text-slate-400 hover:text-slate-600 text-xs px-2 py-0.5 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* NAVIGATION TABS (1, 2, 3) */}
      <div className="grid grid-cols-3 gap-1.5 sm:gap-2.5 bg-slate-100/90 p-1.5 rounded-2xl border border-slate-200/80">
        <button
          type="button"
          onClick={() => setActiveTab('BANK')}
          className={`px-2 sm:px-3 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 sm:gap-2 transition-all cursor-pointer outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
            activeTab === 'BANK'
              ? 'bg-white text-emerald-700 shadow-xs border border-slate-200/80 font-extrabold ring-1 ring-emerald-500/20'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <CreditCard className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="truncate sm:inline hidden">1. Ngân Hàng &amp; VietQR</span>
          <span className="truncate sm:hidden inline">1. VietQR</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('CLOUD')}
          className={`px-2 sm:px-3 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 sm:gap-2 transition-all cursor-pointer outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
            activeTab === 'CLOUD'
              ? 'bg-white text-blue-700 shadow-xs border border-slate-200/80 font-extrabold ring-1 ring-blue-500/20'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <Cloud className="w-4 h-4 text-blue-600 shrink-0" />
          <span className="truncate sm:inline hidden">2. Đám Mây &amp; Sao Lưu</span>
          <span className="truncate sm:hidden inline">2. Đám Mây</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('TEXTS')}
          className={`px-2 sm:px-3 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 sm:gap-2 transition-all cursor-pointer outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 ${
            activeTab === 'TEXTS'
              ? 'bg-white text-purple-700 shadow-xs border border-slate-200/80 font-extrabold ring-1 ring-purple-500/20'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <MessageSquare className="w-4 h-4 text-purple-600 shrink-0" />
          <span className="truncate sm:inline hidden">3. Lời Nhắn &amp; Mẫu Tin</span>
          <span className="truncate sm:hidden inline">3. Lời Nhắn</span>
        </button>
      </div>

      {/* TAB CONTENT CONTAINER */}
      <div className="bg-white rounded-3xl p-5 sm:p-7 border border-slate-200 shadow-xs">
        {/* ===================== TAB 1: BANK & VIETQR ===================== */}
        {activeTab === 'BANK' && (
          <form onSubmit={handleSave} className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900 flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-emerald-600" />
                  <span>1. Tài Khoản Ngân Hàng Nhận Tiền &amp; VietQR</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Thiết lập tài khoản ngân hàng để tạo mã VietQR chuẩn NAPAS 247 khi khách quét mã trả nợ.
                </p>
              </div>

              {/* Status Readiness Badge */}
              <div className="flex items-center gap-1.5">
                {formData.accountNumber && formData.accountName && formData.bankId ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>VietQR Đã Sẵn Sàng</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                    <span>Cần Nhập Đủ STK &amp; Tên</span>
                  </span>
                )}
              </div>
            </div>

            {/* Layout: Form Inputs on Left, Live VietQR Card on Right */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Form Inputs (7 cols on lg) */}
              <div className="lg:col-span-7 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Tên Chủ Nợ:
                    </label>
                    <input
                      type="text"
                      value={formData.ownerName}
                      onChange={(e) => setFormData({ ...formData, ownerName: e.target.value })}
                      placeholder="Ví dụ: Anh Dũng, Cửa Hàng A"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-emerald-500 font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Số Điện Thoại Chủ Nợ:
                    </label>
                      <input
                        type="tel"
                        value={formData.ownerPhone || ''}
                        onChange={(e) => setFormData({ ...formData, ownerPhone: e.target.value })}
                        placeholder="Ví dụ: 0988888888"
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-emerald-500 font-medium"
                      />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Chọn Ngân Hàng:
                    </label>
                    <select
                      value={formData.bankId}
                      onChange={(e) => handleBankChange(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-emerald-500 font-medium cursor-pointer"
                    >
                      <option value="">-- Chọn ngân hàng --</option>
                      {POPULAR_BANKS.map((bank) => (
                        <option key={bank.id} value={bank.id}>
                          {bank.shortName} ({bank.name})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Số Tài Khoản Ngân Hàng (STK):
                    </label>
                    <input
                      type="text"
                      value={formData.accountNumber}
                      onChange={(e) =>
                        setFormData({ ...formData, accountNumber: e.target.value.replace(/\s+/g, '') })
                      }
                      placeholder="Ví dụ: 0987654321"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-emerald-500 font-mono font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Tên Chủ Tài Khoản (In hoa không dấu):
                    </label>
                    <input
                      type="text"
                      value={formData.accountName || ''}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          accountName: e.target.value
                            .normalize('NFD')
                            .replace(/[\u0300-\u036f]/g, '')
                            .toUpperCase(),
                        })
                      }
                      placeholder="NGUYEN VAN A"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-emerald-500 font-mono font-bold uppercase"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">
                      Tự động viết hoa không dấu chuẩn ngân hàng.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Ghi Chú Kèm Theo Khi Quét QR (Sau Tên Khách):
                    </label>
                    <input
                      type="text"
                      value={formData.defaultMemoPrefix ?? ''}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          defaultMemoPrefix: e.target.value.toUpperCase(),
                        })
                      }
                      placeholder="TRA NO"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-emerald-500 font-mono font-bold"
                    />
                    {/* Quick suggestion chips */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      <span className="text-[11px] text-slate-400 font-medium">Gợi ý nhanh:</span>
                      {['TRA NO', 'THANH TOAN', 'TIEN HANG', 'TIEN NHA'].map((chip) => (
                        <button
                          key={chip}
                          type="button"
                          onClick={() => setFormData({ ...formData, defaultMemoPrefix: chip })}
                          className={`px-2 py-0.5 rounded-lg text-[11px] font-mono font-semibold transition-all cursor-pointer ${
                            formData.defaultMemoPrefix === chip
                              ? 'bg-emerald-600 text-white shadow-xs'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {chip}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, defaultMemoPrefix: '' })}
                        className={`px-2 py-0.5 rounded-lg text-[11px] font-medium transition-all cursor-pointer ${
                          formData.defaultMemoPrefix === ''
                            ? 'bg-slate-800 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        }`}
                      >
                        Để trống
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-2">
                      Nội dung trên App Ngân hàng:{' '}
                      <code className="text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                        [TÊN KHÁCH]{formData.defaultMemoPrefix ? ` ${formData.defaultMemoPrefix}` : ''}
                      </code>
                      <span className="text-slate-400 ml-1.5">
                        (Ví dụ: NGUYEN VAN A{formData.defaultMemoPrefix ? ` ${formData.defaultMemoPrefix}` : ''})
                      </span>
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                      <span>Mật Khẩu Đăng Nhập Chủ Nợ:</span>
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="text-slate-400 hover:text-slate-600 text-[11px] flex items-center gap-1 font-normal cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3 text-emerald-600" />}
                        <span>{showPassword ? 'Ẩn' : 'Hiện'}</span>
                      </button>
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={formData.ownerPassword || ''}
                        onChange={(e) =>
                          setFormData({ ...formData, ownerPassword: e.target.value.trim() })
                        }
                        placeholder="Nhập mật khẩu chủ nợ..."
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-emerald-500 font-mono font-bold pr-10"
                      />
                      <div className="absolute right-3 top-2.5 text-slate-400">
                        <Lock className="w-4 h-4" />
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Dùng để chủ nợ đăng nhập và xác nhận các thao tác quan trọng.
                    </p>
                  </div>
                </div>

                {/* Frame mode picker */}
                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                  <label className="block text-xs font-bold text-slate-800">
                    Mẫu Khung Hiển Thị VietQR:
                  </label>
                  <select
                    value={formData.vietQrTemplate || 'compact2'}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        vietQrTemplate: e.target.value as 'compact2' | 'compact' | 'qr_only',
                      })
                    }
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 cursor-pointer font-medium"
                  >
                    <option value="compact2">Khung nhỏ gọn hiện đại (compact2 - Khuyên dùng)</option>
                    <option value="compact">Khung chuẩn NAPAS 247 truyền thống (compact)</option>
                    <option value="qr_only">Chỉ mã QR thuần không viền (qr_only)</option>
                  </select>
                </div>
              </div>

              {/* Live VietQR Preview Card (5 cols on lg) */}
              <div className="lg:col-span-5 bg-gradient-to-b from-slate-50 to-emerald-50/40 rounded-3xl p-5 border border-slate-200/90 shadow-2xs space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200/60">
                  <div className="flex items-center gap-2">
                    <QrCode className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                      Xem Trước Mã VietQR
                    </span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold">
                    Trực Tiếp
                  </span>
                </div>

                {liveVietQrUrl ? (
                  <div className="space-y-3">
                    <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-center">
                      <img
                        src={liveVietQrUrl}
                        alt="VietQR Nhận Tiền"
                        className="max-h-60 max-w-full object-contain rounded-lg"
                        loading="lazy"
                      />
                    </div>

                    <div className="bg-white p-3.5 rounded-2xl border border-slate-200 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Ngân Hàng:</span>
                        <span className="font-bold text-slate-900">{formData.bankName}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Số Tài Khoản:</span>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-emerald-700">
                            {formData.accountNumber}
                          </span>
                          <button
                            type="button"
                            onClick={handleCopyAccount}
                            className="p-1 text-slate-400 hover:text-emerald-700 rounded transition-colors cursor-pointer"
                            title="Sao chép STK"
                          >
                            {copiedAcc ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Chủ Tài Khoản:</span>
                        <span className="font-mono font-bold text-slate-900">
                          {formData.accountName || '(Chưa nhập)'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                        <span className="text-slate-500">Mẫu Nội Dung:</span>
                        <span className="font-mono text-emerald-700 font-bold text-[11px]">
                          [TÊN KHÁCH]{formData.defaultMemoPrefix ? ` ${formData.defaultMemoPrefix}` : ''}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-8 text-center bg-white rounded-2xl border border-dashed border-slate-300 space-y-2">
                    <QrCode className="w-10 h-10 text-slate-300 mx-auto" />
                    <p className="text-xs text-slate-500 font-medium">
                      Vui lòng nhập <strong>Số tài khoản</strong> và <strong>Tên chủ tài khoản</strong> để kích hoạt mã VietQR.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="pt-3 flex justify-end">
              <button
                type="submit"
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>Lưu Thay Đổi Ngân Hàng</span>
              </button>
            </div>
          </form>
        )}

        {/* ===================== TAB 2: ĐỒNG BỘ ĐÁM MÂY & SAO LƯU ===================== */}
        {activeTab === 'CLOUD' && (
          <div className="space-y-6">
            {/* Master Cloud Firestore & Data Sync Card */}
            <FirestoreSettingsTab
              debtors={debtors}
              transactions={transactions}
              settings={formData}
              parties={parties}
              onDataReload={handleDataReloadAndSync}
              showToast={showToast}
              onClearSampleData={handleClearSampleData}
              onResetSampleData={handleResetDefaults}
              onExportJson={handleExportData}
            />
          </div>
        )}

        {/* ===================== TAB 3: TEXTS & LOOKUP GUIDELINES ===================== */}
        {activeTab === 'TEXTS' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-purple-600" />
                  <span>3. Tùy Biến Lời Nhắn &amp; Mẫu Tin Nhắn</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tùy chỉnh tiêu đề ứng dụng, hướng dẫn tra cứu 3 bước, thông báo ghim và các mẫu tin nhắn nhắc nợ lịch sự.
                </p>
              </div>

              {/* Status Readiness Badge */}
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-800 border border-purple-300">
                  <CheckCircle2 className="w-3.5 h-3.5 text-purple-600" />
                  <span>Mẫu Tin &amp; Giao Diện Sẵn Sàng</span>
                </span>
              </div>
            </div>

            <div className="space-y-5">
              {/* App Title & Slogan */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-purple-600" />
                  <span>Tên Ứng Dụng &amp; Khẩu Hiệu (Header):</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Tiêu Đề Ứng Dụng:
                    </label>
                    <input
                      type="text"
                      value={formData.appTitle || ''}
                      onChange={(e) => setFormData({ ...formData, appTitle: e.target.value })}
                      placeholder={DEFAULT_APP_TITLE}
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:ring-2 focus:ring-purple-500 font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Mô Tả Phụ (Slogan):
                    </label>
                    <input
                      type="text"
                      value={formData.appSubtitle || ''}
                      onChange={(e) => setFormData({ ...formData, appSubtitle: e.target.value })}
                      placeholder={DEFAULT_APP_SUBTITLE}
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </div>
              </div>

              {/* Lookup instructions 3-step */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Hướng Dẫn 3 Bước Ở Trang Đăng Nhập Của Khách:
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setFormData({
                        ...formData,
                        lookupInstructionText: DEFAULT_LOOKUP_INSTRUCTION,
                      })
                    }
                    className="text-slate-400 hover:text-purple-600 text-[11px] font-semibold cursor-pointer"
                  >
                    Khôi phục mặc định
                  </button>
                </div>
                <textarea
                  rows={2}
                  value={formData.lookupInstructionText || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, lookupInstructionText: e.target.value })
                  }
                  placeholder={DEFAULT_LOOKUP_INSTRUCTION}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-purple-500 text-slate-800 font-medium leading-relaxed"
                />
              </div>

              {/* Message Templates Container with Sub-Tabs */}
              <div className="p-4 sm:p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-200/60">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                      <MessageSquare className="w-4 h-4 text-purple-600" />
                      <span>Mẫu Tin Nhắn Tự Động Gửi Khách:</span>
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Chọn mẫu tin để chỉnh sửa nội dung và chèn các thẻ biến tự động:
                    </p>
                  </div>

                  {/* Sub-Tabs: Mẫu gửi Pass vs Mẫu nhắc nợ */}
                  <div className="flex items-center gap-1.5 bg-slate-200/80 p-1 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setActiveTemplateTab('LOOKUP')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        activeTemplateTab === 'LOOKUP'
                          ? 'bg-white text-purple-700 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Mẫu Gửi Pass &amp; Link
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTemplateTab('REMINDER')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        activeTemplateTab === 'REMINDER'
                          ? 'bg-white text-purple-700 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Mẫu Nhắc Nợ Lịch Sự
                    </button>
                  </div>
                </div>

                {/* Clickable Variable Tags Palette */}
                <div className="p-3 bg-white rounded-xl border border-slate-200/80 space-y-1.5">
                  <div className="text-[10px] uppercase font-bold text-slate-400">
                    Bấm để chèn nhanh thông tin vào mẫu tin:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {TEMPLATE_TAG_DESCRIPTIONS.map((tag) => (
                      <button
                        key={tag.tag}
                        type="button"
                        onClick={() => handleInsertTag(tag.tag, activeTemplateTab)}
                        className="px-2 py-1 bg-purple-50 hover:bg-purple-100 active:bg-purple-200 text-purple-700 rounded-lg text-xs font-mono font-bold transition-colors cursor-pointer border border-purple-200"
                        title={`${tag.label} (Ví dụ: ${tag.example})`}
                      >
                        + {tag.tag}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Template Editor based on activeTemplateTab */}
                {activeTemplateTab === 'LOOKUP' ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800">
                        Nội dung Mẫu Tin Nhắn Gửi Pass Tra Cứu:
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setFormData({
                            ...formData,
                            lookupGuideTemplate: DEFAULT_LOOKUP_GUIDE,
                            shareMessageTemplate: DEFAULT_LOOKUP_GUIDE,
                          })
                        }
                        className="text-slate-400 hover:text-purple-600 text-[11px] font-semibold cursor-pointer"
                      >
                        Khôi phục mẫu chuẩn
                      </button>
                    </div>

                    <textarea
                      rows={6}
                      value={formData.lookupGuideTemplate || formData.shareMessageTemplate || ''}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          lookupGuideTemplate: e.target.value,
                          shareMessageTemplate: e.target.value,
                        })
                      }
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-purple-500 text-slate-800 leading-relaxed"
                    />

                    {/* Live realistic preview */}
                    <div className="p-3.5 bg-white rounded-xl border border-slate-200 space-y-1.5">
                      <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center justify-between">
                        <span>Xem trước tin nhắn thực tế gửi cho khách:</span>
                        <span className="text-purple-600 font-semibold">Tự động điền dữ liệu thật</span>
                      </div>
                      <div className="text-xs text-slate-700 whitespace-pre-line leading-relaxed font-sans bg-slate-50 p-3 rounded-lg border border-slate-100">
                        {liveLookupPreview}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800">
                        Nội dung Mẫu Tin Nhắc Nợ Định Kỳ:
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setFormData({
                            ...formData,
                            reminderMessageTemplate: DEFAULT_REMINDER_TEMPLATE,
                          })
                        }
                        className="text-slate-400 hover:text-purple-600 text-[11px] font-semibold cursor-pointer"
                      >
                        Khôi phục mẫu chuẩn
                      </button>
                    </div>

                    <textarea
                      rows={7}
                      value={formData.reminderMessageTemplate || ''}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          reminderMessageTemplate: e.target.value,
                        })
                      }
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-purple-500 text-slate-800 leading-relaxed"
                    />

                    {/* Live realistic preview */}
                    <div className="p-3.5 bg-white rounded-xl border border-slate-200 space-y-1.5">
                      <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center justify-between">
                        <span>Xem trước tin nhắn nhắc nợ thực tế:</span>
                        <span className="text-purple-600 font-semibold">Tự động điền STK &amp; số tiền</span>
                      </div>
                      <div className="text-xs text-slate-700 whitespace-pre-line leading-relaxed font-sans bg-slate-50 p-3 rounded-lg border border-slate-100">
                        {liveReminderPreview}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Guest Announcement & Settled Note */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                  <label className="block text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Lời Nhắn Ghim Đầu Trang Sao Kê Của Khách:
                  </label>
                  <textarea
                    rows={2}
                    value={formData.guestAnnouncement || ''}
                    onChange={(e) =>
                      setFormData({ ...formData, guestAnnouncement: e.target.value })
                    }
                    placeholder="Để trống nếu không muốn hiện lời nhắn ghim..."
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-purple-500 text-slate-800"
                  />
                </div>

                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                  <label className="block text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Lời Cảm Ơn Khi Đã Thanh Toán Hết (0đ):
                  </label>
                  <textarea
                    rows={2}
                    value={formData.settledThankYouNote || ''}
                    onChange={(e) =>
                      setFormData({ ...formData, settledThankYouNote: e.target.value })
                    }
                    placeholder={DEFAULT_SETTLED_NOTE}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-purple-500 text-slate-800"
                  />
                </div>
              </div>
            </div>

            <div className="pt-3 flex justify-end">
              <button
                type="button"
                onClick={() => handleSave()}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>Lưu Tùy Biến Lời Nhắn</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Admin Password Verification Modal to Clear Sample Data */}
      <ConfirmClearSampleModal
        isOpen={isConfirmClearOpen}
        onClose={() => setIsConfirmClearOpen(false)}
        onSuccess={() => {
          handleDataReloadAndSync();
          showToast('Đã xóa toàn bộ dữ liệu mẫu! Giờ bạn có thể bắt đầu thêm người nợ thật của mình.', 'success');
        }}
      />

      {/* Admin Password Verification Modal to Reset/Restore Sample Data */}
      <ConfirmResetSampleModal
        isOpen={isConfirmResetOpen}
        onClose={() => setIsConfirmResetOpen(false)}
        onSuccess={() => {
          handleDataReloadAndSync();
          showToast('Đã nạp lại 4 người nợ và lịch sử giao dịch mẫu thành công!', 'success');
        }}
      />

      {/* Floating Quick Save Action Bar when dirty */}
      {isDirty && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 max-w-lg w-[calc(100%-2rem)] bg-slate-900/95 text-white backdrop-blur-md px-4 py-3 rounded-2xl shadow-2xl border border-slate-700/80 flex items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
            <span className="text-xs font-semibold text-slate-200 truncate">
              Có thay đổi chưa lưu
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleDiscardChanges}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            >
              Khôi phục
            </button>
            <button
              type="button"
              onClick={() => handleSave()}
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Lưu Ngay</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
