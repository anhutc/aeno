import express from 'express';
import path from 'path';
import fs from 'fs';
import {
  DEFAULT_SETTINGS,
  INITIAL_DEBTORS,
  INITIAL_PARTIES,
  INITIAL_TRANSACTIONS,
} from './src/data/mockData';
import { Debtor, Transaction, PartySplit, AppSettings } from './src/types';
import {
  loadDataFromFirestore,
  saveDebtorToFirestore,
  deleteDebtorFromFirestore,
  saveTransactionToFirestore,
  deleteTransactionFromFirestore,
  savePartySplitToFirestore,
  deletePartySplitFromFirestore,
  updatePartySplitInFirestore,
  saveSettingsToFirestore,
  clearAllFirestoreData,
  resetSampleDataInFirestore,
  getActiveFirestoreConfig,
  testFirestoreConnection,
  reconfigureFirestore,
  resetToDefaultFirestoreConfig,
  migrateDataToDatabase,
  replaceFirestoreData,
  loadPresetDataIntoFirestore,
  syncAllDataToFirestore,
  createSnapshotBackup,
  listSnapshotBackups,
  restoreSnapshotBackup,
} from './src/services/firestoreService';

interface DatabaseSchema {
  debtors: Debtor[];
  transactions: Transaction[];
  parties: PartySplit[];
  settings: AppSettings;
}

const PORT = 3000;
const IS_VERCEL = Boolean(process.env.VERCEL);

// Guard against benign Firestore BloomFilter fallback warnings
const isBloomFilterNoise = (args: any[]): boolean => {
  return args.some((arg) => {
    const str = typeof arg === 'string' ? arg : arg?.message || (typeof arg === 'object' ? JSON.stringify(arg) : '');
    return str.includes('BloomFilter') || str.includes('Invalid hash count');
  });
};
const origWarn = console.warn;
console.warn = (...args: any[]) => {
  if (isBloomFilterNoise(args)) return;
  origWarn.apply(console, args);
};
const origError = console.error;
console.error = (...args: any[]) => {
  if (isBloomFilterNoise(args)) return;
  origError.apply(console, args);
};
const DATA_DIR = IS_VERCEL ? path.join('/tmp', 'debt-app-data') : path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

let isFirestoreActive = false;
let inMemoryDb: DatabaseSchema | null = null;

function loadLocalDatabase(): DatabaseSchema {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      return {
        debtors: parsed.debtors || INITIAL_DEBTORS,
        transactions: parsed.transactions || INITIAL_TRANSACTIONS,
        parties: parsed.parties || INITIAL_PARTIES,
        settings: parsed.settings || DEFAULT_SETTINGS,
      };
    }
  } catch (err) {
    console.warn('Notice reading local db (safe in serverless):', err);
  }

  const initialDb: DatabaseSchema = {
    debtors: INITIAL_DEBTORS,
    transactions: INITIAL_TRANSACTIONS,
    parties: INITIAL_PARTIES,
    settings: DEFAULT_SETTINGS,
  };
  saveDatabaseLocal(initialDb);
  return initialDb;
}

function saveDatabaseLocal(db: DatabaseSchema) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
  } catch (err) {
    // In serverless, writing to disk may be restricted or ephemeral; in-memory state is preserved
  }
}

// Ensure database state exists
function getDatabase(): DatabaseSchema {
  if (inMemoryDb) {
    return inMemoryDb;
  }
  inMemoryDb = loadLocalDatabase();
  return inMemoryDb;
}

function saveDatabase(db: DatabaseSchema) {
  inMemoryDb = db;
  saveDatabaseLocal(db);
}

// Instantiate Express App for both standalone and serverless (Vercel) runtimes
const app = express();

// Allow larger payload for image uploads (receipt / bill images)
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Initial async Firestore synchronization
let firestoreSyncPromise: Promise<void> | null = null;
async function ensureFirestoreSync() {
  if (inMemoryDb && isFirestoreActive) return;
  if (!firestoreSyncPromise) {
    firestoreSyncPromise = (async () => {
      try {
        console.log('Connecting to Cloud Firestore...');
        const remoteData = await loadDataFromFirestore();
        if (remoteData.debtors.length === 0 && remoteData.transactions.length === 0 && !remoteData.settings?.isInitialized && !remoteData.settings?.lastClearedAt) {
          const localDb = loadLocalDatabase();
          if (localDb.debtors.length > 0 || localDb.transactions.length > 0) {
            console.log('Firestore is clean/empty, seeding from existing local database...');
            await syncAllDataToFirestore(localDb);
            inMemoryDb = localDb;
            isFirestoreActive = true;
            return;
          }
        }
        inMemoryDb = remoteData;
        saveDatabaseLocal(remoteData);
        isFirestoreActive = true;
        console.log('Connected to Cloud Firestore successfully.');
      } catch (err: any) {
        firestoreSyncPromise = null; // allow retry on next request
        console.warn('Cloud Firestore boot sync (using local fallback):', err?.message);
        if (!inMemoryDb) {
          inMemoryDb = loadLocalDatabase();
        }
      }
    })();
  }
  return firestoreSyncPromise;
}

// Trigger background sync immediately
ensureFirestoreSync();

