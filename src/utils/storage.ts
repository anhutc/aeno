/**
 * ============================================================================
 * GHI CHÚ CHỈNH SỬA / CHANGELOG:
 * - loadDebtors: Tự động loại bỏ trường 'phone' nếu người dùng còn lưu dữ liệu cũ
 *   trong LocalStorage để bảo đảm danh sách người nợ hoàn toàn không còn số điện thoại.
 * - loadSettings: Hỗ trợ nạp và khởi tạo 'ownerPhone' (số điện thoại của Chủ Nợ).
 * ============================================================================
 */

import { Debtor, Transaction, PartySplit, AppSettings, AuditLog } from '../types';
import {
  DEFAULT_SETTINGS,
  INITIAL_DEBTORS,
  INITIAL_PARTIES,
  INITIAL_TRANSACTIONS,
} from '../data/mockData';

const STORAGE_KEYS = {
  DEBTORS: 'debt_app_debtors_v1',
  TRANSACTIONS: 'debt_app_transactions_v1',
  PARTIES: 'debt_app_parties_v1',
  SETTINGS: 'debt_app_settings_v1',
  SAMPLE_CLEARED: 'debt_app_sample_cleared_v1',
  DELETED_TX_IDS: 'debt_app_deleted_tx_ids_v1',
  DELETED_DEBTOR_IDS: 'debt_app_deleted_debtor_ids_v1',
  DELETED_PARTY_IDS: 'debt_app_deleted_party_ids_v1',
  AUDIT_LOGS: 'debt_app_audit_logs_v1',
  AUDIT_LOGS_CLEARED: 'debt_app_audit_logs_cleared_v1',
  AUDIT_LOGS_CLEARED_AT: 'debt_app_audit_logs_cleared_at_v1',
};

/**
 * Safe write to localStorage that detects QuotaExceededError and never throws unhandled errors.
 */
function safeSetItem(key: string, value: string): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    localStorage.setItem(key, value);
    return true;
  } catch (err: any) {
    const isQuota =
      err?.name === 'QuotaExceededError' ||
      err?.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      err?.code === 22 ||
      err?.code === 1014 ||
      (typeof err?.message === 'string' && err.message.toLowerCase().includes('quota'));

    if (isQuota) {
      console.warn(`[Storage] Quota exceeded on setting key "${key}". Running self-healing cleanup...`);
    } else {
      console.warn(`[Storage] Could not write "${key}" to localStorage:`, err);
    }
    return false;
  }
}

/**
 * Proactively clean bloated base64 images from localStorage transactions on startup
 * to instantly recover from quota overflow.
 */
export function cleanStorageIfQuotaBloated(): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const rawTxs = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
    if (!rawTxs) return;

    // If transactions JSON is over 1MB or has heavy images, optimize local copy
    if (rawTxs.length > 500000 || rawTxs.includes('data:image')) {
      const parsed = JSON.parse(rawTxs);
      if (Array.isArray(parsed)) {
        // Strip heavy images from older transactions in local storage cache
        const optimized = parsed.map((t: any, idx: number) => {
          if (idx > 2 && t.billImage) {
            const { billImage, ...rest } = t;
            return rest;
          }
          return t;
        });
        safeSetItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(optimized));
      }
    }
  } catch {
    // ignore
  }
}

// Run cleanup immediately on load
if (typeof window !== 'undefined') {
  setTimeout(() => {
    cleanStorageIfQuotaBloated();
  }, 100);
}

export function getDeletedTxIds(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.DELETED_TX_IDS);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

export function markTxDeleted(id: string): void {
  try {
    const set = getDeletedTxIds();
    set.add(id);
    localStorage.setItem(STORAGE_KEYS.DELETED_TX_IDS, JSON.stringify(Array.from(set)));
  } catch {
    // ignore
  }
}

export function unmarkTxDeleted(id: string): void {
  try {
    const set = getDeletedTxIds();
    if (set.has(id)) {
      set.delete(id);
      localStorage.setItem(STORAGE_KEYS.DELETED_TX_IDS, JSON.stringify(Array.from(set)));
    }
  } catch {
    // ignore
  }
}

export function getDeletedDebtorIds(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.DELETED_DEBTOR_IDS);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

export function markDebtorDeleted(id: string): void {
  try {
    const set = getDeletedDebtorIds();
    set.add(id);
    localStorage.setItem(STORAGE_KEYS.DELETED_DEBTOR_IDS, JSON.stringify(Array.from(set)));
  } catch {
    // ignore
  }
}

export function unmarkDebtorDeleted(id: string): void {
  try {
    const set = getDeletedDebtorIds();
    if (set.has(id)) {
      set.delete(id);
      localStorage.setItem(STORAGE_KEYS.DELETED_DEBTOR_IDS, JSON.stringify(Array.from(set)));
    }
  } catch {
    // ignore
  }
}

export function getDeletedPartyIds(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.DELETED_PARTY_IDS);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

export function markPartyDeleted(id: string): void {
  try {
    const set = getDeletedPartyIds();
    set.add(id);
    localStorage.setItem(STORAGE_KEYS.DELETED_PARTY_IDS, JSON.stringify(Array.from(set)));
  } catch {
    // ignore
  }
}

export function unmarkPartyDeleted(id: string): void {
  try {
    const set = getDeletedPartyIds();
    if (set.has(id)) {
      set.delete(id);
      localStorage.setItem(STORAGE_KEYS.DELETED_PARTY_IDS, JSON.stringify(Array.from(set)));
    }
  } catch {
    // ignore
  }
}

