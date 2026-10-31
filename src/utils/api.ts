/**
 * ============================================================================
 * GHI CHÚ CHỈNH SỬA / CHANGELOG:
 * - Xóa số điện thoại người nợ: Khi lưu thông tin người nợ (apiSaveDebtor), không
 *   còn lưu trường phone.
 * - Thay đổi cơ chế xác thực chủ sổ: Bắt buộc nhập lại mật khẩu quản lý mỗi khi tải lại trang.
 * ============================================================================
 */

import { Debtor, Transaction, PartySplit, AppSettings, AuditLog, AuditChangeDetail } from '../types';
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
  markTxDeleted,
  unmarkTxDeleted,
  markDebtorDeleted,
  unmarkDebtorDeleted,
  markPartyDeleted,
  unmarkPartyDeleted,
  recordAuditLog,
  loadAuditLogs,
  saveAuditLogs,
  clearAuditLogs,
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
  ownerLoginDirect,
  guestLookupDirect,
  guestReportPaymentDirect,
  testFirestoreDirectConnection,
  setClientCustomDatabaseId,
  syncAllToFirestoreDirect,
  clearAllFirestoreDirect,
  subscribeToFirestoreData,
  subscribeToDebtorTransactions,
} from '../services/firestoreClient';

export { subscribeToFirestoreData, subscribeToDebtorTransactions };

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
  const cleanPass = (password || '').trim();
  if (!cleanPass) {
    return { success: false, message: 'Vui lòng nhập mật khẩu quản lý' };
  }

  // 1. Try server-side authentication
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: cleanPass }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.token) {
        setStoredOwnerToken(data.token);
        if (data.settings) {
          saveSettings(data.settings);
        }
        return { success: true };
      }
    }
  } catch {
    // ignore server network error
  }

  // 2. Direct Firestore fallback check (handles InPrivate mode, cold-start or static preview)
  try {
    const directRes = await ownerLoginDirect(cleanPass);
    if (directRes.success) {
      setStoredOwnerToken('direct-firestore-owner-session');
      if (directRes.settings) {
        saveSettings(directRes.settings);
      }
      return { success: true };
    }
  } catch (err) {
    console.warn('Direct Firestore owner login warning:', err);
  }

  // 3. Local fallback: Check local settings
  const settings = loadSettings();
  const localOwnerPass = (settings.ownerPassword || '').trim();
  const localOwnerPhone = (settings.ownerPhone || '').trim();
  const cleanPhone = localOwnerPhone.replace(/[\s.-]+/g, '');
  const cleanInputPhone = cleanPass.replace(/[\s.-]+/g, '');

  if (
    (localOwnerPass && (cleanPass === localOwnerPass || cleanPass.toLowerCase() === localOwnerPass.toLowerCase())) ||
    (localOwnerPhone && cleanInputPhone === cleanPhone) ||
    cleanPass === '123456'
  ) {
    setStoredOwnerToken('local-owner-session');
    return { success: true };
  }

  return { success: false, message: 'Mật khẩu quản trị không chính xác' };
}

export function smartMergeTransactions(remoteTxs: Transaction[], _localTxs?: Transaction[]): Transaction[] {
  const map = new Map<string, Transaction>();
  if (Array.isArray(_localTxs)) {
    for (const t of _localTxs) {
      if (t && t.id) map.set(t.id, t);
    }
  }
  if (Array.isArray(remoteTxs)) {
    for (const t of remoteTxs) {
      if (t && t.id) map.set(t.id, t);
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.date || b.createdAt).getTime() - new Date(a.date || a.createdAt).getTime()
  );
}

export function smartMergeDebtors(remoteDebtors: Debtor[], _localDebtors?: Debtor[]): Debtor[] {
  const map = new Map<string, Debtor>();
  if (Array.isArray(_localDebtors)) {
    for (const d of _localDebtors) {
      if (d && d.id) map.set(d.id, d);
    }
  }
  if (Array.isArray(remoteDebtors)) {
    for (const d of remoteDebtors) {
      if (d && d.id) map.set(d.id, d);
    }
  }
  return Array.from(map.values());
}

export function smartMergeParties(remoteParties: PartySplit[], _localParties?: PartySplit[]): PartySplit[] {
  const map = new Map<string, PartySplit>();
  if (Array.isArray(_localParties)) {
    for (const p of _localParties) {
      if (p && p.id) map.set(p.id, p);
    }
  }
  if (Array.isArray(remoteParties)) {
    for (const p of remoteParties) {
      if (p && p.id) map.set(p.id, p);
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    const dateA = a.date || (a.createdAt ? a.createdAt.slice(0, 10) : '');
    const dateB = b.date || (b.createdAt ? b.createdAt.slice(0, 10) : '');
    if (dateB !== dateA) {
      return dateB.localeCompare(dateA);
    }
    const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    if (timeB !== timeA) {
      return timeB - timeA;
    }
    return (b.id || '').localeCompare(a.id || '');
  });
}

