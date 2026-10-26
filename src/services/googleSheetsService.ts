/**
 * Google Sheets & Google Drive Integration Service (100% Cloud)
 * Uses client-side Firebase Auth with in-memory token cache.
 * Scopes:
 * - https://www.googleapis.com/auth/spreadsheets
 * - https://www.googleapis.com/auth/drive.file
 */

import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
  signOut,
} from 'firebase/auth';
import { app } from '../firebase';
import { Debtor, Transaction, PartySplit, AppSettings } from '../types';

export const WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
];

export const auth = getAuth(app);
const provider = new GoogleAuthProvider();
WORKSPACE_SCOPES.forEach((scope) => provider.addScope(scope));
provider.setCustomParameters({
  prompt: 'select_account',
});

// Cache access token strictly in-memory (NEVER in localStorage/sessionStorage)
let cachedAccessToken: string | null = null;
let cachedGoogleUser: User | null = null;
let isSigningIn = false;

export const initGoogleAuth = (
  onSuccess?: (user: User, token: string) => void,
  onSignedOut?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      cachedGoogleUser = user;
      if (cachedAccessToken) {
        if (onSuccess) onSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        // Token not yet acquired in this session
        if (onSignedOut) onSignedOut();
      }
    } else {
      cachedAccessToken = null;
      cachedGoogleUser = null;
      if (onSignedOut) onSignedOut();
    }
  });
};

export const signInWithGoogle = async (): Promise<{ user: User; accessToken: string }> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Không thể nhận token ủy quyền Google. Vui lòng thử lại.');
    }
    cachedAccessToken = credential.accessToken;
    cachedGoogleUser = result.user;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Google Sign-In Error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getGoogleAccessToken = (): string | null => {
  return cachedAccessToken;
};

export const getCurrentGoogleUser = (): User | null => {
  return cachedGoogleUser || auth.currentUser;
};

export const signOutGoogle = async (): Promise<void> => {
  await signOut(auth);
  cachedAccessToken = null;
  cachedGoogleUser = null;
};

export interface SyncDataPayload {
  debtors: Debtor[];
  transactions: Transaction[];
  parties: PartySplit[];
  settings: AppSettings;
}

export interface SyncResult {
  success: boolean;
  spreadsheetId: string;
  spreadsheetUrl: string;
  title: string;
  updatedAt: string;
  summary: {
    debtorsCount: number;
    transactionsCount: number;
    partiesCount: number;
    totalActiveDebt: number;
  };
}

/**
 * Format currency number in VND format
 */
const formatVND = (amount: number): string => {
  return new Intl.NumberFormat('vi-VN').format(Math.round(amount || 0));
};

/**
 * Helper to calculate debtor balance (Positive = owes me; Negative = I owe them)
 */
export const calculateDebtorBalances = (debtors: Debtor[], transactions: Transaction[]) => {
  return debtors.map((d, index) => {
    const txs = transactions.filter((t) => t.debtorId === d.id);
    const totalAdd = txs.filter((t) => t.type === 'ADD').reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const totalSub = txs.filter((t) => t.type === 'SUB').reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const balance = totalAdd - totalSub;
    let status = 'Đã hết nợ';
    if (balance > 0) status = 'Đang còn nợ';
    else if (balance < 0) status = 'Chủ nợ đang nợ lại';

    return {
      index: index + 1,
      debtor: d,
      totalAdd,
      totalSub,
      balance,
      status,
      txCount: txs.length,
    };
  });
};

/**
 * Check if a Google Spreadsheet exists and is accessible
 */
async function checkSpreadsheetExists(spreadsheetId: string, token: string): Promise<any | null> {
  try {
    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?includeGridData=false`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      return await res.json();
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Create a new spreadsheet with 3 tabs and styled header
 */
async function createSpreadsheet(title: string, token: string): Promise<{ id: string; url: string; meta: any }> {
  const body = {
    properties: {
      title,
    },
    sheets: [
      {
        properties: {
          title: 'Tổng Hợp Công Nợ',
          gridProperties: { frozenRowCount: 1 },
        },
      },
      {
        properties: {
          title: 'Lịch Sử Giao Dịch',
          gridProperties: { frozenRowCount: 1 },
        },
      },
      {
        properties: {
          title: 'Các Cuộc Chia Tiền',
          gridProperties: { frozenRowCount: 1 },
        },
      },
    ],
  };

  const res = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData?.error?.message || 'Không thể tạo Google Sheet mới trên Drive');
  }

  const data = await res.json();
  return {
    id: data.spreadsheetId,
    url: data.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${data.spreadsheetId}/edit`,
    meta: data,
  };
}

/**
 * Ensure the 3 required tabs exist in an existing spreadsheet
 */