export function markSampleDataCleared(cleared: boolean): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (cleared) {
        localStorage.setItem(STORAGE_KEYS.SAMPLE_CLEARED, 'true');
      } else {
        localStorage.removeItem(STORAGE_KEYS.SAMPLE_CLEARED);
      }
    }
  } catch {
    // ignore
  }
}

export function isSampleDataCleared(): boolean {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return localStorage.getItem(STORAGE_KEYS.SAMPLE_CLEARED) === 'true';
    }
  } catch {
    // ignore
  }
  return false;
}

export function loadDebtors(): Debtor[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.DEBTORS);
    if (!raw) {
      if (isSampleDataCleared()) {
        return [];
      }
      saveDebtors(INITIAL_DEBTORS);
      return INITIAL_DEBTORS;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      let hasPhoneField = false;
      const sanitized = parsed.map((item: any) => {
        if (item.phone !== undefined) {
          hasPhoneField = true;
          const { phone, ...rest } = item;
          return rest as Debtor;
        }
        return item as Debtor;
      });
      if (hasPhoneField) {
        saveDebtors(sanitized);
      }
      return sanitized;
    }
    return [];
  } catch (err) {
    console.error('Failed to load debtors from localStorage', err);
    return [];
  }
}

export function saveDebtors(debtors: Debtor[]): void {
  try {
    const serialized = JSON.stringify(debtors);
    if (!safeSetItem(STORAGE_KEYS.DEBTORS, serialized)) {
      // If saving debtors failed due to quota, clean up bloated transactions cache first
      cleanStorageIfQuotaBloated();
      safeSetItem(STORAGE_KEYS.DEBTORS, serialized);
    }
  } catch (err) {
    console.warn('[Storage] Failed to save debtors locally:', err);
  }
}

export function loadTransactions(): Transaction[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
    if (!raw) {
      if (isSampleDataCleared()) {
        return [];
      }
      saveTransactions(INITIAL_TRANSACTIONS);
      return INITIAL_TRANSACTIONS;
    }
    const parsed = JSON.parse(raw);
    const txs: Transaction[] = Array.isArray(parsed) ? parsed : [];
    try {
      const partiesRaw = localStorage.getItem(STORAGE_KEYS.PARTIES);
      if (partiesRaw) {
        const parties: PartySplit[] = JSON.parse(partiesRaw);
        const debtorsRaw = localStorage.getItem(STORAGE_KEYS.DEBTORS);
        const debtors: Debtor[] = debtorsRaw ? JSON.parse(debtorsRaw) : [];
        const settingsRaw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
        const settings: AppSettings = settingsRaw ? JSON.parse(settingsRaw) : DEFAULT_SETTINGS;

        txs.forEach((tx) => {
          if (tx.partyId && !tx.partyTotalAmount) {
            const p = parties.find((party) => party.id === tx.partyId);
            if (p) {
              const participantNames: string[] = [];
              if (p.includeMe) participantNames.push(settings.ownerName || 'Tôi (Chủ sổ)');
              (p.participantDebtorIds || []).forEach((id) => {
                const d = debtors.find((deb) => deb.id === id);
                if (d && !participantNames.includes(d.name)) participantNames.push(d.name);
              });
              const payerName = p.payerType === 'ME'
                ? (settings.ownerName || 'Tôi (Chủ sổ)')
                : (debtors.find((deb) => deb.id === p.payerDebtorId)?.name || 'Người này');

              tx.partyTotalAmount = p.totalAmount;
              tx.partySplitAmount = p.splitAmountPerPerson;
              tx.partyParticipants = participantNames;
              tx.partyPayerName = payerName;
              tx.partyName = p.name;
              tx.billImage = tx.billImage || p.billImage;
            }
          }
        });
      }
    } catch {
      // ignore
    }
    return txs;
  } catch (err) {
    console.error('Failed to load transactions', err);
    return [];
  }
}

export function saveTransactions(txs: Transaction[]): void {
  try {
    // 1. Try standard save
    const serialized = JSON.stringify(txs);
    if (safeSetItem(STORAGE_KEYS.TRANSACTIONS, serialized)) {
      return;
    }

    // 2. If quota exceeded: Strip heavy billImage from older transactions in local cache
    console.warn('[Storage] Quota limit reached. Stripping older bill images from local cache...');
    const strippedTxs = txs.map((t, idx) => {
      // Keep billImage only on the 2 most recent transactions locally
      if (idx > 1 && t.billImage) {
        const { billImage, ...rest } = t;
        return rest as Transaction;
      }
      return t;
    });

    if (safeSetItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(strippedTxs))) {
      return;
    }

    // 3. If STILL exceeding quota: strip ALL images from local storage cache
    const allStripped = txs.map(({ billImage, ...rest }) => rest as Transaction);
    if (safeSetItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(allStripped))) {
      return;
    }

    // 4. If still exceeding: keep only the latest 80 transactions in localStorage
    const truncated = allStripped.slice(0, 80);
    safeSetItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(truncated));
  } catch (err) {
    console.warn('[Storage] Could not write transactions to localStorage (quota or storage disabled):', err);
    // CRITICAL: NEVER throw to caller!
  }
}