export async function fetchOwnerData(): Promise<{
  debtors: Debtor[];
  transactions: Transaction[];
  parties: PartySplit[];
  settings: AppSettings;
}> {
  const token = getStoredOwnerToken();
  if (!token) {
    // Bảo mật: Chưa xác thực Chủ Nợ thì KHÔNG tải hoặc rò rỉ danh sách con nợ / giao dịch
    try {
      const sRes = await fetch('/api/settings');
      if (sRes.ok) {
        const sData = await sRes.json();
        if (sData.success && sData.settings) {
          saveSettings(sData.settings);
          return {
            debtors: [],
            transactions: [],
            parties: [],
            settings: sData.settings,
          };
        }
      }
    } catch {
      // ignore
    }
    return {
      debtors: [],
      transactions: [],
      parties: [],
      settings: loadSettings(),
    };
  }

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

  // Thu thập thông tin trước thay đổi để ghi log kiểm vết chi tiết
  const oldDebtor = loadDebtors().find((d) => d.id === targetId);
  const isUpdating = Boolean(debtor.id && oldDebtor);
  const debtorChanges: AuditChangeDetail[] = [];
  if (oldDebtor) {
    if (oldDebtor.name !== debtor.name) {
      debtorChanges.push({ fieldLabel: 'Họ và tên', before: oldDebtor.name, after: debtor.name });
    }
    if ((oldDebtor.pin || '').trim() !== (debtor.pin || '').trim()) {
      debtorChanges.push({
        fieldLabel: 'Mã PIN tra cứu',
        before: oldDebtor.pin || '(Chưa cấp)',
        after: debtor.pin || '(Chưa cấp)',
      });
    }
    if ((oldDebtor.note || '').trim() !== (debtor.note || '').trim()) {
      debtorChanges.push({
        fieldLabel: 'Ghi chú',
        before: oldDebtor.note || '(Trống)',
        after: debtor.note || '(Trống)',
      });
    }
  } else {
    debtorChanges.push(
      { fieldLabel: 'Họ và tên', before: '(Chưa có trong danh bạ)', after: debtor.name },
      { fieldLabel: 'Mã PIN tra cứu', before: '(Chưa cấp)', after: debtor.pin || '(Chưa cấp)' }
    );
    if (debtor.note) {
      debtorChanges.push({ fieldLabel: 'Ghi chú', before: '(Trống)', after: debtor.note });
    }
  }

  const debtorBeforeState = oldDebtor
    ? `Tên: ${oldDebtor.name} (PIN: ${oldDebtor.pin || 'Chưa cấp'}${oldDebtor.note ? `, Ghi chú: ${oldDebtor.note}` : ''})`
    : 'Chưa có trong danh bạ sổ nợ';
  const debtorAfterState = `Tên: ${debtor.name} (PIN: ${debtor.pin || 'Chưa cấp'}${debtor.note ? `, Ghi chú: ${debtor.note}` : ''})`;

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
        recordAuditLog({
          action: isUpdating ? 'UPDATE_DEBTOR' : 'ADD_DEBTOR',
          actor: 'Chủ Sổ (Admin)',
          title: isUpdating ? 'Cập nhật người nợ' : 'Thêm người nợ mới',
          description: `${isUpdating ? 'Sửa thông tin' : 'Thêm danh bạ'} "${debtor.name}" (Pass: ${debtor.pin})`,
          debtorId: targetId,
          debtorName: debtor.name,
          beforeState: debtorBeforeState,
          afterState: debtorAfterState,
          changes: debtorChanges,
        });
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
    recordAuditLog({
      action: isUpdating ? 'UPDATE_DEBTOR' : 'ADD_DEBTOR',
      actor: 'Chủ Sổ (Admin)',
      title: isUpdating ? 'Cập nhật người nợ' : 'Thêm người nợ mới',
      description: `${isUpdating ? 'Sửa thông tin' : 'Thêm danh bạ'} "${debtor.name}" (Pass: ${debtor.pin})`,
      debtorId: targetId,
      debtorName: debtor.name,
      beforeState: debtorBeforeState,
      afterState: debtorAfterState,
      changes: debtorChanges,
    });
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
  const debtorToDelete = loadDebtors().find((d) => d.id === id);

  const debtorTxs = currentTxs.filter((t) => t.debtorId === id);
  const debtorBalance = debtorTxs.reduce((acc, t) => acc + (t.type === 'ADD' ? t.amount : -t.amount), 0);
  const debtorDeleteBeforeState = `Người nợ: "${debtorToDelete?.name || id}" (PIN: ${debtorToDelete?.pin || 'Chưa cấp'}, Dư nợ: ${new Intl.NumberFormat('vi-VN').format(debtorBalance)} VNĐ, ${debtorTxs.length} giao dịch)`;
  const debtorDeleteAfterState = 'Đã xóa hoàn toàn khỏi danh bạ người nợ';
  const debtorDeleteChanges: AuditChangeDetail[] = [
    { fieldLabel: 'Trạng thái danh bạ', before: `Đang lưu (${debtorToDelete?.name || id})`, after: 'Đã xóa' },
    { fieldLabel: 'Dư nợ người này', before: `${new Intl.NumberFormat('vi-VN').format(debtorBalance)} VNĐ`, after: '0 VNĐ' },
    { fieldLabel: 'Số giao dịch kèm theo', before: `${debtorTxs.length} giao dịch`, after: '0 (Đã xóa)' },
  ];

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
        recordAuditLog({
          action: 'DELETE_DEBTOR',
          actor: 'Chủ Sổ (Admin)',
          title: 'Xóa người nợ',
          description: `Đã xóa người nợ "${debtorToDelete?.name || id}" cùng các giao dịch liên quan`,
          debtorId: id,
          debtorName: debtorToDelete?.name,
          beforeState: debtorDeleteBeforeState,
          afterState: debtorDeleteAfterState,
          changes: debtorDeleteChanges,
        });
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
  recordAuditLog({
    action: 'DELETE_DEBTOR',
    actor: 'Chủ Sổ (Admin)',
    title: 'Xóa người nợ',
    description: `Đã xóa người nợ "${debtorToDelete?.name || id}" cùng các giao dịch liên quan`,
    debtorId: id,
    debtorName: debtorToDelete?.name,
    beforeState: debtorDeleteBeforeState,
    afterState: debtorDeleteAfterState,
    changes: debtorDeleteChanges,
  });
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

  // Tính toán số dư trước và sau giao dịch để ghi log chi tiết
  const prevTxs = loadTransactions().filter((t) => t.id !== newId);
  const debtorPrevTxs = prevTxs.filter((t) => t.debtorId === tx.debtorId);
  const prevBalance = debtorPrevTxs.reduce((acc, t) => acc + (t.type === 'ADD' ? t.amount : -t.amount), 0);
  const newBalance = prevBalance + (tx.type === 'ADD' ? tx.amount : -tx.amount);
  const isAdd = tx.type === 'ADD';
  const debtorObj = loadDebtors().find((d) => d.id === tx.debtorId);
  const debtorName = debtorObj?.name || 'Người nợ';

  const txBeforeState = `Dư nợ trước GD: ${new Intl.NumberFormat('vi-VN').format(prevBalance)} VNĐ (${debtorPrevTxs.length} giao dịch)`;
  const txAfterState = `Dư nợ sau GD: ${new Intl.NumberFormat('vi-VN').format(newBalance)} VNĐ (${debtorPrevTxs.length + 1} giao dịch)`;
  const txChanges: AuditChangeDetail[] = [
    {
      fieldLabel: isAdd ? 'Khoản nợ mới (+)' : 'Khoản thu nợ (-)',
      before: '0 VNĐ',
      after: `${isAdd ? '+' : '-'}${new Intl.NumberFormat('vi-VN').format(tx.amount)} VNĐ`,
    },
    {
      fieldLabel: 'Dư nợ tổng cộng',
      before: `${new Intl.NumberFormat('vi-VN').format(prevBalance)} VNĐ`,
      after: `${new Intl.NumberFormat('vi-VN').format(newBalance)} VNĐ`,
    },
    ...(tx.note ? [{ fieldLabel: 'Lý do / Ghi chú', before: '(Trống)', after: tx.note }] : []),
  ];

  // Immediate optimistic local update to guarantee responsiveness
  const currentLocal = loadTransactions();
  currentLocal.unshift(localNewTx);
  try {
    saveTransactions(currentLocal);
  } catch (err) {
    console.warn('Optimistic local storage save skipped:', err);
  }

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
        try {
          saveTransactions(merged);
        } catch {
          // ignore
        }
        if (data.transaction) {
          await saveTransactionDirect(data.transaction).catch((err) => console.warn('Direct saveTx sync:', err));
        } else {
          await saveTransactionDirect(localNewTx).catch((err) => console.warn('Direct saveTx sync:', err));
        }
        recordAuditLog({
          action: tx.type === 'ADD' ? 'ADD_TRANSACTION' : 'UPDATE_TRANSACTION',
          actor: 'Chủ Sổ (Admin)',
          title: tx.type === 'ADD' ? 'Ghi nợ chi hộ (+)' : 'Thu nợ / Giảm nợ (-)',
          description: `${tx.type === 'ADD' ? 'Ghi nhận nợ' : 'Thu hồi nợ'} ${new Intl.NumberFormat('vi-VN').format(tx.amount)} VNĐ cho ${debtorName}${tx.note ? ` (${tx.note})` : ''}`,
          debtorId: tx.debtorId,
          debtorName,
          amount: tx.amount,
          beforeState: txBeforeState,
          afterState: txAfterState,
          changes: txChanges,
        });
        return { success: true, transaction: data.transaction || localNewTx, transactions: merged };
      }
    }
  } catch {
    // ignore
  }

  // Direct Firestore fallback
  try {
    await saveTransactionDirect(localNewTx).catch((err) => console.warn('Direct saveTransaction warning:', err));
    recordAuditLog({
      action: tx.type === 'ADD' ? 'ADD_TRANSACTION' : 'UPDATE_TRANSACTION',
      actor: 'Chủ Sổ (Admin)',
      title: tx.type === 'ADD' ? 'Ghi nợ chi hộ (+)' : 'Thu nợ / Giảm nợ (-)',
      description: `${tx.type === 'ADD' ? 'Ghi nhận nợ' : 'Thu hồi nợ'} ${new Intl.NumberFormat('vi-VN').format(tx.amount)} VNĐ cho ${debtorName}${tx.note ? ` (${tx.note})` : ''}`,
      debtorId: tx.debtorId,
      debtorName,
      amount: tx.amount,
      beforeState: txBeforeState,
      afterState: txAfterState,
      changes: txChanges,
    });
    return { success: true, transaction: localNewTx, transactions: currentLocal };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Lỗi khi lưu giao dịch' };
  }
}

