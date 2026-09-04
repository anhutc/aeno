/**
 * ============================================================================
 * GHI CHÚ CHỈNH SỬA / CHANGELOG:
 * - Xóa số điện thoại người nợ: Khi lưu thông tin người nợ (apiSaveDebtor), không
 *   còn lưu trường phone.
 * - Thay đổi cơ chế xác thực chủ sổ: Bắt buộc nhập lại mật khẩu quản lý mỗi khi tải lại trang.
 * ============================================================================
 */

import { Debtor, Transaction, PartySplit, AppSettings } from '../types';
import {
  INITIAL_DEBTORS,
  INITIAL_TRANSACTIONS,
  INITIAL_PARTIES,
} from '../data/mockData';
import {
  loadDebtors,
  loadTransactions,
  loadParties,
  loadSettings,
  saveDebtors,
  saveTransactions,
  saveParties,
  saveSettings,
  markSampleDataCleared,
  getDeletedTxIds,
  markTxDeleted,
  unmarkTxDeleted,
  getDeletedDebtorIds,
  markDebtorDeleted,
  unmarkDebtorDeleted,
  getDeletedPartyIds,
  markPartyDeleted,
  unmarkPartyDeleted,
} from './storage';
import {
  getClientFirebaseConfig,
  loadDataFromFirestoreDirect,
  saveDebtorDirect,
  deleteDebtorDirect,
  saveTransactionDirect,
  deleteTransactionDirect,
  savePartyDirect,
  deletePartyDirect,
  updatePartyDirect,
  saveSettingsDirect,
  guestLookupDirect,
  guestReportPaymentDirect,
  testFirestoreDirectConnection,
  setClientCustomDatabaseId,
  syncAllToFirestoreDirect,
  clearAllFirestoreDirect,
  loadPresetDirect,
  subscribeToFirestoreData,
} from '../services/firestoreClient';

export { subscribeToFirestoreData };

const OWNER_TOKEN_KEY = 'debt_app_owner_token';

// In-memory token storage ONLY (không lưu vào sessionStorage/localStorage để bắt buộc nhập lại mật khẩu khi reload trang)
let memoryOwnerToken: string | null = null;

// Xóa sạch token tồn dư cũ trong sessionStorage/localStorage khi khởi tạo
try {
  if (typeof window !== 'undefined') {
    window.sessionStorage?.removeItem(OWNER_TOKEN_KEY);
    window.localStorage?.removeItem(OWNER_TOKEN_KEY);
    // Lắng nghe sự kiện trước khi reload/đóng tab để xóa token bộ nhớ
    window.addEventListener('beforeunload', () => {
      memoryOwnerToken = null;
    });
  }
} catch {
  // ignore
}

export function getStoredOwnerToken(): string | null {
  // Chỉ lấy từ bộ nhớ RAM trong phiên hiện tại, reload trang sẽ trả về null
  return memoryOwnerToken;
}

export function setStoredOwnerToken(token: string): void {
  // Chỉ lưu vào biến bộ nhớ tạm thời, tuyệt đối không lưu vào sessionStorage/localStorage
  memoryOwnerToken = token;
}

export function removeStoredOwnerToken(): void {
  memoryOwnerToken = null;
  try {
    if (typeof window !== 'undefined') {
      window.sessionStorage?.removeItem(OWNER_TOKEN_KEY);
      window.localStorage?.removeItem(OWNER_TOKEN_KEY);
    }
  } catch {
    // ignore
  }
}