export function loadParties(): PartySplit[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PARTIES);
    if (!raw) {
      if (isSampleDataCleared()) {
        return [];
      }
      saveParties(INITIAL_PARTIES);
      return INITIAL_PARTIES;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Failed to load party splits', err);
    return [];
  }
}

export function saveParties(parties: PartySplit[]): void {
  try {
    const serialized = JSON.stringify(parties);
    if (!safeSetItem(STORAGE_KEYS.PARTIES, serialized)) {
      cleanStorageIfQuotaBloated();
      // Try stripping bill images from parties if needed
      const stripped = parties.map(({ billImage, ...rest }) => rest as PartySplit);
      safeSetItem(STORAGE_KEYS.PARTIES, JSON.stringify(stripped));
    }
  } catch (err) {
    console.warn('[Storage] Failed to save parties locally:', err);
  }
}

let _cachedSettingsRaw: string | null = null;
let _cachedSettingsObj: AppSettings | null = null;
let _memorySensitiveSettings: Partial<AppSettings> = {};

function stripSensitiveSettingsForStorage(settings: AppSettings): Record<string, any> {
  const {
    ownerPassword: _p,
    reminderMessageTemplate: _r,
    googleAppsScriptUrl: _gUrl,
    googleSheetUrl: _sUrl,
    googleSheetId: _sId,
    ...publicOnly
  } = (settings || {}) as any;
  return publicOnly;
}

export function clearMemorySettings(): void {
  _cachedSettingsRaw = null;
  _cachedSettingsObj = null;
  _memorySensitiveSettings = {};
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (!raw) {
      saveSettings(DEFAULT_SETTINGS);
      return { ...DEFAULT_SETTINGS, ..._memorySensitiveSettings };
    }
    if (raw === _cachedSettingsRaw && _cachedSettingsObj) {
      return _cachedSettingsObj;
    }
    const parsed = JSON.parse(raw);
    const hasLegacySecrets = Boolean(
      parsed &&
        typeof parsed === 'object' &&
        (parsed.ownerPassword !== undefined ||
          parsed.googleAppsScriptUrl !== undefined ||
          parsed.googleSheetUrl !== undefined ||
          parsed.googleSheetId !== undefined)
    );
    const stripMemoLine = (text: string | undefined, defaultText: string) => {
      if (!text) return defaultText;
      return text
        .split('\n')
        .filter((l) => !l.toLowerCase().includes('nội dung chuyển khoản') && !l.toLowerCase().includes('noi dung chuyen khoan'))
        .join('\n');
    };
    const safeParsed = stripSensitiveSettingsForStorage(parsed || {});
    if (hasLegacySecrets) {
      safeSetItem(STORAGE_KEYS.SETTINGS, JSON.stringify(safeParsed));
    }
    const result: AppSettings = {
      ...DEFAULT_SETTINGS,
      ...safeParsed,
      ..._memorySensitiveSettings,
      defaultMemoPrefix: '',
      ownerPhone: safeParsed.ownerPhone !== undefined ? safeParsed.ownerPhone : (DEFAULT_SETTINGS.ownerPhone || ''),
      lookupGuideTemplate: stripMemoLine(safeParsed.lookupGuideTemplate || safeParsed.shareMessageTemplate, DEFAULT_SETTINGS.lookupGuideTemplate || ''),
    };
    _cachedSettingsRaw = JSON.stringify(safeParsed);
    _cachedSettingsObj = result;
    return result;
  } catch (err) {
    console.error('Failed to load settings', err);
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): void {
  try {
    const s = (settings || {}) as any;
    if (s.googleAppsScriptUrl !== undefined) {
      if (s.googleAppsScriptUrl) _memorySensitiveSettings.googleAppsScriptUrl = s.googleAppsScriptUrl;
      else delete _memorySensitiveSettings.googleAppsScriptUrl;
    }
    if (s.googleSheetUrl !== undefined) {
      if (s.googleSheetUrl) _memorySensitiveSettings.googleSheetUrl = s.googleSheetUrl;
      else delete _memorySensitiveSettings.googleSheetUrl;
    }
    if (s.googleSheetId !== undefined) {
      if (s.googleSheetId) _memorySensitiveSettings.googleSheetId = s.googleSheetId;
      else delete _memorySensitiveSettings.googleSheetId;
    }
    if (s.ownerPassword !== undefined) {
      if (s.ownerPassword) _memorySensitiveSettings.ownerPassword = s.ownerPassword;
      else delete _memorySensitiveSettings.ownerPassword;
    }

    const storageSafe = stripSensitiveSettingsForStorage(settings);
    const serialized = JSON.stringify(storageSafe);
    _cachedSettingsRaw = serialized;
    _cachedSettingsObj = { ...DEFAULT_SETTINGS, ...storageSafe, ..._memorySensitiveSettings };
    safeSetItem(STORAGE_KEYS.SETTINGS, serialized);
  } catch (err) {
    console.warn('[Storage] Failed to save settings locally:', err);
  }
}

export function getDebtorBalance(debtorId: string, transactions: Transaction[]): number {
  return transactions
    .filter((tx) => tx.debtorId === debtorId)
    .reduce((acc, tx) => {
      return tx.type === 'ADD' ? acc + tx.amount : acc - tx.amount;
    }, 0);
}

export interface StatementItem {
  transaction: Transaction;
  runningBalance: number;
}