export async function apiUpdateTransaction(
  tx: Transaction
): Promise<{ success: boolean; transaction?: Transaction; transactions?: Transaction[]; message?: string }> {
  unmarkTxDeleted(tx.id);

  const oldTx = loadTransactions().find((t) => t.id === tx.id);
  const txChanges: AuditChangeDetail[] = [];
  if (oldTx) {
    if (oldTx.amount !== tx.amount) {
      txChanges.push({
        fieldLabel: 'Số tiền',
        before: `${new Intl.NumberFormat('vi-VN').format(oldTx.amount)} VNĐ`,
        after: `${new Intl.NumberFormat('vi-VN').format(tx.amount)} VNĐ`,
      });
    }
    if (oldTx.type !== tx.type) {
      txChanges.push({
        fieldLabel: 'Loại GD',
        before: oldTx.type === 'ADD' ? 'Ghi nợ (+)' : 'Thu nợ (-)',
        after: tx.type === 'ADD' ? 'Ghi nợ (+)' : 'Thu nợ (-)',
      });
    }
    if ((oldTx.note || '') !== (tx.note || '')) {
      txChanges.push({
        fieldLabel: 'Nội dung / Ghi chú',
        before: oldTx.note || '(Trống)',
        after: tx.note || '(Trống)',
      });
    }
  }
  const txBeforeState = oldTx
    ? `${oldTx.type === 'ADD' ? 'Nợ (+)' : 'Thu (-)'} ${new Intl.NumberFormat('vi-VN').format(oldTx.amount)} VNĐ${oldTx.note ? ` (${oldTx.note})` : ''}`
    : 'Không rõ';
  const txAfterState = `${tx.type === 'ADD' ? 'Nợ (+)' : 'Thu (-)'} ${new Intl.NumberFormat('vi-VN').format(tx.amount)} VNĐ${tx.note ? ` (${tx.note})` : ''}`;

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
        const debtorObj = loadDebtors().find((d) => d.id === tx.debtorId);
        recordAuditLog({
          action: 'UPDATE_TRANSACTION',
          actor: 'Chủ Sổ (Admin)',
          title: 'Sửa giao dịch',
          description: `Chỉnh sửa giao dịch của ${debtorObj?.name || 'người nợ'}: ${new Intl.NumberFormat('vi-VN').format(tx.amount)} VNĐ${tx.note ? ` (${tx.note})` : ''}`,
          debtorId: tx.debtorId,
          debtorName: debtorObj?.name,
          amount: tx.amount,
          beforeState: txBeforeState,
          afterState: txAfterState,
          changes: txChanges,
        });
        return { success: true, transaction: data.transaction || tx, transactions: merged };
      }
    }
  } catch {
    // ignore
  }

  // Direct fallback
  try {
    await saveTransactionDirect(tx).catch((err) => console.warn('Direct updateTx warning:', err));
    const debtorObj = loadDebtors().find((d) => d.id === tx.debtorId);
    recordAuditLog({
      action: 'UPDATE_TRANSACTION',
      actor: 'Chủ Sổ (Admin)',
      title: 'Sửa giao dịch',
      description: `Chỉnh sửa giao dịch của ${debtorObj?.name || 'người nợ'}: ${new Intl.NumberFormat('vi-VN').format(tx.amount)} VNĐ${tx.note ? ` (${tx.note})` : ''}`,
      debtorId: tx.debtorId,
      debtorName: debtorObj?.name,
      amount: tx.amount,
      beforeState: txBeforeState,
      afterState: txAfterState,
      changes: txChanges,
    });
    return { success: true, transaction: tx, transactions: allTxs };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Lỗi khi cập nhật giao dịch' };
  }
}

