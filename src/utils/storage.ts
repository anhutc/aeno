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
  localStorage.setItem(STORAGE_KEYS.DEBTORS, JSON.stringify(debtors));
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
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Failed to load transactions', err);
    return [];
  }
}

export function saveTransactions(txs: Transaction[]): void {
  localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(txs));
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
  localStorage.setItem(STORAGE_KEYS.PARTIES, JSON.stringify(parties));
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (!raw) {
      saveSettings(DEFAULT_SETTINGS);
      return DEFAULT_SETTINGS;
    }
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      ownerPhone: parsed.ownerPhone !== undefined ? parsed.ownerPhone : (DEFAULT_SETTINGS.ownerPhone || ''),
    };
  } catch (err) {
    console.error('Failed to load settings', err);
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
}

export function resetAllData(): void {
  localStorage.removeItem(STORAGE_KEYS.DEBTORS);
  localStorage.removeItem(STORAGE_KEYS.TRANSACTIONS);
  localStorage.removeItem(STORAGE_KEYS.PARTIES);
  localStorage.removeItem(STORAGE_KEYS.SETTINGS);
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
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
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