export function getDebtorStatement(
  debtorId: string,
  transactions: Transaction[]
): StatementItem[] {
  // Sort chronologically ascending
  const debtorTxs = transactions
    .filter((tx) => tx.debtorId === debtorId)
    .sort((a, b) => {
      const dateDiff = new Date(a.date).getTime() - new Date(b.date).getTime();
      if (dateDiff !== 0) return dateDiff;
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return aTime - bTime;
    });

  let balance = 0;
  return debtorTxs.map((tx) => {
    if (tx.type === 'ADD') {
      balance += tx.amount;
    } else {
      balance -= tx.amount;
    }
    return {
      transaction: tx,
      runningBalance: balance,
    };
  });
}

/**
 * Xóa sạch toàn bộ dấu vết dữ liệu nhạy cảm (Debtors, Txs, Parties, Session Tokens)
 * khi người dùng bấm Đăng xuất để bảo mật tuyệt đối, ngăn nút Back hoặc người mượn máy xem lại.
 */
export function deepCleanSessionData(): void {
  try {
    clearMemorySettings();
    if (typeof window === 'undefined') return;

    const keysToRemove = [
      STORAGE_KEYS.DEBTORS,
      STORAGE_KEYS.TRANSACTIONS,
      STORAGE_KEYS.PARTIES,
      STORAGE_KEYS.SAMPLE_CLEARED,
      STORAGE_KEYS.DELETED_TX_IDS,
      STORAGE_KEYS.DELETED_DEBTOR_IDS,
      STORAGE_KEYS.DELETED_PARTY_IDS,
      'so_ghi_no_owner_session_token',
      'so_ghi_no_saved_guest_pin',
      'so_ghi_no_saved_guest_name',
    ];

    keysToRemove.forEach((k) => localStorage.removeItem(k));
    const rawSettings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (rawSettings) {
      try {
        const parsed = JSON.parse(rawSettings);
        safeSetItem(STORAGE_KEYS.SETTINGS, JSON.stringify(stripSensitiveSettingsForStorage(parsed)));
      } catch {
        // ignore
      }
    }
    sessionStorage.clear();

    // Reset URL và xóa hash/query để người khác không ấn Back xem lại được
    window.history.replaceState(null, '', window.location.pathname);
  } catch (err) {
    console.warn('[Storage] Deep clean session error:', err);
  }
}

/**
 * Tạo dữ liệu nhật ký mẫu ban đầu nếu chưa có nhật ký nào được ghi
 */
function generateInitialAuditLogs(): AuditLog[] {
  const now = Date.now();
  return [
    {
      id: `log-init-1`,
      timestamp: new Date(now - 86400000 * 3).toISOString(),
      action: 'UPDATE_SETTINGS',
      actor: 'Chủ Sổ (Admin)',
      title: 'Khởi tạo sổ nợ & tài khoản VietQR',
      description: 'Thiết lập thông tin tài khoản ngân hàng nhận tiền và mật khẩu quản trị',
      beforeState: 'Chưa thiết lập tài khoản ngân hàng',
      afterState: 'Ngân hàng Vietcombank (STK: 1012345678, Chủ TK: NGUYEN VAN A)',
      changes: [
        { fieldLabel: 'Ngân hàng nhận', before: '(Chưa cài đặt)', after: 'Vietcombank' },
        { fieldLabel: 'Số tài khoản', before: '(Chưa có)', after: '1012345678' },
        { fieldLabel: 'Chủ tài khoản', before: '(Chưa có)', after: 'NGUYEN VAN A' },
      ],
    },
    {
      id: `log-init-2`,
      timestamp: new Date(now - 86400000 * 2.5).toISOString(),
      action: 'ADD_DEBTOR',
      actor: 'Chủ Sổ (Admin)',
      title: 'Thêm người nợ mới',
      description: 'Thêm danh bạ "Nguyễn Văn Nam" với mã PIN tra cứu cá nhân',
      debtorName: 'Nguyễn Văn Nam',
      beforeState: 'Chưa có trong danh bạ',
      afterState: 'Đã lưu danh bạ: Nguyễn Văn Nam (PIN: 112233)',
      changes: [
        { fieldLabel: 'Họ và tên', before: '(Không tồn tại)', after: 'Nguyễn Văn Nam' },
        { fieldLabel: 'Mã tra cứu (PIN)', before: '(Chưa cấp)', after: '112233' },
        { fieldLabel: 'Dư nợ ban đầu', before: '0 VNĐ', after: '0 VNĐ' },
      ],
    },
    {
      id: `log-init-3`,
      timestamp: new Date(now - 86400000 * 2).toISOString(),
      action: 'ADD_TRANSACTION',
      actor: 'Chủ Sổ (Admin)',
      title: 'Ghi nợ chi hộ (+)',
      description: 'Ghi nhận chi hộ 500.000 VNĐ cho Nguyễn Văn Nam (Đi ăn trưa buffet)',
      debtorName: 'Nguyễn Văn Nam',
      amount: 500000,
      beforeState: 'Dư nợ hiện tại: 0 VNĐ (0 giao dịch)',
      afterState: 'Dư nợ mới: 500.000 VNĐ (1 giao dịch)',
      changes: [
        { fieldLabel: 'Giao dịch phát sinh', before: 'Không có', after: '+500.000 VNĐ (Chi hộ ăn trưa)' },
        { fieldLabel: 'Dư nợ người này', before: '0 VNĐ', after: '500.000 VNĐ' },
      ],
    },
    {
      id: `log-init-4`,
      timestamp: new Date(now - 86400000 * 1.5).toISOString(),
      action: 'ADD_PARTY',
      actor: 'Chủ Sổ (Admin)',
      title: 'Ăn chia nhóm mới',
      description: 'Tạo cuộc chia bill "Đi ăn Lẩu Bò" (tổng 1.200.000 VNĐ cho 4 người tham gia)',
      amount: 1200000,
      beforeState: 'Chưa có cuộc chia tiền "Đi ăn Lẩu Bò"',
      afterState: 'Cuộc vui: Đi ăn Lẩu Bò (Tổng bill: 1.200.000 VNĐ, 4 người)',
      changes: [
        { fieldLabel: 'Tổng tiền cuộc vui', before: '0 VNĐ', after: '1.200.000 VNĐ' },
        { fieldLabel: 'Số người tham gia', before: '0', after: '4 người' },
        { fieldLabel: 'Mỗi người đóng', before: '0 VNĐ', after: '300.000 VNĐ' },
      ],
    },
    {
      id: `log-init-5`,
      timestamp: new Date(now - 86400000 * 0.8).toISOString(),
      action: 'UPDATE_TRANSACTION',
      actor: 'Chủ Sổ (Admin)',
      title: 'Thu nợ / Thanh toán (-)',
      description: 'Ghi nhận nhận thanh toán 200.000 VNĐ từ Bạn Tuấn qua chuyển khoản ngân hàng',
      debtorName: 'Bạn Tuấn',
      amount: 200000,
      beforeState: 'Dư nợ trước thanh toán: 500.000 VNĐ',
      afterState: 'Dư nợ sau thanh toán: 300.000 VNĐ',
      changes: [
        { fieldLabel: 'Khoản thu nợ (-)', before: '0 VNĐ', after: '-200.000 VNĐ' },
        { fieldLabel: 'Dư nợ còn lại', before: '500.000 VNĐ', after: '300.000 VNĐ' },
      ],
    },
    {
      id: `log-init-7`,
      timestamp: new Date(now - 86400000 * 0.05).toISOString(),
      action: 'GUEST_LOOKUP',
      actor: 'Khách: Bạn Hùng',
      title: 'Khách tra cứu sổ nợ',
      description: 'Khách "Bạn Hùng" đã nhập mã tra cứu (PIN: 112233) để xem bảng đối soát công nợ. Dư nợ hiện thời: 450.000 VNĐ (3 giao dịch).',
      debtorName: 'Bạn Hùng',
      amount: 450000,
      beforeState: 'Trạng thái: Khách chưa đăng nhập tra cứu',
      afterState: 'Đã nhập đúng mã PIN (112233), xem đối soát nợ 450.000 VNĐ',
      changes: [
        { fieldLabel: 'Mã PIN xác thực', before: 'Chưa nhập', after: 'Khớp mã hợp lệ (112233)' },
        { fieldLabel: 'Dư nợ đối soát', before: '-', after: '450.000 VNĐ (3 giao dịch)' },
      ],
    },
  ];
}