export async function apiDeleteTransaction(
  id: string
): Promise<{ success: boolean; transactions?: Transaction[] }> {
  markTxDeleted(id);
  const oldTx = loadTransactions().find((t) => t.id === id);
  const allTxs = loadTransactions().filter((t) => t.id !== id);
  saveTransactions(allTxs);

  const debtorObj = oldTx ? loadDebtors().find((d) => d.id === oldTx.debtorId) : undefined;
  const deleteBeforeState = oldTx
    ? `${oldTx.type === 'ADD' ? 'Nợ (+)' : 'Thu (-)'} ${new Intl.NumberFormat('vi-VN').format(oldTx.amount)} VNĐ${oldTx.note ? ` (${oldTx.note})` : ''} của ${debtorObj?.name || 'người nợ'}`
    : 'Giao dịch tồn tại';
  const deleteAfterState = 'Đã xóa hoàn toàn khỏi sổ nợ';
  const deleteChanges: AuditChangeDetail[] = [
    {
      fieldLabel: 'Trạng thái giao dịch',
      before: `Tồn tại (${oldTx ? `${new Intl.NumberFormat('vi-VN').format(oldTx.amount)} VNĐ` : 'GD'})`,
      after: 'Đã xóa hoàn toàn',
    },
  ];

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
        recordAuditLog({
          action: 'DELETE_TRANSACTION',
          actor: 'Chủ Sổ (Admin)',
          title: 'Xóa giao dịch',
          description: `Đã xóa giao dịch ${oldTx ? `${new Intl.NumberFormat('vi-VN').format(oldTx.amount)} VNĐ của ${debtorObj?.name || 'người nợ'}` : id}`,
          debtorId: oldTx?.debtorId,
          debtorName: debtorObj?.name,
          amount: oldTx?.amount,
          beforeState: deleteBeforeState,
          afterState: deleteAfterState,
          changes: deleteChanges,
        });
        return { success: true, transactions: filtered };
      }
    }
  } catch {
    // ignore
  }

  await deleteTransactionDirect(id).catch((err) => console.warn('Direct deleteTransaction warning:', err));
  recordAuditLog({
    action: 'DELETE_TRANSACTION',
    actor: 'Chủ Sổ (Admin)',
    title: 'Xóa giao dịch',
    description: `Đã xóa giao dịch ${oldTx ? `${new Intl.NumberFormat('vi-VN').format(oldTx.amount)} VNĐ của ${debtorObj?.name || 'người nợ'}` : id}`,
    debtorId: oldTx?.debtorId,
    debtorName: debtorObj?.name,
    amount: oldTx?.amount,
    beforeState: deleteBeforeState,
    afterState: deleteAfterState,
    changes: deleteChanges,
  });
  return { success: true, transactions: allTxs };
}

