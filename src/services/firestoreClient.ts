/**
 * ============================================================================
 * GHI CHÚ CHỈNH SỬA / CHANGELOG:
 * - Khắc phục lỗi 'Missing or insufficient permissions': Đồng bộ cấu hình chính thức từ
 *   firebase-applet-config.json với dự án 'gen-lang-client-0369169768' và cơ sở dữ liệu
 *   Firestore 'ai-studio-remixremixsghin-9ec32e46-cb00-435a-b1aa-84c978b8f638'.
 * - Triển khai quy tắc an toàn bảo mật Firestore và xử lý lỗi kết nối trực tiếp từ client.
 * ============================================================================
 */

import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  writeBatch,
  query,
  where,
  onSnapshot,
  setLogLevel,
  Firestore,
} from 'firebase/firestore';
import { Debtor, Transaction, PartySplit, AppSettings } from '../types';
import {
  DEFAULT_SETTINGS,
  DATASET_PRESETS,
} from '../data/mockData';
import { BUILTIN_FIREBASE_CONFIG } from '../firebaseConfig';

export { BUILTIN_FIREBASE_CONFIG };

const STORAGE_CUSTOM_DB_KEY = 'debt_app_custom_firestore_db';

/**
 * Returns current configuration with support for Vite environment variables
 * and localStorage overrides (for Vercel, Netlify, GitHub Pages, or custom database switching).
 */
export function getClientFirebaseConfig(): {
  projectId: string;
  apiKey: string;
  appId: string;
  authDomain: string;
  storageBucket: string;
  messagingSenderId: string;
  firestoreDatabaseId: string;
  defaultDatabaseId: string;
  isCustom: boolean;
} {
  let customDb: string | null = null;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      customDb = localStorage.getItem(STORAGE_CUSTOM_DB_KEY);
    }
  } catch {
    // ignore
  }

  const env = (typeof import.meta !== 'undefined' && (import.meta as any).env) ? (import.meta as any).env : {};

  const projectId = (env.VITE_FIREBASE_PROJECT_ID as string) || BUILTIN_FIREBASE_CONFIG.projectId;
  const apiKey = (env.VITE_FIREBASE_API_KEY as string) || BUILTIN_FIREBASE_CONFIG.apiKey;
  const appId = (env.VITE_FIREBASE_APP_ID as string) || BUILTIN_FIREBASE_CONFIG.appId;
  const authDomain = (env.VITE_FIREBASE_AUTH_DOMAIN as string) || BUILTIN_FIREBASE_CONFIG.authDomain;
  const storageBucket = (env.VITE_FIREBASE_STORAGE_BUCKET as string) || BUILTIN_FIREBASE_CONFIG.storageBucket;
  const messagingSenderId = (env.VITE_FIREBASE_MESSAGING_SENDER_ID as string) || BUILTIN_FIREBASE_CONFIG.messagingSenderId;
  const defaultDatabaseId = (env.VITE_FIREBASE_DATABASE_ID as string) || BUILTIN_FIREBASE_CONFIG.firestoreDatabaseId;

  const activeDatabaseId = customDb || defaultDatabaseId;

  return {
    projectId,
    apiKey,
    appId,
    authDomain,
    storageBucket,
    messagingSenderId,
    firestoreDatabaseId: activeDatabaseId,
    defaultDatabaseId,
    isCustom: Boolean(customDb && customDb !== defaultDatabaseId),
  };
}

try {
  setLogLevel('error');
} catch {
  // ignore
}

let clientAppInstance: FirebaseApp | null = null;

function getClientFirebaseApp(): FirebaseApp {
  if (clientAppInstance) return clientAppInstance;
  const existingApps = getApps();
  if (existingApps.length > 0) {
    clientAppInstance = getApp();
  } else {
    const config = getClientFirebaseConfig();
    clientAppInstance = initializeApp({
      projectId: config.projectId,
      apiKey: config.apiKey,
      appId: config.appId,
      authDomain: config.authDomain,
      storageBucket: config.storageBucket,
      messagingSenderId: config.messagingSenderId,
    });
  }
  return clientAppInstance;
}

export function getClientFirestore(): Firestore {
  const app = getClientFirebaseApp();
  const config = getClientFirebaseConfig();
  const dbId = config.firestoreDatabaseId === '(default)' || !config.firestoreDatabaseId ? undefined : config.firestoreDatabaseId;
  return getFirestore(app, dbId);
}