function getAuthHeaders(): HeadersInit {
  const token = getStoredOwnerToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}`, 'x-owner-token': token } : {}),
  };
}

export async function loginOwner(password: string): Promise<{ success: boolean; message?: string }> {
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.token) {
        setStoredOwnerToken(data.token);
        return { success: true };
      }
    }
  } catch {
    // ignore server error
  }

  // Fallback: Check local settings
  const settings = loadSettings();
  if (password === (settings.ownerPassword || '123456')) {
    setStoredOwnerToken('local-owner-session');
    return { success: true };
  }
  return { success: false, message: 'Mật khẩu quản trị không chính xác' };
}

export function smartMergeTransactions(remoteTxs: Transaction[], _localTxs?: Transaction[]): Transaction[] {
  // Remote is the authoritative list when connected to server/Firestore
  return [...remoteTxs].sort(
    (a, b) => new Date(b.date || b.createdAt).getTime() - new Date(a.date || a.createdAt).getTime()
  );
}

export function smartMergeDebtors(remoteDebtors: Debtor[], _localDebtors?: Debtor[]): Debtor[] {
  // Remote is the authoritative list when connected to server/Firestore
  return [...remoteDebtors];
}

export function smartMergeParties(remoteParties: PartySplit[], _localParties?: PartySplit[]): PartySplit[] {
  return [...remoteParties];
}

export async function fetchOwnerData(): Promise<{
  debtors: Debtor[];
  transactions: Transaction[];
  parties: PartySplit[];
  settings: AppSettings;
}> {
  // 1. Try server API
  try {
    const res = await fetch('/api/owner/data', {
      headers: getAuthHeaders(),
    });
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const data = await res.json();
      if (data.success) {
        const finalDebtors = data.debtors || [];
        const finalTransactions = smartMergeTransactions(data.transactions || []);
        const finalParties = data.parties || [];
        const finalSettings = data.settings || loadSettings();

        saveDebtors(finalDebtors);
        saveTransactions(finalTransactions);
        saveParties(finalParties);
        saveSettings(finalSettings);
        return {
          debtors: finalDebtors,
          transactions: finalTransactions,
          parties: finalParties,
          settings: finalSettings,
        };
      }
    } else {
      // If unauthenticated or guest, still fetch public server settings to keep UI updated
      try {
        const sRes = await fetch('/api/settings');
        if (sRes.ok) {
          const sData = await sRes.json();
          if (sData.success && sData.settings) {
            saveSettings(sData.settings);
          }
        }
      } catch {
        // ignore
      }
    }
  } catch (err) {
    console.warn('Server API unavailable, connecting directly to Cloud Firestore:', err);
  }

  // 2. Direct Cloud Firestore fallback (ideal for Vercel, Netlify, or static deploy)
  try {
    const remoteData = await loadDataFromFirestoreDirect();
    if (remoteData) {
      const finalDebtors = remoteData.debtors || [];
      const finalTransactions = smartMergeTransactions(remoteData.transactions || []);
      const finalParties = remoteData.parties || [];
      const finalSettings = remoteData.settings || loadSettings();

      saveDebtors(finalDebtors);
      saveTransactions(finalTransactions);
      saveParties(finalParties);
      saveSettings(finalSettings);
      return {
        debtors: finalDebtors,
        transactions: finalTransactions,
        parties: finalParties,
        settings: finalSettings,
      };
    }
  } catch (err) {
    console.warn('Direct Cloud Firestore fallback failed, using local cache:', err);
  }

  // 3. Local storage fallback
  return {
    debtors: loadDebtors(),
    transactions: loadTransactions(),
    parties: loadParties(),
    settings: loadSettings(),
  };
}

export async function apiSaveDebtor(
  debtor: Omit<Debtor, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
): Promise<{ success: boolean; debtor?: Debtor; debtors?: Debtor[]; message?: string }> {
  const targetId = debtor.id || `debtor-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  unmarkDebtorDeleted(targetId);

  try {
    const res = await fetch('/api/owner/debtor', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ ...debtor, id: targetId }),
    });
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const data = await res.json();
      if (data.success) {
        const mergedDebtors = data.debtors ? smartMergeDebtors(data.debtors) : loadDebtors();
        saveDebtors(mergedDebtors);
        if (data.debtor) {
          await saveDebtorDirect(data.debtor).catch((err) => console.warn('Direct saveDebtor sync:', err));
        }
        return { success: true, debtor: data.debtor, debtors: mergedDebtors };
      }
    }
  } catch {
    // ignore
  }

  // Direct Firestore fallback
  try {
    const allDebtors = loadDebtors();
    const existingIndex = allDebtors.findIndex((d) => d.id === targetId);
    const now = new Date().toISOString();
    const savedDebtor: Debtor = {
      id: targetId,
      name: debtor.name,
      note: debtor.note,
      pin: debtor.pin,
      createdAt: existingIndex >= 0 ? allDebtors[existingIndex].createdAt : now,
      updatedAt: now,
    };
    if (existingIndex >= 0) {
      allDebtors[existingIndex] = savedDebtor;
    } else {
      allDebtors.push(savedDebtor);
    }
    saveDebtors(allDebtors);
    await saveDebtorDirect(savedDebtor).catch((err) => console.warn('Direct saveDebtor warning:', err));
    return { success: true, debtor: savedDebtor, debtors: allDebtors };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Lỗi khi lưu thông tin người nợ' };
  }
}

export async function apiDeleteDebtor(
  id: string
): Promise<{ success: boolean; debtors?: Debtor[]; transactions?: Transaction[] }> {
  markDebtorDeleted(id);
  const currentTxs = loadTransactions();
  currentTxs.filter((t) => t.debtorId === id).forEach((t) => markTxDeleted(t.id));

  try {
    const res = await fetch(`/api/owner/debtor/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const data = await res.json();
      if (data.success) {
        const filteredDebtors = (data.debtors || []).filter((d: Debtor) => d.id !== id);
        const filteredTxs = (data.transactions || []).filter((t: Transaction) => t.debtorId !== id);
        saveDebtors(filteredDebtors);
        saveTransactions(filteredTxs);
        await deleteDebtorDirect(id).catch((err) => console.warn('Direct deleteDebtor sync:', err));
        return { success: true, debtors: filteredDebtors, transactions: filteredTxs };
      }
    }
  } catch {
    // ignore
  }

  // Direct fallback
  const allDebtors = loadDebtors().filter((d) => d.id !== id);
  const allTxs = loadTransactions().filter((t) => t.debtorId !== id);
  saveDebtors(allDebtors);
  saveTransactions(allTxs);
  await deleteDebtorDirect(id).catch((err) => console.warn('Direct deleteDebtor warning:', err));
  return { success: true, debtors: allDebtors, transactions: allTxs };
}

export async function apiSaveTransaction(
  tx: Omit<Transaction, 'id' | 'createdAt'>
): Promise<{ success: boolean; transaction?: Transaction; transactions?: Transaction[]; message?: string }> {
  const newId = `tx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  unmarkTxDeleted(newId);

  const localNewTx: Transaction = {
    ...tx,
    id: newId,
    createdAt: new Date().toISOString(),
  };

  // Immediate optimistic local update to guarantee responsiveness
  const currentLocal = loadTransactions();
  currentLocal.unshift(localNewTx);
  saveTransactions(currentLocal);

  try {
    const res = await fetch('/api/owner/transaction', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(localNewTx),
    });
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const data = await res.json();
      if (data.success) {
        const merged = smartMergeTransactions(data.transactions || currentLocal);
        saveTransactions(merged);
        if (data.transaction) {
          await saveTransactionDirect(data.transaction).catch((err) => console.warn('Direct saveTx sync:', err));
        } else {
          await saveTransactionDirect(localNewTx).catch((err) => console.warn('Direct saveTx sync:', err));
        }
        return { success: true, transaction: data.transaction || localNewTx, transactions: merged };
      }
    }
  } catch {
    // ignore
  }

  // Direct Firestore fallback
  try {
    await saveTransactionDirect(localNewTx).catch((err) => console.warn('Direct saveTransaction warning:', err));
    return { success: true, transaction: localNewTx, transactions: currentLocal };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Lỗi khi lưu giao dịch' };
  }
}

