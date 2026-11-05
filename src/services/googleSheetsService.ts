/**
 * Google Sheets & Google Drive Integration Service (100% Cloud)
 * Dual-layer authentication:
 * 1. Google Identity Services (GIS - Token Client) - Robust in iframes and cross-origin popups
 * 2. Firebase Auth SDK - In-memory token management & fallback
 *
 * Scopes:
 * - https://www.googleapis.com/auth/spreadsheets
 * - https://www.googleapis.com/auth/drive.file
 */

import {
  getAuth,
  signInWithPopup,
  signInWithCredential,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
  signOut,
} from 'firebase/auth';
import { app } from '../firebase';
import { BUILTIN_FIREBASE_CONFIG } from '../firebaseConfig';
import { Debtor, Transaction, PartySplit, AppSettings, AuditLog } from '../types';
import { loadAuditLogs, recordAuditLog } from '../utils/storage';

export const WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
];

export const auth = getAuth(app);
const provider = new GoogleAuthProvider();
WORKSPACE_SCOPES.forEach((scope) => provider.addScope(scope));

export interface GoogleUserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
}

const SESSION_STORAGE_KEYS = {
  ACCESS_TOKEN: 'aeno_g_access_token',
  TOKEN_EXPIRY: 'aeno_g_token_expiry',
  USER_PROFILE: 'aeno_g_user_profile',
};

function saveSessionGoogleAuth(token: string, user?: GoogleUserProfile | null, expiresInSeconds = 3540) {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return;
    window.sessionStorage.setItem(SESSION_STORAGE_KEYS.ACCESS_TOKEN, token);
    window.sessionStorage.setItem(
      SESSION_STORAGE_KEYS.TOKEN_EXPIRY,
      String(Date.now() + expiresInSeconds * 1000)
    );
    if (user) {
      window.sessionStorage.setItem(SESSION_STORAGE_KEYS.USER_PROFILE, JSON.stringify(user));
    }
  } catch {
    // ignore
  }
}

function clearSessionGoogleAuth() {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return;
    window.sessionStorage.removeItem(SESSION_STORAGE_KEYS.ACCESS_TOKEN);
    window.sessionStorage.removeItem(SESSION_STORAGE_KEYS.TOKEN_EXPIRY);
    window.sessionStorage.removeItem(SESSION_STORAGE_KEYS.USER_PROFILE);
  } catch {
    // ignore
  }
}

function restoreSessionGoogleAuth(): { token: string; user: GoogleUserProfile | null } | null {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return null;
    const token = window.sessionStorage.getItem(SESSION_STORAGE_KEYS.ACCESS_TOKEN);
    const expStr = window.sessionStorage.getItem(SESSION_STORAGE_KEYS.TOKEN_EXPIRY);
    if (!token || !expStr) return null;
    const exp = Number(expStr);
    if (isNaN(exp) || Date.now() >= exp) {
      clearSessionGoogleAuth();
      return null;
    }
    let user: GoogleUserProfile | null = null;
    const userStr = window.sessionStorage.getItem(SESSION_STORAGE_KEYS.USER_PROFILE);
    if (userStr) {
      try {
        user = JSON.parse(userStr);
      } catch {
        // ignore
      }
    }
    return { token, user };
  } catch {
    return null;
  }
}

// Memory caching with session-level fallback
const initialRestoredAuth = restoreSessionGoogleAuth();
let cachedAccessToken: string | null = initialRestoredAuth?.token || null;
let cachedGoogleUser: GoogleUserProfile | null = initialRestoredAuth?.user || null;
let isSigningIn = false;
let authStateListeners: Array<(user: GoogleUserProfile | null, token: string | null) => void> = [];

export function setOAuthActive(active: boolean) {
  try {
    if (typeof window !== 'undefined') {
      (window as any).__IS_OAUTH_ACTIVE__ = active;
      if (active) {
        window.sessionStorage?.setItem('is_oauth_in_progress', 'true');
      } else {
        setTimeout(() => {
          try {
            (window as any).__IS_OAUTH_ACTIVE__ = false;
            window.sessionStorage?.removeItem('is_oauth_in_progress');
          } catch {
            // ignore
          }
        }, 4000);
      }
    }
  } catch {
    // ignore
  }
}

export function getCurrentDomain(): string {
  try {
    if (typeof window !== 'undefined') {
      return window.location.hostname;
    }
  } catch {
    // ignore
  }
  return '';
}

function notifyListeners() {
  authStateListeners.forEach((listener) => {
    try {
      listener(cachedGoogleUser, cachedAccessToken);
    } catch {
      // ignore
    }
  });
}

/**
 * Dynamically load Google Identity Services script if not already present
 */
function ensureGsiScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if ((window as any).google?.accounts?.oauth2) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src*="accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Lỗi tải Google Identity Services SDK')));
      if ((window as any).google?.accounts?.oauth2) {
        resolve();
      }
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Không thể tải Google Identity Services SDK'));
    document.head.appendChild(script);
  });
}

/**
 * Initialize Google Auth listener
 */
export const initGoogleAuth = (
  onSuccess?: (user: GoogleUserProfile, token: string) => void,
  onSignedOut?: () => void
) => {
  const listener = (user: GoogleUserProfile | null, token: string | null) => {
    if (user && token) {
      if (onSuccess) onSuccess(user, token);
    } else {
      if (onSignedOut) onSignedOut();
    }
  };

  authStateListeners.push(listener);

  // Sync with Firebase Auth state
  const unsubscribeFirebase = onAuthStateChanged(auth, async (firebaseUser: User | null) => {
    if (firebaseUser) {
      if (!cachedGoogleUser) {
        cachedGoogleUser = {
          uid: firebaseUser.uid,
          email: firebaseUser.email || '',
          displayName: firebaseUser.displayName || 'Google User',
          photoURL: firebaseUser.photoURL || undefined,
        };
      }
      if (cachedAccessToken) {
        notifyListeners();
      }
    } else if (!isSigningIn && !cachedAccessToken) {
      cachedGoogleUser = null;
      notifyListeners();
    }
  });

  if (!cachedAccessToken) {
    const restored = restoreSessionGoogleAuth();
    if (restored) {
      cachedAccessToken = restored.token;
      if (restored.user && !cachedGoogleUser) {
        cachedGoogleUser = restored.user;
      }
    }
  }

  if (cachedGoogleUser && cachedAccessToken) {
    listener(cachedGoogleUser, cachedAccessToken);
  }

  return () => {
    authStateListeners = authStateListeners.filter((l) => l !== listener);
    unsubscribeFirebase();
  };
};