async function ensureSheetsExist(spreadsheetId: string, existingMeta: any, token: string): Promise<void> {
  const existingTitles = new Set(
    (existingMeta.sheets || []).map((s: any) => s.properties?.title)
  );
  const required = ['Tổng Hợp Công Nợ', 'Lịch Sử Giao Dịch', 'Các Cuộc Chia Tiền'];
  const missing = required.filter((r) => !existingTitles.has(r));

  if (missing.length === 0) return;

  const requests = missing.map((title) => ({
    addSheet: {
      properties: {
        title,
        gridProperties: { frozenRowCount: 1 },
      },
    },
  }));

  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests }),
  });
}

/**
 * Sync entire database to Google Sheets
 */
export async function syncDatabaseToGoogleSheets(
  payload: SyncDataPayload,
  explicitToken?: string
): Promise<SyncResult> {
  const token = explicitToken || cachedAccessToken;
  if (!token) {
    throw new Error('Chưa đăng nhập Google hoặc phiên làm việc đã hết hạn. Vui lòng kết nối lại tài khoản Google.');
  }

  const { debtors, transactions, parties, settings } = payload;
  const ownerName = settings.ownerName || 'Chủ Sổ';
  const spreadsheetTitle = `[AENO] Sổ Nợ & Đối Soát - ${ownerName}`;

  let spreadsheetId = settings.googleSheetId;
  let spreadsheetUrl = settings.googleSheetUrl;

  // 1. Check if existing spreadsheet exists and is reachable
  let sheetMeta: any = null;
  if (spreadsheetId) {
    sheetMeta = await checkSpreadsheetExists(spreadsheetId, token);
  }

  // 2. If no valid existing spreadsheet, create a brand new one
  if (!sheetMeta) {
    const created = await createSpreadsheet(spreadsheetTitle, token);
    spreadsheetId = created.id;
    spreadsheetUrl = created.url;
    sheetMeta = created.meta;
  } else {
    await ensureSheetsExist(spreadsheetId!, sheetMeta, token);
  }

  // 3. Prepare data for Tab 1: "Tổng Hợp Công Nợ"
  const calculated = calculateDebtorBalances(debtors, transactions);
  const totalActiveDebt = calculated.filter((c) => c.balance > 0).reduce((s, c) => s + c.balance, 0);
  const totalOwedByMe = calculated.filter((c) => c.balance < 0).reduce((s, c) => s + Math.abs(c.balance), 0);

  const tab1Values: any[][] = [
    [
      'STT',
      'Họ Và Tên Người Nợ',
      'Số Dư Nợ Hiện Tại (VNĐ)',
      'Trạng Thái',
      'Tổng Nợ Thêm (+)',
      'Tổng Đã Trả (-)',
      'Số Giao Dịch',
      'Mã PIN Tra Cứu',
      'Ghi Chú',
      'Cập Nhật Cuối',
    ],
  ];

  calculated.forEach((item) => {
    tab1Values.push([
      item.index,
      item.debtor.name,
      item.balance, // raw number for sheet formulas and formatting
      item.status,
      item.totalAdd,
      item.totalSub,
      item.txCount,
      item.debtor.pin || '',
      item.debtor.note || '',
      item.debtor.updatedAt ? new Date(item.debtor.updatedAt).toLocaleString('vi-VN') : '',
    ]);
  });

  // Summary row at the bottom
  tab1Values.push([]);
  tab1Values.push([
    'TỔNG CỘNG',
    `${debtors.length} người nợ`,
    `Tổng cần thu: ${formatVND(totalActiveDebt)} VNĐ | Tôi nợ lại: ${formatVND(totalOwedByMe)} VNĐ`,
    `Thời gian đồng bộ: ${new Date().toLocaleString('vi-VN')}`,
  ]);

  // 4. Prepare data for Tab 2: "Lịch Sử Giao Dịch"
  const debtorMap = new Map<string, string>();
  debtors.forEach((d) => debtorMap.set(d.id, d.name));

  const sortedTxs = [...transactions].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const tab2Values: any[][] = [
    [
      'STT',
      'Ngày Giao Dịch',
      'Người Nợ',
      'Loại Giao Dịch',
      'Số Tiền (VNĐ)',
      'Nội Dung / Lý Do',
      'Phân Loại',
      'Cuộc Vui Liên Quan',
      'Có Ảnh Chứng Từ',
      'Thời Điểm Tạo',
    ],
  ];

  sortedTxs.forEach((tx, idx) => {
    const debtorName = debtorMap.get(tx.debtorId) || 'Không xác định';
    const typeLabel = tx.type === 'ADD' ? 'Ghi Nợ (+)' : 'Trả Nợ (-)';
    let catLabel = 'Giao dịch lẻ';
    if (tx.category === 'PARTY_SPLIT') catLabel = 'Ăn chia nhóm';
    else if (tx.category === 'PAYMENT_SETTLED') catLabel = 'Tất toán nợ';
    else if (tx.category === 'SELF_REPORTED') catLabel = 'Khách tự báo';

    tab2Values.push([
      idx + 1,
      tx.date || '',
      debtorName,
      typeLabel,
      tx.amount || 0,
      tx.note || '',
      catLabel,
      tx.partyName || (tx.partyId ? 'Cuộc chia tiền' : ''),
      tx.billImage ? 'Có ảnh bill' : 'Không',
      tx.createdAt ? new Date(tx.createdAt).toLocaleString('vi-VN') : '',
    ]);
  });

  // 5. Prepare data for Tab 3: "Các Cuộc Chia Tiền"
  const tab3Values: any[][] = [
    [
      'STT',
      'Ngày Tổ Chức',
      'Tên Cuộc Vui',
      'Tổng Tiền Bill (VNĐ)',
      'Số Người Chia',
      'Mỗi Người Trả (VNĐ)',
      'Người Trả Trước',
      'Người Tham Gia',
      'Ghi Chú Cuộc Vui',
      'Ngày Tạo',
    ],
  ];

  parties.forEach((p, idx) => {
    let payerName = 'Tôi (Chủ sổ)';
    if (p.payerType === 'DEBTOR' || p.payerType === 'DEBTOR_ASSIGNED') {
      payerName = debtorMap.get(p.payerDebtorId || '') || 'Một người trong nhóm';
    }

    const participants = (p.participantDebtorIds || [])
      .map((id) => debtorMap.get(id) || id)
      .join(', ');

    tab3Values.push([
      idx + 1,
      p.date || '',
      p.name || '',
      p.totalAmount || 0,
      p.totalPeopleCount || (p.participantDebtorIds?.length || 0) + (p.includeMe ? 1 : 0),
      p.splitAmountPerPerson || 0,
      payerName,
      participants,
      p.note || '',
      p.createdAt ? new Date(p.createdAt).toLocaleString('vi-VN') : '',
    ]);
  });

  // 6. Clear old ranges to avoid ghost trailing rows
  try {
    await Promise.all([
      fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'Tổng Hợp Công Nợ'!A1:Z1000:clear`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }),
      fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'Lịch Sử Giao Dịch'!A1:Z10000:clear`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }),
      fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'Các Cuộc Chia Tiền'!A1:Z2000:clear`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }),
    ]);
  } catch (err) {
    console.warn('Notice clearing ranges:', err);
  }

  // 7. Write new values to all 3 tabs via batchUpdate
  const updateRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      valueInputOption: 'USER_ENTERED',
      data: [
        {
          range: "'Tổng Hợp Công Nợ'!A1",
          values: tab1Values,
        },
        {
          range: "'Lịch Sử Giao Dịch'!A1",
          values: tab2Values,
        },
        {
          range: "'Các Cuộc Chia Tiền'!A1",
          values: tab3Values,
        },
      ],
    }),
  });

  if (!updateRes.ok) {
    const errData = await updateRes.json().catch(() => ({}));
    throw new Error(errData?.error?.message || 'Lỗi khi ghi dữ liệu vào Google Sheet');
  }

  // 8. Apply formatting (header colors, bold font, number formats)
  try {
    const freshMeta = await checkSpreadsheetExists(spreadsheetId!, token);
    if (freshMeta && Array.isArray(freshMeta.sheets)) {
      const formatRequests: any[] = [];
      freshMeta.sheets.forEach((sheet: any) => {
        const sheetId = sheet.properties?.sheetId;
        if (sheetId !== undefined) {
          // Format header row: Emerald Green (#047857), white text, bold, frozen row
          formatRequests.push({
            repeatCell: {
              range: {
                sheetId,
                startRowIndex: 0,
                endRowIndex: 1,
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.02, green: 0.47, blue: 0.34 },
                  textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 }, fontSize: 11 },
                  horizontalAlignment: 'CENTER',
                },
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
            },
          });
        }
      });

      if (formatRequests.length > 0) {
        await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ requests: formatRequests }),
        });
      }
    }
  } catch (fmtErr) {
    console.warn('Notice formatting Google Sheet (non-fatal):', fmtErr);
  }

  const now = new Date().toISOString();
  return {
    success: true,
    spreadsheetId: spreadsheetId!,
    spreadsheetUrl: spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
    title: spreadsheetTitle,
    updatedAt: now,
    summary: {
      debtorsCount: debtors.length,
      transactionsCount: transactions.length,
      partiesCount: parties.length,
      totalActiveDebt,
    },
  };
}