export async function apiUpdateTransaction(
  tx: Transaction
): Promise<{ success: boolean; transaction?: Transaction; transactions?: Transaction[]; message?: string }> {
  unmarkTxDeleted(tx.id);

  // Optimistic local update
  const allTxs = loadTransactions();
  const idx = allTxs.findIndex((t) => t.id === tx.id);
  if (idx !== -1) {
    allTxs[idx] = tx;
  } else {
    allTxs.unshift(tx);
  }
  saveTransactions(allTxs);

  try {
    const res = await fetch(`/api/owner/transaction/${tx.id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(tx),
    });
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const data = await res.json();
      if (data.success) {
        const merged = smartMergeTransactions(data.transactions || allTxs);
        saveTransactions(merged);
        if (data.transaction) {
          await saveTransactionDirect(data.transaction).catch((err) => console.warn('Direct updateTx sync:', err));
        } else {
          await saveTransactionDirect(tx).catch((err) => console.warn('Direct updateTx sync:', err));
        }
        return { success: true, transaction: data.transaction || tx, transactions: merged };
      }
    }
  } catch {
    // ignore
  }

  // Direct fallback
  try {
    await saveTransactionDirect(tx).catch((err) => console.warn('Direct updateTx warning:', err));
    return { success: true, transaction: tx, transactions: allTxs };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Lỗi khi cập nhật giao dịch' };
  }
}

export async function apiDeleteTransaction(
  id: string
): Promise<{ success: boolean; transactions?: Transaction[] }> {
  markTxDeleted(id);
  const allTxs = loadTransactions().filter((t) => t.id !== id);
  saveTransactions(allTxs);

  try {
    const res = await fetch(`/api/owner/transaction/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const data = await res.json();
      if (data.success) {
        const filtered = (data.transactions || []).filter((t: Transaction) => t.id !== id);
        saveTransactions(filtered);
        await deleteTransactionDirect(id).catch((err) => console.warn('Direct deleteTx sync:', err));
        return { success: true, transactions: filtered };
      }
    }
  } catch {
    // ignore
  }

  await deleteTransactionDirect(id).catch((err) => console.warn('Direct deleteTransaction warning:', err));
  return { success: true, transactions: allTxs };
}

export async function apiSavePartySplit(
  party: Omit<PartySplit, 'id' | 'createdAt'>,
  transactions: Omit<Transaction, 'id' | 'createdAt'>[]
): Promise<{ success: boolean; parties?: PartySplit[]; transactions?: Transaction[]; message?: string }> {
  const partyId = `party-${Date.now()}`;
  unmarkPartyDeleted(partyId);

  const createdTxs: Transaction[] = transactions.map((t, idx) => {
    const txId = `tx-party-${Date.now()}-${idx}`;
    unmarkTxDeleted(txId);
    return {
      ...t,
      id: txId,
      partyId,
      createdAt: new Date().toISOString(),
    };
  });

  const newParty: PartySplit = {
    ...party,
    id: partyId,
    createdAt: new Date().toISOString(),
  };

  const allParties = loadParties();
  allParties.unshift(newParty);
  const updatedTxs = [...createdTxs, ...loadTransactions()];
  saveParties(allParties);
  saveTransactions(updatedTxs);

  try {
    const res = await fetch('/api/owner/party-split', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ party: newParty, transactions: createdTxs }),
    });
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const data = await res.json();
      if (data.success) {
        const mergedParties = data.parties || allParties;
        const mergedTxs = smartMergeTransactions(data.transactions || updatedTxs);
        saveParties(mergedParties);
        saveTransactions(mergedTxs);
        await savePartyDirect(newParty, createdTxs).catch((err) => console.warn('Direct saveParty sync:', err));
        return { success: true, parties: mergedParties, transactions: mergedTxs };
      }
    }
  } catch {
    // ignore
  }

  // Direct fallback
  try {
    await savePartyDirect(newParty, createdTxs).catch((err) => console.warn('Direct saveParty warning:', err));
    return { success: true, parties: allParties, transactions: updatedTxs };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Lỗi khi lưu chia tiền' };
  }
}

