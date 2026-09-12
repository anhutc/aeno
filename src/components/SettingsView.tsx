import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Save,
  Check,
  CreditCard,
  Cloud,
  Copy,
  AlertCircle,
  CheckCircle2,
  Lock,
  Eye,
  EyeOff,
  MessageSquare,
  ArrowLeft,
  Download,
  Upload,
  FileJson,
  RotateCcw,
  Trash2,
  Phone,
  Building2,
  User,
  ShieldCheck,
  Sparkles,
  QrCode,
  Info,
} from 'lucide-react';
import { AppSettings, Debtor, Transaction, PartySplit } from '../types';
import { POPULAR_BANKS, generateVietQrUrl } from '../utils/vietqr';
import {
  loadDebtors,
  loadTransactions,
  loadParties,
  loadSettings,
  saveDebtors,
  saveTransactions,
  saveParties,
  saveSettings,
} from '../utils/storage';
import { apiUploadJsonToFirestore } from '../utils/api';
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

export type SettingsTabType = 'BANK' | 'SECURITY' | 'TEXTS' | 'CLOUD';

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
  const [activeTab, setActiveTab] = useState<SettingsTabType>(() => {
    if (initialTab === 'CLOUD') return 'CLOUD';
    if (initialTab === 'SECURITY') return 'SECURITY';
    if (initialTab === 'TEXTS') return 'TEXTS';
    return 'BANK';
  });

  // Normalize settings with strict fallbacks
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

  // Dual state tracking to ensure accurate isDirty calculation without ref desync
  const [savedSnapshot, setSavedSnapshot] = useState<AppSettings>(() => normalizeSettings(settings));
  const [formData, setFormData] = useState<AppSettings>(() => normalizeSettings(settings));
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);

  // Derive dirty state
  const isDirty = useMemo(() => {
    return (
      (formData.ownerName || '') !== (savedSnapshot.ownerName || '') ||
      (formData.ownerPhone || '') !== (savedSnapshot.ownerPhone || '') ||
      (formData.bankId || '') !== (savedSnapshot.bankId || '') ||
      (formData.accountNumber || '') !== (savedSnapshot.accountNumber || '') ||
      (formData.accountName || '') !== (savedSnapshot.accountName || '') ||
      (formData.defaultMemoPrefix || '') !== (savedSnapshot.defaultMemoPrefix || '') ||
      (formData.ownerPassword || '') !== (savedSnapshot.ownerPassword || '') ||
      (formData.vietQrTemplate || 'compact2') !== (savedSnapshot.vietQrTemplate || 'compact2') ||
      (formData.defaultQrMode || 'MANUAL_AMOUNT') !== (savedSnapshot.defaultQrMode || 'MANUAL_AMOUNT') ||
      (formData.appTitle || DEFAULT_APP_TITLE) !== (savedSnapshot.appTitle || DEFAULT_APP_TITLE) ||
      (formData.appSubtitle || DEFAULT_APP_SUBTITLE) !== (savedSnapshot.appSubtitle || DEFAULT_APP_SUBTITLE) ||
      (formData.lookupInstructionText || DEFAULT_LOOKUP_INSTRUCTION) !==
        (savedSnapshot.lookupInstructionText || DEFAULT_LOOKUP_INSTRUCTION) ||
      (formData.lookupGuideTemplate || '') !== (savedSnapshot.lookupGuideTemplate || '') ||
      (formData.shareMessageTemplate || '') !== (savedSnapshot.shareMessageTemplate || '') ||
      (formData.reminderMessageTemplate || '') !== (savedSnapshot.reminderMessageTemplate || '') ||
      (formData.guestAnnouncement || '') !== (savedSnapshot.guestAnnouncement || '') ||
      (formData.settledThankYouNote || DEFAULT_SETTLED_NOTE) !==
        (savedSnapshot.settledThankYouNote || DEFAULT_SETTLED_NOTE)
    );
  }, [formData, savedSnapshot]);

  // Sync when prop changes if user hasn't edited anything
  useEffect(() => {
    if (settings && !isDirty) {
      const normalized = normalizeSettings(settings);
      setFormData(normalized);
      setSavedSnapshot(normalized);
    }
  }, [settings, isDirty]);

  // Warn before unload if there are unsaved changes
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

  // UI state
  const [showPassword, setShowPassword] = useState(false);
  const [copiedAcc, setCopiedAcc] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [isConfirmClearOpen, setIsConfirmClearOpen] = useState(false);
  const [isConfirmResetOpen, setIsConfirmResetOpen] = useState(false);
  const [activeTemplateTab, setActiveTemplateTab] = useState<'LOOKUP' | 'REMINDER'>('LOOKUP');

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 3500);
  };

  const handleBankChange = (bankId: string) => {
    const found = POPULAR_BANKS.find((b) => b.id === bankId);
    setFormData((prev) => ({
      ...prev,
      bankId,
      bankName: found ? found.shortName : bankId,
    }));
  };

  // Centralized Save Handler: Saves to parent, syncs snapshot, and clears dirty status immediately
  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    setIsSaving(true);
    try {
      await onSaveSettings(formData);
      const normalized = normalizeSettings(formData);
      setSavedSnapshot(normalized);
      setFormData(normalized);
      showToast('Đã lưu cài đặt thành công!', 'success');
    } catch {
      showToast('Lỗi khi lưu cài đặt! Vui lòng thử lại.', 'error');
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  };

  // Discard changes
  const handleDiscardChanges = () => {
    setFormData({ ...savedSnapshot });
    showToast('Đã khôi phục cài đặt về giá trị đã lưu!', 'success');
  };

  const handleSafeGoBack = () => {
    if (isDirty) {
      if (!window.confirm('Bạn đang có thay đổi chưa lưu. Bạn có chắc muốn rời đi không?')) {
        return;
      }
    }
    onGoBack?.();
  };

  const handleDataReloadAndSync = () => {
    onDataReload();
    const fresh = loadSettings();
    if (fresh) {
      const norm = normalizeSettings(fresh);
      setFormData(norm);
      setSavedSnapshot(norm);
    }
  };

  // Export JSON backup
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

  const handleImportJsonFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        let rawJson = JSON.parse(event.target?.result as string);
        if (rawJson && rawJson.data && (Array.isArray(rawJson.data.debtors) || Array.isArray(rawJson.data))) {
          rawJson = rawJson.data;
        }

        let debtorsFound: Debtor[] = [];
        let transactionsFound: Transaction[] = [];
        let partiesFound: PartySplit[] = [];

        if (Array.isArray(rawJson)) {
          if (rawJson.length > 0 && rawJson[0].debtorId !== undefined && rawJson[0].amount !== undefined) {
            transactionsFound = rawJson;
          } else {
            debtorsFound = rawJson;
          }
        } else if (rawJson && typeof rawJson === 'object') {
          if (Array.isArray(rawJson.debtors)) debtorsFound = rawJson.debtors;
          if (Array.isArray(rawJson.transactions)) transactionsFound = rawJson.transactions;
          if (Array.isArray(rawJson.parties)) partiesFound = rawJson.parties;
          if (rawJson.settings && typeof rawJson.settings === 'object') {
            const mergedSettings = { ...formData, ...rawJson.settings };
            setFormData(mergedSettings);
            saveSettings(mergedSettings);
            onSaveSettings(mergedSettings);
          }
        }

        if (debtorsFound.length === 0 && transactionsFound.length === 0) {
          showToast('Tệp JSON không chứa dữ liệu sổ nợ hợp lệ!', 'error');
          return;
        }

        if (debtorsFound.length > 0) saveDebtors(debtorsFound);
        if (transactionsFound.length > 0) saveTransactions(transactionsFound);
        if (partiesFound.length > 0) saveParties(partiesFound);

        // Also push to cloud if online
        try {
          await apiUploadJsonToFirestore(rawJson, 'replace');
        } catch {
          // ignore cloud error if offline
        }

        handleDataReloadAndSync();
        showToast(
          `Đã khôi phục thành công ${debtorsFound.length} người nợ và ${transactionsFound.length} giao dịch!`,
          'success'
        );
      } catch {
        showToast('Tệp JSON bị lỗi hoặc sai định dạng!', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleCopyAccount = () => {
    if (formData.accountNumber) {
      navigator.clipboard.writeText(formData.accountNumber);
      setCopiedAcc(true);
      setTimeout(() => setCopiedAcc(false), 2000);
      showToast('Đã sao chép số tài khoản!', 'success');
    }
  };

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

  // Live realistic preview for messaging templates
  const sampleDebtorPreview: TemplateVariables = {
    name: 'Nguyễn Văn Nam',
    pin: 'nam123',
    pass: 'nam123',
    balance: '550.000 đ',
    url: `${window.location.origin}${window.location.pathname}`,
    owner: formData.ownerName || 'Chủ Sổ',
    ownerPhone: formData.ownerPhone || '0988888888',
    bank: formData.bankName || 'MB Bank',
    account: formData.accountNumber || '0987654321',
    accountName: formData.accountName || 'NGUYEN VAN B',
    ten_nguoi_no: 'Nguyễn Văn Nam',
    so_du: '550.000 đ',
    so_du_so: '550000',
    link_tra_cuu: `${window.location.origin}${window.location.pathname}`,
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

  // Live VietQR URL preview
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
    <div className="w-full max-w-5xl mx-auto space-y-4 pb-16 animate-in fade-in duration-150">
      {/* 1. SINGLE HEADER BAR WITH SAVE ACTION */}
      <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/90 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {onGoBack && (
            <button
              type="button"
              onClick={handleSafeGoBack}
              className="p-2 rounded-2xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 transition-colors flex items-center justify-center shrink-0 cursor-pointer shadow-2xs"
              title="Quay lại giao diện chính"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div>
            <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <span>Cài Đặt Hệ Thống</span>
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Quản lý tài khoản nhận tiền, bảo mật, sao lưu và mẫu tin nhắn
            </p>
          </div>
        </div>

        {/* Action button cluster */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          {isDirty ? (
            <>
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 text-amber-800 border border-amber-200 text-xs font-bold animate-in fade-in">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                <span>Chưa lưu</span>
              </div>
              <button
                type="button"
                onClick={handleDiscardChanges}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition-colors cursor-pointer"
                title="Hủy các thay đổi và khôi phục cài đặt trước"
              >
                Khôi phục
              </button>
              <button
                type="button"
                onClick={() => handleSave()}
                disabled={isSaving}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSaving ? 'Đang lưu...' : 'Lưu Thay Đổi'}</span>
              </button>
            </>
          ) : (
            <>
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-medium">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Đã lưu mới nhất</span>
              </div>
              <button
                type="button"
                onClick={() => handleSave()}
                disabled={isSaving}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5 text-slate-500" />
                <span>Lưu Lại</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Toast Alert Feedback */}
      {message && (
        <div
          className={`p-3.5 rounded-2xl text-xs font-semibold flex items-center gap-2.5 transition-all shadow-xs border animate-in fade-in ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* 2. NAVIGATION TABS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <button
          type="button"
          onClick={() => setActiveTab('BANK')}
          className={`py-2.5 px-3.5 rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer border ${
            activeTab === 'BANK'
              ? 'bg-white text-emerald-700 border-emerald-300 shadow-xs'
              : 'bg-slate-50 hover:bg-white text-slate-600 border-slate-200/80'
          }`}
        >
          <CreditCard className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Ngân Hàng &amp; VietQR</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('SECURITY')}
          className={`py-2.5 px-3.5 rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer border ${
            activeTab === 'SECURITY'
              ? 'bg-white text-emerald-700 border-emerald-300 shadow-xs'
              : 'bg-slate-50 hover:bg-white text-slate-600 border-slate-200/80'
          }`}
        >
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Bảo Mật &amp; Dữ Liệu</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('TEXTS')}
          className={`py-2.5 px-3.5 rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer border ${
            activeTab === 'TEXTS'
              ? 'bg-white text-emerald-700 border-emerald-300 shadow-xs'
              : 'bg-slate-50 hover:bg-white text-slate-600 border-slate-200/80'
          }`}
        >
          <MessageSquare className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Mẫu Tin &amp; Lời Nhắn</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('CLOUD')}
          className={`py-2.5 px-3.5 rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer border ${
            activeTab === 'CLOUD'
              ? 'bg-white text-emerald-700 border-emerald-300 shadow-xs'
              : 'bg-slate-50 hover:bg-white text-slate-600 border-slate-200/80'
          }`}
        >
          <Cloud className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Đám Mây Firestore</span>
        </button>
      </div>

      {/* 3. TAB CONTENT PANELS */}
      <div className="bg-white rounded-3xl p-5 sm:p-7 border border-slate-200/90 shadow-xs space-y-6">
        {/* ==================================================================== */}
        {/* TAB 1: NGÂN HÀNG & VIETQR                                            */}
        {/* ==================================================================== */}
        {activeTab === 'BANK' && (
          <div className="space-y-6 animate-in fade-in">
            <div className="border-b border-slate-100 pb-4">
              <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-emerald-600" />
                <span>Thông Tin Tài Khoản Nhận Tiền &amp; Mã VietQR</span>
              </h2>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Thông tin này sẽ được hiển thị khi người nợ quét mã QR để chuyển khoản hoặc xem số tài khoản nhận tiền.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Form inputs column */}
              <div className="lg:col-span-7 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      <span>Tên Liên Hệ (Hiển thị cho người xem):</span>
                    </label>
                    <input
                      type="text"
                      value={formData.ownerName}
                      onChange={(e) => setFormData({ ...formData, ownerName: e.target.value })}
                      placeholder="Ví dụ: Anh Nam, Chị Lan..."
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-2xl text-xs font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      <span>Số Điện Thoại Liên Hệ:</span>
                    </label>
                    <input
                      type="tel"
                      value={formData.ownerPhone || ''}
                      onChange={(e) => setFormData({ ...formData, ownerPhone: e.target.value })}
                      placeholder="Ví dụ: 0988 888 888"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-2xl text-xs font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-slate-400" />
                    <span>Ngân Hàng Thụ Hưởng:</span>
                  </label>
                  <select
                    value={formData.bankId}
                    onChange={(e) => handleBankChange(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-2xl text-xs font-bold focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 cursor-pointer"
                  >
                    {POPULAR_BANKS.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.shortName} - {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Số Tài Khoản (STK):
                    </label>
                    <input
                      type="text"
                      value={formData.accountNumber}
                      onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value.trim() })}
                      placeholder="Nhập STK ngân hàng"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-2xl text-xs font-mono font-bold focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Tên Chủ Tài Khoản (In hoa không dấu):
                    </label>
                    <input
                      type="text"
                      value={formData.accountName}
                      onChange={(e) => setFormData({ ...formData, accountName: e.target.value.toUpperCase() })}
                      placeholder="NGUYEN VAN A"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-2xl text-xs font-mono font-bold focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 uppercase"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Nội Dung Chuyển Khoản Mặc Định:
                    </label>
                    <input
                      type="text"
                      value={formData.defaultMemoPrefix || ''}
                      onChange={(e) => setFormData({ ...formData, defaultMemoPrefix: e.target.value })}
                      placeholder="TRA NO"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-2xl text-xs font-mono font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 uppercase"
                    />
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {['TRA NO', 'THANH TOAN', 'TIEN AN', 'TIEN PHONG', 'TIEN HANG'].map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => setFormData({ ...formData, defaultMemoPrefix: tag })}
                          className={`text-[10px] font-mono px-2 py-0.5 rounded-lg border transition-colors cursor-pointer ${
                            formData.defaultMemoPrefix === tag
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-300 font-bold'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-600 border-slate-200'
                          }`}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Kiểu Khung Hiển Thị VietQR:
                    </label>
                    <select
                      value={formData.vietQrTemplate || 'compact2'}
                      onChange={(e) => setFormData({ ...formData, vietQrTemplate: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-2xl text-xs font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 cursor-pointer"
                    >
                      <option value="compact2">Khung Hiện Đại (compact2 - Khuyên dùng)</option>
                      <option value="compact">Khung Gọn (compact)</option>
                      <option value="qr_only">Chỉ Mã QR (Không khung)</option>
                    </select>
                    <p className="text-[11px] text-slate-400 mt-1.5">
                      Định dạng mã QR chuyển khoản liên ngân hàng NAPAS 247 chuẩn quốc gia.
                    </p>
                  </div>
                </div>
              </div>

              {/* VietQR Live Preview Card */}
              <div className="lg:col-span-5 bg-slate-50 rounded-3xl p-5 border border-slate-200 flex flex-col items-center justify-between text-center space-y-4">
                <div className="w-full">
                  <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center justify-center gap-1.5 mb-2">
                    <QrCode className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Xem Trước Mã VietQR Thực Tế</span>
                  </div>

                  <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs inline-block max-w-[220px] mx-auto">
                    {liveVietQrUrl ? (
                      <img
                        src={liveVietQrUrl}
                        alt="Xem trước VietQR"
                        className="w-full h-auto rounded-xl object-contain"
                      />
                    ) : (
                      <div className="w-48 h-48 rounded-xl bg-slate-100 flex flex-col items-center justify-center text-slate-400 text-xs p-4">
                        <QrCode className="w-10 h-10 mb-2 opacity-40" />
                        <span>Vui lòng nhập STK để tạo mã QR</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="w-full bg-white p-3 rounded-2xl border border-slate-200/80 text-left space-y-1.5 text-xs">
                  <div className="flex justify-between items-center text-slate-500">
                    <span>Ngân hàng:</span>
                    <span className="font-bold text-slate-900">{formData.bankName}</span>
                  </div>
                  <div className="flex justify-between items-center text-slate-500">
                    <span>Số tài khoản:</span>
                    <span className="font-mono font-bold text-slate-900 flex items-center gap-1.5">
                      {formData.accountNumber || 'Chưa nhập'}
                      {formData.accountNumber && (
                        <button
                          type="button"
                          onClick={handleCopyAccount}
                          className="p-1 text-slate-400 hover:text-emerald-600 cursor-pointer"
                          title="Sao chép STK"
                        >
                          {copiedAcc ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                        </button>
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-slate-500">
                    <span>Chủ tài khoản:</span>
                    <span className="font-mono font-bold text-slate-900 uppercase">
                      {formData.accountName || 'Chưa nhập'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================================================================== */}
        {/* TAB 2: BẢO MẬT & HỆ THỐNG / DỮ LIỆU                                  */}
        {/* ==================================================================== */}
        {activeTab === 'SECURITY' && (
          <div className="space-y-6 animate-in fade-in">
            <div className="border-b border-slate-100 pb-4">
              <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                <span>Bảo Mật Tài Khoản &amp; Quản Trị Dữ Liệu</span>
              </h2>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Mật khẩu quản lý, thông tin thương hiệu và các thao tác sao lưu, khôi phục dữ liệu.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Security section */}
              <div className="p-5 bg-slate-50 rounded-3xl border border-slate-200/80 space-y-4">
                <div className="flex items-center gap-2 text-slate-900 font-bold text-xs uppercase tracking-wider">
                  <Lock className="w-4 h-4 text-emerald-600" />
                  <span>Mật Khẩu Đăng Nhập Quản Lý</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Mật khẩu quản lý:
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={formData.ownerPassword}
                      onChange={(e) => setFormData({ ...formData, ownerPassword: e.target.value })}
                      placeholder="Nhập mật khẩu quản lý..."
                      className="w-full px-3.5 py-2.5 pr-10 bg-white border border-slate-300 rounded-2xl text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                      title={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                    Dùng để đăng nhập vào trang quản lý số dư, thêm bớt người nợ và sửa giao dịch.
                  </p>
                </div>
              </div>

              {/* Branding / Titles section */}
              <div className="p-5 bg-slate-50 rounded-3xl border border-slate-200/80 space-y-4">
                <div className="flex items-center gap-2 text-slate-900 font-bold text-xs uppercase tracking-wider">
                  <Sparkles className="w-4 h-4 text-emerald-600" />
                  <span>Tiêu Đề &amp; Thương Hiệu Ứng Dụng</span>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Tên Ứng Dụng:
                    </label>
                    <input
                      type="text"
                      value={formData.appTitle}
                      onChange={(e) => setFormData({ ...formData, appTitle: e.target.value })}
                      placeholder={DEFAULT_APP_TITLE}
                      className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-2xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Khẩu Hiệu / Mô Tả Phụ:
                    </label>
                    <input
                      type="text"
                      value={formData.appSubtitle}
                      onChange={(e) => setFormData({ ...formData, appSubtitle: e.target.value })}
                      placeholder={DEFAULT_APP_SUBTITLE}
                      className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-2xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Data management actions */}
            <div className="p-5 bg-slate-50 rounded-3xl border border-slate-200/80 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-900">
                  Thao Tác Dữ Liệu Sổ Nợ
                </span>
                <span className="text-[11px] text-slate-500">
                  Hiện có: <strong>{debtors.length}</strong> con nợ, <strong>{transactions.length}</strong> giao dịch
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <button
                  type="button"
                  onClick={handleExportData}
                  className="p-3.5 bg-white hover:bg-emerald-50 hover:border-emerald-300 border border-slate-200 rounded-2xl text-left transition-all group flex flex-col justify-between gap-2 cursor-pointer shadow-2xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 group-hover:text-emerald-700">
                      Xuất File Sao Lưu
                    </span>
                    <Download className="w-4 h-4 text-emerald-600" />
                  </div>
                  <span className="text-[11px] text-slate-500 leading-tight">
                    Tải tệp JSON chứa toàn bộ người nợ và lịch sử để lưu trữ an toàn.
                  </span>
                </button>

                <label className="p-3.5 bg-white hover:bg-blue-50 hover:border-blue-300 border border-slate-200 rounded-2xl text-left transition-all group flex flex-col justify-between gap-2 cursor-pointer shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 group-hover:text-blue-700">
                      Khôi Phục Từ File JSON
                    </span>
                    <Upload className="w-4 h-4 text-blue-600" />
                  </div>
                  <span className="text-[11px] text-slate-500 leading-tight">
                    Nạp dữ liệu từ tệp JSON sao lưu trước đây để phục hồi sổ nợ.
                  </span>
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleImportJsonFile}
                    className="hidden"
                  />
                </label>

                <button
                  type="button"
                  onClick={() => setIsConfirmResetOpen(true)}
                  className="p-3.5 bg-white hover:bg-amber-50 hover:border-amber-300 border border-slate-200 rounded-2xl text-left transition-all group flex flex-col justify-between gap-2 cursor-pointer shadow-2xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 group-hover:text-amber-700">
                      Nạp Lại Dữ Liệu Mẫu
                    </span>
                    <RotateCcw className="w-4 h-4 text-amber-600" />
                  </div>
                  <span className="text-[11px] text-slate-500 leading-tight">
                    Nạp lại bộ 4 người nợ mẫu (Minh, Lan, Hoàng, Thảo) để trải nghiệm thử.
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsConfirmClearOpen(true)}
                  className="p-3.5 bg-white hover:bg-rose-50 hover:border-rose-300 border border-slate-200 rounded-2xl text-left transition-all group flex flex-col justify-between gap-2 cursor-pointer shadow-2xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 group-hover:text-rose-700">
                      Xóa Sạch Dữ Liệu Mẫu
                    </span>
                    <Trash2 className="w-4 h-4 text-rose-600" />
                  </div>
                  <span className="text-[11px] text-slate-500 leading-tight">
                    Xóa các giao dịch mẫu để bắt đầu sổ ghi nợ cá nhân mới tinh.
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ==================================================================== */}
        {/* TAB 3: MẪU TIN & LỜI NHẮN                                            */}
        {/* ==================================================================== */}
        {activeTab === 'TEXTS' && (
          <div className="space-y-6 animate-in fade-in">
            <div className="border-b border-slate-100 pb-4">
              <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-emerald-600" />
                <span>Tùy Biến Mẫu Tin Nhắn Gửi Cho Con Nợ</span>
              </h2>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Tùy chỉnh nội dung tin nhắn gửi Zalo/SMS khi gửi link sao kê hoặc tin nhắn nhắc nợ lịch sự.
              </p>
            </div>

            {/* Sub-tabs: Link Tra Cứu vs Nhắc Nợ */}
            <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-2xl max-w-sm">
              <button
                type="button"
                onClick={() => setActiveTemplateTab('LOOKUP')}
                className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTemplateTab === 'LOOKUP'
                    ? 'bg-white text-emerald-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                1. Mẫu Gửi Pass Tra Cứu
              </button>
              <button
                type="button"
                onClick={() => setActiveTemplateTab('REMINDER')}
                className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTemplateTab === 'REMINDER'
                    ? 'bg-white text-emerald-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                2. Mẫu Nhắc Nợ Lịch Sự
              </button>
            </div>

            {/* Template editor */}
            <div className="p-5 bg-slate-50 rounded-3xl border border-slate-200/80 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-xs font-bold text-slate-900">
                  {activeTemplateTab === 'LOOKUP'
                    ? 'Nội dung tin gửi Link và Mật khẩu tra cứu:'
                    : 'Nội dung tin nhắn nhắc nợ định kỳ:'}
                </span>

                <button
                  type="button"
                  onClick={() => {
                    if (activeTemplateTab === 'LOOKUP') {
                      setFormData({
                        ...formData,
                        lookupGuideTemplate: DEFAULT_LOOKUP_GUIDE,
                        shareMessageTemplate: DEFAULT_LOOKUP_GUIDE,
                      });
                    } else {
                      setFormData({
                        ...formData,
                        reminderMessageTemplate: DEFAULT_REMINDER_TEMPLATE,
                      });
                    }
                    showToast('Đã khôi phục mẫu tin chuẩn!', 'success');
                  }}
                  className="text-slate-500 hover:text-emerald-700 text-xs font-semibold cursor-pointer"
                >
                  Khôi phục mẫu chuẩn
                </button>
              </div>

              {/* Tag inserter chips */}
              <div className="flex flex-wrap items-center gap-1.5 p-3 bg-white rounded-2xl border border-slate-200/80">
                <span className="text-[11px] font-bold text-slate-500 mr-1 flex items-center gap-1">
                  <Info className="w-3 h-3 text-slate-400" />
                  Chèn biến:
                </span>
                {TEMPLATE_TAG_DESCRIPTIONS.map((tag) => (
                  <button
                    key={tag.tag}
                    type="button"
                    onClick={() => handleInsertTag(tag.tag, activeTemplateTab)}
                    className="text-[11px] font-mono px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-emerald-100 hover:text-emerald-800 text-slate-700 border border-slate-200 transition-colors cursor-pointer"
                    title={tag.label}
                  >
                    {tag.tag}
                  </button>
                ))}
              </div>

              {/* Textarea editor */}
              {activeTemplateTab === 'LOOKUP' ? (
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
                  className="w-full px-3.5 py-3 bg-white border border-slate-300 rounded-2xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 leading-relaxed"
                />
              ) : (
                <textarea
                  rows={6}
                  value={formData.reminderMessageTemplate || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      reminderMessageTemplate: e.target.value,
                    })
                  }
                  className="w-full px-3.5 py-3 bg-white border border-slate-300 rounded-2xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 leading-relaxed"
                />
              )}

              {/* Live Preview Box */}
              <div className="p-4 bg-white rounded-2xl border border-slate-200 space-y-2">
                <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center justify-between">
                  <span>Xem trước nội dung tin nhắn gửi thực tế:</span>
                  <span className="text-emerald-700 font-bold">Tự động điền dữ liệu thật</span>
                </div>
                <div className="text-xs text-slate-800 whitespace-pre-line leading-relaxed font-sans bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                  {activeTemplateTab === 'LOOKUP' ? liveLookupPreview : liveReminderPreview}
                </div>
              </div>
            </div>

            {/* Additional notes for debtor page */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <label className="block text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Lời Nhắn Ghim Đầu Trang Sao Kê:
                </label>
                <textarea
                  rows={2}
                  value={formData.guestAnnouncement || ''}
                  onChange={(e) => setFormData({ ...formData, guestAnnouncement: e.target.value })}
                  placeholder="Để trống nếu không muốn hiện lời nhắn ghim..."
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900"
                />
              </div>

              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <label className="block text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Lời Cảm Ơn Khi Đã Thanh Toán Hết (0đ):
                </label>
                <textarea
                  rows={2}
                  value={formData.settledThankYouNote || ''}
                  onChange={(e) => setFormData({ ...formData, settledThankYouNote: e.target.value })}
                  placeholder={DEFAULT_SETTLED_NOTE}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900"
                />
              </div>
            </div>
          </div>
        )}

        {/* ==================================================================== */}
        {/* TAB 4: ĐÁM MÂY FIRESTORE                                             */}
        {/* ==================================================================== */}
        {activeTab === 'CLOUD' && (
          <div className="space-y-4 animate-in fade-in">
            <FirestoreSettingsTab
              debtors={debtors}
              transactions={transactions}
              settings={formData}
              parties={parties}
              onDataReload={handleDataReloadAndSync}
              showToast={showToast}
            />
          </div>
        )}
      </div>

      {/* Confirmation Modals */}
      <ConfirmClearSampleModal
        isOpen={isConfirmClearOpen}
        onClose={() => setIsConfirmClearOpen(false)}
        onSuccess={() => {
          handleDataReloadAndSync();
          showToast('Đã xóa toàn bộ dữ liệu mẫu thành công!', 'success');
        }}
      />

      <ConfirmResetSampleModal
        isOpen={isConfirmResetOpen}
        onClose={() => setIsConfirmResetOpen(false)}
        onSuccess={() => {
          handleDataReloadAndSync();
          showToast('Đã nạp lại dữ liệu 4 người nợ mẫu thành công!', 'success');
        }}
      />
    </div>
  );
};