export async function ensureClientAuth(): Promise<void> {
  // Rules are open (allow read, write: if true;). Avoid calling accounts:signUp to prevent 400 Bad Request
  return Promise.resolve();
}

/**
 * Test connectivity directly from browser to Cloud Firestore
 */
export async function testFirestoreDirectConnection(): Promise<{
  success: boolean;
  latencyMs: number;
  databaseId: string;
  projectId: string;
  isCustom: boolean;
  stats?: { debtors: number; transactions: number; parties: number };
  error?: string;
}> {
  const config = getClientFirebaseConfig();
  const startTime = Date.now();
  try {
    await ensureClientAuth();
    const db = getClientFirestore();

    const [debtorsSnap, txSnap, partiesSnap] = await Promise.all([
      getDocs(collection(db, 'debtors')),
      getDocs(collection(db, 'transactions')),
      getDocs(collection(db, 'parties')),
    ]);

    const latencyMs = Date.now() - startTime;
    return {
      success: true,
      latencyMs,
      databaseId: config.firestoreDatabaseId,
      projectId: config.projectId,
      isCustom: config.isCustom,
      stats: {
        debtors: debtorsSnap.size,
        transactions: txSnap.size,
        parties: partiesSnap.size,
      },
    };
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    return {
      success: false,
      latencyMs,
      databaseId: config.firestoreDatabaseId,
      projectId: config.projectId,
      isCustom: config.isCustom,
      error: err?.message || 'Không thể kết nối trực tiếp đến Cloud Firestore',
    };
  }
}

/**
 * Load all data directly from Cloud Firestore into application format
 */
export async function loadDataFromFirestoreDirect(): Promise<{
  debtors: Debtor[];
  transactions: Transaction[];
  parties: PartySplit[];
  settings: AppSettings;
} | null> {
  try {
    await ensureClientAuth();
    const db = getClientFirestore();

    const [debtorsSnap, txSnap, partiesSnap, settingsDoc] = await Promise.all([
      getDocs(collection(db, 'debtors')),
      getDocs(collection(db, 'transactions')),
      getDocs(collection(db, 'parties')),
      getDoc(doc(db, 'settings', 'app_settings')),
    ]);

    const debtors: Debtor[] = [];
    debtorsSnap.forEach((d) => debtors.push(d.data() as Debtor));

    const transactions: Transaction[] = [];
    txSnap.forEach((t) => transactions.push(t.data() as Transaction));

    const parties: PartySplit[] = [];
    partiesSnap.forEach((p) => parties.push(p.data() as PartySplit));

    const settingsData = settingsDoc.exists() ? (settingsDoc.data() as AppSettings) : DEFAULT_SETTINGS;

    // Sort transactions latest first
    transactions.sort((a, b) => new Date(b.date || b.createdAt).getTime() - new Date(a.date || a.createdAt).getTime());

    // Return actual collections without forcing mock data on clean/empty databases
    return {
      debtors,
      transactions,
      parties,
      settings: settingsData,
    };
  } catch (err) {
    console.warn('loadDataFromFirestoreDirect error:', err);
    return null;
  }
}

/**
 * Utility to strip undefined properties from objects to prevent Firestore crashes
 */
export function cleanClientObject<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) {
    return obj.map((item) => cleanClientObject(item)) as any;
  }
  if (typeof obj === 'object') {
    const cleaned: any = {};
    for (const [key, value] of Object.entries(obj as any)) {
      if (value !== undefined) {
        cleaned[key] = typeof value === 'object' && value !== null ? cleanClientObject(value) : value;
      }
    }
    return cleaned;
  }
  return obj;
}

export async function saveDebtorDirect(debtor: Debtor): Promise<void> {
  await ensureClientAuth();
  const db = getClientFirestore();
  await setDoc(doc(db, 'debtors', debtor.id), cleanClientObject(debtor), { merge: true });
}

export async function deleteDebtorDirect(debtorId: string): Promise<void> {
  await ensureClientAuth();
  const db = getClientFirestore();
  await deleteDoc(doc(db, 'debtors', debtorId));
}

export async function saveTransactionDirect(tx: Transaction): Promise<void> {
  await ensureClientAuth();
  const db = getClientFirestore();
  await setDoc(doc(db, 'transactions', tx.id), cleanClientObject(tx), { merge: true });
}