export async function apiDeletePartySplit(
  partyId: string
): Promise<{ success: boolean; parties?: PartySplit[]; transactions?: Transaction[]; message?: string }> {
  markPartyDeleted(partyId);
  const currentTxs = loadTransactions();
  currentTxs.filter((t) => t.partyId === partyId).forEach((t) => markTxDeleted(t.id));

  // 1. Optimistic update local storage
  const currentParties = loadParties().filter((p) => p.id !== partyId);
  const filteredTxs = currentTxs.filter((t) => t.partyId !== partyId);
  saveParties(currentParties);
  saveTransactions(filteredTxs);

  // 2. Try server API
  try {
    const res = await fetch(`/api/owner/party-split/${partyId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const data = await res.json();
      if (data.success) {
        const finalParties = (data.parties || []).filter((p: PartySplit) => p.id !== partyId);
        const finalTxs = (data.transactions || []).filter((t: Transaction) => t.partyId !== partyId);
        saveParties(finalParties);
        saveTransactions(finalTxs);
        await deletePartyDirect(partyId).catch((err) => console.warn('Direct deleteParty sync:', err));
        return { success: true, parties: finalParties, transactions: finalTxs };
      }
    }
  } catch {
    // ignore
  }

  // 3. Fallback direct Firestore sync
  await deletePartyDirect(partyId).catch((err) => console.warn('Direct deleteParty warning:', err));
  return { success: true, parties: currentParties, transactions: filteredTxs };
}

export async function apiUpdatePartySplit(
  partyId: string,
  party: Omit<PartySplit, 'id' | 'createdAt'>,
  transactions: Omit<Transaction, 'id' | 'createdAt'>[]
): Promise<{ success: boolean; parties?: PartySplit[]; transactions?: Transaction[]; message?: string }> {
  unmarkPartyDeleted(partyId);
  // Mark old split transactions for this party as deleted, replace with updated ones
  const oldTxs = loadTransactions().filter((t) => t.partyId === partyId);
  oldTxs.forEach((t) => markTxDeleted(t.id));

  const allParties = loadParties();
  const existingIndex = allParties.findIndex((p) => p.id === partyId);
  const updatedParty: PartySplit = {
    ...party,
    id: partyId,
    createdAt: existingIndex >= 0 ? allParties[existingIndex].createdAt : new Date().toISOString(),
  };

  if (existingIndex >= 0) {
    allParties[existingIndex] = updatedParty;
  } else {
    allParties.unshift(updatedParty);
  }

  const createdTxs: Transaction[] = transactions.map((t, idx) => {
    const txId = `tx-party-${Date.now()}-${idx}`;
    unmarkTxDeleted(txId);
    return {
      ...t,
      id: txId,
      partyId,
      createdAt: new Date().toISOString(),
    };
  });

  const baseTxs = loadTransactions().filter((t) => t.partyId !== partyId);
  const updatedTxs = [...createdTxs, ...baseTxs];
  saveParties(allParties);
  saveTransactions(updatedTxs);

  // 1. Try server API
  try {
    const res = await fetch(`/api/owner/party-split/${partyId}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ party: updatedParty, transactions: createdTxs }),
    });
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const data = await res.json();
      if (data.success) {
        const mergedParties = smartMergeParties(data.parties || [], allParties);
        const mergedTxs = smartMergeTransactions(data.transactions || [], updatedTxs);
        saveParties(mergedParties);
        saveTransactions(mergedTxs);
        await updatePartyDirect(updatedParty, createdTxs).catch((err) => console.warn('Direct updateParty sync:', err));
        return { success: true, parties: mergedParties, transactions: mergedTxs };
      }
    }
  } catch {
    // ignore
  }

  // 2. Direct fallback
  try {
    await updatePartyDirect(updatedParty, createdTxs).catch((err) => console.warn('Direct updateParty warning:', err));
    return { success: true, parties: allParties, transactions: updatedTxs };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Lỗi khi cập nhật chia tiền' };
  }
}

export async function apiSaveSettings(
  settings: AppSettings
): Promise<{ success: boolean; settings?: AppSettings; message?: string }> {
  // 1. Immediately save to local client storage for instant UI reactivity
  saveSettings(settings);

  // 2. Try server API with auth headers and optional admin password header
  try {
    const res = await fetch('/api/owner/settings', {
      method: 'PUT',
      headers: {
        ...getAuthHeaders(),
        ...(settings.ownerPassword ? { 'x-admin-password': settings.ownerPassword } : {}),
      },
      body: JSON.stringify(settings),
    });
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const data = await res.json();
      if (data.success && data.settings) {
        saveSettings(data.settings);
        await saveSettingsDirect(data.settings).catch((err) =>
          console.warn('Direct saveSettings sync:', err)
        );
        return { success: true, settings: data.settings };
      }
    }
  } catch (err) {
    console.warn('Server saveSettings notice, falling back to direct Firestore:', err);
  }

  // 3. Fallback direct Firestore sync
  try {
    await saveSettingsDirect(settings);
  } catch (err) {
    console.warn('Direct saveSettings warning:', err);
  }

  return { success: true, settings };
}

// --- GUEST APIS (LOOKUP BY PIN) ---
export async function apiGuestLookup(pin: string): Promise<{
  success: boolean;
  debtor?: Debtor;
  transactions?: Transaction[];
  settings?: AppSettings;
  message?: string;
}> {
  try {
    const res = await fetch('/api/guest/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: pin.trim() }),
    });
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const data = await res.json();
      if (data.success) {
        return {
          success: true,
          debtor: data.debtor,
          transactions: data.transactions,
          settings: data.settings,
        };
      }
      return {
        success: false,
        message: data.message || 'Mã PIN không tồn tại hoặc không chính xác.',
      };
    }
  } catch {
    // ignore
  }

  // Direct Firestore lookup fallback (works on any device on Vercel)
  try {
    const directRes = await guestLookupDirect(pin);
    if (directRes.success) {
      return directRes;
    }
  } catch (e) {
    console.warn('Direct guest lookup warning:', e);
  }

  // Local fallback
  const allDebtors = loadDebtors();
  const found = allDebtors.find((d) => d.pin.trim() === pin.trim());
  if (found) {
    const allTxs = loadTransactions();
    const debtorTxs = allTxs.filter((tx) => tx.debtorId === found.id);
    const settings = loadSettings();
    return {
      success: true,
      debtor: found,
      transactions: debtorTxs,
      settings,
    };
  }
  return {
    success: false,
    message: 'Mã PIN không tồn tại hoặc không chính xác.',
  };
}

export async function apiGuestReportPayment(
  pin: string,
  amount: number,
  note: string,
  billImage?: string
): Promise<{
  success: boolean;
  transactions?: Transaction[];
  message?: string;
}> {
  try {
    const res = await fetch('/api/guest/report-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: pin.trim(), amount, note, billImage }),
    });
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const data = await res.json();
      if (data.success) {
        return { success: true, transactions: data.transactions };
      }
    }
  } catch {
    // ignore
  }

  return await guestReportPaymentDirect(pin, amount, note, billImage);
}