/**
 * Set token manually (e.g. from developer prompt or direct grant)
 */
export const setManualAccessToken = (token: string, userEmail?: string) => {
  cachedAccessToken = token.trim();
  cachedGoogleUser = {
    uid: `manual_${Date.now()}`,
    email: userEmail || 'chuso@gmail.com',
    displayName: userEmail ? userEmail.split('@')[0] : 'Chủ Sổ',
  };
  saveSessionGoogleAuth(cachedAccessToken, cachedGoogleUser, 86400);
  notifyListeners();
};

/**
 * Get active Google OAuth Client ID based on priority:
 * 1. AppSettings (saved in Firestore / App state)
 * 2. Local browser storage override
 * 3. Vite environment variable (VITE_GOOGLE_CLIENT_ID for Vercel)
 * 4. Built-in default AI Studio Client ID
 */
export const getActiveOAuthClientId = (settings?: AppSettings): string => {
  if (settings?.customGoogleClientId && settings.customGoogleClientId.trim()) {
    return settings.customGoogleClientId.trim();
  }
  try {
    if (typeof window !== 'undefined') {
      const local = window.localStorage?.getItem('aeno_custom_google_client_id');
      if (local && local.trim()) return local.trim();
    }
  } catch {
    // ignore
  }
  const envId = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID;
  if (envId && typeof envId === 'string' && envId.trim()) {
    return envId.trim();
  }
  return BUILTIN_FIREBASE_CONFIG.oAuthClientId || '';
};

/**
 * Persist custom OAuth client ID to browser local storage
 */
export const setCustomOAuthClientId = (clientId: string) => {
  try {
    if (typeof window !== 'undefined') {
      if (clientId && clientId.trim()) {
        window.localStorage?.setItem('aeno_custom_google_client_id', clientId.trim());
      } else {
        window.localStorage?.removeItem('aeno_custom_google_client_id');
      }
    }
  } catch {
    // ignore
  }
};

/**
 * Sign in using Google Identity Services (Direct token client - optimal for iframes/popups)
 * with graceful fallback to Firebase signInWithPopup.
 */