export function isAutoSyncAuditLog(log: Partial<AuditLog> | null | undefined): boolean {
  if (!log || typeof log !== 'object') return false;
  if (log.action === 'SYNC_SHEETS') {
    return true;
  }
  const titleLower = (log.title || '').toLowerCase();
  if (titleLower.includes('đồng bộ google sheets (apps script)')) {
    return true;
  }
  const meta = (log.metadata || {}) as Record<string, any>;
  if (meta.isAutoSync === true || meta.autoSync === true || meta.source === 'auto-sync') {
    return true;
  }
  if (log.action === 'CLOUD_SYNC') {
    const text = `${log.title || ''} ${log.description || ''}`.toLowerCase();
    if (
      text.includes('tự động') ||
      text.includes('đồng bộ ngầm') ||
      text.includes('auto-sync') ||
      text.includes('autosync')
    ) {
      return true;
    }
  }
  return false;
}

export function loadAuditLogs(): AuditLog[] {
  try {
    const isCleared = localStorage.getItem(STORAGE_KEYS.AUDIT_LOGS_CLEARED);
    if (isCleared === 'true') {
      const raw = localStorage.getItem(STORAGE_KEYS.AUDIT_LOGS);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((item) => !isAutoSyncAuditLog(item)) : [];
    }

    const raw = localStorage.getItem(STORAGE_KEYS.AUDIT_LOGS);
    if (!raw) {
      const initialLogs = generateInitialAuditLogs();
      saveAuditLogs(initialLogs);
      return initialLogs;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item) => !isAutoSyncAuditLog(item)) : [];
  } catch (err) {
    console.error('Failed to load audit logs:', err);
    return [];
  }
}

export function saveAuditLogs(logs: AuditLog[]): void {
  try {
    // Keep max 500 most recent logs locally for thorough audit trail without exceeding storage quota
    const trimmed = logs.slice(0, 500);
    safeSetItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(trimmed));
  } catch (err) {
    console.warn('[Storage] Failed to save audit logs:', err);
  }
}