// --- CLOUD FIRESTORE STATUS & MANAGEMENT ---

export interface FirestoreStatusInfo {
  success: boolean;
  connected: boolean;
  latencyMs: number;
  databaseId: string;
  defaultDatabaseId: string;
  projectId: string;
  isCustom: boolean;
  stats: {
    debtors: number;
    transactions: number;
    parties: number;
  };
  error?: string | null;
  lastChecked: string;
}

export async function apiGetFirestoreStatus(): Promise<FirestoreStatusInfo> {
  // 1. Try server endpoint
  try {
    const res = await fetch('/api/firestore/status');
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const data = await res.json();
      if (data && typeof data.connected === 'boolean') {
        return data;
      }
    }
  } catch {
    // ignore
  }

  // 2. Direct browser test to Cloud Firestore
  try {
    const direct = await testFirestoreDirectConnection();
    const config = getClientFirebaseConfig();
    return {
      success: direct.success,
      connected: direct.success,
      latencyMs: direct.latencyMs,
      databaseId: direct.databaseId,
      defaultDatabaseId: config.defaultDatabaseId,
      projectId: direct.projectId,
      isCustom: direct.isCustom,
      stats: direct.stats || {
        debtors: loadDebtors().length,
        transactions: loadTransactions().length,
        parties: loadParties().length,
      },
      error: direct.error,
      lastChecked: new Date().toISOString(),
    };
  } catch (err: any) {
    const config = getClientFirebaseConfig();
    return {
      success: false,
      connected: false,
      latencyMs: 0,
      databaseId: config.firestoreDatabaseId,
      defaultDatabaseId: config.defaultDatabaseId,
      projectId: config.projectId,
      isCustom: config.isCustom,
      stats: { debtors: 0, transactions: 0, parties: 0 },
      error: err?.message || 'Không thể kết nối đến Cloud Firestore',
      lastChecked: new Date().toISOString(),
    };
  }
}

export async function apiTestFirestoreConnection(options?: {
  databaseId?: string;
  projectId?: string;
  apiKey?: string;
}): Promise<{
  success: boolean;
  latencyMs: number;
  databaseId: string;
  projectId: string;
  isCustom: boolean;
  stats?: { debtors: number; transactions: number; parties: number };
  error?: string;
}> {
  try {
    const res = await fetch('/api/firestore/test-connection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options || {}),
    });
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      return await res.json();
    }
  } catch {
    // ignore
  }

  return await testFirestoreDirectConnection();
}

export async function apiChangeFirestoreDatabase(options: {
  databaseId: string;
  projectId?: string;
  apiKey?: string;
  migrateExistingData?: boolean;
}): Promise<{
  success: boolean;
  message?: string;
  databaseId?: string;
  debtors?: Debtor[];
  transactions?: Transaction[];
  parties?: PartySplit[];
  settings?: AppSettings;
}> {
  try {
    const res = await fetch('/api/firestore/change-database', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(options),
    });
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const data = await res.json();
      if (data.success && data.data) {
        if (data.data.debtors) saveDebtors(data.data.debtors);
        if (data.data.transactions) saveTransactions(data.data.transactions);
        if (data.data.parties) saveParties(data.data.parties);
        if (data.data.settings) saveSettings(data.data.settings);
        setClientCustomDatabaseId(options.databaseId);
        return {
          success: true,
          message: data.message,
          databaseId: data.databaseId,
          debtors: data.data.debtors,
          transactions: data.data.transactions,
          parties: data.data.parties,
          settings: data.data.settings,
        };
      }
    }
  } catch {
    // ignore
  }

  // Direct client switch
  setClientCustomDatabaseId(options.databaseId);
  const test = await testFirestoreDirectConnection();
  if (test.success) {
    const fresh = await loadDataFromFirestoreDirect();
    if (fresh) {
      saveDebtors(fresh.debtors);
      saveTransactions(fresh.transactions);
      saveParties(fresh.parties);
      saveSettings(fresh.settings);
      return {
        success: true,
        message: `Đã kết nối trực tiếp tới cơ sở dữ liệu Cloud Firestore: "${options.databaseId}"`,
        databaseId: options.databaseId,
        debtors: fresh.debtors,
        transactions: fresh.transactions,
        parties: fresh.parties,
        settings: fresh.settings,
      };
    }
  }
  return {
    success: false,
    message: test.error || 'Không thể kết nối đến cơ sở dữ liệu mới trên Cloud Firestore',
  };
}