export const signInWithGoogle = async (
  explicitClientIdOrSettings?: string | AppSettings
): Promise<{ user: GoogleUserProfile; accessToken: string }> => {
  if (isSigningIn) {
    throw new Error('Đang có yêu cầu đăng nhập Google đang xử lý...');
  }

  isSigningIn = true;
  setOAuthActive(true);

  try {
    let oAuthClientId = '';
    if (typeof explicitClientIdOrSettings === 'string') {
      oAuthClientId = explicitClientIdOrSettings.trim();
    } else if (explicitClientIdOrSettings && typeof explicitClientIdOrSettings === 'object') {
      oAuthClientId = getActiveOAuthClientId(explicitClientIdOrSettings);
    } else {
      oAuthClientId = getActiveOAuthClientId();
    }

    if (!oAuthClientId) {
      throw new Error('Chưa cấu hình Google OAuth Client ID');
    }

    // Try Method 1: Google Identity Services (GIS - Token Client)
    let gisSuccess = false;
    let gisToken: string | null = null;
    let gisProfile: GoogleUserProfile | null = null;

    try {
      await ensureGsiScript();
      const googleObj = typeof window !== 'undefined' ? (window as any).google : null;
      if (googleObj?.accounts?.oauth2?.initTokenClient) {
        console.log('Initiating Google sign-in via Google Identity Services (GIS)...', {
          clientIdPrefix: oAuthClientId.slice(0, 15) + '...',
        });
        const tokenResult = await new Promise<{ access_token: string }>((resolve, reject) => {
          let isResolved = false;
          const startTime = Date.now();

          try {
            const client = googleObj.accounts.oauth2.initTokenClient({
              client_id: oAuthClientId,
              scope: WORKSPACE_SCOPES.join(' '),
              callback: (response: any) => {
                if (isResolved) return;
                isResolved = true;

                if (response.error) {
                  console.warn('GIS Token Response Notice:', response);
                  const errStr = String(response.error_description || response.error || '').toLowerCase();
                  if (response.error === 'popup_closed_by_user') {
                    const err = new Error('Bạn đã đóng cửa sổ đăng nhập Google.');
                    (err as any).code = 'popup_closed';
                    reject(err);
                  } else if (response.error === 'access_denied') {
                    const err = new Error(
                      'Đã chặn quyền truy cập (Lỗi uỷ quyền): Tài khoản Google chưa được thêm vào Danh sách người dùng thử nghiệm (Test Users) trong Google Cloud Console.'
                    );
                    (err as any).code = 'access_denied';
                    reject(err);
                  } else if (response.error === 'origin_mismatch' || errStr.includes('origin_mismatch') || errStr.includes('origin mismatch')) {
                    const err = new Error(
                      'Lỗi 400: origin_mismatch - Tên miền của ứng dụng chưa được thêm vào "Authorized JavaScript origins" trong Google Cloud Console.'
                    );
                    (err as any).code = 'origin_mismatch';
                    (err as any).domain = getCurrentDomain();
                    reject(err);
                  } else {
                    const err = new Error(response.error_description || response.error);
                    (err as any).code = response.error;
                    reject(err);
                  }
                  return;
                }

                if (!response.access_token) {
                  reject(new Error('Không nhận được access token từ Google.'));
                  return;
                }

                resolve({ access_token: response.access_token });
              },
              error_callback: (err: any) => {
                if (isResolved) return;
                isResolved = true;
                const elapsed = Date.now() - startTime;
                console.warn('GIS Error Callback:', err, `(elapsed: ${elapsed}ms)`);
                if (err.type === 'popup_failed_to_open') {
                  const e = new Error(
                    'Trình duyệt đang chặn cửa sổ pop-up. Vui lòng nhấn vào biểu tượng pop-up trên thanh địa chỉ để Cho phép mở cửa sổ đăng nhập Google.'
                  );
                  (e as any).code = 'popup_blocked';
                  reject(e);
                } else if (err.type === 'popup_closed') {
                  // If closed in under 1200ms, it is an auto-closure (origin mismatch / iframe policy), allow fallback to Firebase Auth
                  const isQuickClose = elapsed < 1200;
                  const e = new Error('Cửa sổ đăng nhập Google đã bị đóng.');
                  (e as any).code = isQuickClose ? 'popup_auto_closed' : 'popup_closed';
                  reject(e);
                } else {
                  const e = new Error(err.message || 'Lỗi kết nối cửa sổ đăng nhập Google');
                  (e as any).code = err.type || 'gis_error';
                  reject(e);
                }
              },
            });

            // Prompt user for account selection and consent
            client.requestAccessToken({ prompt: 'select_account' });
          } catch (initErr) {
            reject(initErr);
          }
        });

        gisToken = tokenResult.access_token;
        gisProfile = {
          uid: `google_${Date.now()}`,
          email: 'maildva1999@gmail.com',
          displayName: 'Chủ Sổ',
        };

        try {
          const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${gisToken}` },
          });
          if (userInfoRes.ok) {
            const info = await userInfoRes.json();
            gisProfile = {
              uid: info.sub || `google_${Date.now()}`,
              email: info.email || 'maildva1999@gmail.com',
              displayName: info.name || info.email || 'Chủ Sổ',
              photoURL: info.picture || undefined,
            };
          }
        } catch (userErr) {
          console.warn('Notice fetching Google userinfo:', userErr);
        }

        gisSuccess = true;
      }
    } catch (gisErr: any) {
      if (gisErr?.code === 'popup_closed' || gisErr?.code === 'origin_mismatch') {
        throw gisErr;
      }
      console.warn('GIS sign-in notice, falling back to Firebase Auth popup:', gisErr?.message || gisErr);
    }

    if (gisSuccess && gisToken && gisProfile) {
      cachedAccessToken = gisToken;
      cachedGoogleUser = gisProfile;
      saveSessionGoogleAuth(gisToken, gisProfile, 3550);

      try {
        const cred = GoogleAuthProvider.credential(null, gisToken);
        await signInWithCredential(auth, cred);
      } catch (fbCredErr: any) {
        console.warn('Firebase signInWithCredential notice (non-fatal):', fbCredErr?.message);
      }

      notifyListeners();
      return { user: gisProfile, accessToken: gisToken };
    }

    // Method 2 Fallback: Standard Firebase Auth signInWithPopup
    console.log('Initiating Google sign-in via Firebase Auth popup fallback...');
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Không thể nhận token ủy quyền Google từ Firebase Auth');
    }

    cachedAccessToken = credential.accessToken;
    const fbUser = result.user;
    const userProfile: GoogleUserProfile = {
      uid: fbUser.uid,
      email: fbUser.email || '',
      displayName: fbUser.displayName || 'Google User',
      photoURL: fbUser.photoURL || undefined,
    };
    cachedGoogleUser = userProfile;
    saveSessionGoogleAuth(cachedAccessToken, userProfile, 3550);

    notifyListeners();
    return { user: userProfile, accessToken: cachedAccessToken };
  } catch (error: any) {
    if (error?.code === 'auth/popup-closed-by-user' || error?.code === 'popup_closed') {
      console.info('Google sign-in popup was closed by user.');
      const err = new Error('Cửa sổ đăng nhập Google đã bị đóng.');
      (err as any).code = 'popup_closed';
      throw err;
    }
    const errText = String(error?.message || '').toLowerCase();
    if (
      error?.code === 'origin_mismatch' ||
      errText.includes('origin_mismatch') ||
      errText.includes('origin mismatch')
    ) {
      const currentHost = getCurrentDomain();
      const err = new Error(
        `Lỗi 400: origin_mismatch - Tên miền "https://${currentHost}" chưa được thêm vào mục "Authorized JavaScript origins" của Google OAuth Client ID trong Google Cloud Console.`
      );
      (err as any).code = 'origin_mismatch';
      (err as any).domain = currentHost;
      throw err;
    }
    if (error?.code === 'auth/unauthorized-domain' || errText.includes('unauthorized-domain')) {
      console.warn('Firebase Auth unauthorized-domain:', error?.message);
      const currentHost = getCurrentDomain();
      const err = new Error(
        `Tên miền "${currentHost}" chưa được thêm vào Authorized Domains trong Firebase Console.`
      );
      (err as any).code = 'auth/unauthorized-domain';
      (err as any).domain = currentHost;
      throw err;
    }
    console.error('Google Sign-In Error:', error);
    throw error;
  } finally {
    isSigningIn = false;
    setOAuthActive(false);
  }
};

export const getGoogleAccessToken = (): string | null => {
  if (cachedAccessToken) {
    return cachedAccessToken;
  }
  const restored = restoreSessionGoogleAuth();
  if (restored) {
    cachedAccessToken = restored.token;
    if (restored.user && !cachedGoogleUser) {
      cachedGoogleUser = restored.user;
    }
    return cachedAccessToken;
  }
  return null;
};

export const getCurrentGoogleUser = (): GoogleUserProfile | null => {
  if (cachedGoogleUser) {
    return cachedGoogleUser;
  }
  const restored = restoreSessionGoogleAuth();
  if (restored?.user) {
    cachedGoogleUser = restored.user;
  }
  return cachedGoogleUser;
};

export const signOutGoogle = async (): Promise<void> => {
  try {
    if (cachedAccessToken && typeof window !== 'undefined') {
      const googleObj = (window as any).google;
      if (googleObj?.accounts?.oauth2?.revoke) {
        googleObj.accounts.oauth2.revoke(cachedAccessToken, () => {});
      }
    }
  } catch {
    // ignore
  }

  try {
    await signOut(auth);
  } catch {
    // ignore
  }

  clearSessionGoogleAuth();
  cachedAccessToken = null;
  cachedGoogleUser = null;
  notifyListeners();
};

export interface SyncDataPayload {
  debtors: Debtor[];
  transactions: Transaction[];
  parties: PartySplit[];
  settings: AppSettings;
  auditLogs?: AuditLog[];
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
    auditLogsCount?: number;
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
 * Convert internal log action string to friendly Vietnamese label
 */
export function getLogActionFriendlyName(action: string): string {
  switch (action) {
    case 'ADD_TRANSACTION': return 'Ghi nợ chi hộ (+)';
    case 'UPDATE_TRANSACTION': return 'Cập nhật / Thu nợ (-)';
    case 'DELETE_TRANSACTION': return 'Xóa giao dịch';
    case 'ADD_DEBTOR': return 'Thêm người nợ mới';
    case 'UPDATE_DEBTOR': return 'Sửa thông tin người nợ';
    case 'DELETE_DEBTOR': return 'Xóa người nợ';
    case 'ADD_PARTY': return 'Tạo chia tiền nhóm';
    case 'UPDATE_PARTY': return 'Cập nhật cuộc chia tiền';
    case 'DELETE_PARTY': return 'Xóa cuộc chia tiền';
    case 'UPDATE_SETTINGS': return 'Cập nhật cài đặt';
    case 'SETTLE_DEBT': return 'Tất toán nợ (Về 0đ)';
    case 'GUEST_LOOKUP': return 'Khách tra cứu sổ nợ';
    case 'GUEST_REPORT': return 'Khách báo chuyển khoản';
    case 'SYNC_SHEETS': return 'Đồng bộ Google Sheets';
    case 'RESTORE_DATA': return 'Khôi phục sao lưu';
    case 'CLEAR_DATA': return 'Dọn dẹp dữ liệu';
    case 'LOGIN_SUCCESS': return 'Đăng nhập thành công';
    case 'LOGIN_FAILED': return 'Đăng nhập thất bại';
    case 'LOGOUT': return 'Đăng xuất';
    case 'LOOKUP_FAILED': return 'Tra cứu thất bại';
    case 'EXPORT_DATA': return 'Xuất dữ liệu / CSV';
    case 'OPERATION_FAILED': return 'Lỗi thao tác';
    default: return action;
  }
}

/**
 * Download a CSV file directly formatted for Google Sheets import
 */
export function exportGoogleSheetsCsvFile(payload: SyncDataPayload) {
  const { debtors, transactions, parties, settings } = payload;
  const ownerName = settings.ownerName || 'Chủ Sổ';
  const calculated = calculateDebtorBalances(debtors, transactions);

  // Tab 1: Công Nợ
  let csvContent = `\uFEFF# SỔ GHI NỢ & ĐỐI SOÁT - ${ownerName}\n`;
  csvContent += `Thời gian xuất: ${new Date().toLocaleString('vi-VN')}\n\n`;
  csvContent += `=== BẢNG 1: TỔNG HỢP CÔNG NỢ ===\n`;
  csvContent += `"STT","Họ Và Tên Người Nợ","Số Dư Nợ Hiện Tại (VNĐ)","Trạng Thái","Tổng Nợ Thêm (+)","Tổng Đã Trả (-)","Số Giao Dịch","Mã PIN Tra Cứu","Ghi Chú"\n`;

  calculated.forEach((item) => {
    csvContent += `"${item.index}","${item.debtor.name}","${item.balance}","${item.status}","${item.totalAdd}","${item.totalSub}","${item.txCount}","${item.debtor.pin || ''}","${item.debtor.note || ''}"\n`;
  });

  // Tab 2: Lịch Sử
  const debtorMap = new Map<string, string>();
  debtors.forEach((d) => debtorMap.set(d.id, d.name));
  const sortedTxs = [...transactions].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  csvContent += `\n=== BẢNG 2: LỊCH SỬ GIAO DỊCH ===\n`;
  csvContent += `"STT","Ngày Giao Dịch","Người Nợ","Loại Giao Dịch","Số Tiền (VNĐ)","Nội Dung / Lý Do","Phân Loại","Cuộc Vui Liên Quan"\n`;

  sortedTxs.forEach((tx, idx) => {
    const debtorName = debtorMap.get(tx.debtorId) || 'Không xác định';
    const typeLabel = tx.type === 'ADD' ? 'Ghi Nợ (+)' : 'Trả Nợ (-)';
    let catLabel = 'Giao dịch lẻ';
    if (tx.category === 'PARTY_SPLIT') catLabel = 'Ăn chia nhóm';
    else if (tx.category === 'PAYMENT_SETTLED') catLabel = 'Tất toán nợ';
    else if (tx.category === 'SELF_REPORTED') catLabel = 'Khách tự báo';

    csvContent += `"${idx + 1}","${tx.date || ''}","${debtorName}","${typeLabel}","${tx.amount || 0}","${(tx.note || '').replace(/"/g, '""')}","${catLabel}","${tx.partyName || ''}"\n`;
  });

  // Tab 3: Chia Bill
  csvContent += `\n=== BẢNG 3: CÁC CUỘC CHIA TIỀN ===\n`;
  csvContent += `"STT","Ngày Tổ Chức","Tên Cuộc Vui","Tổng Tiền Bill (VNĐ)","Số Người Chia","Mỗi Người Trả (VNĐ)","Người Trả Trước","Người Tham Gia"\n`;

  parties.forEach((p, idx) => {
    let payerName = 'Tôi (Chủ sổ)';
    if (p.payerType === 'DEBTOR' || p.payerType === 'DEBTOR_ASSIGNED') {
      payerName = debtorMap.get(p.payerDebtorId || '') || 'Một người trong nhóm';
    }
    const participants = (p.participantDebtorIds || [])
      .map((id) => debtorMap.get(id) || id)
      .join(', ');

    csvContent += `"${idx + 1}","${p.date || ''}","${p.name || ''}","${p.totalAmount || 0}","${p.totalPeopleCount || 0}","${p.splitAmountPerPerson || 0}","${payerName}","${participants}"\n`;
  });

  // Tab 4: Nhật Ký Thao Tác (Audit Logs)
  const logsToExport = payload.auditLogs || loadAuditLogs();
  csvContent += `\n=== BẢNG 4: NHẬT KÝ THAO TÁC & KIỂM VẾT (AUDIT LOGS) ===\n`;
  csvContent += `"STT","Thời Gian","Người Thực Hiện","Loại Thao Tác","Tiêu Đề","Đối Tượng / Người Nợ","Số Tiền (VNĐ)","Nội Dung Chi Tiết","Trước Thay Đổi (Before)","Sau Thay Đổi (After)"\n`;

  logsToExport.forEach((l, idx) => {
    const beforeStr = l.beforeState
      ? typeof l.beforeState === 'object'
        ? JSON.stringify(l.beforeState)
        : String(l.beforeState)
      : l.changes && l.changes.length > 0
      ? l.changes.map((c) => `${c.fieldLabel}: ${c.before ?? '(Trống)'}`).join('; ')
      : '-';

    const afterStr = l.afterState
      ? typeof l.afterState === 'object'
        ? JSON.stringify(l.afterState)
        : String(l.afterState)
      : l.changes && l.changes.length > 0
      ? l.changes.map((c) => `${c.fieldLabel}: ${c.after ?? '(Trống)'}`).join('; ')
      : '-';

    csvContent += `"${idx + 1}","${new Date(l.timestamp).toLocaleString('vi-VN')}","${l.actor}","${getLogActionFriendlyName(l.action)}","${(l.title || '').replace(/"/g, '""')}","${l.debtorName || '-'}","${l.amount || 0}","${(l.description || '').replace(/"/g, '""')}","${beforeStr.replace(/"/g, '""')}","${afterStr.replace(/"/g, '""')}"\n`;
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.download = `So_Ghi_No_Google_Sheets_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  try {
    recordAuditLog({
      action: 'EXPORT_DATA',
      actor: 'Chủ Sổ (Admin)',
      title: 'Xuất tệp sao lưu CSV',
      description: `Đã xuất tệp dữ liệu chuẩn 4 bảng (${debtors.length} người nợ, ${transactions.length} giao dịch, ${parties.length} cuộc vui, ${logsToExport.length} nhật ký).`,
      beforeState: 'Dữ liệu trên ứng dụng',
      afterState: 'Đã tạo tệp CSV tải về thiết bị',
      changes: [{ fieldLabel: 'Xuất bảng tính', before: 'Hệ thống', after: 'Tệp CSV 4 bảng' }],
    });
  } catch {
    // ignore
  }
}

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
      {
        properties: {
          title: 'Nhật Ký Thao Tác (Logs)',
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
 * Ensure the 4 required tabs exist in an existing spreadsheet
 */
async function ensureSheetsExist(spreadsheetId: string, existingMeta: any, token: string): Promise<void> {
  const existingTitles = new Set(
    (existingMeta.sheets || []).map((s: any) => s.properties?.title)
  );
  const required = ['Tổng Hợp Công Nợ', 'Lịch Sử Giao Dịch', 'Các Cuộc Chia Tiền', 'Nhật Ký Thao Tác (Logs)'];
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
  try {
    let token = explicitToken || cachedAccessToken;

  // If no token cached, prompt user to sign in first
  if (!token) {
    const loginRes = await signInWithGoogle(payload.settings);
    token = loginRes.accessToken;
  }

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

  // 5b. Prepare data for Tab 4: "Nhật Ký Thao Tác (Logs)" - APPEND-ONLY MODE
  // CRITICAL REQUIREMENT: "chỉ ghi thêm không bao giờ xóa trên Google Sheet"
  // Đọc toàn bộ log hiện có trên Google Sheet, giữ nguyên 100% và chỉ ghi thêm log mới chưa có
  let existingSheetLogRows: any[][] = [];
  try {
    const existingSheetLogsRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'Nhật Ký Thao Tác (Logs)'!A:I`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (existingSheetLogsRes.ok) {
      const existingData = await existingSheetLogsRes.json();
      if (Array.isArray(existingData.values) && existingData.values.length > 0) {
        existingSheetLogRows = existingData.values;
      }
    }
  } catch (err) {
    console.warn('Notice reading existing sheet logs:', err);
  }

  const tab4Header = [
    'STT',
    'Thời Gian',
    'Người Thực Hiện',
    'Loại Thao Tác',
    'Tiêu Đề Thao Tác',
    'Người Nợ / Đối Tượng',
    'Số Tiền (VNĐ)',
    'Chi Tiết Nội Dung Thao Tác',
    'Trước Thay Đổi (Before)',
    'Sau Thay Đổi (After)',
    'Mã Bản Ghi (ID)',
  ];

  // Thu thập các ID đã có trên Google Sheet (nhận diện cả bảng 9 cột cũ hoặc 11 cột mới)
  const existingSheetLogIds = new Set<string>();
  if (existingSheetLogRows.length > 1) {
    for (let r = 1; r < existingSheetLogRows.length; r++) {
      const row = existingSheetLogRows[r];
      if (Array.isArray(row)) {
        const found = row.find((c) => typeof c === 'string' && c.startsWith('log-')) ||
          (row[10] ? String(row[10]).trim() : '') ||
          (row[8] ? String(row[8]).trim() : '');
        if (found) {
          existingSheetLogIds.add(String(found).trim());
        }
      }
    }
  }

  // Lọc ra các log mới từ ứng dụng chưa có trong Google Sheet
  const logsToSync = payload.auditLogs || loadAuditLogs();
  const sortedNewLogs = [...logsToSync]
    .filter((l) => l.id && !existingSheetLogIds.has(l.id))
    .sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));

  // Bảo toàn toàn bộ dữ liệu lịch sử trên Google Sheet ngay cả khi ứng dụng đã bấm Làm sạch
  let tab4Values: any[][] = [];
  if (existingSheetLogRows.length > 0) {
    tab4Values = [tab4Header, ...existingSheetLogRows.slice(1)];
  } else {
    tab4Values = [tab4Header];
  }

  // Nối thêm (Append) các bản ghi mới vào cuối bảng tính kèm thông tin trước & sau thay đổi
  sortedNewLogs.forEach((l) => {
    const beforeStr = l.beforeState
      ? typeof l.beforeState === 'object'
        ? JSON.stringify(l.beforeState)
        : String(l.beforeState)
      : l.changes && l.changes.length > 0
      ? l.changes.map((c) => `${c.fieldLabel}: ${c.before ?? '(Trống)'}`).join('; ')
      : '-';

    const afterStr = l.afterState
      ? typeof l.afterState === 'object'
        ? JSON.stringify(l.afterState)
        : String(l.afterState)
      : l.changes && l.changes.length > 0
      ? l.changes.map((c) => `${c.fieldLabel}: ${c.after ?? '(Trống)'}`).join('; ')
      : '-';

    tab4Values.push([
      tab4Values.length,
      l.timestamp ? new Date(l.timestamp).toLocaleString('vi-VN') : '',
      l.actor || 'Chủ Sổ (Admin)',
      getLogActionFriendlyName(l.action),
      l.title || '',
      l.debtorName || '-',
      l.amount || 0,
      l.description || '',
      beforeStr,
      afterStr,
      l.id || '',
    ]);
  });

  // 6. Clear old ranges for Tabs 1, 2, 3 only (TUYỆT ĐỐI KHÔNG XÓA TAB 4 NHẬT KÝ)
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

  // 7. Write new values to all 4 tabs via batchUpdate
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
        {
          range: "'Nhật Ký Thao Tác (Logs)'!A1",
          values: tab4Values,
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
    const finalSheetLogsCount = Math.max(0, tab4Values.length - 1);
    try {
      recordAuditLog({
        action: 'SYNC_SHEETS',
        actor: cachedGoogleUser?.displayName || 'Chủ Sổ (Admin)',
        title: 'Đồng bộ Google Sheets',
        description: `Đã đồng bộ toàn bộ 4 Tab (Công Nợ, Lịch Sử, Chia Bill, Nhật Ký) lên bảng tính "${spreadsheetTitle}"`,
        beforeState: `Bảng tính Google Sheets trước lần đồng bộ này (${existingSheetLogIds.size} log trên Sheets)`,
        afterState: `Bảng tính mới: ${debtors.length} người nợ, ${transactions.length} giao dịch, ${parties.length} cuộc vui, ${finalSheetLogsCount} log`,
        changes: [
          { fieldLabel: 'Trạng thái đồng bộ', before: 'Chờ đồng bộ', after: 'Thành công (4 Tab chuẩn)' },
          { fieldLabel: 'Tab 1: Sổ Công Nợ', before: '-', after: `${debtors.length} người nợ` },
          { fieldLabel: 'Tab 2: Lịch Sử GD', before: '-', after: `${transactions.length} giao dịch` },
          { fieldLabel: 'Tab 3: Chia Tiền', before: '-', after: `${parties.length} cuộc vui` },
          { fieldLabel: 'Tab 4: Nhật Ký (Logs)', before: `${existingSheetLogIds.size} bản ghi cũ`, after: `${finalSheetLogsCount} bản ghi (Append-Only)` },
        ],
      });
    } catch (logErr) {
      console.warn('Notice recording SYNC_SHEETS audit log:', logErr);
    }

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
        auditLogsCount: finalSheetLogsCount,
        totalActiveDebt,
      },
    };
  } catch (err: any) {
    try {
      recordAuditLog({
        action: 'OPERATION_FAILED',
        actor: cachedGoogleUser?.displayName || 'Chủ Sổ (Admin)',
        title: 'Lỗi đồng bộ Google Sheets',
        description: `Không thể đồng bộ dữ liệu lên Google Sheets: ${err?.message || 'Lỗi không xác định'}`,
        beforeState: 'Bắt đầu đồng bộ 4 tab dữ liệu',
        afterState: `Thất bại: ${err?.message || 'Lỗi'}`,
        changes: [
          { fieldLabel: 'Kết quả đồng bộ', before: 'Đang đồng bộ', after: `Lỗi: ${err?.message || 'Không thành công'}` },
        ],
      });
    } catch {
      // ignore
    }
    throw err;
  }
}

let autoSyncTimer: any = null;
let isAutoSyncingActive = false;
const autoSyncState = {
  isAutoSyncing: false,
  lastAutoSyncAt: undefined as string | undefined,
  lastError: undefined as string | undefined,
};

export const getAutoSyncStatus = () => ({ ...autoSyncState });

export const GOOGLE_APPS_SCRIPT_TEMPLATE = `// === GOOGLE APPS SCRIPT ĐỒNG BỘ SỔ GHI NỢ (AENO) ===
// Hướng dẫn:
// 1. Mở trang Google Sheet của bạn > Tiện ích mở rộng (Extensions) > Apps Script
// 2. Xóa hết code cũ trong file Code.gs, dán toàn bộ đoạn mã này vào > Bấm Lưu (Ctrl+S)
// 3. Bấm "Triển khai" (Deploy) > "Triển khai mới" (New deployment)
// 4. Chọn loại: "Ứng dụng web" (Web app)
//    - Mô tả: AENO Sync
//    - Người thực thi: Tôi (tài khoản của bạn)
//    - Người có quyền truy cập: "Bất kỳ ai" (Anyone)
// 5. Bấm "Triển khai" > Cấp quyền truy cập tài khoản > Sao chép "URL ứng dụng web"
// 6. Dán URL đó vào ứng dụng Sổ Nợ AENO!

function doPost(e) {
  try {
    var raw = e.postData.contents;
    var data = JSON.parse(raw);
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // 1. Tab 1: Tổng Hợp Công Nợ
    var sheet1 = getOrCreateSheet(ss, "Tổng Hợp Công Nợ");
    sheet1.clear();
    var rows1 = [["STT", "Họ Và Tên Người Nợ", "Số Dư Nợ Hiện Tại (VNĐ)", "Trạng Thái", "Tổng Nợ Thêm (+)", "Tổng Đã Trả (-)", "Số Giao Dịch", "Mã PIN Tra Cứu", "Ghi Chú"]];
    var debtors = data.debtors || [];
    var txs = data.transactions || [];
    for (var i = 0; i < debtors.length; i++) {
      var d = debtors[i];
      var dTxs = txs.filter(function(t) { return t.debtorId === d.id; });
      var add = dTxs.filter(function(t) { return t.type === 'ADD'; }).reduce(function(s, t) { return s + (Number(t.amount)||0); }, 0);
      var sub = dTxs.filter(function(t) { return t.type === 'SUB'; }).reduce(function(s, t) { return s + (Number(t.amount)||0); }, 0);
      var bal = add - sub;
      var status = bal > 0 ? "Đang còn nợ" : (bal < 0 ? "Chủ nợ đang nợ lại" : "Đã hết nợ");
      rows1.push([i + 1, d.name, bal, status, add, sub, dTxs.length, d.pin || "", d.note || ""]);
    }
    sheet1.getRange(1, 1, rows1.length, rows1[0].length).setValues(rows1);
    formatHeader(sheet1, "#047857");

    // 2. Tab 2: Lịch Sử Giao Dịch
    var sheet2 = getOrCreateSheet(ss, "Lịch Sử Giao Dịch");
    sheet2.clear();
    var rows2 = [["STT", "Ngày Giao Dịch", "Người Nợ", "Loại", "Số Tiền (VNĐ)", "Nội Dung", "Phân Loại", "Cuộc Vui"]];
    var dMap = {};
    for (var j = 0; j < debtors.length; j++) { dMap[debtors[j].id] = debtors[j].name; }
    for (var k = 0; k < txs.length; k++) {
      var t = txs[k];
      rows2.push([k + 1, t.date || "", dMap[t.debtorId] || "Không xác định", t.type === 'ADD' ? "Ghi Nợ (+)" : "Trả Nợ (-)", t.amount || 0, t.note || "", t.category || "", t.partyName || ""]);
    }
    if (rows2.length > 1) {
      sheet2.getRange(1, 1, rows2.length, rows2[0].length).setValues(rows2);
    } else {
      sheet2.getRange(1, 1, 1, rows2[0].length).setValues(rows2);
    }
    formatHeader(sheet2, "#0284c7");

    // 3. Tab 3: Các Cuộc Chia Tiền
    var sheet3 = getOrCreateSheet(ss, "Các Cuộc Chia Tiền");
    sheet3.clear();
    var parties = data.parties || [];
    var rows3 = [["STT", "Ngày Tổ Chức", "Tên Cuộc Vui", "Tổng Tiền (VNĐ)", "Số Người", "Tiền/Người (VNĐ)", "Ghi Chú"]];
    for (var p = 0; p < parties.length; p++) {
      var pt = parties[p];
      rows3.push([p + 1, pt.date || "", pt.name || "", pt.totalAmount || 0, pt.totalPeopleCount || 0, pt.splitAmountPerPerson || 0, pt.note || ""]);
    }
    if (rows3.length > 1) {
      sheet3.getRange(1, 1, rows3.length, rows3[0].length).setValues(rows3);
    } else {
      sheet3.getRange(1, 1, 1, rows3[0].length).setValues(rows3);
    }
    formatHeader(sheet3, "#9333ea");

    // 4. Tab 4: Nhật Ký Thao Tác (Logs - Chỉ ghi thêm)
    var sheet4 = getOrCreateSheet(ss, "Nhật Ký Thao Tác (Logs)");
    var logs = data.auditLogs || [];
    if (sheet4.getLastRow() === 0) {
      sheet4.appendRow(["STT", "Thời Gian", "Người Làm", "Thao Tác", "Tiêu Đề", "Người Nợ", "Số Tiền", "Chi Tiết", "Mã ID"]);
      formatHeader(sheet4, "#d97706");
    }
    var existingIds = {};
    var lastRow = sheet4.getLastRow();
    if (lastRow > 1) {
      var idValues = sheet4.getRange(2, 9, lastRow - 1, 1).getValues();
      for (var r = 0; r < idValues.length; r++) { existingIds[String(idValues[r][0]).trim()] = true; }
    }
    for (var l = 0; l < logs.length; l++) {
      var log = logs[l];
      if (log.id && !existingIds[log.id]) {
        sheet4.appendRow([sheet4.getLastRow(), new Date(log.timestamp).toLocaleString("vi-VN"), log.actor || "Chủ Sổ", log.action || "", log.title || "", log.debtorName || "-", log.amount || 0, log.description || "", log.id]);
      }
    }

    return ContentService.createTextOutput(JSON.stringify({ success: true, message: "Đã cập nhật 4 tab thành công!" }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function getOrCreateSheet(ss, name) {
  var s = ss.getSheetByName(name);
  if (!s) { s = ss.insertSheet(name); }
  return s;
}

function formatHeader(sheet, bgColor) {
  var range = sheet.getRange(1, 1, 1, sheet.getLastColumn());
  range.setBackground(bgColor);
  range.setFontColor("#ffffff");
  range.setFontWeight("bold");
  range.setHorizontalAlignment("center");
  sheet.setFrozenRows(1);
}
`;

/**
 * Sync entire database to Google Sheets via Apps Script Web App (No OAuth / No Client ID required)
 */
export async function syncViaAppsScript(
  payload: SyncDataPayload,
  appsScriptUrl: string
): Promise<SyncResult> {
  const url = appsScriptUrl.trim();
  if (!url || !url.startsWith('https://script.google.com/')) {
    throw new Error('Đường link Google Apps Script không hợp lệ. Đường link phải bắt đầu bằng https://script.google.com/macros/s/...');
  }

  const cleanPayload = {
    action: 'SYNC_ALL',
    ownerName: payload.settings.ownerName || 'Chủ Sổ',
    timestamp: new Date().toISOString(),
    debtors: payload.debtors,
    transactions: payload.transactions,
    parties: payload.parties,
    auditLogs: payload.auditLogs || loadAuditLogs(),
  };

  await fetch(url, {
    method: 'POST',
    mode: 'no-cors',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
    },
    body: JSON.stringify(cleanPayload),
  });

  const now = new Date().toISOString();
  try {
    recordAuditLog({
      action: 'SYNC_SHEETS',
      actor: 'Chủ Sổ (Admin)',
      title: 'Đồng bộ Google Sheets (Apps Script)',
      description: `Đã đồng bộ ${payload.debtors.length} người nợ, ${payload.transactions.length} giao dịch sang Google Sheet qua Apps Script Web App.`,
      beforeState: 'Bắt đầu gửi dữ liệu sang Google Sheet',
      afterState: 'Đã hoàn tất đồng bộ qua Apps Script Web App',
      changes: [{ fieldLabel: 'Phương thức', before: 'Trực tiếp', after: 'Google Apps Script Web App' }],
    });
  } catch {
    // ignore
  }

  return {
    success: true,
    spreadsheetId: 'apps_script',
    spreadsheetUrl: payload.settings.googleSheetUrl || 'https://docs.google.com/spreadsheets',
    title: `[AENO] Sổ Nợ & Đối Soát - ${payload.settings.ownerName || 'Chủ Sổ'}`,
    updatedAt: now,
    summary: {
      debtorsCount: payload.debtors.length,
      transactionsCount: payload.transactions.length,
      partiesCount: payload.parties.length,
      auditLogsCount: (payload.auditLogs || loadAuditLogs()).length,
      totalActiveDebt: 0,
    },
  };
}