export function getAuditEnvironmentContext(): Record<string, any> {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { environment: 'Server / Node' };
  }
  try {
    const ua = navigator.userAgent || '';

    // 1. OS & Device detection
    let osName = 'Không rõ OS';
    let deviceType = 'Máy tính';
    if (/iPhone/i.test(ua)) {
      const ver = ua.match(/OS (\d+[_.]\d+(?:[_.]\d+)?)/i)?.[1]?.replace(/_/g, '.');
      osName = ver ? `iOS ${ver} (iPhone)` : 'iOS (iPhone)';
      deviceType = 'Điện thoại';
    } else if (/iPad/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
      const ver = ua.match(/OS (\d+[_.]\d+(?:[_.]\d+)?)/i)?.[1]?.replace(/_/g, '.');
      osName = ver ? `iPadOS ${ver}` : 'iPadOS (iPad)';
      deviceType = 'Máy tính bảng';
    } else if (/Android/i.test(ua)) {
      const ver = ua.match(/Android\s+([0-9.]+)/i)?.[1];
      const model = ua.match(/Android[^;)]+;\s*([^;)]+?)\s*(?:Build|\))/i)?.[1]?.trim();
      osName = `Android${ver ? ` ${ver}` : ''}${model && model !== 'K' ? ` (${model})` : ''}`;
      deviceType = /Mobile/i.test(ua) ? 'Điện thoại' : 'Máy tính bảng';
    } else if (/Mac OS X/i.test(ua)) {
      const ver = ua.match(/Mac OS X (\d+[_.]\d+)/i)?.[1]?.replace(/_/g, '.');
      osName = ver ? `macOS ${ver}` : 'macOS';
    } else if (/Windows NT/i.test(ua)) {
      const nt = ua.match(/Windows NT ([0-9.]+)/i)?.[1];
      osName = nt === '10.0' ? 'Windows 10/11' : `Windows${nt ? ` (${nt})` : ''}`;
    } else if (/Linux/i.test(ua)) {
      osName = 'Linux';
    }

    // 2. Browser detection
    let browserName = 'Trình duyệt';
    if (/Zalo/i.test(ua)) browserName = 'Zalo In-App Browser';
    else if (/FBAN|FBAV/i.test(ua)) browserName = 'Facebook In-App Browser';
    else if (/coc_coc_browser/i.test(ua)) browserName = 'Cốc Cốc';
    else if (/Edg(?:A|iOS)?\/([0-9]+)/i.test(ua)) {
      const v = ua.match(/Edg(?:A|iOS)?\/([0-9]+)/i)?.[1];
      browserName = v ? `Edge ${v}` : 'Edge';
    } else if (/CriOS\/([0-9]+)/i.test(ua)) {
      const v = ua.match(/CriOS\/([0-9]+)/i)?.[1];
      browserName = v ? `Chrome iOS ${v}` : 'Chrome iOS';
    } else if (/Chrome\/([0-9]+)/i.test(ua)) {
      const v = ua.match(/Chrome\/([0-9]+)/i)?.[1];
      browserName = v ? `Chrome ${v}` : 'Chrome';
    } else if (/FxiOS\/([0-9]+)|Firefox\/([0-9]+)/i.test(ua)) {
      const m = ua.match(/(?:FxiOS|Firefox)\/([0-9]+)/i)?.[1];
      browserName = m ? `Firefox ${m}` : 'Firefox';
    } else if (/Safari\//i.test(ua)) {
      const v = ua.match(/Version\/([0-9.]+)/i)?.[1];
      browserName = v ? `Safari ${v}` : 'Safari';
    }

    const isStandalone =
      (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) ||
      (navigator as any).standalone === true;

    // 3. Timezone & Screen & Network
    let timezone = '';
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const offsetMin = -new Date().getTimezoneOffset();
      const sign = offsetMin >= 0 ? '+' : '-';
      const absH = Math.floor(Math.abs(offsetMin) / 60);
      const absM = Math.abs(offsetMin) % 60;
      const utcLabel = absM > 0 ? `UTC${sign}${absH}:${String(absM).padStart(2, '0')}` : `UTC${sign}${absH}`;
      timezone = tz ? `${tz} (${utcLabel})` : utcLabel;
    } catch {
      timezone = '';
    }

    const dpr = typeof window.devicePixelRatio === 'number' ? Math.round(window.devicePixelRatio * 10) / 10 : 1;
    const screenResolution =
      window.screen?.width && window.screen?.height
        ? `${window.screen.width}×${window.screen.height}${dpr > 1 ? ` (${dpr}x)` : ''}`
        : undefined;

    const conn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
    let networkInfo = navigator.onLine ? 'Trực tuyến' : 'Ngoại tuyến';
    if (conn) {
      const netParts: string[] = [];
      if (conn.type && conn.type !== 'unknown') netParts.push(String(conn.type).toUpperCase());
      if (conn.effectiveType) netParts.push(String(conn.effectiveType).toUpperCase());
      if (typeof conn.downlink === 'number' && conn.downlink > 0) netParts.push(`${conn.downlink} Mbps`);
      if (typeof conn.rtt === 'number' && conn.rtt > 0) netParts.push(`RTT ${conn.rtt}ms`);
      if (netParts.length > 0) {
        networkInfo = `${navigator.onLine ? 'Online' : 'Offline'} (${netParts.join(' · ')})`;
      }
    }

    const touchPoints = typeof navigator.maxTouchPoints === 'number' ? navigator.maxTouchPoints : 0;
    const touchSupport = touchPoints > 0 ? `Cảm ứng (${touchPoints} điểm)` : 'Chuột / Bàn phím';

    const hwParts: string[] = [];
    if (typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency > 0) {
      hwParts.push(`${navigator.hardwareConcurrency} nhân CPU`);
    }
    if (typeof (navigator as any).deviceMemory === 'number' && (navigator as any).deviceMemory > 0) {
      hwParts.push(`${(navigator as any).deviceMemory} GB RAM`);
    }

    const pageOrigin = `${window.location.origin}${window.location.pathname}`;

    return {
      device: `${osName} · ${browserName}`,
      deviceType,
      osName,
      browserName,
      appMode: isStandalone ? 'PWA (Đã cài đặt)' : 'Trình duyệt Web',
      viewport: `${window.innerWidth}×${window.innerHeight}`,
      ...(screenResolution ? { screenResolution } : {}),
      ...(timezone ? { timezone } : {}),
      ...(navigator.language ? { language: navigator.language } : {}),
      networkInfo,
      online: navigator.onLine,
      touchSupport,
      ...(hwParts.length > 0 ? { hardwareSummary: hwParts.join(' · ') } : {}),
      pageOrigin,
      ...(document.referrer ? { referrer: document.referrer.slice(0, 120) } : {}),
    };
  } catch {
    return {};
  }
}