export async function apiResetDefaultFirestoreDatabase(): Promise<{
  success: boolean;
  message?: string;
  databaseId?: string;
  debtors?: Debtor[];
  transactions?: Transaction[];
  parties?: PartySplit[];
  settings?: AppSettings;
}> {
  try {
    const res = await fetch('/api/firestore/reset-default-database', {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const data = await res.json();
      if (data.success && data.data) {
        if (data.data.debtors) saveDebtors(data.data.debtors);
        if (data.data.transactions) saveTransactions(data.data.transactions);
        if (data.data.parties) saveParties(data.data.parties);
        if (data.data.settings) saveSettings(data.data.settings);
        setClientCustomDatabaseId(null);
        return {
          success: true,
          message: data.message,
          databaseId: data.databaseId,
          debtors: data.data.debtors,
          transactions: data.data.transactions,
          parties: data.data.parties,
          settings: data.data.settings,
        };
      }
    }
  } catch {
    // ignore
  }

  setClientCustomDatabaseId(null);
  const fresh = await loadDataFromFirestoreDirect();
  if (fresh) {
    saveDebtors(fresh.debtors);
    saveTransactions(fresh.transactions);
    saveParties(fresh.parties);
    saveSettings(fresh.settings);
    return {
      success: true,
      message: 'Đã khôi phục cơ sở dữ liệu Cloud Firestore mặc định.',
      databaseId: getClientFirebaseConfig().defaultDatabaseId,
      debtors: fresh.debtors,
      transactions: fresh.transactions,
      parties: fresh.parties,
      settings: fresh.settings,
    };
  }
  return { success: false, message: 'Lỗi khi khôi phục database mặc định' };
}

export interface BackupItem {
  filename: string;
  timestamp: string;
  debtorCount: number;
  transactionCount: number;
  partyCount: number;
  databaseId?: string;
  label?: string;
}

export async function apiGetFirestoreBackups(): Promise<{ success: boolean; backups: BackupItem[] }> {
  try {
    const res = await fetch('/api/firestore/backups', {
      headers: getAuthHeaders(),
    });
    if (res.ok) {
      const data = await res.json();
      return { success: true, backups: data.backups || [] };
    }
  } catch {
    // ignore
  }
  return { success: false, backups: [] };
}

export async function apiCreateFirestoreBackup(label?: string): Promise<{ success: boolean; message?: string; filename?: string }> {
  try {
    const res = await fetch('/api/firestore/create-backup', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ label }),
    });
    if (res.ok) {
      const data = await res.json();
      return { success: true, message: data.message, filename: data.filename };
    }
  } catch {
    // ignore
  }
  return { success: false, message: 'Không thể tạo bản sao lưu snapshot.' };
}

export async function apiRestoreFirestoreBackup(filename: string): Promise<{
  success: boolean;
  message?: string;
  debtors?: Debtor[];
  transactions?: Transaction[];
  parties?: PartySplit[];
  settings?: AppSettings;
}> {
  try {
    const res = await fetch('/api/firestore/restore-backup', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ filename }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.data) {
        if (data.data.debtors) saveDebtors(data.data.debtors);
        if (data.data.transactions) saveTransactions(data.data.transactions);
        if (data.data.parties) saveParties(data.data.parties);
        if (data.data.settings) saveSettings(data.data.settings);
        return {
          success: true,
          message: data.message,
          debtors: data.data.debtors,
          transactions: data.data.transactions,
          parties: data.data.parties,
          settings: data.data.settings,
        };
      }
    }
  } catch {
    // ignore
  }
  return { success: false, message: 'Không thể khôi phục từ bản sao lưu.' };
}

export async function apiLoadFirestoreDataset(preset: string): Promise<{
  success: boolean;
  message?: string;
  debtors?: Debtor[];
  transactions?: Transaction[];
  parties?: PartySplit[];
  settings?: AppSettings;
}> {
  try {
    const res = await fetch('/api/firestore/load-dataset', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ preset }),
    });
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const data = await res.json();
      if (data.success && data.data) {
        if (data.data.debtors) saveDebtors(data.data.debtors);
        if (data.data.transactions) saveTransactions(data.data.transactions);
        if (data.data.parties) saveParties(data.data.parties);
        if (data.data.settings) saveSettings(data.data.settings);
        return {
          success: true,
          message: data.message,
          debtors: data.data.debtors,
          transactions: data.data.transactions,
          parties: data.data.parties,
          settings: data.data.settings,
        };
      }
    }
  } catch {
    // ignore
  }

  try {
    const fresh = await loadPresetDirect(preset);
    saveDebtors(fresh.debtors);
    saveTransactions(fresh.transactions);
    saveParties(fresh.parties);
    saveSettings(fresh.settings);
    return {
      success: true,
      message: `Đã nạp gói dữ liệu mẫu trực tiếp lên Cloud Firestore thành công.`,
      debtors: fresh.debtors,
      transactions: fresh.transactions,
      parties: fresh.parties,
      settings: fresh.settings,
    };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Lỗi khi nạp dữ liệu mẫu' };
  }
}

export async function apiUploadJsonToFirestore(jsonData: any, mode: 'replace' | 'merge' = 'replace'): Promise<{
  success: boolean;
  message?: string;
  debtors?: Debtor[];
  transactions?: Transaction[];
  parties?: PartySplit[];
  settings?: AppSettings;
}> {
  try {
    const res = await fetch('/api/firestore/upload-json', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ data: jsonData, mode }),
    });
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await res.json();
      if (res.ok && data.success && data.data) {
        if (data.data.debtors) saveDebtors(data.data.debtors);
        if (data.data.transactions) saveTransactions(data.data.transactions);
        if (data.data.parties) saveParties(data.data.parties);
        if (data.data.settings) saveSettings(data.data.settings);
        return {
          success: true,
          message: data.message,
          debtors: data.data.debtors,
          transactions: data.data.transactions,
          parties: data.data.parties,
          settings: data.data.settings,
        };
      } else if (!res.ok) {
        console.warn('Server upload-json returned error response:', data);
      }
    }
  } catch (serverErr) {
    console.warn('Server upload-json error, attempting client-side fallback:', serverErr);
  }

  // Fallback: Direct client-side restore to Firestore
  try {
    let parsedDebtors = Array.isArray(jsonData?.debtors) ? jsonData.debtors : (Array.isArray(jsonData) ? jsonData : []);
    let parsedTransactions = Array.isArray(jsonData?.transactions) ? jsonData.transactions : [];
    let parsedParties = Array.isArray(jsonData?.parties) ? jsonData.parties : [];
    let parsedSettings = jsonData?.settings || null;

    if (mode === 'merge') {
      const currentDebtors = loadDebtors();
      const currentTx = loadTransactions();
      const currentParties = loadParties();
      const currentSettings = loadSettings();

      const dMap = new Map<string, Debtor>();
      currentDebtors.forEach((d) => dMap.set(d.id, d));
      parsedDebtors.forEach((d: Debtor) => dMap.set(d.id, d));

      const tMap = new Map<string, Transaction>();
      currentTx.forEach((t) => tMap.set(t.id, t));
      parsedTransactions.forEach((t: Transaction) => tMap.set(t.id, t));

      const pMap = new Map<string, PartySplit>();
      currentParties.forEach((p) => pMap.set(p.id, p));
      parsedParties.forEach((p: PartySplit) => pMap.set(p.id, p));

      parsedDebtors = Array.from(dMap.values());
      parsedTransactions = Array.from(tMap.values());
      parsedParties = Array.from(pMap.values());
      parsedSettings = parsedSettings ? { ...currentSettings, ...parsedSettings } : currentSettings;
    } else {
      parsedSettings = parsedSettings || loadSettings();
    }

    const formatted = {
      debtors: parsedDebtors,
      transactions: parsedTransactions,
      parties: parsedParties,
      settings: parsedSettings,
    };
    await syncAllToFirestoreDirect(formatted);
    saveDebtors(formatted.debtors);
    saveTransactions(formatted.transactions);
    saveParties(formatted.parties);
    saveSettings(formatted.settings);
    return {
      success: true,
      message: `Đã khôi phục thành công ${formatted.debtors.length} người nợ, ${formatted.transactions.length} giao dịch lên Cloud Firestore!`,
      ...formatted,
    };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Lỗi khi khôi phục dữ liệu từ tệp JSON' };
  }
}