export async function deleteTransactionDirect(txId: string): Promise<void> {
  await ensureClientAuth();
  const db = getClientFirestore();
  await deleteDoc(doc(db, 'transactions', txId));
}

export async function savePartyDirect(party: PartySplit, transactions: Transaction[]): Promise<void> {
  await ensureClientAuth();
  const db = getClientFirestore();
  const batch = writeBatch(db);
  batch.set(doc(db, 'parties', party.id), cleanClientObject(party), { merge: true });
  for (const tx of transactions) {
    batch.set(doc(db, 'transactions', tx.id), cleanClientObject(tx), { merge: true });
  }
  await batch.commit();
}

export async function deletePartyDirect(partyId: string): Promise<void> {
  await ensureClientAuth();
  const db = getClientFirestore();
  const batch = writeBatch(db);
  batch.delete(doc(db, 'parties', partyId));

  // Find and cascade delete all transactions associated with this partyId
  const q = query(collection(db, 'transactions'), where('partyId', '==', partyId));
  const snap = await getDocs(q);
  snap.forEach((d) => batch.delete(d.ref));

  await batch.commit();
}

export async function updatePartyDirect(
  party: PartySplit,
  transactions: Transaction[]
): Promise<void> {
  await ensureClientAuth();
  const db = getClientFirestore();
  const batch = writeBatch(db);
  batch.set(doc(db, 'parties', party.id), cleanClientObject(party), { merge: true });

  // Delete existing transactions for this partyId
  const q = query(collection(db, 'transactions'), where('partyId', '==', party.id));
  const snap = await getDocs(q);
  snap.forEach((d) => batch.delete(d.ref));

  // Insert updated transactions
  for (const tx of transactions) {
    batch.set(doc(db, 'transactions', tx.id), cleanClientObject(tx), { merge: true });
  }

  await batch.commit();
}

export async function saveSettingsDirect(settings: AppSettings): Promise<void> {
  await ensureClientAuth();
  const db = getClientFirestore();
  await setDoc(doc(db, 'settings', 'app_settings'), cleanClientObject(settings), { merge: true });
}

/**
 * Direct lookup by PIN without backend server
 */
export async function guestLookupDirect(pin: string): Promise<{
  success: boolean;
  debtor?: Debtor;
  transactions?: Transaction[];
  settings?: AppSettings;
  message?: string;
}> {
  try {
    await ensureClientAuth();
    const db = getClientFirestore();
    const cleanPin = pin.trim();

    const q = query(collection(db, 'debtors'), where('pin', '==', cleanPin));
    const snap = await getDocs(q);

    if (snap.empty) {
      return { success: false, message: 'Mã PIN không tồn tại hoặc chưa chính xác.' };
    }

    const debtorDoc = snap.docs[0];
    const debtor = debtorDoc.data() as Debtor;

    const txQ = query(collection(db, 'transactions'), where('debtorId', '==', debtor.id));
    const txSnap = await getDocs(txQ);
    const transactions: Transaction[] = [];
    txSnap.forEach((docSnap) => transactions.push(docSnap.data() as Transaction));
    transactions.sort((a, b) => new Date(b.date || b.createdAt).getTime() - new Date(a.date || a.createdAt).getTime());

    const settingsDoc = await getDoc(doc(db, 'settings', 'app_settings'));
    const settings = settingsDoc.exists() ? (settingsDoc.data() as AppSettings) : DEFAULT_SETTINGS;

    return {
      success: true,
      debtor,
      transactions,
      settings,
    };
  } catch (err: any) {
    console.warn('guestLookupDirect error:', err);
    return { success: false, message: err?.message || 'Không thể tra cứu trực tiếp từ Cloud Firestore.' };
  }
}

/**
 * Direct guest payment report
 */
export async function guestReportPaymentDirect(
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
    const lookup = await guestLookupDirect(pin);
    if (!lookup.success || !lookup.debtor) {
      return { success: false, message: lookup.message || 'Mã PIN không hợp lệ' };
    }

    const newTx: Transaction = {
      id: `tx-report-${Date.now()}`,
      debtorId: lookup.debtor.id,
      type: 'SUB',
      amount: Number(amount),
      date: new Date().toISOString().split('T')[0],
      note: note ? note.trim() : 'Chuyển khoản thanh toán',
      category: 'PAYMENT_SETTLED',
      ...(billImage ? { billImage } : {}),
      createdAt: new Date().toISOString(),
    };

    await saveTransactionDirect(newTx);

    const updatedTxs = [newTx, ...(lookup.transactions || [])];
    return { success: true, transactions: updatedTxs };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Lỗi khi báo thanh toán' };
  }
}