let pendingRemoteAuditLogs: AuditLog[] = [];
let remoteAuditPushTimer: ReturnType<typeof setTimeout> | null = null;

export function flushPendingAuditLogs(useKeepAlive = false): void {
  if (typeof window === 'undefined' || pendingRemoteAuditLogs.length === 0) return;
  const batch = pendingRemoteAuditLogs.splice(0, 50);
  if (remoteAuditPushTimer) {
    clearTimeout(remoteAuditPushTimer);
    remoteAuditPushTimer = null;
  }

  try {
    const bodyStr = JSON.stringify({ logs: batch });
    const allowKeepAlive = useKeepAlive && bodyStr.length < 48000;
    fetch('/api/audit-logs/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: bodyStr,
      keepalive: allowKeepAlive,
    }).catch(() => {
      // ignore offline or transient errors
    });
  } catch {
    // ignore
  }
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('pagehide', () => flushPendingAuditLogs(true));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushPendingAuditLogs(true);
    }
  });
}

function queueRemoteAuditLogPush(log: AuditLog): void {
  if (typeof window === 'undefined') return;
  if (!log.id || log.id.startsWith('log-init-')) return;

  pendingRemoteAuditLogs.push(log);
  const isUrgent =
    log.action === 'AUTO_LOCK' ||
    log.action === 'LOGOUT' ||
    log.action === 'GUEST_LOOKUP' ||
    log.action === 'LOOKUP_FAILED' ||
    log.action === 'GUEST_REPORT' ||
    log.action === 'LOGIN_SUCCESS' ||
    log.action === 'LOGIN_FAILED' ||
    log.action === 'BIOMETRIC_AUTH';

  if (isUrgent) {
    flushPendingAuditLogs(true);
    return;
  }

  if (!remoteAuditPushTimer) {
    remoteAuditPushTimer = setTimeout(() => {
      remoteAuditPushTimer = null;
      flushPendingAuditLogs(false);
    }, 650);
  }
}

export function parseAuditTimestampMs(ts?: unknown, id?: string): number | null {
  if (typeof ts === 'number' && Number.isFinite(ts) && ts > 0) {
    return ts;
  }
  if (typeof ts === 'string') {
    const trimmed = ts.trim();
    if (trimmed) {
      // 1. Standard ISO 8601 / RFC starting with YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
        const parsedIso = Date.parse(trimmed);
        if (!Number.isNaN(parsedIso)) return parsedIso;
      }

      // 2. Vietnamese locale formats from Google Sheets: "HH:mm:ss dd/MM/yyyy" or "dd/MM/yyyy, HH:mm:ss"
      const timeFirst = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*[, ]?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (timeFirst) {
        const [, hh, mm, ss = '0', dd, mo, yyyy] = timeFirst;
        const d = new Date(Number(yyyy), Number(mo) - 1, Number(dd), Number(hh), Number(mm), Number(ss)).getTime();
        if (!Number.isNaN(d)) return d;
      }

      const dateFirst = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[\s,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
      if (dateFirst) {
        const [, dd, mo, yyyy, hh = '0', mm = '0', ss = '0'] = dateFirst;
        const d = new Date(Number(yyyy), Number(mo) - 1, Number(dd), Number(hh), Number(mm), Number(ss)).getTime();
        if (!Number.isNaN(d)) return d;
      }

      // 3. Fallback native Date.parse for non-dd/MM strings (e.g. "Sat Nov 21 2026 ...")
      if (!/^\d{1,2}\/\d{1,2}\/\d{4}/.test(trimmed)) {
        const parsed = Date.parse(trimmed);
        if (!Number.isNaN(parsed)) return parsed;
      }
    }
  }

  // 4. Fallback: extract exact millisecond timestamp embedded in log ID ("log-<ms>-...")
  if (typeof id === 'string') {
    const idMatch = id.match(/^log-(\d{10,15})-/);
    if (idMatch) {
      const ms = Number(idMatch[1]);
      if (Number.isFinite(ms) && ms > 0) return ms;
    }
  }

  return null;
}