export async function apiForceSyncFirestore(direction: 'PUSH' | 'PULL'): Promise<{
  success: boolean;
  message?: string;
  debtors?: Debtor[];
  transactions?: Transaction[];
  parties?: PartySplit[];
  settings?: AppSettings;
}> {
  try {
    const res = await fetch('/api/firestore/force-sync', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ direction }),
    });
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const data = await res.json();
      if (data.success && data.data) {
        if (data.data.debtors) saveDebtors(data.data.debtors);
        if (data.data.transactions) saveTransactions(data.data.transactions);
        if (data.data.parties) saveParties(data.data.parties);
        if (data.data.settings) saveSettings(data.data.settings);
        return {
          success: true,
          message: data.message,
          debtors: data.data.debtors,
          transactions: data.data.transactions,
          parties: data.data.parties,
          settings: data.data.settings,
        };
      }
    }
  } catch {
    // ignore
  }

  try {
    if (direction === 'PULL') {
      const fresh = await loadDataFromFirestoreDirect();
      if (fresh) {
        saveDebtors(fresh.debtors);
        saveTransactions(fresh.transactions);
        saveParties(fresh.parties);
        saveSettings(fresh.settings);
        return {
          success: true,
          message: 'Đã tải dữ liệu mới nhất trực tiếp từ Cloud Firestore về máy!',
          debtors: fresh.debtors,
          transactions: fresh.transactions,
          parties: fresh.parties,
          settings: fresh.settings,
        };
      }
    } else {
      return await apiSyncAllNow();
    }
  } catch (err: any) {
    return { success: false, message: err?.message || 'Đồng bộ trực tiếp Cloud Firestore thất bại' };
  }

  return { success: false, message: 'Đồng bộ thất bại' };
}

/**
 * Save and synchronize ALL data immediately to Cloud Firestore (both via Server & Direct Client SDK)
 */
export async function apiSyncAllNow(dataOverride?: {
  debtors?: Debtor[];
  transactions?: Transaction[];
  parties?: PartySplit[];
  settings?: AppSettings;
}): Promise<{
  success: boolean;
  message?: string;
  debtors?: Debtor[];
  transactions?: Transaction[];
  parties?: PartySplit[];
  settings?: AppSettings;
  stats?: { debtorsCount: number; transactionsCount: number; partiesCount: number };
}> {
  const localData = {
    debtors: dataOverride?.debtors || loadDebtors(),
    transactions: dataOverride?.transactions || loadTransactions(),
    parties: dataOverride?.parties || loadParties(),
    settings: dataOverride?.settings || loadSettings(),
  };

  // 1. Direct browser sync to Cloud Firestore
  let directSyncOk = false;
  try {
    await syncAllToFirestoreDirect(localData);
    directSyncOk = true;
  } catch (err) {
    console.warn('Direct client sync warning:', err);
  }

  // 2. Server API sync
  try {
    const res = await fetch('/api/owner/sync-all', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(localData),
    });
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const data = await res.json();
      if (data.success) {
        if (data.debtors) saveDebtors(data.debtors);
        if (data.transactions) saveTransactions(data.transactions);
        if (data.parties) saveParties(data.parties);
        if (data.settings) saveSettings(data.settings);
        return {
          success: true,
          message: data.message || `Đã lưu và đồng bộ toàn bộ ${localData.debtors.length} người nợ, ${localData.transactions.length} giao dịch lên Cloud Firestore thành công!`,
          debtors: data.debtors || localData.debtors,
          transactions: data.transactions || localData.transactions,
          parties: data.parties || localData.parties,
          settings: data.settings || localData.settings,
          stats: data.stats || {
            debtorsCount: localData.debtors.length,
            transactionsCount: localData.transactions.length,
            partiesCount: localData.parties.length,
          },
        };
      }
    }
  } catch (err) {
    console.warn('Server sync-all API warning:', err);
  }

  if (directSyncOk) {
    saveDebtors(localData.debtors);
    saveTransactions(localData.transactions);
    saveParties(localData.parties);
    saveSettings(localData.settings);
    return {
      success: true,
      message: `Đã lưu và đồng bộ tức thì ${localData.debtors.length} người nợ, ${localData.transactions.length} giao dịch lên Cloud Firestore thành công!`,
      ...localData,
      stats: {
        debtorsCount: localData.debtors.length,
        transactionsCount: localData.transactions.length,
        partiesCount: localData.parties.length,
      },
    };
  }

  return { success: false, message: 'Không thể kết nối đến máy chủ hoặc Cloud Firestore để đồng bộ' };
}