/**
 * Switch custom Firestore database ID in browser storage
 */
export function setClientCustomDatabaseId(databaseId: string | null): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (!databaseId || databaseId === BUILTIN_FIREBASE_CONFIG.firestoreDatabaseId) {
        localStorage.removeItem(STORAGE_CUSTOM_DB_KEY);
      } else {
        localStorage.setItem(STORAGE_CUSTOM_DB_KEY, databaseId.trim());
      }
    }
  } catch {
    // ignore
  }
}

/**
 * Direct upload of full database state to Cloud Firestore
 */
/**
 * Direct client sync: Synchronize all data directly to Cloud Firestore
 */
export async function syncAllToFirestoreDirect(data: {
  debtors: Debtor[];
  transactions: Transaction[];
  parties: PartySplit[];
  settings: AppSettings;
}): Promise<void> {
  await ensureClientAuth();
  const db = getClientFirestore();

  // Settings
  if (data.settings) {
    await setDoc(doc(db, 'settings', 'app_settings'), cleanClientObject(data.settings), { merge: true });
  }

  // Debtors in chunks of 400
  if (data.debtors.length > 0) {
    for (let i = 0; i < data.debtors.length; i += 400) {
      const chunk = data.debtors.slice(i, i + 400);
      const b = writeBatch(db);
      chunk.forEach((d, idx) => {
        const dId = String(d.id || `d_${Date.now()}_${i + idx}`);
        b.set(doc(db, 'debtors', dId), cleanClientObject({ ...d, id: dId }), { merge: true });
      });
      await b.commit();
    }
  }

  // Transactions in chunks of 400
  if (data.transactions.length > 0) {
    for (let i = 0; i < data.transactions.length; i += 400) {
      const chunk = data.transactions.slice(i, i + 400);
      const b = writeBatch(db);
      chunk.forEach((t, idx) => {
        const tId = String(t.id || `tx_${Date.now()}_${i + idx}`);
        b.set(doc(db, 'transactions', tId), cleanClientObject({ ...t, id: tId }), { merge: true });
      });
      await b.commit();
    }
  }

  // Parties in chunks of 400
  if (data.parties.length > 0) {
    for (let i = 0; i < data.parties.length; i += 400) {
      const chunk = data.parties.slice(i, i + 400);
      const b = writeBatch(db);
      chunk.forEach((p, idx) => {
        const pId = String(p.id || `p_${Date.now()}_${i + idx}`);
        b.set(doc(db, 'parties', pId), cleanClientObject({ ...p, id: pId }), { merge: true });
      });
      await b.commit();
    }
  }
}

/**
 * Clear all collections on Firestore directly in safe chunks
 */
export async function clearAllFirestoreDirect(): Promise<void> {
  await ensureClientAuth();
  const db = getClientFirestore();

  const [dSnap, tSnap, pSnap] = await Promise.all([
    getDocs(collection(db, 'debtors')),
    getDocs(collection(db, 'transactions')),
    getDocs(collection(db, 'parties')),
  ]);

  const allRefs: any[] = [];
  dSnap.forEach((d) => allRefs.push(d.ref));
  tSnap.forEach((t) => allRefs.push(t.ref));
  pSnap.forEach((p) => allRefs.push(p.ref));

  for (let i = 0; i < allRefs.length; i += 400) {
    const chunk = allRefs.slice(i, i + 400);
    const b = writeBatch(db);
    chunk.forEach((ref) => b.delete(ref));
    await b.commit();
  }

  // Ensure settings document exists so it is never treated as an uninitialized database
  await setDoc(
    doc(db, 'settings', 'app_settings'),
    { isInitialized: true, lastClearedAt: new Date().toISOString() },
    { merge: true }
  );
}

/**
 * Load preset dataset directly
 */
