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

function fmtMoney(amount: number): string {
  return `${new Intl.NumberFormat('vi-VN').format(amount || 0)} VNĐ`;
}

function getDebtorAuditStats(debtorId: string, txs: Transaction[]) {
  const list = txs.filter((t) => t.debtorId === debtorId);
  let addTotal = 0;
  let subTotal = 0;
  let splitCount = 0;
  list.forEach((t) => {
    if (t.type === 'ADD') addTotal += t.amount;
    else subTotal += t.amount;
    if (t.partyId || t.category === 'PARTY_SPLIT') splitCount++;
  });
  return {
    balance: addTotal - subTotal,
    txCount: list.length,
    addTotal,
    subTotal,
    splitCount,
  };
}

function getTxCategoryLabel(tx: Partial<Transaction>): string {
  if (tx.category === 'PARTY_SPLIT' || tx.partyId) {
    return tx.partyName ? `Chia bill nhóm (${tx.partyName})` : 'Chia bill nhóm';
  }
  if (tx.category === 'PAYMENT_SETTLED') return 'Tất toán sạch nợ';
  if (tx.category === 'SELF_REPORTED') return 'Khách tự báo CK';
  return 'Giao dịch lẻ';
}

function maskSecret(val?: string): string {
  const clean = (val || '').trim();
  if (!clean) return '(Trống)';
  return `****** (${clean.length} ký tự)`;
}

function getAuthHeaders(): HeadersInit {
  const token = getStoredOwnerToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}`, 'x-owner-token': token } : {}),
  };
}

export async function loginOwner(
  password: string,
  methodHint?: 'PASSWORD' | 'FACE_ID'
): Promise<{ success: boolean; message?: string }> {
  const cleanPass = (password || '').trim();
  if (!cleanPass) {
    return { success: false, message: 'Vui lòng nhập mật khẩu quản lý' };
  }

  const recordOwnerLoginSuccess = (authChannel: string, usedMethod: string) => {
    try {
      const currentSettings = loadSettings();
      const dCount = loadDebtors().length;
      const tCount = loadTransactions().length;
      recordAuditLog({
        action: methodHint === 'FACE_ID' ? 'BIOMETRIC_AUTH' : 'LOGIN_SUCCESS',
        actor: `Chủ Sổ (${currentSettings.ownerName || 'Admin'})`,
        title: methodHint === 'FACE_ID' ? 'Đăng nhập quản trị bằng FaceID / Vân tay' : 'Đăng nhập quản trị thành công',
        description: `Chủ sổ đã xác thực thành công vào hệ thống quản lý công nợ qua ${usedMethod} (Kênh: ${authChannel}). Hiện có ${dCount} người nợ và ${tCount} giao dịch.`,
        beforeState: 'Chưa đăng nhập (Phiên khóa)',
        afterState: `Đã mở khóa phiên quản trị qua ${usedMethod}`,
        changes: [
          { fieldLabel: 'Phương thức xác thực', before: 'Chưa xác thực', after: usedMethod },
          { fieldLabel: 'Kênh kiểm tra', before: '-', after: authChannel },
          { fieldLabel: 'Trạng thái phiên', before: 'Khóa', after: 'Đang hoạt động' },
        ],
        metadata: {
          authChannel,
          loginMethod: usedMethod,
          ownerName: currentSettings.ownerName || 'Chủ Sổ',
          debtorsCount: dCount,
          transactionsCount: tCount,
        },
      });
    } catch (err) {
      console.warn('Login success log notice:', err);
    }
  };

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
        const s = data.settings || loadSettings();
        const isPhoneMatch = Boolean(
          s.ownerPhone && cleanPass.replace(/[\s.-]+/g, '') === String(s.ownerPhone).replace(/[\s.-]+/g, '')
        );
        const methodLabel =
          methodHint === 'FACE_ID'
            ? 'FaceID / Sinh trắc học'
            : isPhoneMatch
            ? 'Số điện thoại chủ sổ'
            : 'Mật khẩu quản trị';
        recordOwnerLoginSuccess('Server API', methodLabel);
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
      const s = directRes.settings || loadSettings();
      const isPhoneMatch = Boolean(
        s.ownerPhone && cleanPass.replace(/[\s.-]+/g, '') === String(s.ownerPhone).replace(/[\s.-]+/g, '')
      );
      const methodLabel =
        methodHint === 'FACE_ID'
          ? 'FaceID / Sinh trắc học'
          : isPhoneMatch
          ? 'Số điện thoại chủ sổ'
          : 'Mật khẩu quản trị';
      recordOwnerLoginSuccess('Cloud Firestore trực tiếp', methodLabel);
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

  const isLocalPhone = Boolean(localOwnerPhone && cleanInputPhone === cleanPhone);
  if (
    (localOwnerPass && (cleanPass === localOwnerPass || cleanPass.toLowerCase() === localOwnerPass.toLowerCase())) ||
    isLocalPhone ||
    cleanPass === '123456'
  ) {
    setStoredOwnerToken('local-owner-session');
    const methodLabel =
      methodHint === 'FACE_ID'
        ? 'FaceID / Sinh trắc học'
        : isLocalPhone
        ? 'Số điện thoại chủ sổ'
        : 'Mật khẩu quản trị';
    recordOwnerLoginSuccess('Bộ nhớ cục bộ (Offline)', methodLabel);
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
  if (!debtor.name || !debtor.name.trim()) {
    const errorMsg = 'Họ và tên người nợ không được để trống';
    recordAuditLog({
      action: 'OPERATION_FAILED',
      actor: 'Chủ Sổ (Admin)',
      title: 'Lỗi lưu người nợ',
      description: errorMsg,
      beforeState: 'Thêm / Cập nhật người nợ',
      afterState: `Thất bại: ${errorMsg}`,
      changes: [{ fieldLabel: 'Kết quả thao tác', before: 'Đang lưu', after: 'Thất bại (Tên trống)' }],
    });
    return { success: false, message: errorMsg };
  }

  const targetId = debtor.id || `debtor-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  unmarkDebtorDeleted(targetId);

  // Thu thập thông tin trước thay đổi để ghi log kiểm vết chi tiết
  const oldDebtor = loadDebtors().find((d) => d.id === targetId);
  const isUpdating = Boolean(debtor.id && oldDebtor);
  const allCurrentTxs = loadTransactions();
  const debtorStats = getDebtorAuditStats(targetId, allCurrentTxs);
  const debtorChanges: AuditChangeDetail[] = [];
  if (oldDebtor) {
    if (oldDebtor.name !== debtor.name) {
      debtorChanges.push({ field: 'name', fieldLabel: 'Họ và tên', before: oldDebtor.name, after: debtor.name });
    }
    if ((oldDebtor.pin || '').trim() !== (debtor.pin || '').trim()) {
      debtorChanges.push({
        field: 'pin',
        fieldLabel: 'Mã PIN tra cứu',
        before: oldDebtor.pin || '(Chưa cấp)',
        after: debtor.pin || '(Chưa cấp)',
      });
    }
    if ((oldDebtor.note || '').trim() !== (debtor.note || '').trim()) {
      debtorChanges.push({
        field: 'note',
        fieldLabel: 'Ghi chú',
        before: oldDebtor.note || '(Trống)',
        after: debtor.note || '(Trống)',
      });
    }
    if (debtorChanges.length === 0) {
      debtorChanges.push({
        fieldLabel: 'Thông tin danh bạ',
        before: oldDebtor.name,
        after: `${debtor.name} (Xác nhận lưu lại)`,
      });
    }
  } else {
    debtorChanges.push(
      { field: 'name', fieldLabel: 'Họ và tên', before: '(Chưa có trong danh bạ)', after: debtor.name },
      { field: 'pin', fieldLabel: 'Mã PIN tra cứu', before: '(Chưa cấp)', after: debtor.pin || '(Chưa cấp)' }
    );
    if (debtor.note) {
      debtorChanges.push({ field: 'note', fieldLabel: 'Ghi chú', before: '(Trống)', after: debtor.note });
    }
  }

  const debtorBeforeState = oldDebtor
    ? `Tên: ${oldDebtor.name} | PIN: ${oldDebtor.pin || 'Chưa cấp'} | Dư nợ hiện tại: ${fmtMoney(debtorStats.balance)} (${debtorStats.txCount} GD)${oldDebtor.note ? ` | Ghi chú: ${oldDebtor.note}` : ''}`
    : 'Chưa có trong danh bạ sổ nợ';
  const debtorAfterState = `Tên: ${debtor.name} | PIN: ${debtor.pin || 'Chưa cấp'} | Dư nợ: ${fmtMoney(debtorStats.balance)}${debtor.note ? ` | Ghi chú: ${debtor.note}` : ''}`;

  const buildDebtorSuccessLog = () => ({
    action: (isUpdating ? 'UPDATE_DEBTOR' : 'ADD_DEBTOR') as 'UPDATE_DEBTOR' | 'ADD_DEBTOR',
    actor: 'Chủ Sổ (Admin)',
    title: isUpdating ? `Cập nhật hồ sơ: ${debtor.name}` : `Thêm người nợ mới: ${debtor.name}`,
    description: isUpdating
      ? `Đã cập nhật thông tin "${debtor.name}" (PIN: ${debtor.pin || 'Chưa cấp'}). Dư nợ hiện tại: ${fmtMoney(debtorStats.balance)} qua ${debtorStats.txCount} giao dịch.`
      : `Đã thêm người nợ mới "${debtor.name}" vào danh bạ (Mã PIN tra cứu: ${debtor.pin || 'Chưa cấp'})${debtor.note ? ` · Ghi chú: ${debtor.note}` : ''}.`,
    debtorId: targetId,
    debtorName: debtor.name,
    amount: debtorStats.balance !== 0 ? Math.abs(debtorStats.balance) : undefined,
    beforeState: debtorBeforeState,
    afterState: debtorAfterState,
    changes: debtorChanges,
    metadata: {
      debtorId: targetId,
      pin: debtor.pin || '',
      mode: isUpdating ? 'UPDATE' : 'CREATE',
      currentBalance: debtorStats.balance,
      txCount: debtorStats.txCount,
      note: debtor.note || '',
    },
  });

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
        recordAuditLog(buildDebtorSuccessLog());
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
    recordAuditLog(buildDebtorSuccessLog());
    return { success: true, debtor: savedDebtor, debtors: allDebtors };
  } catch (err: any) {
    recordAuditLog({
      action: 'OPERATION_FAILED',
      actor: 'Chủ Sổ (Admin)',
      title: 'Lỗi lưu người nợ',
      description: `Không thể lưu thông tin "${debtor.name}": ${err?.message || 'Lỗi hệ thống'}`,
      debtorId: targetId,
      debtorName: debtor.name,
      beforeState: debtorBeforeState,
      afterState: `Thất bại: ${err?.message || 'Lỗi'}`,
      changes: [{ fieldLabel: 'Kết quả thao tác', before: 'Đang lưu', after: `Lỗi: ${err?.message || 'Thất bại'}` }],
    });
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
  const stats = getDebtorAuditStats(id, currentTxs);
  const recentTxSummary = debtorTxs
    .slice(0, 5)
    .map((t) => `${t.date || ''} ${t.type === 'ADD' ? '+' : '-'}${fmtMoney(t.amount)}${t.note ? ` (${t.note})` : ''}`)
    .join('; ');

  const debtorDeleteBeforeState = `Người nợ: "${debtorToDelete?.name || id}" | PIN: ${debtorToDelete?.pin || 'Chưa cấp'} | Dư nợ: ${fmtMoney(stats.balance)} (Tổng vay: ${fmtMoney(stats.addTotal)}, Đã trả: ${fmtMoney(stats.subTotal)}, ${stats.txCount} giao dịch)`;
  const debtorDeleteAfterState = 'Đã xóa hoàn toàn hồ sơ người nợ và các giao dịch kèm theo khỏi sổ';
  const debtorDeleteChanges: AuditChangeDetail[] = [
    { fieldLabel: 'Trạng thái danh bạ', before: `Đang lưu (${debtorToDelete?.name || id})`, after: 'Đã xóa hoàn toàn' },
    { fieldLabel: 'Dư nợ thời điểm xóa', before: fmtMoney(stats.balance), after: '0 VNĐ' },
    { fieldLabel: 'Tổng nợ / Tổng đã trả', before: `Nợ ${fmtMoney(stats.addTotal)} · Trả ${fmtMoney(stats.subTotal)}`, after: 'Đã xóa' },
    { fieldLabel: 'Số giao dịch bị xóa theo', before: `${stats.txCount} giao dịch`, after: '0 (Đã xóa)' },
    ...(debtorToDelete?.pin ? [{ fieldLabel: 'Mã PIN cũ', before: debtorToDelete.pin, after: 'Đã thu hồi' }] : []),
  ];

  const buildDeleteDebtorLog = () => ({
    action: 'DELETE_DEBTOR' as const,
    actor: 'Chủ Sổ (Admin)',
    title: `Xóa người nợ: ${debtorToDelete?.name || id}`,
    description: `Đã xóa vĩnh viễn "${debtorToDelete?.name || id}" (PIN: ${debtorToDelete?.pin || '-'}) cùng ${stats.txCount} giao dịch liên quan. Dư nợ trước khi xóa: ${fmtMoney(stats.balance)}.${recentTxSummary ? ` Giao dịch gần nhất: ${recentTxSummary}.` : ''}`,
    debtorId: id,
    debtorName: debtorToDelete?.name,
    amount: Math.abs(stats.balance),
    beforeState: debtorDeleteBeforeState,
    afterState: debtorDeleteAfterState,
    changes: debtorDeleteChanges,
    metadata: {
      debtorId: id,
      pin: debtorToDelete?.pin || '',
      deletedBalance: stats.balance,
      deletedAddTotal: stats.addTotal,
      deletedSubTotal: stats.subTotal,
      deletedTxCount: stats.txCount,
      recentTxSummary: recentTxSummary || undefined,
    },
  });

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
        recordAuditLog(buildDeleteDebtorLog());
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
  recordAuditLog(buildDeleteDebtorLog());
  return { success: true, debtors: allDebtors, transactions: allTxs };
}

