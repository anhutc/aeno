/**
 * ============================================================================
 * GHI CHÚ CHỈNH SỬA / CHANGELOG:
 * - loadDebtors: Tự động loại bỏ trường 'phone' nếu người dùng còn lưu dữ liệu cũ
 *   trong LocalStorage để bảo đảm danh sách người nợ hoàn toàn không còn số điện thoại.
 * - loadSettings: Hỗ trợ nạp và khởi tạo 'ownerPhone' (số điện thoại của Chủ Nợ).
 * ============================================================================
 */

import { Debtor, Transaction, PartySplit, AppSettings } from '../types';
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

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (!raw) {
      saveSettings(DEFAULT_SETTINGS);
      return DEFAULT_SETTINGS;
    }
    if (raw === _cachedSettingsRaw && _cachedSettingsObj) {
      return _cachedSettingsObj;
    }
    const parsed = JSON.parse(raw);
    const stripMemoLine = (text: string | undefined, defaultText: string) => {
      if (!text) return defaultText;
      return text
        .split('\n')
        .filter((l) => !l.toLowerCase().includes('nội dung chuyển khoản') && !l.toLowerCase().includes('noi dung chuyen khoan'))
        .join('\n');
    };
    const { reminderMessageTemplate, ...restParsed } = parsed;
    const result: AppSettings = {
      ...DEFAULT_SETTINGS,
      ...restParsed,
      defaultMemoPrefix: '',
      ownerPhone: parsed.ownerPhone !== undefined ? parsed.ownerPhone : (DEFAULT_SETTINGS.ownerPhone || ''),
      lookupGuideTemplate: stripMemoLine(parsed.lookupGuideTemplate || parsed.shareMessageTemplate, DEFAULT_SETTINGS.lookupGuideTemplate || ''),
    };
    _cachedSettingsRaw = raw;
    _cachedSettingsObj = result;
    return result;
  } catch (err) {
    console.error('Failed to load settings', err);
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): void {
  try {
    const { reminderMessageTemplate, ...cleanedSettings } = settings as any;
    const serialized = JSON.stringify(cleanedSettings);
    _cachedSettingsRaw = serialized;
    _cachedSettingsObj = { ...settings };
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
    sessionStorage.clear();

    // Reset URL và xóa hash/query để người khác không ấn Back xem lại được
    window.history.replaceState(null, '', window.location.pathname);
  } catch (err) {
    console.warn('[Storage] Deep clean session error:', err);
  }
}