export async function apiClearAllSampleData(
  password: string
): Promise<{ success: boolean; message?: string }> {
  const trimmedPassword = (password || '').trim();
  const authHeaders = getAuthHeaders();

  // 1. Try server endpoint (/api/owner/clear-all or /api/owner/clear-sample-data)
  try {
    const res = await fetch('/api/owner/clear-all', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({
        adminPassword: trimmedPassword,
        password: trimmedPassword,
      }),
    });
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await res.json();
      if (data.success) {
        markSampleDataCleared(true);
        saveDebtors([]);
        saveTransactions([]);
        saveParties([]);
        // Ensure direct client-side Firestore also executes in dual-mode
        try {
          await clearAllFirestoreDirect();
        } catch (fErr) {
          console.warn('Dual-mode direct clear note:', fErr);
        }
        return { success: true, message: data.message };
      } else {
        return { success: false, message: data.message || 'Mật khẩu quản trị không chính xác!' };
      }
    }
  } catch (err) {
    console.warn('Server clear endpoint unreachable, attempting direct client fallback:', err);
  }

  // 2. Direct client-side verification and fallback
  const currentSettings = loadSettings();
  const correctPass = (currentSettings.ownerPassword || '123456').trim();

  // MUST strictly match the owner password
  if (!trimmedPassword || trimmedPassword !== correctPass) {
    return { success: false, message: 'Mật khẩu quản trị không chính xác!' };
  }

  markSampleDataCleared(true);
  saveDebtors([]);
  saveTransactions([]);
  saveParties([]);
  try {
    await clearAllFirestoreDirect();
  } catch (err: any) {
    console.warn('Direct clear sample error:', err);
  }
  return { success: true, message: 'Đã xóa toàn bộ dữ liệu mẫu thành công!' };
}

export async function apiResetSampleData(
  password: string
): Promise<{ success: boolean; message?: string }> {
  const trimmedPassword = (password || '').trim();
  const authHeaders = getAuthHeaders();

  try {
    const res = await fetch('/api/owner/reset-sample', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({
        adminPassword: trimmedPassword,
        password: trimmedPassword,
      }),
    });
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await res.json();
      if (data.success) {
        markSampleDataCleared(false);
        saveDebtors(INITIAL_DEBTORS);
        saveTransactions(INITIAL_TRANSACTIONS);
        saveParties(INITIAL_PARTIES);
        try {
          await syncAllToFirestoreDirect({
            debtors: INITIAL_DEBTORS,
            transactions: INITIAL_TRANSACTIONS,
            parties: INITIAL_PARTIES,
            settings: loadSettings(),
          });
        } catch (fErr) {
          console.warn('Dual-mode direct reset sync note:', fErr);
        }
        return { success: true, message: data.message };
      } else {
        return { success: false, message: data.message || 'Mật khẩu quản trị không chính xác!' };
      }
    }
  } catch (err) {
    console.warn('Server reset endpoint unreachable, attempting direct client fallback:', err);
  }

  // Direct client-side verification and fallback
  const currentSettings = loadSettings();
  const correctPass = (currentSettings.ownerPassword || '123456').trim();

  // MUST strictly match the owner password
  if (!trimmedPassword || trimmedPassword !== correctPass) {
    return { success: false, message: 'Mật khẩu quản trị không chính xác!' };
  }

  markSampleDataCleared(false);
  saveDebtors(INITIAL_DEBTORS);
  saveTransactions(INITIAL_TRANSACTIONS);
  saveParties(INITIAL_PARTIES);
  try {
    await syncAllToFirestoreDirect({
      debtors: INITIAL_DEBTORS,
      transactions: INITIAL_TRANSACTIONS,
      parties: INITIAL_PARTIES,
      settings: currentSettings,
    });
  } catch (err) {
    console.warn('Direct reset sample error:', err);
  }
  return { success: true, message: 'Đã nạp lại dữ liệu mẫu ban đầu thành công!' };
}

export async function apiSyncExternal(
  url: string,
  apiKey: string,
  direction: 'PUSH' | 'PULL'
): Promise<{ success: boolean; message?: string }> {
  if (!url) return { success: false, message: 'Chưa cấu hình URL máy chủ đồng bộ.' };
  try {
    if (direction === 'PUSH') {
      const payload = {
        debtors: loadDebtors(),
        transactions: loadTransactions(),
        parties: loadParties(),
        settings: loadSettings(),
        syncedAt: new Date().toISOString(),
      };
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}`, 'x-api-key': apiKey } : {}),
        },
        body: JSON.stringify(payload),
      });
      if (res.ok) return { success: true };
      return { success: false, message: `Máy chủ phản hồi mã lỗi ${res.status}` };
    } else {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          ...(apiKey ? { Authorization: `Bearer ${apiKey}`, 'x-api-key': apiKey } : {}),
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.debtors && Array.isArray(data.debtors)) saveDebtors(data.debtors);
        if (data.transactions && Array.isArray(data.transactions)) saveTransactions(data.transactions);
        if (data.parties && Array.isArray(data.parties)) saveParties(data.parties);
        if (data.settings) saveSettings(data.settings);
        return { success: true };
      }
      return { success: false, message: `Máy chủ phản hồi mã lỗi ${res.status}` };
    }
  } catch (err: any) {
    return { success: false, message: err?.message || 'Không thể kết nối đến máy chủ bên ngoài.' };
  }
}

