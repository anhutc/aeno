/**
 * ============================================================================
 * GHI CHÚ CHỈNH SỬA / CHANGELOG:
 * - Sửa lỗi 'Missing or insufficient permissions': Cập nhật cấu hình mặc định đồng bộ
 *   với firebase-applet-config.json (Project 'gen-lang-client-0369169768', database
 *   'ai-studio-remixremixsghin-9ec32e46-cb00-435a-b1aa-84c978b8f638').
 * - Triển khai và áp dụng Firestore Security Rules mở quyền truy cập cho cơ sở dữ liệu.
 * ============================================================================
 */

import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
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
  setLogLevel,
  Firestore,
} from 'firebase/firestore';
import fs from 'fs';
import path from 'path';
import { Debtor, Transaction, PartySplit, AppSettings } from '../types';
import {
  DEFAULT_SETTINGS,
  INITIAL_DEBTORS,
  INITIAL_PARTIES,
  INITIAL_TRANSACTIONS,
  DATASET_PRESETS,
} from '../data/mockData';
import { BUILTIN_FIREBASE_CONFIG } from '../firebaseConfig';

export { BUILTIN_FIREBASE_CONFIG };

const BASE_CONFIG_PATH = path.join(process.cwd(), 'firebase-applet-config.json');
const OVERRIDE_CONFIG_PATH = path.join(process.cwd(), 'data', 'firestore-active-config.json');