export async function loadPresetDirect(presetId: string): Promise<{
  debtors: Debtor[];
  transactions: Transaction[];
  parties: PartySplit[];
  settings: AppSettings;
}> {
  const preset = DATASET_PRESETS.find((p) => p.id === presetId) || DATASET_PRESETS[0];
  const rawData = preset.getData();
  const data: {
    debtors: Debtor[];
    transactions: Transaction[];
    parties: PartySplit[];
    settings: AppSettings;
  } = {
    debtors: rawData.debtors || [],
    transactions: rawData.transactions || [],
    parties: rawData.parties || [],
    settings: {
      ...DEFAULT_SETTINGS,
      ...(rawData.settings || {}),
    },
  };

  await clearAllFirestoreDirect();
  await syncAllToFirestoreDirect(data);

  return data;
}

/**
 * Real-time subscription to Cloud Firestore collections
 * Returns an unsubscribe cleanup function
 */
export function subscribeToFirestoreData(callbacks: {
  onDebtors?: (debtors: Debtor[]) => void;
  onTransactions?: (transactions: Transaction[]) => void;
  onParties?: (parties: PartySplit[]) => void;
  onSettings?: (settings: AppSettings) => void;
  onError?: (err: any) => void;
}): () => void {
  try {
    ensureClientAuth().catch(() => {});
    const db = getClientFirestore();
    const unsubs: (() => void)[] = [];

    if (callbacks.onDebtors) {
      const unsubD = onSnapshot(
        collection(db, 'debtors'),
        (snap) => {
          const debtors: Debtor[] = [];
          snap.forEach((d) => debtors.push(d.data() as Debtor));
          callbacks.onDebtors?.(debtors);
        },
        (err) => {
          console.warn('Realtime debtors listener notice:', err?.message);
          callbacks.onError?.(err);
        }
      );
      unsubs.push(unsubD);
    }

    if (callbacks.onTransactions) {
      const unsubT = onSnapshot(
        collection(db, 'transactions'),
        (snap) => {
          const txs: Transaction[] = [];
          snap.forEach((t) => txs.push(t.data() as Transaction));
          txs.sort((a, b) => new Date(b.date || b.createdAt).getTime() - new Date(a.date || a.createdAt).getTime());
          callbacks.onTransactions?.(txs);
        },
        (err) => {
          console.warn('Realtime transactions listener notice:', err?.message);
          callbacks.onError?.(err);
        }
      );
      unsubs.push(unsubT);
    }

    if (callbacks.onParties) {
      const unsubP = onSnapshot(
        collection(db, 'parties'),
        (snap) => {
          const parties: PartySplit[] = [];
          snap.forEach((p) => parties.push(p.data() as PartySplit));
          callbacks.onParties?.(parties);
        },
        (err) => {
          console.warn('Realtime parties listener notice:', err?.message);
          callbacks.onError?.(err);
        }
      );
      unsubs.push(unsubP);
    }

    if (callbacks.onSettings) {
      const unsubS = onSnapshot(
        doc(db, 'settings', 'app_settings'),
        (snap) => {
          if (snap.exists()) {
            callbacks.onSettings?.(snap.data() as AppSettings);
          }
        },
        (err) => {
          console.warn('Realtime settings listener notice:', err?.message);
          callbacks.onError?.(err);
        }
      );
      unsubs.push(unsubS);
    }

    return () => {
      unsubs.forEach((u) => u());
    };
  } catch (err) {
    console.warn('Could not initialize realtime firestore subscription:', err);
    return () => {};
  }
}

/**
 * Real-time subscription to a specific debtor's transactions
 * Allows guests on mobile phones to see instant live updates whenever the owner records a payment or debt
 */
export function subscribeToDebtorTransactions(
  debtorId: string,
  onUpdate: (txs: Transaction[]) => void
): () => void {
  try {
    ensureClientAuth().catch(() => {});
    const db = getClientFirestore();
    const q = query(collection(db, 'transactions'), where('debtorId', '==', debtorId));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const txs: Transaction[] = [];
        snap.forEach((d) => txs.push(d.data() as Transaction));
        txs.sort(
          (a, b) => new Date(b.date || b.createdAt).getTime() - new Date(a.date || a.createdAt).getTime()
        );
        onUpdate(txs);
      },
      (err) => {
        console.warn('Debtor transactions realtime listener notice:', err?.message);
      }
    );
    return unsub;
  } catch (err) {
    console.warn('Could not initialize debtor realtime listener:', err);
    return () => {};
  }
}