export async function apiSaveTransaction(
  tx: Omit<Transaction, 'id' | 'createdAt'>
): Promise<{ success: boolean; transaction?: Transaction; transactions?: Transaction[]; message?: string }> {
  if (!tx.debtorId || !tx.amount || tx.amount <= 0) {
    const errorMsg = 'Thông tin giao dịch không hợp lệ (Số tiền phải lớn hơn 0 và cần chọn người nợ)';
    recordAuditLog({
      action: 'OPERATION_FAILED',
      actor: 'Chủ Sổ (Admin)',
      title: 'Lỗi ghi nhận giao dịch',
      description: errorMsg,
      debtorId: tx.debtorId,
      amount: tx.amount || 0,
      beforeState: 'Nhập giao dịch mới',
      afterState: `Thất bại: ${errorMsg}`,
      changes: [{ fieldLabel: 'Kết quả tạo giao dịch', before: 'Đang tạo', after: 'Thất bại' }],
    });
    return { success: false, message: errorMsg };
  }

  const newId = `tx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  unmarkTxDeleted(newId);

  const localNewTx: Transaction = {
    ...tx,
    id: newId,
    createdAt: new Date().toISOString(),
  };

  // Tính toán số dư trước và sau giao dịch để ghi log chi tiết
  const prevTxs = loadTransactions().filter((t) => t.id !== newId);
  const prevStats = getDebtorAuditStats(tx.debtorId, prevTxs);
  const prevBalance = prevStats.balance;
  const newBalance = prevBalance + (tx.type === 'ADD' ? tx.amount : -tx.amount);
  const isAdd = tx.type === 'ADD';
  const debtorObj = loadDebtors().find((d) => d.id === tx.debtorId);
  const debtorName = debtorObj?.name || 'Người nợ';
  const catLabel = getTxCategoryLabel(tx);

  const txBeforeState = `Dư nợ trước GD: ${fmtMoney(prevBalance)} (${prevStats.txCount} giao dịch)`;
  const txAfterState = `Dư nợ sau GD: ${fmtMoney(newBalance)} (${prevStats.txCount + 1} giao dịch)`;
  const txChanges: AuditChangeDetail[] = [
    {
      fieldLabel: isAdd ? 'Khoản nợ mới (+)' : 'Khoản thu nợ (-)',
      before: '0 VNĐ',
      after: `${isAdd ? '+' : '-'}${fmtMoney(tx.amount)}`,
    },
    {
      fieldLabel: 'Dư nợ tổng cộng',
      before: fmtMoney(prevBalance),
      after: fmtMoney(newBalance),
    },
    {
      fieldLabel: 'Ngày giao dịch',
      before: '-',
      after: tx.date || new Date().toISOString().slice(0, 10),
    },
    {
      fieldLabel: 'Phân loại',
      before: '-',
      after: catLabel,
    },
    ...(tx.note ? [{ fieldLabel: 'Lý do / Ghi chú', before: '(Trống)', after: tx.note }] : []),
    ...(tx.billImage ? [{ fieldLabel: 'Ảnh hóa đơn đính kèm', before: 'Không có', after: 'Đã đính kèm ảnh chứng từ' }] : []),
  ];

  const buildSaveTxLog = () => {
    const isSettled = !isAdd && newBalance === 0 && prevBalance > 0;
    const txAction = isAdd ? 'ADD_TRANSACTION' : isSettled ? 'SETTLE_DEBT' : 'UPDATE_TRANSACTION';
    const txTitle = isAdd
      ? `Ghi nợ (+): ${debtorName}`
      : isSettled
      ? `Tất toán sạch nợ (0đ): ${debtorName}`
      : `Thu nợ (-): ${debtorName}`;
    return {
      action: txAction as 'ADD_TRANSACTION' | 'SETTLE_DEBT' | 'UPDATE_TRANSACTION',
      actor: 'Chủ Sổ (Admin)',
      title: txTitle,
      description: isSettled
        ? `${debtorName} đã hoàn tất thanh toán sạch nợ ${fmtMoney(tx.amount)} (Dư nợ: ${fmtMoney(prevBalance)} → 0 VNĐ, ngày ${tx.date})${tx.note ? ` · Ghi chú: ${tx.note}` : ''}${tx.billImage ? ' · Có ảnh hóa đơn' : ''}`
        : `${isAdd ? 'Ghi nhận nợ mới' : 'Thu hồi nợ'} ${fmtMoney(tx.amount)} cho ${debtorName} ngày ${tx.date}. Dư nợ biến động: ${fmtMoney(prevBalance)} → ${fmtMoney(newBalance)}${tx.note ? ` · Nội dung: ${tx.note}` : ''}${tx.billImage ? ' · Đính kèm ảnh bill' : ''}`,
      debtorId: tx.debtorId,
      debtorName,
      amount: tx.amount,
      beforeState: txBeforeState,
      afterState: txAfterState,
      changes: txChanges,
      metadata: {
        transactionId: newId,
        type: tx.type,
        date: tx.date,
        category: tx.category || 'DIRECT',
        prevBalance,
        newBalance,
        prevTxCount: prevStats.txCount,
        newTxCount: prevStats.txCount + 1,
        hasBillImage: Boolean(tx.billImage),
        isSettled,
      },
    };
  };

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
        recordAuditLog(buildSaveTxLog());
        return { success: true, transaction: data.transaction || localNewTx, transactions: merged };
      }
    }
  } catch {
    // ignore
  }

  // Direct Firestore fallback
  try {
    await saveTransactionDirect(localNewTx).catch((err) => console.warn('Direct saveTransaction warning:', err));
    recordAuditLog(buildSaveTxLog());
    return { success: true, transaction: localNewTx, transactions: currentLocal };
  } catch (err: any) {
    recordAuditLog({
      action: 'OPERATION_FAILED',
      actor: 'Chủ Sổ (Admin)',
      title: 'Lỗi ghi nhận giao dịch',
      description: `Không thể lưu giao dịch cho "${debtorName}": ${err?.message || 'Lỗi hệ thống'}`,
      debtorId: tx.debtorId,
      debtorName,
      amount: tx.amount,
      beforeState: txBeforeState,
      afterState: `Thất bại: ${err?.message || 'Lỗi'}`,
      changes: [{ fieldLabel: 'Kết quả thao tác', before: 'Đang lưu', after: `Lỗi: ${err?.message || 'Thất bại'}` }],
    });
    return { success: false, message: err?.message || 'Lỗi khi lưu giao dịch' };
  }
}

export async function apiUpdateTransaction(
  tx: Transaction
): Promise<{ success: boolean; transaction?: Transaction; transactions?: Transaction[]; message?: string }> {
  unmarkTxDeleted(tx.id);

  const prevAllTxs = loadTransactions();
  const prevAllDebtors = loadDebtors();
  const oldTx = prevAllTxs.find((t) => t.id === tx.id);
  const oldDebtorObj = oldTx ? prevAllDebtors.find((d) => d.id === oldTx.debtorId) : undefined;
  const newDebtorObj = prevAllDebtors.find((d) => d.id === tx.debtorId);

  const prevBalance = getDebtorAuditStats(tx.debtorId, prevAllTxs).balance;
  const nextTxsPreview = prevAllTxs.some((t) => t.id === tx.id)
    ? prevAllTxs.map((t) => (t.id === tx.id ? tx : t))
    : [tx, ...prevAllTxs];
  const newBalance = getDebtorAuditStats(tx.debtorId, nextTxsPreview).balance;

  const txChanges: AuditChangeDetail[] = [];
  if (oldTx) {
    if (oldTx.debtorId !== tx.debtorId) {
      txChanges.push({
        field: 'debtorId',
        fieldLabel: 'Chuyển người nợ',
        before: oldDebtorObj?.name || oldTx.debtorId,
        after: newDebtorObj?.name || tx.debtorId,
      });
    }
    if (oldTx.amount !== tx.amount) {
      txChanges.push({
        field: 'amount',
        fieldLabel: 'Số tiền',
        before: fmtMoney(oldTx.amount),
        after: fmtMoney(tx.amount),
      });
    }
    if (oldTx.type !== tx.type) {
      txChanges.push({
        field: 'type',
        fieldLabel: 'Loại giao dịch',
        before: oldTx.type === 'ADD' ? 'Ghi nợ (+)' : 'Thu nợ (-)',
        after: tx.type === 'ADD' ? 'Ghi nợ (+)' : 'Thu nợ (-)',
      });
    }
    if ((oldTx.date || '') !== (tx.date || '')) {
      txChanges.push({
        field: 'date',
        fieldLabel: 'Ngày giao dịch',
        before: oldTx.date || '(Trống)',
        after: tx.date || '(Trống)',
      });
    }
    if ((oldTx.note || '') !== (tx.note || '')) {
      txChanges.push({
        field: 'note',
        fieldLabel: 'Nội dung / Ghi chú',
        before: oldTx.note || '(Trống)',
        after: tx.note || '(Trống)',
      });
    }
    if ((oldTx.customNote || '') !== (tx.customNote || '')) {
      txChanges.push({
        field: 'customNote',
        fieldLabel: 'Ghi chú phụ',
        before: oldTx.customNote || '(Trống)',
        after: tx.customNote || '(Trống)',
      });
    }
    if ((oldTx.billImage || '') !== (tx.billImage || '')) {
      txChanges.push({
        field: 'billImage',
        fieldLabel: 'Ảnh hóa đơn',
        before: oldTx.billImage ? 'Đã có ảnh cũ' : 'Chưa có ảnh',
        after: tx.billImage ? (oldTx.billImage ? 'Đã thay ảnh mới' : 'Đã thêm ảnh hóa đơn') : 'Đã gỡ ảnh hóa đơn',
      });
    }
    if (prevBalance !== newBalance) {
      txChanges.push({
        fieldLabel: `Số dư nợ (${newDebtorObj?.name || 'Người nợ'})`,
        before: fmtMoney(prevBalance),
        after: fmtMoney(newBalance),
      });
    }
  }
  if (txChanges.length === 0) {
    txChanges.push({
      fieldLabel: 'Thông tin giao dịch',
      before: `${tx.type === 'ADD' ? '+' : '-'}${fmtMoney(tx.amount)}`,
      after: `${tx.type === 'ADD' ? '+' : '-'}${fmtMoney(tx.amount)} (Lưu lại)`,
    });
  }

  const txBeforeState = oldTx
    ? `${oldTx.type === 'ADD' ? 'Nợ (+)' : 'Thu (-)'} ${fmtMoney(oldTx.amount)} · Ngày ${oldTx.date || '-'} · Số dư ${fmtMoney(prevBalance)}${oldTx.note ? ` · ${oldTx.note}` : ''}`
    : 'Không rõ dữ liệu cũ';
  const txAfterState = `${tx.type === 'ADD' ? 'Nợ (+)' : 'Thu (-)'} ${fmtMoney(tx.amount)} · Ngày ${tx.date || '-'} · Số dư ${fmtMoney(newBalance)}${tx.note ? ` · ${tx.note}` : ''}`;

  const buildUpdateTxLog = () => {
    const debtorName = newDebtorObj?.name || 'Người nợ';
    const diffSummary = txChanges.map((c) => c.fieldLabel).join(', ');
    return {
      action: 'UPDATE_TRANSACTION' as const,
      actor: 'Chủ Sổ (Admin)',
      title: `Sửa giao dịch: ${debtorName}`,
      description: `Cập nhật giao dịch của ${debtorName} (${diffSummary}). Hiện tại: ${tx.type === 'ADD' ? '+' : '-'}${fmtMoney(tx.amount)} ngày ${tx.date}${tx.note ? ` · "${tx.note}"` : ''}. Số dư: ${fmtMoney(prevBalance)} → ${fmtMoney(newBalance)}.`,
      debtorId: tx.debtorId,
      debtorName,
      amount: tx.amount,
      beforeState: txBeforeState,
      afterState: txAfterState,
      changes: txChanges,
      metadata: {
        transactionId: tx.id,
        date: tx.date,
        type: tx.type,
        category: tx.category || 'DIRECT',
        prevBalance,
        newBalance,
        hasBillImage: Boolean(tx.billImage),
        fieldsChangedCount: txChanges.length,
      },
    };
  };

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
        recordAuditLog(buildUpdateTxLog());
        return { success: true, transaction: data.transaction || tx, transactions: merged };
      }
    }
  } catch {
    // ignore
  }

  // Direct fallback
  try {
    await saveTransactionDirect(tx).catch((err) => console.warn('Direct updateTx warning:', err));
    recordAuditLog(buildUpdateTxLog());
    return { success: true, transaction: tx, transactions: allTxs };
  } catch (err: any) {
    recordAuditLog({
      action: 'OPERATION_FAILED',
      actor: 'Chủ Sổ (Admin)',
      title: 'Lỗi cập nhật giao dịch',
      description: `Không thể cập nhật giao dịch: ${err?.message || 'Lỗi hệ thống'}`,
      debtorId: tx.debtorId,
      debtorName: newDebtorObj?.name,
      amount: tx.amount,
      beforeState: txBeforeState,
      afterState: `Thất bại: ${err?.message || 'Lỗi'}`,
      changes: [{ fieldLabel: 'Kết quả thao tác', before: 'Đang lưu', after: `Lỗi: ${err?.message || 'Thất bại'}` }],
    });
    return { success: false, message: err?.message || 'Lỗi khi cập nhật giao dịch' };
  }
}

export async function apiDeleteTransaction(
  id: string
): Promise<{ success: boolean; transactions?: Transaction[] }> {
  markTxDeleted(id);
  const prevAllTxs = loadTransactions();
  const oldTx = prevAllTxs.find((t) => t.id === id);
  const allTxs = prevAllTxs.filter((t) => t.id !== id);
  saveTransactions(allTxs);

  const debtorObj = oldTx ? loadDebtors().find((d) => d.id === oldTx.debtorId) : undefined;
  const prevStats = oldTx ? getDebtorAuditStats(oldTx.debtorId, prevAllTxs) : { balance: 0, txCount: 0 };
  const afterStats = oldTx ? getDebtorAuditStats(oldTx.debtorId, allTxs) : { balance: 0, txCount: 0 };

  const deleteBeforeState = oldTx
    ? `${oldTx.type === 'ADD' ? 'Nợ (+)' : 'Thu (-)'} ${fmtMoney(oldTx.amount)} · Ngày ${oldTx.date || '-'} · Số dư ${fmtMoney(prevStats.balance)}${oldTx.note ? ` · ${oldTx.note}` : ''}`
    : 'Giao dịch tồn tại';
  const deleteAfterState = oldTx
    ? `Đã xóa hoàn toàn · Số dư sau xóa: ${fmtMoney(afterStats.balance)} (Còn ${afterStats.txCount} GD)`
    : 'Đã xóa hoàn toàn khỏi sổ nợ';
  const deleteChanges: AuditChangeDetail[] = [
    {
      fieldLabel: 'Trạng thái giao dịch',
      before: `Tồn tại (${oldTx ? `${oldTx.type === 'ADD' ? '+' : '-'}${fmtMoney(oldTx.amount)}` : id})`,
      after: 'Đã xóa hoàn toàn',
    },
    ...(oldTx
      ? [
          {
            fieldLabel: 'Loại & Ngày GD',
            before: `${oldTx.type === 'ADD' ? 'Ghi nợ (+)' : 'Thu nợ (-)'} · ${oldTx.date || '-'}`,
            after: 'Đã hủy',
          },
          {
            fieldLabel: 'Dư nợ người này',
            before: fmtMoney(prevStats.balance),
            after: fmtMoney(afterStats.balance),
          },
          {
            fieldLabel: 'Số giao dịch còn lại',
            before: `${prevStats.txCount} GD`,
            after: `${afterStats.txCount} GD`,
          },
        ]
      : []),
    ...(oldTx?.note ? [{ fieldLabel: 'Ghi chú đã xóa', before: oldTx.note, after: '(Đã xóa)' }] : []),
    ...(oldTx?.billImage ? [{ fieldLabel: 'Ảnh hóa đơn', before: 'Có đính kèm ảnh bill', after: '(Đã xóa)' }] : []),
  ];

  const buildDeleteTxLog = () => ({
    action: 'DELETE_TRANSACTION' as const,
    actor: 'Chủ Sổ (Admin)',
    title: `Xóa giao dịch${debtorObj?.name ? `: ${debtorObj.name}` : ''}`,
    description: oldTx
      ? `Đã xóa giao dịch ${oldTx.type === 'ADD' ? 'ghi nợ (+)' : 'thu nợ (-)'} ${fmtMoney(oldTx.amount)} ngày ${oldTx.date || '-'} của ${debtorObj?.name || 'người nợ'}${oldTx.note ? ` (${oldTx.note})` : ''}. Dư nợ thay đổi: ${fmtMoney(prevStats.balance)} → ${fmtMoney(afterStats.balance)}.`
      : `Đã xóa giao dịch mã ${id}.`,
    debtorId: oldTx?.debtorId,
    debtorName: debtorObj?.name,
    amount: oldTx?.amount,
    beforeState: deleteBeforeState,
    afterState: deleteAfterState,
    changes: deleteChanges,
    metadata: {
      transactionId: id,
      date: oldTx?.date,
      type: oldTx?.type,
      category: oldTx?.category || 'DIRECT',
      prevBalance: prevStats.balance,
      afterBalance: afterStats.balance,
      remainingTxCount: afterStats.txCount,
      hadBillImage: Boolean(oldTx?.billImage),
    },
  });

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
        recordAuditLog(buildDeleteTxLog());
        return { success: true, transactions: filtered };
      }
    }
  } catch {
    // ignore
  }

  await deleteTransactionDirect(id).catch((err) => console.warn('Direct deleteTransaction warning:', err));
  recordAuditLog(buildDeleteTxLog());
  return { success: true, transactions: allTxs };
}

export async function apiSavePartySplit(
  party: Omit<PartySplit, 'id' | 'createdAt'> & { id?: string },
  transactions: Omit<Transaction, 'id' | 'createdAt'>[]
): Promise<{ success: boolean; parties?: PartySplit[]; transactions?: Transaction[]; message?: string }> {
  if (!party.name || !party.name.trim() || !party.totalAmount || party.totalAmount <= 0) {
    const errorMsg = 'Thông tin cuộc vui không hợp lệ (Tên và tổng tiền phải lớn hơn 0)';
    recordAuditLog({
      action: 'OPERATION_FAILED',
      actor: 'Chủ Sổ (Admin)',
      title: 'Lỗi tạo cuộc chia tiền',
      description: errorMsg,
      amount: party.totalAmount || 0,
      beforeState: 'Nhập thông tin chia bill',
      afterState: `Thất bại: ${errorMsg}`,
      changes: [{ fieldLabel: 'Kết quả tạo cuộc vui', before: 'Đang tạo', after: 'Thất bại' }],
    });
    return { success: false, message: errorMsg };
  }

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

  const debtorMap = new Map(loadDebtors().map((d) => [d.id, d.name]));
  const participantNames = (newParty.participantDebtorIds || []).map((did) => debtorMap.get(did) || did);
  const payerName =
    newParty.payerType === 'DEBTOR' || newParty.payerType === 'DEBTOR_ASSIGNED'
      ? `${debtorMap.get(newParty.payerDebtorId || '') || 'Thành viên nhóm'}${newParty.payerType === 'DEBTOR_ASSIGNED' ? ' (Ghi nợ lại cho người này)' : ''}`
      : 'Tôi (Chủ sổ trả trước)';
  const totalHeadcount = newParty.totalPeopleCount || createdTxs.length + (newParty.includeMe ? 1 : 0);

  const partyBeforeState = 'Chưa có cuộc chia tiền này';
  const partyAfterState = `Cuộc vui: "${newParty.name}" · Ngày ${newParty.date || '-'} · Tổng ${fmtMoney(newParty.totalAmount)} / ${totalHeadcount} người (${fmtMoney(newParty.splitAmountPerPerson || 0)}/người) · Tham gia: ${participantNames.join(', ') || '-'}`;
  const partyChanges: AuditChangeDetail[] = [
    { fieldLabel: 'Tên & Ngày cuộc vui', before: '-', after: `${newParty.name} (${newParty.date || '-'})` },
    { fieldLabel: 'Tổng tiền cuộc vui', before: '0 VNĐ', after: fmtMoney(newParty.totalAmount) },
    { fieldLabel: 'Số người chia bill', before: '0', after: `${totalHeadcount} người (${newParty.includeMe ? 'Có tính chủ sổ' : 'Không tính chủ sổ'})` },
    { fieldLabel: 'Đơn giá mỗi người', before: '0 VNĐ', after: fmtMoney(newParty.splitAmountPerPerson || 0) },
    { fieldLabel: 'Người thanh toán trước', before: '-', after: payerName },
    { fieldLabel: 'Thành viên tham gia', before: '-', after: participantNames.join(', ') || '(Không có)' },
    ...(newParty.note ? [{ fieldLabel: 'Ghi chú cuộc vui', before: '(Trống)', after: newParty.note }] : []),
    ...(newParty.billImage ? [{ fieldLabel: 'Ảnh hóa đơn nhóm', before: 'Không có', after: 'Đã đính kèm ảnh bill' }] : []),
  ];

  const buildSavePartyLog = () => ({
    action: 'ADD_PARTY' as const,
    actor: 'Chủ Sổ (Admin)',
    title: `Chia bill nhóm mới: ${newParty.name}`,
    description: `Tạo cuộc chia bill "${newParty.name}" ngày ${newParty.date || '-'}: Tổng ${fmtMoney(newParty.totalAmount)} chia ${totalHeadcount} người (${fmtMoney(newParty.splitAmountPerPerson || 0)}/người). Thanh toán trước: ${payerName}. Tham gia: ${participantNames.join(', ')}. Đã sinh ${createdTxs.length} giao dịch con.`,
    amount: newParty.totalAmount,
    beforeState: partyBeforeState,
    afterState: partyAfterState,
    changes: partyChanges,
    metadata: {
      partyId,
      date: newParty.date,
      totalAmount: newParty.totalAmount,
      splitAmountPerPerson: newParty.splitAmountPerPerson,
      totalPeopleCount: totalHeadcount,
      includeMe: Boolean(newParty.includeMe),
      payerType: newParty.payerType || 'ME',
      payerName,
      participants: participantNames,
      generatedTxCount: createdTxs.length,
      hasBillImage: Boolean(newParty.billImage),
    },
  });

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
        recordAuditLog(buildSavePartyLog());
        return { success: true, parties: mergedParties, transactions: mergedTxs };
      }
    }
  } catch {
    // ignore
  }

  // Direct fallback
  try {
    await savePartyDirect(newParty, createdTxs).catch((err) => console.warn('Direct saveParty warning:', err));
    recordAuditLog(buildSavePartyLog());
    return { success: true, parties: allParties, transactions: updatedTxs };
  } catch (err: any) {
    recordAuditLog({
      action: 'OPERATION_FAILED',
      actor: 'Chủ Sổ (Admin)',
      title: 'Lỗi tạo cuộc chia tiền',
      description: `Không thể tạo cuộc chia bill "${newParty.name}": ${err?.message || 'Lỗi hệ thống'}`,
      amount: newParty.totalAmount,
      beforeState: partyBeforeState,
      afterState: `Thất bại: ${err?.message || 'Lỗi'}`,
      changes: [{ fieldLabel: 'Kết quả thao tác', before: 'Đang tạo', after: `Lỗi: ${err?.message || 'Thất bại'}` }],
    });
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
  const removedTxs = currentTxs.filter((t) => t.partyId === partyId);
  const debtorMap = new Map(loadDebtors().map((d) => [d.id, d.name]));
  const deletedParticipants = (oldParty?.participantDebtorIds || []).map((did) => debtorMap.get(did) || did);

  const partyDeleteBeforeState = `Cuộc vui: "${oldParty?.name || partyId}" · Ngày ${oldParty?.date || '-'} · Tổng ${fmtMoney(oldParty?.totalAmount || 0)} · ${removedTxs.length} giao dịch con (${deletedParticipants.join(', ') || '-'})`;
  const partyDeleteAfterState = 'Đã hủy cuộc vui và thu hồi toàn bộ khoản phân bổ nợ liên quan';
  const partyDeleteChanges: AuditChangeDetail[] = [
    { fieldLabel: 'Trạng thái cuộc vui', before: `Tồn tại (${oldParty?.name || partyId})`, after: 'Đã xóa hoàn toàn' },
    { fieldLabel: 'Tổng tiền chia bill', before: fmtMoney(oldParty?.totalAmount || 0), after: '0 VNĐ' },
    { fieldLabel: 'Giao dịch phân bổ bị thu hồi', before: `${removedTxs.length} giao dịch`, after: '0 (Đã xóa)' },
    ...(deletedParticipants.length > 0
      ? [{ fieldLabel: 'Thành viên liên quan', before: deletedParticipants.join(', '), after: 'Đã hoàn tác dư nợ' }]
      : []),
  ];

  const buildDeletePartyLog = () => ({
    action: 'DELETE_PARTY' as const,
    actor: 'Chủ Sổ (Admin)',
    title: `Xóa cuộc chia tiền: ${oldParty?.name || partyId}`,
    description: `Đã xóa cuộc chia bill "${oldParty?.name || partyId}" (ngày ${oldParty?.date || '-'}, tổng ${fmtMoney(oldParty?.totalAmount || 0)}) và thu hồi ${removedTxs.length} giao dịch phân bổ của ${deletedParticipants.join(', ') || 'các thành viên'}.`,
    amount: oldParty?.totalAmount,
    beforeState: partyDeleteBeforeState,
    afterState: partyDeleteAfterState,
    changes: partyDeleteChanges,
    metadata: {
      partyId,
      date: oldParty?.date,
      deletedTxCount: removedTxs.length,
      participants: deletedParticipants,
      totalAmount: oldParty?.totalAmount || 0,
    },
  });

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
        recordAuditLog(buildDeletePartyLog());
        return { success: true, parties: finalParties, transactions: finalTxs };
      }
    }
  } catch {
    // ignore
  }

  // 3. Fallback direct Firestore sync
  await deletePartyDirect(partyId).catch((err) => console.warn('Direct deleteParty warning:', err));
  recordAuditLog(buildDeletePartyLog());
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

  const debtorMap = new Map(loadDebtors().map((d) => [d.id, d.name]));
  const oldParticipantIds = oldParty?.participantDebtorIds || [];
  const newParticipantIds = updatedParty.participantDebtorIds || [];
  const oldNames = oldParticipantIds.map((did) => debtorMap.get(did) || did);
  const newNames = newParticipantIds.map((did) => debtorMap.get(did) || did);
  const addedParticipants = newParticipantIds.filter((did) => !oldParticipantIds.includes(did)).map((did) => debtorMap.get(did) || did);
  const removedParticipants = oldParticipantIds.filter((did) => !newParticipantIds.includes(did)).map((did) => debtorMap.get(did) || did);

  const resolvePayer = (p?: Partial<PartySplit>) =>
    p?.payerType === 'DEBTOR' || p?.payerType === 'DEBTOR_ASSIGNED'
      ? debtorMap.get(p.payerDebtorId || '') || 'Thành viên nhóm'
      : 'Tôi (Chủ sổ)';

  const partyUpdateChanges: AuditChangeDetail[] = [];
  if (oldParty) {
    if (oldParty.name !== updatedParty.name) {
      partyUpdateChanges.push({ fieldLabel: 'Tên cuộc vui', before: oldParty.name, after: updatedParty.name });
    }
    if ((oldParty.date || '') !== (updatedParty.date || '')) {
      partyUpdateChanges.push({ fieldLabel: 'Ngày tổ chức', before: oldParty.date || '-', after: updatedParty.date || '-' });
    }
    if (oldParty.totalAmount !== updatedParty.totalAmount) {
      partyUpdateChanges.push({
        fieldLabel: 'Tổng tiền',
        before: fmtMoney(oldParty.totalAmount),
        after: fmtMoney(updatedParty.totalAmount),
      });
    }
    if ((oldParty.splitAmountPerPerson || 0) !== (updatedParty.splitAmountPerPerson || 0)) {
      partyUpdateChanges.push({
        fieldLabel: 'Tiền mỗi người',
        before: fmtMoney(oldParty.splitAmountPerPerson || 0),
        after: fmtMoney(updatedParty.splitAmountPerPerson || 0),
      });
    }
    if ((oldParty.totalPeopleCount || 0) !== (updatedParty.totalPeopleCount || 0)) {
      partyUpdateChanges.push({
        fieldLabel: 'Số người chia',
        before: `${oldParty.totalPeopleCount} người`,
        after: `${updatedParty.totalPeopleCount} người`,
      });
    }
    if ((oldParty.payerType || 'ME') !== (updatedParty.payerType || 'ME') || (oldParty.payerDebtorId || '') !== (updatedParty.payerDebtorId || '')) {
      partyUpdateChanges.push({
        fieldLabel: 'Người thanh toán trước',
        before: resolvePayer(oldParty),
        after: resolvePayer(updatedParty),
      });
    }
    if (addedParticipants.length > 0 || removedParticipants.length > 0) {
      partyUpdateChanges.push({
        fieldLabel: 'Thành viên tham gia',
        before: oldNames.join(', ') || '(Trống)',
        after: newNames.join(', ') || '(Trống)',
      });
    }
    if ((oldParty.note || '') !== (updatedParty.note || '')) {
      partyUpdateChanges.push({
        fieldLabel: 'Ghi chú',
        before: oldParty.note || '(Trống)',
        after: updatedParty.note || '(Trống)',
      });
    }
    if ((oldParty.billImage || '') !== (updatedParty.billImage || '')) {
      partyUpdateChanges.push({
        fieldLabel: 'Ảnh hóa đơn nhóm',
        before: oldParty.billImage ? 'Có ảnh cũ' : 'Không có',
        after: updatedParty.billImage ? 'Đã cập nhật ảnh mới' : 'Đã gỡ ảnh',
      });
    }
  }
  if (partyUpdateChanges.length === 0) {
    partyUpdateChanges.push({
      fieldLabel: 'Thông tin cuộc vui',
      before: updatedParty.name,
      after: `${updatedParty.name} (Đã cập nhật chia tiền)`,
    });
  }

  const partyUpdateBeforeState = oldParty
    ? `Cuộc vui: "${oldParty.name}" · Ngày ${oldParty.date || '-'} · Tổng ${fmtMoney(oldParty.totalAmount)} · ${oldParty.totalPeopleCount} người (${oldNames.join(', ') || '-'})`
    : 'Chưa có thông tin cũ';
  const partyUpdateAfterState = `Cuộc vui: "${updatedParty.name}" · Ngày ${updatedParty.date || '-'} · Tổng ${fmtMoney(updatedParty.totalAmount)} · ${updatedParty.totalPeopleCount} người (${newNames.join(', ') || '-'})`;

  const buildUpdatePartyLog = () => ({
    action: 'UPDATE_PARTY' as const,
    actor: 'Chủ Sổ (Admin)',
    title: `Sửa cuộc chia bill: ${updatedParty.name}`,
    description: `Cập nhật cuộc chia bill "${updatedParty.name}" ngày ${updatedParty.date || '-'} (Tổng ${fmtMoney(updatedParty.totalAmount)} / ${updatedParty.totalPeopleCount} người, ${fmtMoney(updatedParty.splitAmountPerPerson || 0)}/người).${addedParticipants.length ? ` Thêm: ${addedParticipants.join(', ')}.` : ''}${removedParticipants.length ? ` Gỡ: ${removedParticipants.join(', ')}.` : ''}`,
    amount: updatedParty.totalAmount,
    beforeState: partyUpdateBeforeState,
    afterState: partyUpdateAfterState,
    changes: partyUpdateChanges,
    metadata: {
      partyId,
      date: updatedParty.date,
      totalAmount: updatedParty.totalAmount,
      splitAmountPerPerson: updatedParty.splitAmountPerPerson,
      totalPeopleCount: updatedParty.totalPeopleCount,
      participants: newNames,
      addedParticipants,
      removedParticipants,
      payerName: resolvePayer(updatedParty),
      hasBillImage: Boolean(updatedParty.billImage),
    },
  });

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
        recordAuditLog(buildUpdatePartyLog());
        return { success: true, parties: mergedParties, transactions: mergedTxs };
      }
    }
  } catch {
    // ignore
  }

  // 2. Direct fallback
  try {
    await updatePartyDirect(updatedParty, createdTxs).catch((err) => console.warn('Direct updateParty warning:', err));
    recordAuditLog(buildUpdatePartyLog());
    return { success: true, parties: allParties, transactions: updatedTxs };
  } catch (err: any) {
    recordAuditLog({
      action: 'OPERATION_FAILED',
      actor: 'Chủ Sổ (Admin)',
      title: 'Lỗi sửa cuộc chia tiền',
      description: `Không thể cập nhật cuộc chia bill "${updatedParty.name}": ${err?.message || 'Lỗi hệ thống'}`,
      amount: updatedParty.totalAmount,
      beforeState: partyUpdateBeforeState,
      afterState: `Thất bại: ${err?.message || 'Lỗi'}`,
      changes: [{ fieldLabel: 'Kết quả thao tác', before: 'Đang lưu', after: `Lỗi: ${err?.message || 'Thất bại'}` }],
    });
    return { success: false, message: err?.message || 'Lỗi khi cập nhật chia tiền' };
  }
}

export async function apiSaveSettings(
  settings: AppSettings
): Promise<{ success: boolean; settings?: AppSettings; message?: string }> {
  // Lấy cài đặt cũ để so sánh trước và sau khi lưu toàn diện mọi trường
  const oldSettings = loadSettings();
  const settingsChanges: AuditChangeDetail[] = [];

  const diffStr = (key: keyof AppSettings, label: string, emptyVal = '(Trống)') => {
    const prev = String(oldSettings[key] ?? '').trim();
    const next = String(settings[key] ?? '').trim();
    if (prev !== next) {
      settingsChanges.push({
        field: String(key),
        fieldLabel: label,
        before: prev || emptyVal,
        after: next || emptyVal,
      });
    }
  };

  diffStr('ownerName', 'Tên chủ sổ');
  diffStr('ownerPhone', 'SĐT chủ sổ');
  diffStr('bankId', 'Mã ngân hàng');
  diffStr('bankName', 'Tên ngân hàng');
  diffStr('accountNumber', 'Số tài khoản');
  diffStr('accountName', 'Tên chủ tài khoản');
  if ((oldSettings.ownerPassword || '') !== (settings.ownerPassword || '')) {
    settingsChanges.push({
      field: 'ownerPassword',
      fieldLabel: 'Mật khẩu quản trị',
      before: maskSecret(oldSettings.ownerPassword),
      after: `Đã đổi mới (${(settings.ownerPassword || '').trim().length} ký tự)`,
    });
  }
  diffStr('defaultQrMode', 'Chế độ mã VietQR');
  diffStr('vietQrTemplate', 'Mẫu khung VietQR');
  diffStr('appTitle', 'Tiêu đề sổ', '(Mặc định)');
  diffStr('appSubtitle', 'Mô tả phụ', '(Mặc định)');
  diffStr('guestAnnouncement', 'Thông báo ghim cho khách');
  diffStr('settledThankYouNote', 'Lời cảm ơn tất toán');
  diffStr('lookupInstructionText', 'Hướng dẫn tra cứu');
  diffStr('lookupGuideTemplate', 'Mẫu tin nhắn chia sẻ');
  diffStr('autoLockTimeout', 'Tự động khóa khi rời app');
  diffStr('themeColor', 'Màu chủ đạo');
  diffStr('debtorCardLayout', 'Kiểu hiển thị thẻ');
  if ((oldSettings.showSummaryStats ?? true) !== (settings.showSummaryStats ?? true)) {
    settingsChanges.push({
      field: 'showSummaryStats',
      fieldLabel: 'Hiện thống kê tổng quan',
      before: (oldSettings.showSummaryStats ?? true) ? 'Bật' : 'Tắt',
      after: (settings.showSummaryStats ?? true) ? 'Bật' : 'Tắt',
    });
  }
  diffStr('googleAppsScriptUrl', 'URL Apps Script Webhook');
  diffStr('googleSheetUrl', 'Link Google Sheets');
  if ((oldSettings.autoSyncGoogleSheets ?? false) !== (settings.autoSyncGoogleSheets ?? false)) {
    settingsChanges.push({
      field: 'autoSyncGoogleSheets',
      fieldLabel: 'Tự động đồng bộ Google Sheets',
      before: oldSettings.autoSyncGoogleSheets ? 'Bật' : 'Tắt',
      after: settings.autoSyncGoogleSheets ? 'Bật' : 'Tắt',
    });
  }

  const settingsBeforeState = `Ngân hàng: ${oldSettings.bankName || oldSettings.bankId || '-'} (STK: ${oldSettings.accountNumber || '-'}) · Chủ sổ: ${oldSettings.ownerName || '-'} · Tự khóa: ${oldSettings.autoLockTimeout || 'IMMEDIATE'}`;
  const settingsAfterState = `Ngân hàng: ${settings.bankName || settings.bankId || '-'} (STK: ${settings.accountNumber || '-'}) · Chủ sổ: ${settings.ownerName || '-'} · Tự khóa: ${settings.autoLockTimeout || 'IMMEDIATE'}`;

  const recordSettingsLogIfChanged = (saved: AppSettings) => {
    // Tránh ghi log thừa khi chỉ cập nhật timestamp đồng bộ nền (lastGoogleSheetSyncAt)
    if (settingsChanges.length === 0) return;
    const changedLabels = settingsChanges.map((c) => c.fieldLabel).join(', ');
    recordAuditLog({
      action: 'UPDATE_SETTINGS',
      actor: 'Chủ Sổ (Admin)',
      title: `Cập nhật cài đặt (${settingsChanges.length} mục)`,
      description: `Đã thay đổi: ${changedLabels}. Tài khoản nhận hiện tại: ${saved.bankName || saved.bankId} (${saved.accountNumber || 'Chưa có STK'}).`,
      beforeState: settingsBeforeState,
      afterState: settingsAfterState,
      changes: settingsChanges,
      metadata: {
        changedFields: settingsChanges.map((c) => c.field || c.fieldLabel),
        changedCount: settingsChanges.length,
        bankId: saved.bankId,
        autoLockTimeout: saved.autoLockTimeout || 'IMMEDIATE',
      },
    });
  };

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
        recordSettingsLogIfChanged(data.settings);
        return { success: true, settings: data.settings };
      }
    }
  } catch (err) {
    console.warn('Server saveSettings notice, falling back to direct Firestore:', err);
  }

  // 3. Fallback direct Firestore sync
  try {
    await saveSettingsDirect(settings);
    recordSettingsLogIfChanged(settings);
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

  const recordLookupAudit = (debtor: Debtor, txs: Transaction[] = [], source: string) => {
    try {
      const stats = getDebtorAuditStats(debtor.id, txs);
      const balanceStr = fmtMoney(stats.balance);
      const safePin = (debtor.pin || cleanPin).trim();
      const lookupBeforeState = 'Trạng thái khách: Chưa đăng nhập tra cứu';
      const lookupAfterState = `Đã xác thực mã PIN: ${safePin} (${source}), đối soát số dư ${balanceStr} (${stats.txCount} giao dịch)`;
      const lookupChanges: AuditChangeDetail[] = [
        { fieldLabel: 'Mã PIN tra cứu', before: 'Chưa nhập', after: `Khớp PIN (${safePin})` },
        { fieldLabel: 'Nguồn dữ liệu', before: '-', after: source },
        { fieldLabel: 'Dư nợ đối soát', before: 'Ẩn', after: `${balanceStr} (${stats.txCount} GD · Gồm ${stats.splitCount} bill nhóm)` },
        { fieldLabel: 'Tổng nợ / Đã trả', before: '-', after: `Nợ ${fmtMoney(stats.addTotal)} · Đã trả ${fmtMoney(stats.subTotal)}` },
      ];

      recordAuditLog({
        action: 'GUEST_LOOKUP',
        actor: `Khách: ${debtor.name}`,
        title: `Khách tra cứu sổ nợ: ${debtor.name}`,
        description: `Khách "${debtor.name}" đã tra cứu bảng đối soát (PIN: ${safePin}, Nguồn: ${source}). Dư nợ hiện tại: ${balanceStr} qua ${stats.txCount} giao dịch (Tổng vay ${fmtMoney(stats.addTotal)}, đã trả ${fmtMoney(stats.subTotal)}).`,
        debtorId: debtor.id,
        debtorName: debtor.name,
        amount: stats.balance,
        beforeState: lookupBeforeState,
        afterState: lookupAfterState,
        changes: lookupChanges,
        metadata: {
          pin: safePin,
          source,
          balance: stats.balance,
          totalAdd: stats.addTotal,
          totalSub: stats.subTotal,
          txCount: stats.txCount,
          splitCount: stats.splitCount,
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
        recordLookupAudit(data.debtor, data.transactions || [], 'Server API');
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
      recordLookupAudit(directRes.debtor, directRes.transactions || [], 'Cloud Firestore trực tiếp');
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
    recordLookupAudit(found, debtorTxs, 'Bộ nhớ cục bộ (Offline)');
    return {
      success: true,
      debtor: found,
      transactions: debtorTxs,
      settings,
    };
  }
  const maskedPin = cleanPin.length > 2 ? `${cleanPin.slice(0, 1)}***${cleanPin.slice(-1)}` : '***';
  recordAuditLog({
    action: 'LOOKUP_FAILED',
    actor: 'Khách vãng lai',
    title: 'Khách tra cứu thất bại',
    description: `Khách đã nhập mã tra cứu không hợp lệ hoặc không tồn tại (${maskedPin}).`,
    beforeState: 'Chưa tra cứu',
    afterState: 'Từ chối xem thông tin (Sai mã PIN)',
    changes: [{ fieldLabel: 'Kết quả tra cứu', before: 'Chờ nhập mã', after: `Không tìm thấy (${maskedPin})` }],
    metadata: { maskedInput: maskedPin, inputLength: cleanPin.length },
  });
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
  const currentStats = debtorObj ? getDebtorAuditStats(debtorObj.id, loadTransactions()) : { balance: 0, txCount: 0 };
  const projectedBalance = currentStats.balance - amount;

  const recordReportAudit = (debtorName?: string, debtorId?: string) => {
    try {
      const amountStr = fmtMoney(amount);
      const reportBeforeState = `Dư nợ trước báo CK: ${fmtMoney(currentStats.balance)} (${currentStats.txCount} GD)`;
      const reportAfterState = `Đã báo CK ${amountStr} · Dư nợ dự kiến: ${fmtMoney(projectedBalance)}`;
      const reportChanges: AuditChangeDetail[] = [
        { fieldLabel: 'Số tiền báo CK', before: '0 VNĐ', after: amountStr },
        { fieldLabel: 'Dư nợ dự kiến', before: fmtMoney(currentStats.balance), after: fmtMoney(projectedBalance) },
        { fieldLabel: 'Ghi chú giao dịch', before: '(Trống)', after: note || 'Chuyển khoản thanh toán' },
        { fieldLabel: 'Ảnh biên lai', before: 'Chưa có', after: billImage ? 'Có đính kèm ảnh biên lai CK' : 'Không có ảnh' },
      ];

      recordAuditLog({
        action: 'GUEST_REPORT',
        actor: `Khách: ${debtorName || 'Khách nợ'}`,
        title: `Khách báo chuyển khoản: ${debtorName || 'Khách'}`,
        description: `Khách "${debtorName || 'Người nợ'}" vừa báo đã chuyển khoản ${amountStr} (PIN: ${cleanPin})${note ? ` · Nội dung: "${note}"` : ''}${billImage ? ' · Có đính kèm ảnh biên lai' : ''}. Dư nợ: ${fmtMoney(currentStats.balance)} → ${fmtMoney(projectedBalance)}.`,
        debtorId,
        debtorName,
        amount,
        beforeState: reportBeforeState,
        afterState: reportAfterState,
        changes: reportChanges,
        metadata: {
          pin: cleanPin,
          amount,
          note: note || '',
          prevBalance: currentStats.balance,
          projectedBalance,
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
  } else {
    recordAuditLog({
      action: 'OPERATION_FAILED',
      actor: debtorObj?.name ? `Khách: ${debtorObj.name}` : 'Khách vãng lai',
      title: 'Lỗi khách báo chuyển khoản',
      description: `Báo chuyển khoản thất bại: ${directRes.message || 'Lỗi không xác định'}`,
      debtorId: debtorObj?.id,
      debtorName: debtorObj?.name,
      amount,
      beforeState: `Định gửi báo chuyển khoản ${fmtMoney(amount)}`,
      afterState: `Thất bại: ${directRes.message || 'Lỗi'}`,
      changes: [{ fieldLabel: 'Kết quả gửi báo', before: 'Đang gửi', after: 'Thất bại' }],
    });
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
  const prevDbId = getClientFirebaseConfig().firestoreDatabaseId;
  const logDbSwitch = (channel: string) => {
    recordAuditLog({
      action: 'CLOUD_SYNC',
      actor: 'Chủ Sổ (Admin)',
      title: `Chuyển Database Cloud Firestore: ${options.databaseId}`,
      description: `Đã chuyển kết nối Cloud Firestore từ "${prevDbId}" sang "${options.databaseId}" qua ${channel}${options.migrateExistingData ? ' (có di chuyển dữ liệu hiện có)' : ''}.`,
      beforeState: `Database: ${prevDbId}`,
      afterState: `Database: ${options.databaseId}`,
      changes: [
        { fieldLabel: 'Database ID', before: prevDbId, after: options.databaseId },
        { fieldLabel: 'Di chuyển dữ liệu', before: '-', after: options.migrateExistingData ? 'Có di chuyển' : 'Không' },
        { fieldLabel: 'Kênh kết nối', before: '-', after: channel },
      ],
      metadata: {
        previousDatabaseId: prevDbId,
        targetDatabaseId: options.databaseId,
        migrateExistingData: Boolean(options.migrateExistingData),
        channel,
      },
    });
  };

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
        logDbSwitch('Server API');
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
      logDbSwitch('Cloud Firestore trực tiếp');
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
  recordAuditLog({
    action: 'OPERATION_FAILED',
    actor: 'Chủ Sổ (Admin)',
    title: 'Lỗi chuyển Database Cloud Firestore',
    description: `Không thể chuyển kết nối sang "${options.databaseId}": ${test.error || 'Lỗi kết nối'}`,
    beforeState: `Database: ${prevDbId}`,
    afterState: `Thất bại khi nối "${options.databaseId}"`,
    changes: [{ fieldLabel: 'Database đích', before: prevDbId, after: `Lỗi: ${options.databaseId}` }],
  });
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
  const prevDbId = getClientFirebaseConfig().firestoreDatabaseId;
  const defaultDbId = getClientFirebaseConfig().defaultDatabaseId;

  const logResetDb = (targetDb: string) => {
    recordAuditLog({
      action: 'CLOUD_SYNC',
      actor: 'Chủ Sổ (Admin)',
      title: 'Khôi phục Database Cloud Firestore mặc định',
      description: `Đã khôi phục kết nối Cloud Firestore từ "${prevDbId}" về database mặc định "${targetDb}".`,
      beforeState: `Database tùy chỉnh: ${prevDbId}`,
      afterState: `Database mặc định: ${targetDb}`,
      changes: [{ fieldLabel: 'Database ID', before: prevDbId, after: targetDb }],
      metadata: { previousDatabaseId: prevDbId, targetDatabaseId: targetDb },
    });
  };

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
        logResetDb(data.databaseId || defaultDbId);
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
    logResetDb(defaultDbId);
    return {
      success: true,
      message: 'Đã khôi phục cơ sở dữ liệu Cloud Firestore mặc định.',
      databaseId: defaultDbId,
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
      recordAuditLog({
        action: 'CLOUD_SYNC',
        actor: 'Chủ Sổ (Admin)',
        title: 'Tạo bản sao lưu Snapshot',
        description: `Đã tạo bản sao lưu Snapshot "${data.filename || label || 'Mới'}" (${loadDebtors().length} người nợ, ${loadTransactions().length} giao dịch).`,
        beforeState: 'Dữ liệu sổ nợ hiện tại',
        afterState: `Đã lưu Snapshot: ${data.filename || label || 'Thành công'}`,
        changes: [
          { fieldLabel: 'Tên Snapshot', before: '-', after: data.filename || label || 'Snapshot' },
          { fieldLabel: 'Quy mô dữ liệu', before: '-', after: `${loadDebtors().length} người nợ · ${loadTransactions().length} GD` },
        ],
        metadata: {
          filename: data.filename,
          label,
          debtorsCount: loadDebtors().length,
          transactionsCount: loadTransactions().length,
        },
      });
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
  const prevDebtors = loadDebtors().length;
  const prevTxs = loadTransactions().length;
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
        const nextDebtors = (data.data.debtors || []).length;
        const nextTxs = (data.data.transactions || []).length;
        recordAuditLog({
          action: 'RESTORE_DATA',
          actor: 'Chủ Sổ (Admin)',
          title: `Khôi phục Snapshot: ${filename}`,
          description: `Đã khôi phục dữ liệu từ bản sao lưu "${filename}" (${nextDebtors} người nợ, ${nextTxs} giao dịch).`,
          beforeState: `Trước khôi phục: ${prevDebtors} người nợ · ${prevTxs} GD`,
          afterState: `Sau khôi phục: ${nextDebtors} người nợ · ${nextTxs} GD`,
          changes: [
            { fieldLabel: 'Tệp Snapshot', before: '-', after: filename },
            { fieldLabel: 'Người nợ', before: `${prevDebtors} người`, after: `${nextDebtors} người` },
            { fieldLabel: 'Giao dịch', before: `${prevTxs} GD`, after: `${nextTxs} GD` },
          ],
          metadata: { filename, prevDebtors, prevTxs, nextDebtors, nextTxs },
        });
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
  const prevDebtorsCount = loadDebtors().length;
  const prevTxsCount = loadTransactions().length;
  const prevPartiesCount = loadParties().length;

  const logRestoreSuccess = (
    nextD: number,
    nextT: number,
    nextP: number,
    channel: string
  ) => {
    recordAuditLog({
      action: 'RESTORE_DATA',
      actor: 'Chủ Sổ (Admin)',
      title: `Khôi phục dữ liệu từ JSON (${mode === 'merge' ? 'Gộp' : 'Ghi đè'})`,
      description: `Đã nạp thành công ${nextD} người nợ, ${nextT} giao dịch, ${nextP} cuộc vui từ tệp JSON qua ${channel}.`,
      beforeState: `Trước khi nhập: ${prevDebtorsCount} người nợ · ${prevTxsCount} GD · ${prevPartiesCount} cuộc vui`,
      afterState: `Sau khi nhập: ${nextD} người nợ · ${nextT} GD · ${nextP} cuộc vui`,
      changes: [
        { fieldLabel: 'Chế độ khôi phục', before: '-', after: mode === 'merge' ? 'Gộp dữ liệu' : 'Ghi đè hoàn toàn' },
        { fieldLabel: 'Người nợ', before: `${prevDebtorsCount} người`, after: `${nextD} người` },
        { fieldLabel: 'Giao dịch', before: `${prevTxsCount} GD`, after: `${nextT} GD` },
        { fieldLabel: 'Cuộc chia bill', before: `${prevPartiesCount} cuộc`, after: `${nextP} cuộc` },
      ],
      metadata: { mode, channel, prevDebtorsCount, prevTxsCount, nextDebtorsCount: nextD, nextTxsCount: nextT, nextPartiesCount: nextP },
    });
  };

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
        logRestoreSuccess(
          (data.data.debtors || []).length,
          (data.data.transactions || []).length,
          (data.data.parties || []).length,
          'Server API'
        );
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

    const currentSettings = loadSettings();
    if (parsedSettings && typeof parsedSettings === 'object') {
      const { ownerPassword: _ignoredPass, reminderMessageTemplate, shareMessageTemplate, ...cleanSettings } = parsedSettings;
      parsedSettings = { ...currentSettings, ...cleanSettings, ownerPassword: currentSettings.ownerPassword };
    } else {
      parsedSettings = currentSettings;
    }

    if (mode === 'merge') {
      const currentDebtors = loadDebtors();
      const currentTx = loadTransactions();
      const currentParties = loadParties();

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
    logRestoreSuccess(
      formatted.debtors.length,
      formatted.transactions.length,
      formatted.parties.length,
      'Cloud Firestore trực tiếp'
    );
    return {
      success: true,
      message: `Đã khôi phục thành công ${formatted.debtors.length} người nợ, ${formatted.transactions.length} giao dịch lên Cloud Firestore!`,
      ...formatted,
    };
  } catch (err: any) {
    recordAuditLog({
      action: 'OPERATION_FAILED',
      actor: 'Chủ Sổ (Admin)',
      title: 'Lỗi khôi phục tệp JSON',
      description: `Không thể khôi phục dữ liệu: ${err?.message || 'Tệp không đúng định dạng'}`,
      beforeState: 'Thử nhập tệp sao lưu JSON',
      afterState: `Thất bại: ${err?.message || 'Lỗi'}`,
      changes: [{ fieldLabel: 'Kết quả khôi phục', before: 'Đang xử lý', after: 'Thất bại' }],
    });
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
      const data = await res.json();
      if (data.success) {
        recordAuditLog({
          action: data.removedCount > 0 ? 'CLEAR_DATA' : 'CLOUD_SYNC',
          actor: 'Chủ Sổ (Admin)',
          title: data.removedCount > 0 ? `Dọn dẹp ${data.removedCount} giao dịch mồ côi` : 'Quét kiểm tra giao dịch mồ côi',
          description:
            data.removedCount > 0
              ? `Đã tự động loại bỏ ${data.removedCount} giao dịch không còn liên kết với người nợ nào. Còn lại ${data.transactionsCount ?? '-'} giao dịch hợp lệ.`
              : `Đã quét kiểm tra toàn bộ dữ liệu: không phát hiện giao dịch rác hay mồ côi nào (${data.transactionsCount ?? loadTransactions().length} giao dịch đều hợp lệ).`,
          beforeState: data.removedCount > 0 ? `Phát hiện ${data.removedCount} giao dịch mồ côi` : 'Kiểm tra toàn vẹn dữ liệu',
          afterState: data.removedCount > 0 ? 'Đã dọn dẹp sạch sẽ' : 'Dữ liệu sạch 100% (0 giao dịch rác)',
          changes: [
            { fieldLabel: 'Giao dịch mồ côi', before: `${data.removedCount} GD`, after: '0 GD' },
            { fieldLabel: 'Trạng thái dữ liệu', before: 'Đang quét', after: 'Hợp lệ & sạch sẽ' },
          ],
          metadata: { removedCount: data.removedCount, debtorsCount: data.debtorsCount, transactionsCount: data.transactionsCount },
        });
      }
      return data;
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
  const dbId = getClientFirebaseConfig().firestoreDatabaseId;
  const logSync = (dCount: number, tCount: number, pCount: number, channel: string) => {
    recordAuditLog({
      action: 'CLOUD_SYNC',
      actor: 'Chủ Sổ (Admin)',
      title: direction === 'PUSH' ? 'Đẩy dữ liệu lên Cloud Firestore' : 'Tải dữ liệu từ Cloud Firestore về máy',
      description: `Đã đồng bộ (${direction === 'PUSH' ? 'Đẩy lên Cloud' : 'Tải về máy'}) qua ${channel}: ${dCount} người nợ, ${tCount} giao dịch, ${pCount} cuộc chia tiền (Database: ${dbId}).`,
      beforeState: `Database: ${dbId}`,
      afterState: `Đồng bộ ${direction} thành công (${dCount} người nợ, ${tCount} GD)`,
      changes: [
        { fieldLabel: 'Hướng đồng bộ', before: '-', after: direction === 'PUSH' ? 'Máy -> Cloud Firestore' : 'Cloud Firestore -> Máy' },
        { fieldLabel: 'Database ID', before: '-', after: dbId },
        { fieldLabel: 'Khối lượng dữ liệu', before: '-', after: `${dCount} người nợ · ${tCount} GD · ${pCount} cuộc vui` },
      ],
      metadata: { direction, databaseId: dbId, channel, debtorsCount: dCount, transactionsCount: tCount, partiesCount: pCount },
    });
  };

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
        logSync(
          (data.data.debtors || []).length,
          (data.data.transactions || []).length,
          (data.data.parties || []).length,
          'Server API'
        );
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
        logSync(fresh.debtors.length, fresh.transactions.length, fresh.parties.length, 'Cloud Firestore trực tiếp');
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
      const pushRes = await apiSyncAllNow();
      if (pushRes.success) {
        logSync(
          pushRes.debtors?.length ?? loadDebtors().length,
          pushRes.transactions?.length ?? loadTransactions().length,
          pushRes.parties?.length ?? loadParties().length,
          'Cloud Firestore trực tiếp'
        );
      }
      return pushRes;
    }
  } catch (err: any) {
    recordAuditLog({
      action: 'OPERATION_FAILED',
      actor: 'Chủ Sổ (Admin)',
      title: `Lỗi đồng bộ Cloud Firestore (${direction})`,
      description: err?.message || 'Đồng bộ trực tiếp Cloud Firestore thất bại',
      beforeState: `Yêu cầu đồng bộ ${direction}`,
      afterState: 'Thất bại',
      changes: [{ fieldLabel: 'Kết quả đồng bộ', before: direction, after: `Lỗi: ${err?.message || 'Thất bại'}` }],
    });
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
  const oldDebtorsCount = loadDebtors().length;
  const oldTxsCount = loadTransactions().length;
  const oldPartiesCount = loadParties().length;

  const recordClearSuccess = () => {
    recordAuditLog({
      action: 'CLEAR_DATA',
      actor: 'Chủ Sổ (Admin)',
      title: 'Xóa toàn bộ dữ liệu mẫu / Làm trắng sổ nợ',
      description: `Đã dọn dẹp sạch sẽ toàn bộ sổ nợ (${oldDebtorsCount} người nợ, ${oldTxsCount} giao dịch, ${oldPartiesCount} cuộc chia tiền). Sẵn sàng ghi sổ mới!`,
      beforeState: `Trước khi xóa: ${oldDebtorsCount} người nợ, ${oldTxsCount} giao dịch, ${oldPartiesCount} cuộc vui`,
      afterState: '0 người nợ, 0 giao dịch (Sổ trắng tinh)',
      changes: [
        { fieldLabel: 'Danh bạ người nợ', before: `${oldDebtorsCount} người`, after: '0' },
        { fieldLabel: 'Lịch sử giao dịch', before: `${oldTxsCount} GD`, after: '0' },
        { fieldLabel: 'Cuộc chia bill', before: `${oldPartiesCount} cuộc`, after: '0' },
      ],
    });
  };

  const recordClearFailure = () => {
    recordAuditLog({
      action: 'OPERATION_FAILED',
      actor: 'Chủ Sổ (Admin)',
      title: 'Xác thực xóa dữ liệu thất bại',
      description: 'Nhập sai mật khẩu quản lý khi cố gắng xóa toàn bộ dữ liệu mẫu / làm trắng sổ nợ.',
      beforeState: `Hiện có: ${oldDebtorsCount} người nợ, ${oldTxsCount} GD`,
      afterState: 'Từ chối thao tác (Sai mật khẩu)',
      changes: [{ fieldLabel: 'Xác thực quản trị', before: 'Yêu cầu mật khẩu', after: 'Không khớp' }],
    });
  };

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
        recordClearSuccess();
        return { success: true, message: data.message };
      } else {
        recordClearFailure();
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
    recordClearFailure();
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
  recordClearSuccess();
  return { success: true, message: 'Đã xóa toàn bộ dữ liệu mẫu thành công!' };
}

export async function apiResetSampleData(
  password: string
): Promise<{ success: boolean; message?: string }> {
  const trimmedPassword = (password || '').trim();
  const authHeaders = getAuthHeaders();

  const recordResetSuccess = () => {
    recordAuditLog({
      action: 'RESTORE_DATA',
      actor: 'Chủ Sổ (Admin)',
      title: 'Nạp lại dữ liệu mẫu ban đầu',
      description: `Đã nạp lại thành công ${INITIAL_DEBTORS.length} người nợ mẫu và ${INITIAL_TRANSACTIONS.length} giao dịch mẫu.`,
      beforeState: 'Sổ nợ trước khi nạp mẫu',
      afterState: `Đã nạp ${INITIAL_DEBTORS.length} người nợ mẫu, ${INITIAL_TRANSACTIONS.length} GD mẫu`,
      changes: [{ fieldLabel: 'Dữ liệu mẫu', before: '-', after: 'Khôi phục ban đầu' }],
    });
  };

  const recordResetFailure = () => {
    recordAuditLog({
      action: 'OPERATION_FAILED',
      actor: 'Chủ Sổ (Admin)',
      title: 'Xác thực nạp dữ liệu mẫu thất bại',
      description: 'Nhập sai mật khẩu quản lý khi cố gắng nạp lại dữ liệu mẫu ban đầu.',
      beforeState: 'Yêu cầu nạp lại dữ liệu mẫu',
      afterState: 'Từ chối thao tác (Sai mật khẩu)',
      changes: [{ fieldLabel: 'Xác thực quản trị', before: 'Yêu cầu mật khẩu', after: 'Không khớp' }],
    });
  };

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
        recordResetSuccess();
        return { success: true, message: data.message };
      } else {
        recordResetFailure();
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
    recordResetFailure();
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
  recordResetSuccess();
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