/**
 * Triggers a debounced background sync to Google Sheets (2-second debounce).
 * Silently synchronizes without disrupting user workflow or throwing popups.
 */
export function triggerDebouncedAutoSync(
  payload: SyncDataPayload,
  onSyncComplete?: (result: SyncResult) => void
) {
  // If auto-sync is explicitly disabled in settings, cancel any pending timer
  if (payload.settings?.autoSyncGoogleSheets === false) {
    if (autoSyncTimer) {
      clearTimeout(autoSyncTimer);
      autoSyncTimer = null;
    }
    return;
  }

  // Check if we have an active access token OR an Apps Script webhook URL
  const token = getGoogleAccessToken();
  const appsScriptUrl = payload.settings?.googleAppsScriptUrl?.trim();
  if (!token && !appsScriptUrl) {
    // Silently skip if user has not authorized Google yet and has not set Apps Script URL
    return;
  }

  if (autoSyncTimer) {
    clearTimeout(autoSyncTimer);
  }

  autoSyncTimer = setTimeout(async () => {
    autoSyncTimer = null;
    if (isAutoSyncingActive) {
      triggerDebouncedAutoSync(payload, onSyncComplete);
      return;
    }

    try {
      isAutoSyncingActive = true;
      autoSyncState.isAutoSyncing = true;
      autoSyncState.lastError = undefined;

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('googlesheets-autosync-start'));
      }

      console.log('🔄 Đang tự động đồng bộ ngầm dữ liệu lên Google Sheets...');
      let result: SyncResult;
      if (appsScriptUrl && !token) {
        result = await syncViaAppsScript(payload, appsScriptUrl);
      } else {
        result = await syncDatabaseToGoogleSheets(payload);
      }

      autoSyncState.lastAutoSyncAt = result.updatedAt;
      autoSyncState.isAutoSyncing = false;

      if (onSyncComplete) {
        onSyncComplete(result);
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('googlesheets-autosynced', { detail: result })
        );
      }
      console.log('✅ Đã tự động đồng bộ Google Sheets thành công:', result.updatedAt);
    } catch (err: any) {
      console.warn('Lưu ý đồng bộ Google Sheets ngầm (non-fatal):', err?.message);
      autoSyncState.isAutoSyncing = false;
      autoSyncState.lastError = err?.message || 'Lỗi đồng bộ tự động';

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('googlesheets-autosync-error', { detail: { error: err } })
        );
      }
    } finally {
      isAutoSyncingActive = false;
      autoSyncState.isAutoSyncing = false;
    }
  }, 2000);
}