// Middleware: Ensure Cloud Firestore data is hydrated before processing any /api routes
app.use(async (req, _res, next) => {
  if (req.url && req.url.startsWith('/api') && req.url !== '/api/health') {
    try {
      // Bounded sync with 2.5s maximum wait so serverless function never crashes or times out
      await Promise.race([
        ensureFirestoreSync(),
        new Promise((resolve) => setTimeout(resolve, 2500)),
      ]);
    } catch (err: any) {
      console.warn('Middleware Firestore sync notice:', err?.message);
    }
  }
  next();
});

  // Session token tolerance
  const OWNER_TOKEN_PREFIX = 'secret-owner-token-';
  const OWNER_TOKEN = 'secret-owner-token-' + Date.now();

  const authMiddleware = (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    const authHeader = req.headers['authorization'] || req.headers['x-owner-token'];
    const token = typeof authHeader === 'string' ? authHeader.replace(/^Bearer\s+/, '').trim() : '';
    const db = getDatabase();
    const currentOwnerPassword = (db.settings.ownerPassword || '123456').trim();
    const adminPasswordHeader = typeof req.headers['x-admin-password'] === 'string' ? req.headers['x-admin-password'].trim() : '';
    const bodyPassword = typeof req.body?.ownerPassword === 'string' ? req.body.ownerPassword.trim() : '';

    // Allow if matches token prefix, session token, or current admin password
    if (
      (typeof token === 'string' && token.startsWith(OWNER_TOKEN_PREFIX)) ||
      token === 'local-owner-session' ||
      token === currentOwnerPassword ||
      adminPasswordHeader === currentOwnerPassword ||
      bodyPassword === currentOwnerPassword
    ) {
      return next();
    }
    return res.status(401).json({ success: false, message: 'Yêu cầu mật khẩu chủ sổ!' });
  };

  // --- API ROUTES ---

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      firestore: isFirestoreActive ? 'connected' : 'local_fallback',
      time: new Date().toISOString(),
    });
  });

  // Public: App Settings (Available for Guest and initial load)
  app.get('/api/settings', (_req, res) => {
    const db = getDatabase();
    res.json({
      success: true,
      settings: db.settings,
    });
  });

  // Owner Login
  app.post('/api/auth/login', (req, res) => {
    const { password } = req.body;
    const db = getDatabase();
    const correctPassword = db.settings.ownerPassword || '123456';

    if (password && password.trim() === correctPassword.trim()) {
      return res.json({
        success: true,
        token: OWNER_TOKEN,
        settings: db.settings,
      });
    }

    return res.status(401).json({
      success: false,
      message: 'Mật khẩu quản trị chủ sổ không đúng. Vui lòng thử lại.',
    });
  });

  // Get all data for authenticated owner
  app.get('/api/owner/data', authMiddleware, (_req, res) => {
    const db = getDatabase();
    res.json({
      success: true,
      debtors: db.debtors,
      transactions: db.transactions,
      parties: db.parties,
      settings: db.settings,
    });
  });

  // Owner: Add or Edit Debtor
  app.post('/api/owner/debtor', authMiddleware, async (req, res) => {
    const { id, name, phone, pin, note } = req.body;
    if (!name || !pin) {
      return res.status(400).json({ success: false, message: 'Tên và mật khẩu là bắt buộc' });
    }

    const trimmedPin = String(pin).trim();
    if (trimmedPin.length < 2) {
      return res.status(400).json({ success: false, message: 'Mật khẩu phải từ 2 ký tự trở lên' });
    }

    const db = getDatabase();

    // Check pass uniqueness (case-insensitive for convenience)
    const duplicatePin = db.debtors.find(
      (d) => d.id !== id && d.pin.trim().toLowerCase() === trimmedPin.toLowerCase()
    );
    if (duplicatePin) {
      return res.status(400).json({
        success: false,
        message: `Mật khẩu "${trimmedPin}" đã được gán cho "${duplicatePin.name}". Mỗi người cần một pass riêng để tra cứu bảo mật.`,
      });
    }

    const now = new Date().toISOString();
    let savedDebtor: Debtor;

    if (id) {
      const existingIdx = db.debtors.findIndex((d) => d.id === id);
      if (existingIdx === -1) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy người nợ' });
      }
      savedDebtor = {
        ...db.debtors[existingIdx],
        name: name.trim(),
        phone: phone ? phone.trim() : undefined,
        pin: trimmedPin,
        note: note ? note.trim() : undefined,
        updatedAt: now,
      };
      db.debtors[existingIdx] = savedDebtor;
    } else {
      savedDebtor = {
        id: `debtor-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: name.trim(),
        phone: phone ? phone.trim() : undefined,
        pin: trimmedPin,
        note: note ? note.trim() : undefined,
        createdAt: now,
        updatedAt: now,
      };
      db.debtors.push(savedDebtor);
    }

    saveDatabase(db);
    try {
      await saveDebtorToFirestore(savedDebtor);
      isFirestoreActive = true;
    } catch (err: any) {
      console.error('Error saving debtor to Cloud Firestore:', err?.message);
    }
    res.json({ success: true, debtor: savedDebtor, debtors: db.debtors });
  });

  // Owner: Delete Debtor
  app.delete('/api/owner/debtor/:id', authMiddleware, async (req, res) => {
    const { id } = req.params;
    const db = getDatabase();
    db.debtors = db.debtors.filter((d) => d.id !== id);
    db.transactions = db.transactions.filter((tx) => tx.debtorId !== id);
    saveDatabase(db);
    try {
      await deleteDebtorFromFirestore(id);
    } catch (err: any) {
      console.error('Error deleting debtor from Cloud Firestore:', err?.message);
    }
    res.json({ success: true, debtors: db.debtors, transactions: db.transactions });
  });

  // Owner: Add Transaction
  app.post('/api/owner/transaction', authMiddleware, async (req, res) => {
    const { debtorId, type, amount, date, note, category, billImage, partyId } = req.body;
    if (!debtorId || !amount || !date) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin giao dịch' });
    }

    const db = getDatabase();
    const newTx: Transaction = {
      id: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      debtorId,
      type,
      amount: Number(amount),
      date,
      note: note || '',
      category: category || 'SINGLE',
      ...(billImage ? { billImage } : {}),
      ...(partyId ? { partyId } : {}),
      createdAt: new Date().toISOString(),
    };

    db.transactions.unshift(newTx);
    saveDatabase(db);
    try {
      await saveTransactionToFirestore(newTx);
      isFirestoreActive = true;
    } catch (err: any) {
      console.error('Error saving transaction to Cloud Firestore:', err?.message);
    }
    res.json({ success: true, transaction: newTx, transactions: db.transactions });
  });

  // Owner: Edit/Update Transaction
  app.put('/api/owner/transaction/:id', authMiddleware, async (req, res) => {
    const { id } = req.params;
    const { type, amount, date, note, category, billImage, debtorId, partyId } = req.body;
    const db = getDatabase();
    const index = db.transactions.findIndex((t) => t.id === id);
    if (index === -1) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy giao dịch cần sửa' });
    }

    const existing = db.transactions[index];
    const updatedTx: Transaction = {
      ...existing,
      type: type || existing.type,
      amount: amount !== undefined ? Number(amount) : existing.amount,
      date: date || existing.date,
      note: note !== undefined ? note : existing.note,
      category: category !== undefined ? category : existing.category,
      debtorId: debtorId || existing.debtorId,
      createdAt: existing.createdAt || new Date().toISOString(),
    };
    if (billImage !== undefined) {
      if (billImage) {
        updatedTx.billImage = billImage;
      } else {
        delete updatedTx.billImage;
      }
    }
    if (partyId !== undefined) {
      if (partyId) {
        updatedTx.partyId = partyId;
      } else {
        delete updatedTx.partyId;
      }
    }

    db.transactions[index] = updatedTx;
    saveDatabase(db);
    try {
      await saveTransactionToFirestore(updatedTx);
      isFirestoreActive = true;
    } catch (err: any) {
      console.error('Error updating transaction to Cloud Firestore:', err?.message);
    }
    res.json({ success: true, transaction: updatedTx, transactions: db.transactions });
  });

  // Owner: Delete Transaction
  app.delete('/api/owner/transaction/:id', authMiddleware, async (req, res) => {
    const { id } = req.params;
    const db = getDatabase();
    db.transactions = db.transactions.filter((t) => t.id !== id);
    saveDatabase(db);
    try {
      await deleteTransactionFromFirestore(id);
    } catch (err: any) {
      console.error('Error deleting transaction from Cloud Firestore:', err?.message);
    }
    res.json({ success: true, transactions: db.transactions });
  });

  // Owner: Save Party Split
  app.post('/api/owner/party-split', authMiddleware, async (req, res) => {
    const { party, transactions: newTxs } = req.body;
    if (!party || !Array.isArray(newTxs)) {
      return res.status(400).json({ success: false, message: 'Dữ liệu chia tiền không hợp lệ' });
    }

    const db = getDatabase();
    const partyId = `party-${Date.now()}`;
    const savedParty: PartySplit = {
      ...party,
      id: partyId,
      createdAt: new Date().toISOString(),
    };

    const savedTransactions: Transaction[] = newTxs.map((tx: any, idx: number) => ({
      ...tx,
      id: `tx-${Date.now()}-${idx}`,
      partyId,
      createdAt: new Date().toISOString(),
    }));

    db.parties.unshift(savedParty);
    db.transactions = [...savedTransactions, ...db.transactions];
    saveDatabase(db);
    try {
      await savePartySplitToFirestore(savedParty, savedTransactions);
      isFirestoreActive = true;
    } catch (err: any) {
      console.error('Error saving party split to Cloud Firestore:', err?.message);
    }

    res.json({
      success: true,
      party: savedParty,
      parties: db.parties,
      transactions: db.transactions,
    });
  });

  // Owner: Delete Party Split (Cascading delete all participant transactions)
  app.delete('/api/owner/party-split/:id', authMiddleware, async (req, res) => {
    const { id } = req.params;
    const db = getDatabase();

    db.parties = db.parties.filter((p) => p.id !== id);
    // Cascade delete all transactions generated by this party split
    db.transactions = db.transactions.filter((t) => t.partyId !== id);
    saveDatabase(db);

    try {
      await deletePartySplitFromFirestore(id);
      isFirestoreActive = true;
    } catch (err: any) {
      console.error('Error deleting party split from Cloud Firestore:', err?.message);
    }

    res.json({
      success: true,
      parties: db.parties,
      transactions: db.transactions,
    });
  });

  // Owner: Update Party Split (Cascading update all participant transactions)
  app.put('/api/owner/party-split/:id', authMiddleware, async (req, res) => {
    const { id } = req.params;
    const { party, transactions: newTxs } = req.body;
    if (!party || !Array.isArray(newTxs)) {
      return res.status(400).json({ success: false, message: 'Dữ liệu chia tiền không hợp lệ' });
    }

    const db = getDatabase();
    const existingIndex = db.parties.findIndex((p) => p.id === id);
    const updatedParty: PartySplit = {
      ...party,
      id,
      createdAt: existingIndex >= 0 ? db.parties[existingIndex].createdAt : new Date().toISOString(),
    };

    if (existingIndex >= 0) {
      db.parties[existingIndex] = updatedParty;
    } else {
      db.parties.unshift(updatedParty);
    }

    // Remove old transactions for this partyId and insert new recalculated transactions
    const filteredTxs = db.transactions.filter((t) => t.partyId !== id);
    const savedTransactions: Transaction[] = newTxs.map((tx: any, idx: number) => ({
      ...tx,
      id: tx.id || `tx-${Date.now()}-${idx}`,
      partyId: id,
      createdAt: tx.createdAt || new Date().toISOString(),
    }));

    db.transactions = [...savedTransactions, ...filteredTxs];
    saveDatabase(db);

    try {
      await updatePartySplitInFirestore(updatedParty, savedTransactions);
      isFirestoreActive = true;
    } catch (err: any) {
      console.error('Error updating party split in Cloud Firestore:', err?.message);
    }

    res.json({
      success: true,
      party: updatedParty,
      parties: db.parties,
      transactions: db.transactions,
    });
  });

  // Owner: Update Settings
  app.put('/api/owner/settings', authMiddleware, async (req, res) => {
    const newSettings = req.body;
    const db = getDatabase();
    db.settings = {
      ...db.settings,
      ...newSettings,
    };
    saveDatabase(db);
    try {
      await saveSettingsToFirestore(db.settings);
      isFirestoreActive = true;
    } catch (err: any) {
      console.error('Error saving settings to Cloud Firestore:', err?.message);
    }
    res.json({ success: true, settings: db.settings });
  });

  // Owner: Clear all sample data to start fresh (Requires strict password verification)
  const handleClearAllSampleData = async (req: express.Request, res: express.Response) => {
    const { adminPassword, password } = req.body || {};
    const db = getDatabase();
    const currentOwnerPassword = (db.settings?.ownerPassword || '123456').trim();
    const inputPassword = (typeof adminPassword === 'string' ? adminPassword : (typeof password === 'string' ? password : '')).trim();

    // MUST strictly verify the password matches the current owner password
    if (!inputPassword || inputPassword !== currentOwnerPassword) {
      return res.status(401).json({
        success: false,
        message: 'Mật khẩu quản trị chủ sổ không đúng. Vui lòng nhập đúng mật khẩu để xác nhận!',
      });
    }

    try {
      createSnapshotBackup(getDatabase(), 'pre_clear_sample');
    } catch {
      // ignore
    }

    db.debtors = [];
    db.transactions = [];
    db.parties = [];
    saveDatabase(db);

    try {
      await clearAllFirestoreData();
    } catch (err: any) {
      console.error('Error clearing Cloud Firestore data:', err?.message);
    }

    return res.json({
      success: true,
      message: 'Đã xóa toàn bộ dữ liệu mẫu thành công trên Cloud Firestore và bộ nhớ. Sổ nợ của bạn đã được làm sạch!',
      debtors: [],
      transactions: [],
      parties: [],
    });
  };

  app.post('/api/owner/clear-all', handleClearAllSampleData);
  app.post('/api/owner/clear-sample-data', handleClearAllSampleData);

  // Owner: Reset back to sample data (Requires strict password verification)
  const handleResetSampleData = async (req: express.Request, res: express.Response) => {
    const { adminPassword, password } = req.body || {};
    const db = getDatabase();
    const currentOwnerPassword = (db.settings?.ownerPassword || '123456').trim();
    const inputPassword = (typeof adminPassword === 'string' ? adminPassword : (typeof password === 'string' ? password : '')).trim();

    // MUST strictly verify the password matches the current owner password
    if (!inputPassword || inputPassword !== currentOwnerPassword) {
      return res.status(401).json({
        success: false,
        message: 'Mật khẩu quản trị chủ sổ không đúng. Vui lòng nhập đúng mật khẩu để xác nhận!',
      });
    }

    try {
      createSnapshotBackup(getDatabase(), 'pre_reset_sample');
    } catch {
      // ignore
    }

    db.debtors = JSON.parse(JSON.stringify(INITIAL_DEBTORS));
    db.transactions = JSON.parse(JSON.stringify(INITIAL_TRANSACTIONS));
    db.parties = JSON.parse(JSON.stringify(INITIAL_PARTIES));
    saveDatabase(db);

    try {
      await resetSampleDataInFirestore();
    } catch (err: any) {
      console.error('Error resetting sample data in Cloud Firestore:', err?.message);
    }

    return res.json({
      success: true,
      message: 'Đã nạp lại toàn bộ dữ liệu mẫu ban đầu vào Cloud Firestore thành công!',
      debtors: db.debtors,
      transactions: db.transactions,
      parties: db.parties,
    });
  };

  app.post('/api/owner/reset-sample', handleResetSampleData);
  app.post('/api/owner/reset-sample-data', handleResetSampleData);

  // Owner: Save and Sync ALL Data to Cloud Firestore instantly
  const handleSyncAllData = async (req: express.Request, res: express.Response) => {
    try {
      const clientData = req.body || {};
      const db = getDatabase();

      // If client provided data, safely merge
      if (Array.isArray(clientData.debtors) && clientData.debtors.length > 0) {
        const debtorMap = new Map<string, Debtor>();
        db.debtors.forEach((d) => debtorMap.set(d.id, d));
        clientData.debtors.forEach((d: Debtor) => debtorMap.set(d.id, d));
        db.debtors = Array.from(debtorMap.values());
      }
      if (Array.isArray(clientData.transactions) && clientData.transactions.length > 0) {
        const txMap = new Map<string, Transaction>();
        db.transactions.forEach((t) => txMap.set(t.id, t));
        clientData.transactions.forEach((t: Transaction) => txMap.set(t.id, t));
        db.transactions = Array.from(txMap.values());
      }
      if (Array.isArray(clientData.parties) && clientData.parties.length > 0) {
        const partyMap = new Map<string, PartySplit>();
        db.parties.forEach((p) => partyMap.set(p.id, p));
        clientData.parties.forEach((p: PartySplit) => partyMap.set(p.id, p));
        db.parties = Array.from(partyMap.values());
      }
      if (clientData.settings && typeof clientData.settings === 'object') {
        db.settings = { ...db.settings, ...clientData.settings };
      }

      saveDatabase(db);

      // Perform guaranteed batch sync to Cloud Firestore
      const stats = await syncAllDataToFirestore(db);
      isFirestoreActive = true;

      return res.json({
        success: true,
        message: `Đã lưu và đồng bộ toàn bộ ${stats.debtorsCount} người nợ, ${stats.transactionsCount} giao dịch, ${stats.partiesCount} đợt chia tiền lên Cloud Firestore thành công tức thì!`,
        debtors: db.debtors,
        transactions: db.transactions,
        parties: db.parties,
        settings: db.settings,
        stats,
        syncedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error('Error syncing all data to Cloud Firestore:', err);
      return res.status(500).json({
        success: false,
        message: `Lỗi đồng bộ Cloud Firestore: ${err?.message || 'Không thể đồng bộ dữ liệu'}`,
      });
    }
  };

  app.post('/api/owner/sync-all', authMiddleware, handleSyncAllData);
  app.post('/api/owner/sync-now', authMiddleware, handleSyncAllData);

  // Owner: Sync with external server/webhook/database
  app.post('/api/owner/sync/external', authMiddleware, async (req, res) => {
    const { url, apiKey, mode } = req.body;
    if (!url) {
      return res.status(400).json({ success: false, message: 'Thiếu URL máy chủ đồng bộ' });
    }

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
        headers['x-api-key'] = apiKey;
      }

      if (mode === 'PULL') {
        const remoteRes = await fetch(url, { method: 'GET', headers });
        if (!remoteRes.ok) {
          return res.status(remoteRes.status).json({
            success: false,
            message: `Máy chủ trả về mã lỗi HTTP ${remoteRes.status}: ${remoteRes.statusText}`,
          });
        }
        const data = await remoteRes.json();
        const db = getDatabase();
        if (data.debtors && Array.isArray(data.debtors)) db.debtors = data.debtors;
        if (data.transactions && Array.isArray(data.transactions)) db.transactions = data.transactions;
        if (data.parties && Array.isArray(data.parties)) db.parties = data.parties;
        if (data.settings && typeof data.settings === 'object') {
          db.settings = { ...db.settings, ...data.settings };
        }
        saveDatabase(db);
        return res.json({
          success: true,
          message: 'Kéo dữ liệu từ máy chủ đồng bộ thành công!',
          debtors: db.debtors,
          transactions: db.transactions,
          parties: db.parties,
          settings: db.settings,
        });
      } else {
        // PUSH or TEST
        const db = getDatabase();
        const payload = {
          debtors: db.debtors,
          transactions: db.transactions,
          parties: db.parties,
          settings: db.settings,
          syncedAt: new Date().toISOString(),
        };

        const remoteRes = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });

        if (!remoteRes.ok) {
          return res.status(remoteRes.status).json({
            success: false,
            message: `Máy chủ trả về mã lỗi HTTP ${remoteRes.status}: ${remoteRes.statusText}`,
          });
        }

        const result = await remoteRes.json().catch(() => ({}));
        return res.json({
          success: true,
          message: 'Đẩy dữ liệu sao lưu lên máy chủ thành công!',
          result,
          syncedAt: payload.syncedAt,
        });
      }
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        message: `Lỗi kết nối máy chủ: ${err?.message || 'Không thể gửi yêu cầu'}`,
      });
    }
  });

  // --- CLOUD FIRESTORE MANAGEMENT APIS ---

  // Get live status, latency, connected database ID, and statistics
  app.get('/api/firestore/status', async (_req, res) => {
    try {
      const config = getActiveFirestoreConfig();
      const testRes = await testFirestoreConnection();
      const currentDb = getDatabase();
      res.json({
        success: true,
        connected: testRes.success,
        latencyMs: testRes.latencyMs,
        databaseId: testRes.databaseId,
        defaultDatabaseId: config.defaultDatabaseId,
        projectId: testRes.projectId,
        isCustom: testRes.isCustom,
        stats: testRes.stats || {
          debtors: currentDb.debtors.length,
          transactions: currentDb.transactions.length,
          parties: currentDb.parties.length,
        },
        error: testRes.error || null,
        lastChecked: new Date().toISOString(),
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        connected: false,
        error: err?.message || 'Lỗi kiểm tra trạng thái Firestore',
      });
    }
  });

  // Test connection to proposed database ID / Firebase credentials
  app.post('/api/firestore/test-connection', async (req, res) => {
    try {
      const { databaseId, projectId, apiKey } = req.body;
      const testRes = await testFirestoreConnection({
        firestoreDatabaseId: databaseId,
        projectId,
        apiKey,
      });
      res.json(testRes);
    } catch (err: any) {
      res.json({
        success: false,
        error: err?.message || 'Không thể kiểm tra kết nối',
        latencyMs: 0,
      });
    }
  });

  // Switch to another Firestore database ID with optional migration
  app.post('/api/firestore/change-database', authMiddleware, async (req, res) => {
    const { databaseId, projectId, apiKey, migrateExistingData } = req.body;
    if (!databaseId || typeof databaseId !== 'string') {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp Database ID hợp lệ!' });
    }

    const cleanDbId = databaseId.trim();
    try {
      // 0. Auto snapshot current data BEFORE any switch to guarantee no data loss
      const currentData = getDatabase();
      const backupFile = createSnapshotBackup(currentData, `pre_switch_to_${cleanDbId}`);

      // 1. Test target database first
      const testTarget = await testFirestoreConnection({
        firestoreDatabaseId: cleanDbId,
        projectId,
        apiKey,
      });

      if (!testTarget.success) {
        return res.status(400).json({
          success: false,
          message: `Không thể kết nối đến Database "${cleanDbId}": ${testTarget.error || 'Vui lòng kiểm tra lại quyền truy cập hoặc tên Database'}.`,
        });
      }

      // 2. If requested, migrate current data to the target database
      let migratedCount = null;
      if (migrateExistingData) {
        const migRes = await migrateDataToDatabase(cleanDbId, currentData);
        if (!migRes.success) {
          return res.status(500).json({
            success: false,
            message: `Kết nối thành công nhưng sao chép dữ liệu thất bại: ${migRes.message}`,
          });
        }
        migratedCount = migRes.count;
      }

      // 3. Reconfigure active database
      await reconfigureFirestore(cleanDbId, { projectId, apiKey });

      // 4. Reload data from new database into memory
      const freshData = await loadDataFromFirestore();
      inMemoryDb = freshData;
      saveDatabaseLocal(freshData);
      isFirestoreActive = true;

      return res.json({
        success: true,
        message: migrateExistingData
          ? `Đã chuyển sang Database "${cleanDbId}" và sao chép toàn bộ dữ liệu (${migratedCount?.debtors || 0} người nợ, ${migratedCount?.transactions || 0} giao dịch)!`
          : `Đã kết nối thành công tới Database "${cleanDbId}" (${freshData.debtors.length} người nợ có sẵn trên Cloud). Bản sao lưu dữ liệu trước đó đã được tạo tự động an toàn.`,
        databaseId: cleanDbId,
        data: freshData,
        backupFile,
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        message: `Lỗi khi thay đổi database: ${err?.message}`,
      });
    }
  });

  // Reset back to default applet database
  app.post('/api/firestore/reset-default-database', authMiddleware, async (_req, res) => {
    try {
      // Auto snapshot current data first
      const currentData = getDatabase();
      const backupFile = createSnapshotBackup(currentData, 'pre_reset_default');

      await resetToDefaultFirestoreConfig();
      const freshData = await loadDataFromFirestore();
      inMemoryDb = freshData;
      saveDatabaseLocal(freshData);
      isFirestoreActive = true;

      const config = getActiveFirestoreConfig();
      return res.json({
        success: true,
        message: `Đã khôi phục về Database mặc định: "${config.defaultDatabaseId}"`,
        databaseId: config.defaultDatabaseId,
        data: freshData,
        backupFile,
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        message: `Lỗi khi khôi phục database: ${err?.message}`,
      });
    }
  });

  // List snapshot backups
  app.get('/api/firestore/backups', authMiddleware, (_req, res) => {
    try {
      const backups = listSnapshotBackups();
      return res.json({ success: true, backups });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err?.message });
    }
  });

  // Manual snapshot backup creation
  app.post('/api/firestore/create-backup', authMiddleware, (req, res) => {
    try {
      const { label } = req.body;
      const currentData = getDatabase();
      const filename = createSnapshotBackup(currentData, label || 'manual_backup');
      return res.json({ success: true, filename, message: 'Đã tạo bản sao lưu snapshot thành công!' });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err?.message });
    }
  });

  // Restore from snapshot backup
  app.post('/api/firestore/restore-backup', authMiddleware, async (req, res) => {
    const { filename } = req.body;
    if (!filename) {
      return res.status(400).json({ success: false, message: 'Thiếu tên tệp sao lưu!' });
    }

    try {
      const backupData = restoreSnapshotBackup(filename);
      if (!backupData) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy tệp sao lưu hợp lệ!' });
      }

      // Auto snapshot current state before restoring
      createSnapshotBackup(getDatabase(), 'pre_restore_snapshot');

      // Update in memory & local
      inMemoryDb = backupData;
      saveDatabaseLocal(backupData);

      // Sync to Cloud Firestore if connected
      try {
        await replaceFirestoreData(backupData);
        isFirestoreActive = true;
      } catch (cloudErr: any) {
        console.warn('Could not sync restored backup to Cloud Firestore immediately:', cloudErr?.message);
      }

      return res.json({
        success: true,
        message: `Đã khôi phục thành công từ bản sao lưu: ${backupData.debtors.length} người nợ, ${backupData.transactions.length} giao dịch!`,
        data: backupData,
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err?.message });
    }
  });

  // Load a dataset preset directly into Cloud Firestore
  app.post('/api/firestore/load-dataset', authMiddleware, async (req, res) => {
    const { preset } = req.body;
    if (!preset || typeof preset !== 'string') {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn bộ dữ liệu mẫu hợp lệ!' });
    }

    try {
      const updatedState = await loadPresetDataIntoFirestore(preset);
      inMemoryDb = updatedState;
      saveDatabaseLocal(updatedState);
      isFirestoreActive = true;

      return res.json({
        success: true,
        message: `Đã nạp bộ dữ liệu lên Cloud Firestore thành công!`,
        data: updatedState,
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        message: `Lỗi khi nạp dữ liệu: ${err?.message}`,
      });
    }
  });

  // Upload custom JSON dataset directly to Cloud Firestore (Restore / Import)
  app.post('/api/firestore/upload-json', authMiddleware, async (req, res) => {
    let raw = req.body?.data !== undefined ? req.body.data : req.body;
    const mode = req.body?.mode === 'merge' ? 'merge' : 'replace';

    if (!raw || (typeof raw !== 'object' && !Array.isArray(raw))) {
      return res.status(400).json({ success: false, message: 'Dữ liệu JSON không hợp lệ!' });
    }

    // Unwrap nested data envelope if present
    if (raw.data && (Array.isArray(raw.data.debtors) || Array.isArray(raw.data))) {
      raw = raw.data;
    }

    try {
      const currentDb = getDatabase();
      let inputDebtors: any[] = [];
      let inputTransactions: any[] = [];
      let inputParties: any[] = [];
      let inputSettings: any = null;

      if (Array.isArray(raw)) {
        // If the array contains transactions with debtorId & amount, treat as transactions, else debtors
        if (raw.length > 0 && raw[0].debtorId !== undefined && raw[0].amount !== undefined) {
          inputTransactions = raw;
        } else {
          inputDebtors = raw;
        }
      } else {
        if (Array.isArray(raw.debtors)) inputDebtors = raw.debtors;
        if (Array.isArray(raw.transactions)) inputTransactions = raw.transactions;
        if (Array.isArray(raw.parties)) inputParties = raw.parties;
        if (raw.settings && typeof raw.settings === 'object') inputSettings = raw.settings;
      }

      // Sanitize debtors
      const cleanDebtors: Debtor[] = inputDebtors.map((d: any, idx: number) => ({
        id: String(d.id || `d_${Date.now()}_${idx}`),
        name: String(d.name || 'Người nợ không tên'),
        phone: d.phone ? String(d.phone) : undefined,
        note: d.note ? String(d.note) : '',
        pin: String(d.pin || Math.floor(100000 + Math.random() * 900000)),
        createdAt: String(d.createdAt || new Date().toISOString()),
        updatedAt: String(d.updatedAt || d.createdAt || new Date().toISOString()),
      }));

      // Sanitize transactions
      const cleanTransactions: Transaction[] = inputTransactions.map((t: any, idx: number) => {
        let typeVal: 'ADD' | 'SUB' = 'ADD';
        if (t.type === 'SUB' || t.type === 'REPAYMENT' || t.type === 'PAYMENT') {
          typeVal = 'SUB';
        } else if (t.type === 'ADD' || t.type === 'LOAN' || t.type === 'DEBT') {
          typeVal = 'ADD';
        }
        return {
          id: String(t.id || `tx_${Date.now()}_${idx}`),
          debtorId: String(t.debtorId || ''),
          amount: typeof t.amount === 'number' ? t.amount : Number(t.amount) || 0,
          type: typeVal,
          note: String(t.note || t.description || ''),
          category: (t.category || 'SINGLE') as any,
          date: String(t.date || new Date().toISOString().split('T')[0]),
          billImage: t.billImage || t.billImageUrl ? String(t.billImage || t.billImageUrl) : undefined,
          partyId: t.partyId ? String(t.partyId) : undefined,
          createdAt: String(t.createdAt || new Date().toISOString()),
        };
      });

      // Sanitize parties
      const cleanParties: PartySplit[] = inputParties.map((p: any, idx: number) => {
        const participantIds = Array.isArray(p.participantDebtorIds)
          ? p.participantDebtorIds
          : Array.isArray(p.participants)
          ? p.participants.map((item: any) => (typeof item === 'string' ? item : item.debtorId || item.id))
          : [];
        const total = typeof p.totalAmount === 'number' ? p.totalAmount : Number(p.totalAmount) || 0;
        const count = participantIds.length + (p.includeMe !== false ? 1 : 0);
        const split =
          typeof p.splitAmountPerPerson === 'number'
            ? p.splitAmountPerPerson
            : count > 0
            ? Math.round(total / count)
            : total;

        return {
          id: String(p.id || `p_${Date.now()}_${idx}`),
          name: String(p.name || p.title || 'Đợt chia tiền'),
          date: String(p.date || new Date().toISOString().split('T')[0]),
          totalAmount: total,
          payerType: (p.payerType === 'DEBTOR' ? 'DEBTOR' : 'ME') as 'ME' | 'DEBTOR',
          payerDebtorId:
            p.payerDebtorId || p.paidByDebtorId ? String(p.payerDebtorId || p.paidByDebtorId) : undefined,
          participantDebtorIds: participantIds.map(String),
          includeMe: p.includeMe !== false,
          splitAmountPerPerson: split,
          billImage: p.billImage || p.billImageUrl ? String(p.billImage || p.billImageUrl) : undefined,
          createdAt: String(p.createdAt || new Date().toISOString()),
        };
      });

      let finalDebtors: Debtor[];
      let finalTransactions: Transaction[];
      let finalParties: PartySplit[];
      let finalSettings: AppSettings;

      if (mode === 'merge') {
        const debtorMap = new Map<string, Debtor>();
        currentDb.debtors.forEach((d) => debtorMap.set(d.id, d));
        cleanDebtors.forEach((d) => debtorMap.set(d.id, d));
        finalDebtors = Array.from(debtorMap.values());

        const txMap = new Map<string, Transaction>();
        currentDb.transactions.forEach((t) => txMap.set(t.id, t));
        cleanTransactions.forEach((t) => txMap.set(t.id, t));
        finalTransactions = Array.from(txMap.values());

        const partyMap = new Map<string, PartySplit>();
        currentDb.parties.forEach((p) => partyMap.set(p.id, p));
        cleanParties.forEach((p) => partyMap.set(p.id, p));
        finalParties = Array.from(partyMap.values());

        finalSettings = inputSettings ? { ...currentDb.settings, ...inputSettings } : currentDb.settings;
      } else {
        // Mode replace
        finalDebtors = cleanDebtors;
        finalTransactions = cleanTransactions;
        finalParties = cleanParties;
        finalSettings = inputSettings ? { ...currentDb.settings, ...inputSettings } : currentDb.settings;
      }

      const newState: DatabaseSchema = {
        debtors: finalDebtors,
        transactions: finalTransactions,
        parties: finalParties,
        settings: finalSettings,
      };

      // Guaranteed batch replace on Cloud Firestore
      await replaceFirestoreData(newState);
      inMemoryDb = newState;
      saveDatabaseLocal(newState);
      isFirestoreActive = true;

      return res.json({
        success: true,
        message: `Khôi phục thành công ${finalDebtors.length} người nợ, ${finalTransactions.length} giao dịch, ${finalParties.length} đợt chia tiền lên Cloud Firestore!`,
        data: newState,
        stats: {
          debtorsCount: finalDebtors.length,
          transactionsCount: finalTransactions.length,
          partiesCount: finalParties.length,
        },
      });
    } catch (err: any) {
      console.error('Error during JSON restore upload:', err);
      return res.status(500).json({
        success: false,
        message: `Lỗi khi khôi phục dữ liệu từ tệp JSON: ${err?.message || 'Không thể ghi vào cơ sở dữ liệu'}`,
      });
    }
  });

  // Force Push or Force Pull
  app.post('/api/firestore/force-sync', authMiddleware, async (req, res) => {
    const { direction } = req.body;
    try {
      if (direction === 'PUSH') {
        const current = getDatabase();
        await replaceFirestoreData(current);
        isFirestoreActive = true;
        return res.json({
          success: true,
          message: 'Đã ghi đè toàn bộ dữ liệu từ máy lên Cloud Firestore thành công!',
          data: current,
        });
      } else {
        const fresh = await loadDataFromFirestore();
        inMemoryDb = fresh;
        saveDatabaseLocal(fresh);
        isFirestoreActive = true;
        return res.json({
          success: true,
          message: 'Đã tải toàn bộ dữ liệu mới nhất từ Cloud Firestore về máy!',
          data: fresh,
        });
      }
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        message: `Lỗi đồng bộ: ${err?.message}`,
      });
    }
  });

  // --- GUEST APIS (STRICT PRIVACY: ONLY PIN, NO LIST OF DEBTORS) ---

  // Guest: Lookup by PIN/Pass only!
  app.post('/api/guest/lookup', (req, res) => {
    const { pin } = req.body;
    if (!pin || typeof pin !== 'string') {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập mật khẩu (pass) tra cứu.' });
    }

    const trimmedPin = pin.trim().toLowerCase();
    const db = getDatabase();
    const targetDebtor = db.debtors.find((d) => d.pin.trim().toLowerCase() === trimmedPin);

    if (!targetDebtor) {
      return res.status(404).json({
        success: false,
        message: 'Mật khẩu (pass) không tồn tại hoặc không chính xác. Vui lòng liên hệ chủ sổ.',
      });
    }

    // Filter transactions ONLY for this specific debtor
    const debtorTransactions = db.transactions.filter((tx) => tx.debtorId === targetDebtor.id);

    // Return ONLY this debtor's data and necessary VietQR bank info
    // Never send other debtors' names, counts, or total receivable to the guest!
    res.json({
      success: true,
      debtor: {
        id: targetDebtor.id,
        name: targetDebtor.name,
        phone: targetDebtor.phone,
        pin: targetDebtor.pin,
        note: targetDebtor.note,
      },
      transactions: debtorTransactions,
      settings: {
        ownerName: db.settings.ownerName,
        bankId: db.settings.bankId,
        bankName: db.settings.bankName,
        accountNumber: db.settings.accountNumber,
        accountName: db.settings.accountName,
        defaultMemoPrefix: db.settings.defaultMemoPrefix,
        appTitle: db.settings.appTitle,
        appSubtitle: db.settings.appSubtitle,
        guestAnnouncement: db.settings.guestAnnouncement,
        settledThankYouNote: db.settings.settledThankYouNote,
        defaultQrMode: db.settings.defaultQrMode || 'MANUAL_AMOUNT',
        vietQrTemplate: db.settings.vietQrTemplate || 'compact2',
        lookupInstructionText: db.settings.lookupInstructionText,
        themeColor: db.settings.themeColor,
        currencySuffix: db.settings.currencySuffix,
      },
    });
  });

  // Guest: Report self payment with bill
  app.post('/api/guest/report-payment', async (req, res) => {
    const { pin, amount, note, billImage } = req.body;
    if (!pin || !amount) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin thanh toán' });
    }

    const trimmedPin = String(pin).trim();
    const db = getDatabase();
    const targetDebtor = db.debtors.find((d) => d.pin.trim() === trimmedPin);

    if (!targetDebtor) {
      return res.status(404).json({ success: false, message: 'Mã PIN không hợp lệ' });
    }

    const newTx: Transaction = {
      id: `tx-report-${Date.now()}`,
      debtorId: targetDebtor.id,
      type: 'SUB',
      amount: Number(amount),
      date: new Date().toISOString().split('T')[0],
      note: note ? note.trim() : 'Chuyển khoản thanh toán',
      category: 'PAYMENT_SETTLED',
      ...(billImage ? { billImage } : {}),
      createdAt: new Date().toISOString(),
    };

    db.transactions.unshift(newTx);
    saveDatabase(db);
    try {
      await saveTransactionToFirestore(newTx);
      isFirestoreActive = true;
    } catch (err: any) {
      console.error('Error saving payment report to Cloud Firestore:', err?.message);
    }

    const updatedDebtorTxs = db.transactions.filter((tx) => tx.debtorId === targetDebtor.id);

    res.json({
      success: true,
      transaction: newTx,
      transactions: updatedDebtorTxs,
    });
  });

  // --- VITE MIDDLEWARE / STATIC ASSETS & LISTEN ---
  async function startStandaloneServer() {
    if (process.env.NODE_ENV !== 'production') {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } else {
      const distPath = path.join(process.cwd(), 'dist');
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }

    // Bind and listen only in non-serverless container environments
    if (!IS_VERCEL) {
      app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server running on http://0.0.0.0:${PORT}`);
      });
    }
  }

  // Only launch standalone listener if not running in Vercel serverless environment
  if (!IS_VERCEL) {
    startStandaloneServer();
  }

  export default app;
  export { app };