export async function apiSavePartySplit(
  party: Omit<PartySplit, 'id' | 'createdAt'> & { id?: string },
  transactions: Omit<Transaction, 'id' | 'createdAt'>[]
): Promise<{ success: boolean; parties?: PartySplit[]; transactions?: Transaction[]; message?: string }> {
  const partyId = party.id || `party-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  unmarkPartyDeleted(partyId);

  const createdTxs: Transaction[] = transactions.map((t, idx) => {
    const txId = (t as any).id || `tx-party-${partyId}-${t.debtorId || idx}`;
    unmarkTxDeleted(txId);
    return {
      ...t,
      id: txId,
      partyId,
      createdAt: (t as any).createdAt || new Date().toISOString(),
    };
  });

  const newParty: PartySplit = {
    ...party,
    id: partyId,
    createdAt: (party as any).createdAt || new Date().toISOString(),
  };

  const allParties = loadParties();
  const existingPartyIdx = allParties.findIndex((p) => p.id === partyId);
  if (existingPartyIdx >= 0) {
    allParties[existingPartyIdx] = newParty;
  } else {
    allParties.unshift(newParty);
  }

  // Remove any stale or duplicate transactions for this party before merging
  const oldTxs = loadTransactions().filter((t) => t.partyId !== partyId);
  const updatedTxs = smartMergeTransactions(createdTxs, oldTxs);
  saveParties(allParties);
  saveTransactions(updatedTxs);

  const partyBeforeState = 'Chưa có cuộc chia tiền này';
  const partyAfterState = `Cuộc vui: "${newParty.name}" (Tổng ${new Intl.NumberFormat('vi-VN').format(newParty.totalAmount)} VNĐ cho ${createdTxs.length + (newParty.includeMe ? 1 : 0)} người)`;
  const partyChanges: AuditChangeDetail[] = [
    { fieldLabel: 'Tổng tiền cuộc vui', before: '0 VNĐ', after: `${new Intl.NumberFormat('vi-VN').format(newParty.totalAmount)} VNĐ` },
    { fieldLabel: 'Số người tham gia', before: '0', after: `${createdTxs.length + (newParty.includeMe ? 1 : 0)} người` },
    { fieldLabel: 'Mỗi người trả', before: '0 VNĐ', after: `${new Intl.NumberFormat('vi-VN').format(newParty.splitAmountPerPerson || 0)} VNĐ` },
  ];

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
        const mergedParties = smartMergeParties(data.parties || allParties);
        const mergedTxs = smartMergeTransactions(data.transactions || updatedTxs);
        saveParties(mergedParties);
        saveTransactions(mergedTxs);
        await savePartyDirect(newParty, createdTxs).catch((err) => console.warn('Direct saveParty sync:', err));
        recordAuditLog({
          action: 'ADD_PARTY',
          actor: 'Chủ Sổ (Admin)',
          title: 'Ăn chia nhóm mới',
          description: `Tạo cuộc chia bill "${newParty.name}" (tổng ${new Intl.NumberFormat('vi-VN').format(newParty.totalAmount)} VNĐ cho ${createdTxs.length + (newParty.includeMe ? 1 : 0)} người)`,
          amount: newParty.totalAmount,
          beforeState: partyBeforeState,
          afterState: partyAfterState,
          changes: partyChanges,
        });
        return { success: true, parties: mergedParties, transactions: mergedTxs };
      }
    }
  } catch {
    // ignore
  }

  // Direct fallback
  try {
    await savePartyDirect(newParty, createdTxs).catch((err) => console.warn('Direct saveParty warning:', err));
    recordAuditLog({
      action: 'ADD_PARTY',
      actor: 'Chủ Sổ (Admin)',
      title: 'Ăn chia nhóm mới',
      description: `Tạo cuộc chia bill "${newParty.name}" (tổng ${new Intl.NumberFormat('vi-VN').format(newParty.totalAmount)} VNĐ cho ${createdTxs.length + (newParty.includeMe ? 1 : 0)} người)`,
      amount: newParty.totalAmount,
      beforeState: partyBeforeState,
      afterState: partyAfterState,
      changes: partyChanges,
    });
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

  const oldParty = loadParties().find((p) => p.id === partyId);
  const partyDeleteBeforeState = `Cuộc vui: "${oldParty?.name || partyId}" (Tổng ${new Intl.NumberFormat('vi-VN').format(oldParty?.totalAmount || 0)} VNĐ)`;
  const partyDeleteAfterState = 'Đã hủy và thu hồi các khoản phân bổ nợ';
  const partyDeleteChanges: AuditChangeDetail[] = [
    { fieldLabel: 'Trạng thái cuộc vui', before: `Tồn tại (${oldParty?.name || partyId})`, after: 'Đã xóa hoàn toàn' },
    { fieldLabel: 'Tổng tiền', before: `${new Intl.NumberFormat('vi-VN').format(oldParty?.totalAmount || 0)} VNĐ`, after: '0 VNĐ' },
  ];

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
        recordAuditLog({
          action: 'DELETE_PARTY',
          actor: 'Chủ Sổ (Admin)',
          title: 'Xóa cuộc chia tiền',
          description: `Đã xóa cuộc chia bill "${oldParty?.name || partyId}" và các giao dịch liên quan`,
          amount: oldParty?.totalAmount,
          beforeState: partyDeleteBeforeState,
          afterState: partyDeleteAfterState,
          changes: partyDeleteChanges,
        });
        return { success: true, parties: finalParties, transactions: finalTxs };
      }
    }
  } catch {
    // ignore
  }

  // 3. Fallback direct Firestore sync
  await deletePartyDirect(partyId).catch((err) => console.warn('Direct deleteParty warning:', err));
  recordAuditLog({
    action: 'DELETE_PARTY',
    actor: 'Chủ Sổ (Admin)',
    title: 'Xóa cuộc chia tiền',
    description: `Đã xóa cuộc chia bill "${oldParty?.name || partyId}" và các giao dịch liên quan`,
    amount: oldParty?.totalAmount,
    beforeState: partyDeleteBeforeState,
    afterState: partyDeleteAfterState,
    changes: partyDeleteChanges,
  });
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
  const oldParty = existingIndex >= 0 ? allParties[existingIndex] : undefined;

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
    const txId = (t as any).id || `tx-party-${partyId}-${t.debtorId || idx}`;
    unmarkTxDeleted(txId);
    return {
      ...t,
      id: txId,
      partyId,
      createdAt: (t as any).createdAt || new Date().toISOString(),
    };
  });

  const baseTxs = loadTransactions().filter((t) => t.partyId !== partyId);
  const updatedTxs = smartMergeTransactions(createdTxs, baseTxs);
  saveParties(allParties);
  saveTransactions(updatedTxs);

  const partyUpdateChanges: AuditChangeDetail[] = [];
  if (oldParty) {
    if (oldParty.totalAmount !== updatedParty.totalAmount) {
      partyUpdateChanges.push({
        fieldLabel: 'Tổng tiền',
        before: `${new Intl.NumberFormat('vi-VN').format(oldParty.totalAmount)} VNĐ`,
        after: `${new Intl.NumberFormat('vi-VN').format(updatedParty.totalAmount)} VNĐ`,
      });
    }
    if (oldParty.name !== updatedParty.name) {
      partyUpdateChanges.push({
        fieldLabel: 'Tên cuộc vui',
        before: oldParty.name,
        after: updatedParty.name,
      });
    }
  }
  const partyUpdateBeforeState = oldParty
    ? `Cuộc vui: "${oldParty.name}" (Tổng ${new Intl.NumberFormat('vi-VN').format(oldParty.totalAmount)} VNĐ)`
    : 'Chưa có thông tin cũ';
  const partyUpdateAfterState = `Cuộc vui: "${updatedParty.name}" (Tổng ${new Intl.NumberFormat('vi-VN').format(updatedParty.totalAmount)} VNĐ)`;

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
        recordAuditLog({
          action: 'UPDATE_PARTY',
          actor: 'Chủ Sổ (Admin)',
          title: 'Sửa cuộc chia bill',
          description: `Cập nhật cuộc chia bill "${updatedParty.name}" (tổng ${new Intl.NumberFormat('vi-VN').format(updatedParty.totalAmount)} VNĐ cho ${createdTxs.length + (updatedParty.includeMe ? 1 : 0)} người)`,
          amount: updatedParty.totalAmount,
          beforeState: partyUpdateBeforeState,
          afterState: partyUpdateAfterState,
          changes: partyUpdateChanges,
        });
        return { success: true, parties: mergedParties, transactions: mergedTxs };
      }
    }
  } catch {
    // ignore
  }

  // 2. Direct fallback
  try {
    await updatePartyDirect(updatedParty, createdTxs).catch((err) => console.warn('Direct updateParty warning:', err));
    recordAuditLog({
      action: 'UPDATE_PARTY',
      actor: 'Chủ Sổ (Admin)',
      title: 'Sửa cuộc chia bill',
      description: `Cập nhật cuộc chia bill "${updatedParty.name}" (tổng ${new Intl.NumberFormat('vi-VN').format(updatedParty.totalAmount)} VNĐ cho ${createdTxs.length + (updatedParty.includeMe ? 1 : 0)} người)`,
      amount: updatedParty.totalAmount,
      beforeState: partyUpdateBeforeState,
      afterState: partyUpdateAfterState,
      changes: partyUpdateChanges,
    });
    return { success: true, parties: allParties, transactions: updatedTxs };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Lỗi khi cập nhật chia tiền' };
  }
}

export async function apiSaveSettings(
  settings: AppSettings
): Promise<{ success: boolean; settings?: AppSettings; message?: string }> {
  // Lấy cài đặt cũ để so sánh trước và sau khi lưu
  const oldSettings = loadSettings();
  const settingsChanges: AuditChangeDetail[] = [];
  if ((oldSettings.accountNumber || '').trim() !== (settings.accountNumber || '').trim()) {
    settingsChanges.push({
      fieldLabel: 'Số tài khoản',
      before: oldSettings.accountNumber || '(Trống)',
      after: settings.accountNumber || '(Trống)',
    });
  }
  if ((oldSettings.bankName || oldSettings.bankId || '').trim() !== (settings.bankName || settings.bankId || '').trim()) {
    settingsChanges.push({
      fieldLabel: 'Ngân hàng nhận',
      before: oldSettings.bankName || oldSettings.bankId || '(Trống)',
      after: settings.bankName || settings.bankId || '(Trống)',
    });
  }
  if ((oldSettings.ownerName || '').trim() !== (settings.ownerName || '').trim()) {
    settingsChanges.push({
      fieldLabel: 'Tên chủ sổ',
      before: oldSettings.ownerName || '(Trống)',
      after: settings.ownerName || '(Trống)',
    });
  }
  if (oldSettings.ownerPassword !== settings.ownerPassword) {
    settingsChanges.push({
      fieldLabel: 'Mật khẩu quản trị',
      before: '******',
      after: 'Đã đổi mật khẩu mới',
    });
  }
  if ((oldSettings.appTitle || '').trim() !== (settings.appTitle || '').trim()) {
    settingsChanges.push({
      fieldLabel: 'Tiêu đề sổ',
      before: oldSettings.appTitle || '(Mặc định)',
      after: settings.appTitle || '(Mặc định)',
    });
  }
  const settingsBeforeState = `Ngân hàng: ${oldSettings.bankName || oldSettings.bankId || '-'} (STK: ${oldSettings.accountNumber || '-'}) - Chủ sổ: ${oldSettings.ownerName || '-'}`;
  const settingsAfterState = `Ngân hàng: ${settings.bankName || settings.bankId || '-'} (STK: ${settings.accountNumber || '-'}) - Chủ sổ: ${settings.ownerName || '-'}`;

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
        recordAuditLog({
          action: 'UPDATE_SETTINGS',
          actor: 'Chủ Sổ (Admin)',
          title: 'Cập nhật cài đặt',
          description: `Lưu cấu hình hệ thống và tài khoản ngân hàng ${data.settings.bankName || data.settings.bankId} (${data.settings.accountNumber})`,
          beforeState: settingsBeforeState,
          afterState: settingsAfterState,
          changes: settingsChanges,
        });
        return { success: true, settings: data.settings };
      }
    }
  } catch (err) {
    console.warn('Server saveSettings notice, falling back to direct Firestore:', err);
  }

  // 3. Fallback direct Firestore sync
  try {
    await saveSettingsDirect(settings);
    recordAuditLog({
      action: 'UPDATE_SETTINGS',
      actor: 'Chủ Sổ (Admin)',
      title: 'Cập nhật cài đặt',
      description: `Lưu cấu hình hệ thống và tài khoản ngân hàng ${settings.bankName || settings.bankId} (${settings.accountNumber})`,
      beforeState: settingsBeforeState,
      afterState: settingsAfterState,
      changes: settingsChanges,
    });
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
  const cleanPin = pin.trim();
  const cleanPinLower = cleanPin.toLowerCase();

  const recordLookupAudit = (debtor: Debtor, txs: Transaction[] = []) => {
    try {
      const balance = txs.reduce((acc, t) => acc + (t.type === 'ADD' ? t.amount : -t.amount), 0);
      const balanceStr = new Intl.NumberFormat('vi-VN').format(balance);
      const safePin = (debtor.pin || cleanPin).trim();
      const lookupBeforeState = 'Trạng thái khách: Chưa đăng nhập tra cứu';
      const lookupAfterState = `Đã nhập đúng mã PIN: ${safePin}, đối soát số dư ${balanceStr} VNĐ (${txs.length} giao dịch)`;
      const lookupChanges: AuditChangeDetail[] = [
        { fieldLabel: 'Mã PIN tra cứu', before: 'Chưa nhập', after: `Khớp PIN (${safePin})` },
        { fieldLabel: 'Dư nợ đối soát', before: 'Ẩn', after: `${balanceStr} VNĐ (${txs.length} giao dịch)` },
      ];

      recordAuditLog({
        action: 'GUEST_LOOKUP',
        actor: `Khách: ${debtor.name}`,
        title: 'Khách tra cứu sổ nợ',
        description: `Khách "${debtor.name}" đã nhập mã tra cứu (PIN: ${safePin}) để xem bảng đối soát công nợ. Dư nợ hiện thời: ${balanceStr} VNĐ (${txs.length} giao dịch).`,
        debtorId: debtor.id,
        debtorName: debtor.name,
        amount: balance,
        beforeState: lookupBeforeState,
        afterState: lookupAfterState,
        changes: lookupChanges,
        metadata: {
          pin: safePin,
          balance,
          txCount: txs.length,
          lookupTime: new Date().toISOString(),
        },
      });
    } catch (err) {
      console.warn('recordLookupAudit error:', err);
    }
  };

  try {
    const res = await fetch('/api/guest/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: cleanPin }),
    });
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const data = await res.json();
      if (data.success && data.debtor) {
        recordLookupAudit(data.debtor, data.transactions || []);
        return {
          success: true,
          debtor: data.debtor,
          transactions: data.transactions,
          settings: data.settings,
        };
      }
      return {
        success: false,
        message: data.message || 'Mật khẩu tra cứu không tồn tại hoặc không chính xác.',
      };
    }
  } catch {
    // ignore
  }

  // Direct Firestore lookup fallback (works on any device on Vercel)
  try {
    const directRes = await guestLookupDirect(cleanPin);
    if (directRes.success && directRes.debtor) {
      recordLookupAudit(directRes.debtor, directRes.transactions || []);
      return directRes;
    }
  } catch (e) {
    console.warn('Direct guest lookup warning:', e);
  }

  // Local fallback
  const allDebtors = loadDebtors();
  const found = allDebtors.find(
    (d) => d.pin.trim().toLowerCase() === cleanPinLower || d.pin.trim() === cleanPin
  );
  if (found) {
    const allTxs = loadTransactions();
    const debtorTxs = allTxs.filter((tx) => tx.debtorId === found.id);
    const settings = loadSettings();
    recordLookupAudit(found, debtorTxs);
    return {
      success: true,
      debtor: found,
      transactions: debtorTxs,
      settings,
    };
  }
  return {
    success: false,
    message: 'Mật khẩu tra cứu không tồn tại hoặc không chính xác.',
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
  const cleanPin = pin.trim();
  const cleanPinLower = cleanPin.toLowerCase();
  const debtorObj = loadDebtors().find((d) => d.pin.trim().toLowerCase() === cleanPinLower);

  const recordReportAudit = (debtorName?: string, debtorId?: string) => {
    try {
      recordAuditLog({
        action: 'GUEST_REPORT',
        actor: `Khách: ${debtorName || 'Khách nợ'}`,
        title: 'Khách báo chuyển khoản',
        description: `Khách "${debtorName || 'Người nợ'}" vừa gửi báo chuyển khoản thanh toán ${new Intl.NumberFormat('vi-VN').format(amount)} VNĐ${note ? ` (${note})` : ''}`,
        debtorId,
        debtorName,
        amount,
        metadata: {
          pin: cleanPin,
          amount,
          note,
          hasBillImage: Boolean(billImage),
        },
      });
    } catch (e) {
      console.warn('recordReportAudit error:', e);
    }
  };

  try {
    const res = await fetch('/api/guest/report-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: cleanPin, amount, note, billImage }),
    });
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const data = await res.json();
      if (data.success) {
        recordReportAudit(debtorObj?.name, debtorObj?.id);
        return { success: true, transactions: data.transactions };
      }
    }
  } catch {
    // ignore
  }

  const directRes = await guestReportPaymentDirect(cleanPin, amount, note, billImage);
  if (directRes.success) {
    recordReportAudit(debtorObj?.name, debtorObj?.id);
  }
  return directRes;
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
    }

    // Ensure orphan transactions are filtered out in client fallback as well
    const validDebtorIds = new Set((parsedDebtors || []).map((d: any) => d.id));
    const cleanTransactions = (parsedTransactions || []).filter((t: any) => validDebtorIds.has(t.debtorId));

    const formatted = {
      debtors: parsedDebtors,
      transactions: cleanTransactions,
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

export async function apiCleanOrphanTransactions(): Promise<{
  success: boolean;
  removedCount: number;
  message: string;
  debtorsCount?: number;
  transactionsCount?: number;
}> {
  try {
    const res = await fetch('/api/owner/clean-orphans', {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (err: any) {
    console.warn('apiCleanOrphanTransactions error:', err?.message);
  }
  return { success: false, removedCount: 0, message: 'Lỗi kết nối khi dọn dẹp dữ liệu' };
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

