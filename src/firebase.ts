/**
 * ============================================================================
 * GHI CHÚ CHỈNH SỬA / CHANGELOG:
 * - Khởi tạo kết nối Cloud Firestore: Đồng bộ cấu hình chính thức từ firebase-applet-config.json
 *   với project 'gen-lang-client-0369169768' và database 'ai-studio-remixremixsghin-9ec32e46-cb00-435a-b1aa-84c978b8f638'.
 * - Khắc phục lỗi 'Missing or insufficient permissions': Đảm bảo kiểm tra kết nối an toàn,
 *   bắt lỗi permissions chi tiết và không làm crash ứng dụng khi kiểm tra ban đầu.
 * ============================================================================
 */

import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getFirestore, doc, getDocFromServer, setLogLevel, Firestore } from 'firebase/firestore';
import { BUILTIN_FIREBASE_CONFIG } from './firebaseConfig';

export { BUILTIN_FIREBASE_CONFIG };

const CLIENT_DB_OVERRIDE_KEY = 'debt_app_client_firestore_db_id';

const env = (typeof import.meta !== 'undefined' && (import.meta as any).env) ? (import.meta as any).env : {};

const effectiveConfig = {
  ...BUILTIN_FIREBASE_CONFIG,
  projectId: (env.VITE_FIREBASE_PROJECT_ID as string) || BUILTIN_FIREBASE_CONFIG.projectId,
  apiKey: (env.VITE_FIREBASE_API_KEY as string) || BUILTIN_FIREBASE_CONFIG.apiKey,
  appId: (env.VITE_FIREBASE_APP_ID as string) || BUILTIN_FIREBASE_CONFIG.appId,
  firestoreDatabaseId: (env.VITE_FIREBASE_DATABASE_ID as string) || BUILTIN_FIREBASE_CONFIG.firestoreDatabaseId,
};

try {
  setLogLevel('error');
} catch {
  // ignore
}

export const app: FirebaseApp = getApps().length === 0 ? initializeApp(effectiveConfig) : getApp();

// Rules are set to open access (allow read, write: if true;), no anonymous authentication required
async function ensureClientAuth() {
  // Safe no-op: prevents calling accounts:signUp when anonymous auth is not enabled in Firebase project
  return Promise.resolve();
}

function getInitialDatabaseId(): string {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const stored = localStorage.getItem(CLIENT_DB_OVERRIDE_KEY);
      if (stored) return stored;
    }
  } catch {
    // ignore
  }
  return effectiveConfig.firestoreDatabaseId || '(default)';
}

let currentDatabaseId = getInitialDatabaseId();

export let db: Firestore = getFirestore(
  app,
  currentDatabaseId === '(default)' || !currentDatabaseId ? undefined : currentDatabaseId
);

export function getClientFirebaseConfig() {
  return {
    ...effectiveConfig,
    activeDatabaseId: currentDatabaseId,
    defaultDatabaseId: effectiveConfig.firestoreDatabaseId || '(default)',
  };
}

export function reconfigureClientFirestore(newDatabaseId: string): void {
  const cleanId = newDatabaseId.trim();
  currentDatabaseId = cleanId;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (cleanId === effectiveConfig.firestoreDatabaseId) {
        localStorage.removeItem(CLIENT_DB_OVERRIDE_KEY);
      } else {
        localStorage.setItem(CLIENT_DB_OVERRIDE_KEY, cleanId);
      }
    }
  } catch {
    // ignore
  }

  db = getFirestore(
    app,
    cleanId === '(default)' || !cleanId ? undefined : cleanId
  );
  console.log(`Client Firestore updated to database: "${cleanId}"`);
}

export async function testFirestoreConnection(): Promise<boolean> {
  try {
    await ensureClientAuth();
    await getDocFromServer(doc(db, 'settings', 'app_settings'));
    console.log('Successfully connected to Cloud Firestore');
    return true;
  } catch (error: any) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    } else {
      console.warn('Firestore connection check:', error?.message);
    }
    return false;
  }
}

/**
 * Ping Cloud Firestore directly from browser and measure round-trip latency
 */
export async function pingClientFirestore(): Promise<{
  success: boolean;
  latencyMs: number;
  databaseId: string;
  error?: string;
}> {
  const startTime = performance.now();
  try {
    await ensureClientAuth();
    await getDocFromServer(doc(db, 'settings', 'app_settings'));
    const latencyMs = Math.round(performance.now() - startTime);
    return {
      success: true,
      latencyMs,
      databaseId: currentDatabaseId,
    };
  } catch (err: any) {
    const latencyMs = Math.round(performance.now() - startTime);
    const msg = err?.message || 'Lỗi kết nối';
    const isOnline = !msg.includes('client is offline') && !msg.includes('failed to fetch');
    return {
      success: isOnline,
      latencyMs,
      databaseId: currentDatabaseId,
      error: isOnline ? undefined : msg,
    };
  }
}

// Automatically test on boot
if (typeof window !== 'undefined') {
  testFirestoreConnection();
}