export function recordAuditLog(
  log: Omit<AuditLog, 'id' | 'timestamp'> & { timestamp?: string },
  options?: { skipRemoteSync?: boolean }
): AuditLog {
  let ts = log.timestamp || new Date().toISOString();
  try {
    const clearedAtStr = localStorage.getItem(STORAGE_KEYS.AUDIT_LOGS_CLEARED_AT);
    const clearedMs = parseAuditTimestampMs(clearedAtStr);
    const tsMs = parseAuditTimestampMs(ts);
    if (clearedMs && tsMs !== null && tsMs <= clearedMs) {
      ts = new Date(clearedMs + 1).toISOString();
    }
  } catch {
    // ignore
  }

  const envContext = getAuditEnvironmentContext();
  let localTimeStr = ts;
  try {
    localTimeStr = new Date(ts).toLocaleString('vi-VN');
  } catch {
    // ignore
  }

  const newLog: AuditLog = {
    ...log,
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: ts,
    metadata: {
      recordedAtLocal: localTimeStr,
      ...envContext,
      ...(log.metadata || {}),
    },
  };

  if (isAutoSyncAuditLog(newLog)) {
    return newLog;
  }

  try {
    const currentLogs = loadAuditLogs();
    const updated = [newLog, ...currentLogs];
    saveAuditLogs(updated);
    // Mark as initialized/active so it won't revert to initial sample data
    safeSetItem(STORAGE_KEYS.AUDIT_LOGS_CLEARED, 'true');

    // Dispatch custom browser event so any open UI updates immediately
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('audit-log-recorded', { detail: newLog }));
    }

    if (!options?.skipRemoteSync) {
      queueRemoteAuditLogPush(newLog);
    }
  } catch (err) {
    console.warn('Could not record audit log:', err);
  }

  return newLog;
}

export function mergeRemoteAuditLogs(
  remoteLogs: AuditLog[],
  options?: { includeCleared?: boolean; serverClearedAt?: string }
): { logs: AuditLog[]; newCount: number; hiddenByClearCount: number } {
  const includeCleared = Boolean(options?.includeCleared);
  let clearedAtMs = 0;
  try {
    if (includeCleared) {
      localStorage.removeItem(STORAGE_KEYS.AUDIT_LOGS_CLEARED_AT);
    } else {
      const localClearedStr = localStorage.getItem(STORAGE_KEYS.AUDIT_LOGS_CLEARED_AT) || '';
      const localClearedMs = parseAuditTimestampMs(localClearedStr) || 0;
      const serverClearedMs = parseAuditTimestampMs(options?.serverClearedAt) || 0;
      clearedAtMs = Math.max(localClearedMs, serverClearedMs);
      if (serverClearedMs > localClearedMs && serverClearedMs > 0) {
        safeSetItem(STORAGE_KEYS.AUDIT_LOGS_CLEARED_AT, new Date(serverClearedMs).toISOString());
      }
    }
  } catch {
    clearedAtMs = 0;
  }

  const currentLocal = loadAuditLogs().filter((l) => {
    if (!l.id || l.id.startsWith('log-init-') || isAutoSyncAuditLog(l)) return false;
    if (!includeCleared && clearedAtMs > 0) {
      const lMs = parseAuditTimestampMs(l.timestamp, l.id);
      if (lMs === null || lMs <= clearedAtMs) return false;
    }
    return true;
  });
  const existingIds = new Set(currentLocal.map((l) => l.id));
  const mergedMap = new Map<string, AuditLog>();

  for (const l of currentLocal) {
    mergedMap.set(l.id, l);
  }

  let newCount = 0;
  let hiddenByClearCount = 0;
  for (const r of remoteLogs) {
    if (!r || !r.id || r.id.startsWith('log-init-') || isAutoSyncAuditLog(r)) continue;
    const rMs = parseAuditTimestampMs(r.timestamp, r.id);
    if (!includeCleared && clearedAtMs > 0 && (rMs === null || rMs <= clearedAtMs)) {
      hiddenByClearCount++;
      continue;
    }
    if (!existingIds.has(r.id)) {
      newCount++;
    }
    mergedMap.set(r.id, rMs !== null && !/^\d{4}-\d{2}-\d{2}T/.test(r.timestamp || '') ? { ...r, timestamp: new Date(rMs).toISOString() } : r);
  }

  const merged = Array.from(mergedMap.values())
    .sort((a, b) => {
      const msA = parseAuditTimestampMs(a.timestamp, a.id) ?? -Infinity;
      const msB = parseAuditTimestampMs(b.timestamp, b.id) ?? -Infinity;
      if (msB !== msA) return msB - msA;
      return (b.timestamp || '').localeCompare(a.timestamp || '');
    })
    .slice(0, 500);

  if (merged.length > 0 || localStorage.getItem(STORAGE_KEYS.AUDIT_LOGS_CLEARED) === 'true' || clearedAtMs > 0) {
    saveAuditLogs(merged);
    safeSetItem(STORAGE_KEYS.AUDIT_LOGS_CLEARED, 'true');
  }

  return { logs: merged, newCount, hiddenByClearCount };
}

export function clearAuditLogs(clearedAtIso?: string): string {
  const effectiveIso = clearedAtIso || new Date().toISOString();
  try {
    // Cancel any queued logs from before clearing so they never resurrect on the server afterwards
    pendingRemoteAuditLogs = [];
    if (remoteAuditPushTimer) {
      clearTimeout(remoteAuditPushTimer);
      remoteAuditPushTimer = null;
    }

    safeSetItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify([]));
    safeSetItem(STORAGE_KEYS.AUDIT_LOGS_CLEARED, 'true');
    safeSetItem(STORAGE_KEYS.AUDIT_LOGS_CLEARED_AT, effectiveIso);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('audit-logs-cleared'));
    }
  } catch {
    // ignore
  }
  return effectiveIso;
}