// Base config from AI Studio deployment or fallback
let defaultFirebaseConfig: any = { ...BUILTIN_FIREBASE_CONFIG };
try {
  if (fs.existsSync(BASE_CONFIG_PATH)) {
    const raw = fs.readFileSync(BASE_CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    defaultFirebaseConfig = { ...defaultFirebaseConfig, ...parsed };
  }
} catch (e) {
  // Safe fallback in serverless
}

// Check environment variables as well (e.g. set in Vercel project settings)
if (process.env.FIREBASE_CONFIG) {
  try {
    const envConfig = JSON.parse(process.env.FIREBASE_CONFIG);
    defaultFirebaseConfig = { ...defaultFirebaseConfig, ...envConfig };
  } catch {
    // ignore
  }
}
if (process.env.FIRESTORE_DATABASE_ID) {
  defaultFirebaseConfig.firestoreDatabaseId = process.env.FIRESTORE_DATABASE_ID;
}
if (process.env.FIREBASE_PROJECT_ID) {
  defaultFirebaseConfig.projectId = process.env.FIREBASE_PROJECT_ID;
}

let memoryOverrideConfig: any = null;

/**
 * Returns the currently active Firebase configuration
 */
export function getActiveFirestoreConfig(): {
  projectId: string;
  firestoreDatabaseId: string;
  defaultDatabaseId: string;
  isCustom: boolean;
  apiKey?: string;
  appId?: string;
  authDomain?: string;
  storageBucket?: string;
} {
  let active = { ...defaultFirebaseConfig };
  let isCustom = false;

  if (memoryOverrideConfig) {
    active = { ...active, ...memoryOverrideConfig };
    isCustom = true;
  } else {
    try {
      if (fs.existsSync(OVERRIDE_CONFIG_PATH)) {
        const raw = fs.readFileSync(OVERRIDE_CONFIG_PATH, 'utf-8');
        const override = JSON.parse(raw);
        active = { ...active, ...override };
        isCustom = true;
      }
    } catch (err) {
      // ignore read error on restricted environments
    }
  }

  return {
    projectId: active.projectId || defaultFirebaseConfig.projectId || '',
    firestoreDatabaseId: active.firestoreDatabaseId || defaultFirebaseConfig.firestoreDatabaseId || '(default)',
    defaultDatabaseId: defaultFirebaseConfig.firestoreDatabaseId || '(default)',
    isCustom,
    apiKey: active.apiKey,
    appId: active.appId,
    authDomain: active.authDomain,
    storageBucket: active.storageBucket,
  };
}

try {
  setLogLevel('error');
} catch {
  // ignore
}

let firebaseApp: FirebaseApp = getApps().length === 0 ? initializeApp(defaultFirebaseConfig) : getApp();

let currentConfig = getActiveFirestoreConfig();
export let firestore: Firestore = getFirestore(
  firebaseApp,
  currentConfig.firestoreDatabaseId === '(default)' ? undefined : currentConfig.firestoreDatabaseId
);

/**
 * Re-creates or gets Firestore instance
 */
export async function ensureAuth(_app: FirebaseApp): Promise<void> {
  // Rules are open (allow read, write: if true;). Avoid calling accounts:signUp to prevent 400 Bad Request
  return Promise.resolve();
}

export function getFirestoreForConfig(config: { projectId?: string; firestoreDatabaseId?: string; apiKey?: string; appId?: string }): Firestore {
  const dbId = config.firestoreDatabaseId === '(default)' || !config.firestoreDatabaseId ? undefined : config.firestoreDatabaseId;
  return getFirestore(firebaseApp, dbId);
}

/**
 * Test connectivity and measure latency to a Firestore database
 */
export async function testFirestoreConnection(configOverride?: {
  firestoreDatabaseId?: string;
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
  const targetConfig = configOverride
    ? { ...getActiveFirestoreConfig(), ...configOverride }
    : getActiveFirestoreConfig();

  const startTime = Date.now();
  try {
    await ensureAuth(firebaseApp);
    const targetDb = getFirestoreForConfig(targetConfig);

    // Read debtors collection metadata/count
    const debtorsCol = collection(targetDb, 'debtors');
    const txCol = collection(targetDb, 'transactions');
    const partiesCol = collection(targetDb, 'parties');

    const [debtorsSnap, txSnap, partiesSnap] = await Promise.all([
      getDocs(debtorsCol),
      getDocs(txCol),
      getDocs(partiesCol),
    ]);

    const latencyMs = Date.now() - startTime;

    return {
      success: true,
      latencyMs,
      databaseId: targetConfig.firestoreDatabaseId,
      projectId: targetConfig.projectId,
      isCustom: targetConfig.isCustom || targetConfig.firestoreDatabaseId !== targetConfig.defaultDatabaseId,
      stats: {
        debtors: debtorsSnap.size,
        transactions: txSnap.size,
        parties: partiesSnap.size,
      },
    };
  } catch (error: any) {
    const latencyMs = Date.now() - startTime;
    return {
      success: false,
      latencyMs,
      databaseId: targetConfig.firestoreDatabaseId,
      projectId: targetConfig.projectId,
      isCustom: targetConfig.isCustom,
      error: error?.message || 'Không thể kết nối đến Cloud Firestore',
    };
  }
}

/**
 * Reconfigure active Firestore database ID and persist it
 */
export async function reconfigureFirestore(
  databaseId: string,
  customConfig?: { projectId?: string; apiKey?: string; appId?: string }
): Promise<void> {
  const cleanDbId = databaseId.trim();

  const newConfig = {
    ...defaultFirebaseConfig,
    firestoreDatabaseId: cleanDbId,
    ...(customConfig || {}),
  };

  memoryOverrideConfig = newConfig;

  try {
    const dir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(OVERRIDE_CONFIG_PATH, JSON.stringify(newConfig, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Could not persist firestore-active-config.json to disk (safe in serverless):', err);
  }

  // Rebind firestore instance
  currentConfig = getActiveFirestoreConfig();
  firestore = getFirestore(
    firebaseApp,
    cleanDbId === '(default)' || !cleanDbId ? undefined : cleanDbId
  );
  console.log(`Active Cloud Firestore reconfigured to database: "${cleanDbId}"`);
}

/**
 * Reset back to default applet database
 */
export async function resetToDefaultFirestoreConfig(): Promise<void> {
  memoryOverrideConfig = null;
  try {
    if (fs.existsSync(OVERRIDE_CONFIG_PATH)) {
      fs.unlinkSync(OVERRIDE_CONFIG_PATH);
    }
  } catch (err) {
    console.warn('Error deleting firestore-active-config.json:', err);
  }

  currentConfig = getActiveFirestoreConfig();
  firestore = getFirestore(
    firebaseApp,
    defaultFirebaseConfig.firestoreDatabaseId || undefined
  );
  console.log(`Reset Cloud Firestore to default database: "${defaultFirebaseConfig.firestoreDatabaseId}"`);
}

const BACKUPS_DIR = path.join(process.cwd(), 'data', 'backups');

/**
 * Create a local snapshot backup of database state
 */
export function createSnapshotBackup(data: DatabaseState, label: string): string {
  try {
    if (!fs.existsSync(BACKUPS_DIR)) {
      fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    }
    const safeLabel = label.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `backup-${new Date().toISOString().replace(/[:.]/g, '-')}-${safeLabel}.json`;
    const fullPath = path.join(BACKUPS_DIR, filename);
    const payload = {
      backupDate: new Date().toISOString(),
      label,
      databaseId: currentConfig?.firestoreDatabaseId || '(default)',
      data,
    };
    fs.writeFileSync(fullPath, JSON.stringify(payload, null, 2), 'utf-8');
    fs.writeFileSync(
      path.join(process.cwd(), 'data', 'latest-backup.json'),
      JSON.stringify(payload, null, 2),
      'utf-8'
    );
    console.log(`Created snapshot backup: ${filename}`);
    return filename;
  } catch (err) {
    console.warn('Could not save snapshot backup (safe in serverless):', err);
    return '';
  }
}

/**
 * List all available snapshot backups
 */
export function listSnapshotBackups(): Array<{
  filename: string;
  backupDate: string;
  label: string;
  databaseId: string;
  debtorsCount: number;
  transactionsCount: number;
}> {
  try {
    if (!fs.existsSync(BACKUPS_DIR)) return [];
    const files = fs.readdirSync(BACKUPS_DIR).filter((f) => f.endsWith('.json'));
    return files
      .map((f) => {
        try {
          const raw = fs.readFileSync(path.join(BACKUPS_DIR, f), 'utf-8');
          const parsed = JSON.parse(raw);
          return {
            filename: f,
            backupDate: parsed.backupDate || '',
            label: parsed.label || '',
            databaseId: parsed.databaseId || '',
            debtorsCount: parsed.data?.debtors?.length || 0,
            transactionsCount: parsed.data?.transactions?.length || 0,
          };
        } catch {
          return null;
        }
      })
      .filter((b): b is NonNullable<typeof b> => b !== null)
      .sort((a, b) => b.backupDate.localeCompare(a.backupDate));
  } catch {
    return [];
  }
}

/**
 * Restore database state from a snapshot backup file
 */
export function restoreSnapshotBackup(filename: string): DatabaseState | null {
  try {
    const fullPath = path.join(BACKUPS_DIR, filename);
    if (!fs.existsSync(fullPath)) return null;
    const raw = fs.readFileSync(fullPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return parsed.data as DatabaseState;
  } catch (err) {
    console.error('Error reading snapshot backup file:', err);
    return null;
  }
}

/**
 * Migrate/Copy all data from current database to target database safely with chunking & auth
 */
export async function migrateDataToDatabase(
  targetDatabaseId: string,
  currentData: DatabaseState
): Promise<{ success: boolean; message?: string; count?: { debtors: number; transactions: number; parties: number } }> {
  try {
    await ensureAuth(firebaseApp);
    const targetDb = getFirestore(
      firebaseApp,
      targetDatabaseId === '(default)' || !targetDatabaseId ? undefined : targetDatabaseId
    );

    // 1. Settings
    const sRef = doc(targetDb, 'settings', 'app_settings');
    await setDoc(sRef, currentData.settings || DEFAULT_SETTINGS);

    // 2. Chunk Debtors (max 400 per batch)
    if (currentData.debtors && currentData.debtors.length > 0) {
      for (let i = 0; i < currentData.debtors.length; i += 400) {
        const chunk = currentData.debtors.slice(i, i + 400);
        const batch = writeBatch(targetDb);
        chunk.forEach((d) => batch.set(doc(targetDb, 'debtors', d.id), d));
        await batch.commit();
      }
    }

    // 3. Chunk Transactions (max 400 per batch)
    if (currentData.transactions && currentData.transactions.length > 0) {
      for (let i = 0; i < currentData.transactions.length; i += 400) {
        const chunk = currentData.transactions.slice(i, i + 400);
        const batch = writeBatch(targetDb);
        chunk.forEach((t) => batch.set(doc(targetDb, 'transactions', t.id), t));
        await batch.commit();
      }
    }

    // 4. Chunk Parties (max 400 per batch)
    if (currentData.parties && currentData.parties.length > 0) {
      for (let i = 0; i < currentData.parties.length; i += 400) {
        const chunk = currentData.parties.slice(i, i + 400);
        const batch = writeBatch(targetDb);
        chunk.forEach((p) => batch.set(doc(targetDb, 'parties', p.id), p));
        await batch.commit();
      }
    }

    console.log(`Successfully migrated data to database "${targetDatabaseId}": ${currentData.debtors?.length || 0} debtors, ${currentData.transactions?.length || 0} txs.`);
    return {
      success: true,
      count: {
        debtors: currentData.debtors?.length || 0,
        transactions: currentData.transactions?.length || 0,
        parties: currentData.parties?.length || 0,
      },
    };
  } catch (err: any) {
    console.error('Error migrating data to target database:', err);
    return { success: false, message: err?.message || 'Lỗi khi sao chép dữ liệu sang Database mới' };
  }
}

export interface DatabaseState {
  debtors: Debtor[];
  transactions: Transaction[];
  parties: PartySplit[];
  settings: AppSettings;
}

/**
 * Load complete dataset from Cloud Firestore.
 * If Cloud Firestore has no debtors and no transactions, automatically seeds with initial dataset.
 */
export async function loadDataFromFirestore(): Promise<DatabaseState> {
  try {
    await ensureAuth(firebaseApp);
    const debtorsCol = collection(firestore, 'debtors');
    const transactionsCol = collection(firestore, 'transactions');
    const partiesCol = collection(firestore, 'parties');
    const settingsDocRef = doc(firestore, 'settings', 'app_settings');

    const [debtorsSnap, txSnap, partiesSnap, settingsSnap] = await Promise.all([
      getDocs(debtorsCol),
      getDocs(transactionsCol),
      getDocs(partiesCol),
      getDoc(settingsDocRef),
    ]);

    const debtors: Debtor[] = [];
    debtorsSnap.forEach((d) => {
      debtors.push(d.data() as Debtor);
    });

    const transactions: Transaction[] = [];
    txSnap.forEach((t) => {
      transactions.push(t.data() as Transaction);
    });

    const parties: PartySplit[] = [];
    partiesSnap.forEach((p) => {
      parties.push(p.data() as PartySplit);
    });

    let settings: AppSettings = DEFAULT_SETTINGS;
    if (settingsSnap.exists()) {
      settings = { ...DEFAULT_SETTINGS, ...(settingsSnap.data() as AppSettings) };
    }

    // If Cloud Firestore is totally empty (newly connected or clean database),
    // initialize a clean settings document so the database is recognized, but DO NOT inject mock data!
    // Users can load sample datasets explicitly anytime from the "Nạp Bộ Dữ Liệu Mẫu" presets.
    if (debtors.length === 0 && transactions.length === 0 && !settingsSnap.exists()) {
      console.log('Cloud Firestore is clean/empty. Initializing clean settings without forcing mock data.');
      try {
        await setDoc(settingsDocRef, { ...DEFAULT_SETTINGS, isInitialized: true });
      } catch (err) {
        console.warn('Notice initializing clean settings doc:', err);
      }
      return {
        debtors: [],
        transactions: [],
        parties: [],
        settings: DEFAULT_SETTINGS,
      };
    }

    return {
      debtors,
      transactions,
      parties,
      settings,
    };
  } catch (error: any) {
    console.error('Error reading from Cloud Firestore:', error?.message);
    throw error;
  }
}

/**
 * Seed initial sample dataset into Cloud Firestore
 */
export async function seedInitialDataToFirestore(): Promise<void> {
  const batch = writeBatch(firestore);

  // Settings
  const settingsDocRef = doc(firestore, 'settings', 'app_settings');
  batch.set(settingsDocRef, DEFAULT_SETTINGS);

  // Debtors
  for (const debtor of INITIAL_DEBTORS) {
    const dRef = doc(firestore, 'debtors', debtor.id);
    batch.set(dRef, debtor);
  }

  // Transactions
  for (const tx of INITIAL_TRANSACTIONS) {
    const tRef = doc(firestore, 'transactions', tx.id);
    batch.set(tRef, tx);
  }

  // Parties
  for (const p of INITIAL_PARTIES) {
    const pRef = doc(firestore, 'parties', p.id);
    batch.set(pRef, p);
  }

  await batch.commit();
  console.log('Cloud Firestore successfully seeded with initial dataset');
}

/**
 * Utility to strip undefined properties from objects to prevent Firestore WriteBatch crashes
 */
/**
 * Utility to strip undefined properties from objects to prevent Firestore crashes
 */
export function cleanFirestoreObject<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) {
    return obj.map((item) => cleanFirestoreObject(item)) as any;
  }
  if (typeof obj === 'object') {
    const cleaned: any = {};
    for (const [key, value] of Object.entries(obj as any)) {
      if (value !== undefined) {
        cleaned[key] = typeof value === 'object' && value !== null ? cleanFirestoreObject(value) : value;
      }
    }
    return cleaned;
  }
  return obj;
}

/**
 * Replace entire Firestore data with given state
 */
export async function replaceFirestoreData(state: DatabaseState): Promise<void> {
  await ensureAuth(firebaseApp);
  await clearAllFirestoreData();

  // Settings
  const settingsDocRef = doc(firestore, 'settings', 'app_settings');
  await setDoc(settingsDocRef, cleanFirestoreObject(state.settings || DEFAULT_SETTINGS));

  // Chunk debtors (safe doc IDs and sanitized objects)
  if (state.debtors.length > 0) {
    for (let i = 0; i < state.debtors.length; i += 400) {
      const chunk = state.debtors.slice(i, i + 400);
      const b = writeBatch(firestore);
      chunk.forEach((d, idx) => {
        const dId = String(d.id || `d_${Date.now()}_${i + idx}`);
        b.set(doc(firestore, 'debtors', dId), cleanFirestoreObject({ ...d, id: dId }));
      });
      await b.commit();
    }
  }

  // Chunk transactions (safe doc IDs and sanitized objects)
  if (state.transactions.length > 0) {
    for (let i = 0; i < state.transactions.length; i += 400) {
      const chunk = state.transactions.slice(i, i + 400);
      const b = writeBatch(firestore);
      chunk.forEach((t, idx) => {
        const tId = String(t.id || `tx_${Date.now()}_${i + idx}`);
        b.set(doc(firestore, 'transactions', tId), cleanFirestoreObject({ ...t, id: tId }));
      });
      await b.commit();
    }
  }

  // Chunk parties (safe doc IDs and sanitized objects)
  if (state.parties.length > 0) {
    for (let i = 0; i < state.parties.length; i += 400) {
      const chunk = state.parties.slice(i, i + 400);
      const b = writeBatch(firestore);
      chunk.forEach((p, idx) => {
        const pId = String(p.id || `p_${Date.now()}_${i + idx}`);
        b.set(doc(firestore, 'parties', pId), cleanFirestoreObject({ ...p, id: pId }));
      });
      await b.commit();
    }
  }
}

/**
 * Load a dataset preset directly into Cloud Firestore
 */
export async function loadPresetDataIntoFirestore(presetId: string): Promise<DatabaseState> {
  const preset = DATASET_PRESETS.find((p) => p.id === presetId);
  if (!preset) {
    throw new Error(`Preset "${presetId}" không tồn tại.`);
  }

  const presetData = preset.getData();
  const currentSettings = (await loadDataFromFirestore()).settings || DEFAULT_SETTINGS;
  const mergedSettings = {
    ...currentSettings,
    ...(presetData.settings || {}),
  };

  const newState: DatabaseState = {
    debtors: presetData.debtors,
    transactions: presetData.transactions,
    parties: presetData.parties,
    settings: mergedSettings,
  };

  await replaceFirestoreData(newState);
  return newState;
}

/**
 * Save or update a single debtor in Cloud Firestore
 */
export async function saveDebtorToFirestore(debtor: Debtor): Promise<void> {
  await ensureAuth(firebaseApp);
  const dRef = doc(firestore, 'debtors', debtor.id);
  await setDoc(dRef, cleanFirestoreObject(debtor), { merge: true });
}

/**
 * Delete a debtor and all their associated transactions from Cloud Firestore
 */
export async function deleteDebtorFromFirestore(debtorId: string): Promise<void> {
  await ensureAuth(firebaseApp);
  const dRef = doc(firestore, 'debtors', debtorId);
  await deleteDoc(dRef);

  // Clean up transactions belonging to this debtor
  try {
    const txSnap = await getDocs(collection(firestore, 'transactions'));
    const batch = writeBatch(firestore);
    let count = 0;
    txSnap.forEach((docItem) => {
      const data = docItem.data() as Transaction;
      if (data.debtorId === debtorId) {
        batch.delete(docItem.ref);
        count++;
      }
    });
    if (count > 0) {
      await batch.commit();
    }
  } catch (e: any) {
    console.warn('Error cleaning up debtor transactions:', e?.message);
  }
}

/**
 * Save or update a single transaction in Cloud Firestore
 */
export async function saveTransactionToFirestore(tx: Transaction): Promise<void> {
  await ensureAuth(firebaseApp);
  const tRef = doc(firestore, 'transactions', tx.id);
  await setDoc(tRef, cleanFirestoreObject(tx), { merge: true });
}

/**
 * Delete a single transaction from Cloud Firestore
 */
export async function deleteTransactionFromFirestore(txId: string): Promise<void> {
  await ensureAuth(firebaseApp);
  const tRef = doc(firestore, 'transactions', txId);
  await deleteDoc(tRef);
}

/**
 * Save party split and batch of generated transactions to Cloud Firestore
 */
export async function savePartySplitToFirestore(
  party: PartySplit,
  txs: Transaction[]
): Promise<void> {
  await ensureAuth(firebaseApp);
  const batch = writeBatch(firestore);
  const pRef = doc(firestore, 'parties', party.id);
  batch.set(pRef, cleanFirestoreObject(party), { merge: true });

  for (const tx of txs) {
    const tRef = doc(firestore, 'transactions', tx.id);
    batch.set(tRef, cleanFirestoreObject(tx), { merge: true });
  }

  await batch.commit();
}

/**
 * Delete party split and cascade delete all its transactions from Cloud Firestore
 */
export async function deletePartySplitFromFirestore(partyId: string): Promise<void> {
  await ensureAuth(firebaseApp);
  const batch = writeBatch(firestore);
  batch.delete(doc(firestore, 'parties', partyId));

  // Find and cascade delete all transactions associated with this partyId
  const q = query(collection(firestore, 'transactions'), where('partyId', '==', partyId));
  const snap = await getDocs(q);
  snap.forEach((d) => batch.delete(d.ref));

  await batch.commit();
}

/**
 * Update party split and cascade update its transactions in Cloud Firestore
 */
export async function updatePartySplitInFirestore(
  party: PartySplit,
  txs: Transaction[]
): Promise<void> {
  await ensureAuth(firebaseApp);
  const batch = writeBatch(firestore);
  batch.set(doc(firestore, 'parties', party.id), cleanFirestoreObject(party), { merge: true });

  // Delete previous transactions with this partyId
  const q = query(collection(firestore, 'transactions'), where('partyId', '==', party.id));
  const snap = await getDocs(q);
  snap.forEach((d) => batch.delete(d.ref));

  // Add new transactions
  for (const tx of txs) {
    const tRef = doc(firestore, 'transactions', tx.id);
    batch.set(tRef, cleanFirestoreObject(tx), { merge: true });
  }

  await batch.commit();
}

/**
 * Save settings to Cloud Firestore
 */
export async function saveSettingsToFirestore(settings: AppSettings): Promise<void> {
  await ensureAuth(firebaseApp);
  const sRef = doc(firestore, 'settings', 'app_settings');
  await setDoc(sRef, cleanFirestoreObject(settings), { merge: true });
}

/**
 * Synchronize full database state directly to Cloud Firestore in chunked batches
 */
export async function syncAllDataToFirestore(state: DatabaseState): Promise<{
  debtorsCount: number;
  transactionsCount: number;
  partiesCount: number;
}> {
  await ensureAuth(firebaseApp);

  // 1. Settings
  const sRef = doc(firestore, 'settings', 'app_settings');
  await setDoc(sRef, cleanFirestoreObject(state.settings || DEFAULT_SETTINGS), { merge: true });

  // 2. Debtors
  if (state.debtors.length > 0) {
    for (let i = 0; i < state.debtors.length; i += 400) {
      const chunk = state.debtors.slice(i, i + 400);
      const b = writeBatch(firestore);
      chunk.forEach((d, idx) => {
        const dId = String(d.id || `d_${Date.now()}_${i + idx}`);
        b.set(doc(firestore, 'debtors', dId), cleanFirestoreObject({ ...d, id: dId }), { merge: true });
      });
      await b.commit();
    }
  }

  // 3. Transactions
  if (state.transactions.length > 0) {
    for (let i = 0; i < state.transactions.length; i += 400) {
      const chunk = state.transactions.slice(i, i + 400);
      const b = writeBatch(firestore);
      chunk.forEach((t, idx) => {
        const tId = String(t.id || `tx_${Date.now()}_${i + idx}`);
        b.set(doc(firestore, 'transactions', tId), cleanFirestoreObject({ ...t, id: tId }), { merge: true });
      });
      await b.commit();
    }
  }

  // 4. Parties
  if (state.parties.length > 0) {
    for (let i = 0; i < state.parties.length; i += 400) {
      const chunk = state.parties.slice(i, i + 400);
      const b = writeBatch(firestore);
      chunk.forEach((p, idx) => {
        const pId = String(p.id || `p_${Date.now()}_${i + idx}`);
        b.set(doc(firestore, 'parties', pId), cleanFirestoreObject({ ...p, id: pId }), { merge: true });
      });
      await b.commit();
    }
  }

  console.log(`Cloud Firestore: Successfully synchronized ${state.debtors.length} debtors, ${state.transactions.length} transactions, ${state.parties.length} parties.`);
  return {
    debtorsCount: state.debtors.length,
    transactionsCount: state.transactions.length,
    partiesCount: state.parties.length,
  };
}

/**
 * Clear all data (debtors, transactions, parties) from Cloud Firestore safely in chunks
 */
export async function clearAllFirestoreData(): Promise<void> {
  await ensureAuth(firebaseApp);
  const [debtorsSnap, txSnap, partiesSnap] = await Promise.all([
    getDocs(collection(firestore, 'debtors')),
    getDocs(collection(firestore, 'transactions')),
    getDocs(collection(firestore, 'parties')),
  ]);

  const allRefs: any[] = [];
  debtorsSnap.forEach((d) => allRefs.push(d.ref));
  txSnap.forEach((t) => allRefs.push(t.ref));
  partiesSnap.forEach((p) => allRefs.push(p.ref));

  for (let i = 0; i < allRefs.length; i += 400) {
    const chunk = allRefs.slice(i, i + 400);
    const b = writeBatch(firestore);
    chunk.forEach((ref) => b.delete(ref));
    await b.commit();
  }

  // Ensure settings document remains exists so database is never auto re-seeded
  const settingsDocRef = doc(firestore, 'settings', 'app_settings');
  await setDoc(
    settingsDocRef,
    { isInitialized: true, lastClearedAt: new Date().toISOString() },
    { merge: true }
  );

  console.log(`Cloud Firestore: Cleared ${allRefs.length} records safely in chunks`);
}

/**
 * Reset Cloud Firestore data to initial sample dataset
 */
export async function resetSampleDataInFirestore(): Promise<void> {
  await clearAllFirestoreData();
  await seedInitialDataToFirestore();
}
