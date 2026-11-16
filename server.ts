import express from 'express';
import path from 'path';
import fs from 'fs';
import QRCode from 'qrcode';
import {
  DEFAULT_SETTINGS,
  INITIAL_DEBTORS,
  INITIAL_PARTIES,
  INITIAL_TRANSACTIONS,
} from './src/data/mockData';
import { Debtor, Transaction, PartySplit, AppSettings, AuditLog } from './src/types';
import {
  SheetsDatabaseSchema,
  getActiveSheetsConfig,
  saveSheetsConfig,
  classifySheetsError,
  testSheetsConnection,
  loadSettingsFromSheets,
  loadAllDataFromSheets,
  lookupGuestInSheets,
  saveAllDataToSheets,
  saveSettingsToSheets,
  guestReportPaymentToSheets,
  uploadBillImageToDrive,
  createSnapshotBackup,
  listSnapshotBackups,
  restoreSnapshotBackup,
} from './src/services/googleSheetsDbService';

const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const portFromArgs = portIndex !== -1 ? Number(args[portIndex + 1]) : null;
const hostIndex = args.indexOf('--host');
const hostFromArgs = hostIndex !== -1 ? args[hostIndex + 1] : null;

const PORT = portFromArgs || 3000;
const HOST = hostFromArgs || '0.0.0.0';
const IS_VERCEL = Boolean(process.env.VERCEL);

process.on('uncaughtException', (err: any) => {
  const msg = String(err?.message || err);
  if (msg.includes('WebSocket') || msg.includes('24678') || msg.includes('EADDRINUSE')) {
    return;
  }
  console.error('Process error notice:', err?.message || err);
});
process.on('unhandledRejection', (reason: any) => {
  const msg = String(reason?.message || reason);
  if (msg.includes('WebSocket') || msg.includes('24678')) {
    return;
  }
  console.warn('Unhandled promise notice:', reason);
});

const DATA_DIR = IS_VERCEL ? path.join('/tmp', 'debt-app-data') : path.join(process.cwd(), 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
try {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
} catch {
  // safe fallback
}

let inMemoryDb: SheetsDatabaseSchema | null = null;
let isSheetsDataLoaded = false;
let isSheetsSettingsLoaded = false;
let sheetsDataSyncPromise: Promise<void> | null = null;
let sheetsSettingsSyncPromise: Promise<void> | null = null;
let lastFullSyncAt = 0;
let lastSettingsSyncAt = 0;
let lastSheetsErrorAt = 0;
let lastSheetsError: string | null = null;
let lastSheetsErrorCode: 'SHEETS_NOT_CONFIGURED' | 'SHEETS_LEGACY_SCRIPT' | 'SHEETS_UNAVAILABLE' | null = null;
let needsScriptUpgrade = false;

function loadEmptyDatabase(): SheetsDatabaseSchema {
  return {
    debtors: [],
    transactions: [],
    parties: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}

function getDatabase(): SheetsDatabaseSchema {
  if (inMemoryDb) {
    return inMemoryDb;
  }
  inMemoryDb = loadEmptyDatabase();
  return inMemoryDb;
}

function saveDatabase(db: SheetsDatabaseSchema) {
  inMemoryDb = db;
}

function resolveRequestScriptUrl(req?: express.Request): string | undefined {
  if (!req) return undefined;
  const headerUrl =
    typeof req.headers['x-apps-script-url'] === 'string'
      ? req.headers['x-apps-script-url'].trim()
      : '';
  const bodyUrl =
    typeof req.body?.googleAppsScriptUrl === 'string'
      ? req.body.googleAppsScriptUrl.trim()
      : typeof req.body?.settings?.googleAppsScriptUrl === 'string'
      ? req.body.settings.googleAppsScriptUrl.trim()
      : '';
  const memUrl = (inMemoryDb?.settings?.googleAppsScriptUrl || '').trim();
  const current = getActiveSheetsConfig();

  // If the request explicitly provides a valid Apps Script URL from an authenticated owner session,
  // or when the existing env/file config is missing or previously errored, allow the request URL.
  if (headerUrl.startsWith('https://script.google.com/')) {
    if (
      current.source !== 'env' ||
      isAuthorizedOwnerRequest(req) ||
      lastSheetsErrorCode === 'SHEETS_UNAVAILABLE' ||
      lastSheetsErrorCode === 'SHEETS_LEGACY_SCRIPT'
    ) {
      return headerUrl;
    }
  }

  if (current.source === 'env') {
    return current.appsScriptUrl;
  }
  if (current.source === 'file' && current.appsScriptUrl) {
    return current.appsScriptUrl;
  }
  const candidate = [headerUrl, bodyUrl, memUrl].find((u) =>
    u.startsWith('https://script.google.com/')
  );
  return candidate || undefined;
}

function recordSheetsError(err: any) {
  const info = classifySheetsError(err);
  lastSheetsErrorAt = Date.now();
  lastSheetsError = info.message;
  lastSheetsErrorCode = info.code;
  needsScriptUpgrade = info.needsUpgrade;
  return info;
}

function clearSheetsError() {
  lastSheetsErrorAt = 0;
  lastSheetsError = null;
  lastSheetsErrorCode = null;
  needsScriptUpgrade = false;
}

async function ensureSheetsSettingsSync(forceRefresh = false, overrideUrl?: string) {
  const cfg = getActiveSheetsConfig(overrideUrl);
  if (!cfg.appsScriptUrl) {
    isSheetsSettingsLoaded = false;
    lastSheetsErrorCode = 'SHEETS_NOT_CONFIGURED';
    lastSheetsError = 'Chưa cấu hình URL Google Apps Script Web App.';
    needsScriptUpgrade = false;
    if (!inMemoryDb) inMemoryDb = loadEmptyDatabase();
    return;
  }

  if (!forceRefresh && isSheetsSettingsLoaded && Date.now() - lastSettingsSyncAt < 20000) {
    return;
  }
  if (!forceRefresh && !sheetsSettingsSyncPromise && lastSheetsErrorAt > 0 && Date.now() - lastSheetsErrorAt < 8000) {
    if (!inMemoryDb) inMemoryDb = loadEmptyDatabase();
    return;
  }

  if (!sheetsSettingsSyncPromise) {
    sheetsSettingsSyncPromise = (async () => {
      try {
        const settings = await loadSettingsFromSheets(cfg.appsScriptUrl);
        const db = getDatabase();
        db.settings = {
          ...db.settings,
          ...settings,
          googleAppsScriptUrl: cfg.appsScriptUrl,
        };
        isSheetsSettingsLoaded = true;
        lastSettingsSyncAt = Date.now();
        clearSheetsError();
        if (cfg.source === 'override') {
          saveSheetsConfig(cfg.appsScriptUrl, settings.googleSheetUrl || cfg.googleSheetUrl);
        }
      } catch (err: any) {
        const info = recordSheetsError(err);
        console.warn('Google Sheets settings sync notice:', info.message);
        if (!inMemoryDb) inMemoryDb = loadEmptyDatabase();
      } finally {
        sheetsSettingsSyncPromise = null;
      }
    })();
  }
  return sheetsSettingsSyncPromise;
}

async function ensureSheetsDataSync(forceRefresh = false, overrideUrl?: string) {
  const cfg = getActiveSheetsConfig(overrideUrl);
  if (!cfg.appsScriptUrl) {
    isSheetsDataLoaded = false;
    isSheetsSettingsLoaded = false;
    lastSheetsErrorCode = 'SHEETS_NOT_CONFIGURED';
    lastSheetsError = 'Chưa cấu hình URL Google Apps Script Web App.';
    needsScriptUpgrade = false;
    if (!inMemoryDb) inMemoryDb = loadEmptyDatabase();
    return;
  }

  if (!forceRefresh && inMemoryDb && isSheetsDataLoaded && Date.now() - lastFullSyncAt < 10000) {
    return;
  }

  if (!sheetsDataSyncPromise) {
    sheetsDataSyncPromise = (async () => {
      try {
        const remote = await loadAllDataFromSheets(cfg.appsScriptUrl);
        remote.settings = {
          ...remote.settings,
          googleAppsScriptUrl: cfg.appsScriptUrl,
        };
        inMemoryDb = remote;
        isSheetsDataLoaded = true;
        isSheetsSettingsLoaded = true;
        lastFullSyncAt = Date.now();
        lastSettingsSyncAt = Date.now();
        clearSheetsError();
        if (cfg.source === 'override') {
          saveSheetsConfig(cfg.appsScriptUrl, remote.settings.googleSheetUrl || cfg.googleSheetUrl);
        }
      } catch (err: any) {
        const info = recordSheetsError(err);
        console.warn('Google Sheets full sync notice:', info.message);
        if (!inMemoryDb) inMemoryDb = loadEmptyDatabase();
      } finally {
        sheetsDataSyncPromise = null;
      }
    })();
  }
  return sheetsDataSyncPromise;
}

if (!IS_VERCEL) {
  ensureSheetsSettingsSync();
}

const app = express();
app.use((req: any, _res, next) => {
  if (req.body !== undefined) {
    if (typeof req.body === 'string' && req.body.trim().startsWith('{')) {
      try {
        req.body = JSON.parse(req.body);
      } catch {
        // leave to express/route
      }
    }
    req._body = true;
  } else if (req.readableEnded) {
    req.body = {};
    req._body = true;
  }
  next();
});
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const SKIP_FULL_HYDRATION_PREFIXES = [
  '/api/health',
  '/api/settings',
  '/api/auth/login',
  '/api/guest/lookup',
  '/api/guest/report-payment',
  '/api/owner/data',
  '/api/owner/settings',
  '/api/owner/sync-all',
  '/api/owner/sync-now',
  '/api/audit-logs/',
  '/api/proxy-vietqr',
  '/api/images/',
  '/api/upload-image',
  '/api/sheets/',
  '/api/firestore/',
];

app.use(async (req, _res, next) => {
  const url = req.url || '';
  const reqUrl = resolveRequestScriptUrl(req);
  if (url.startsWith('/api') && !SKIP_FULL_HYDRATION_PREFIXES.some((prefix) => url.startsWith(prefix))) {
    try {
      await Promise.race([
        ensureSheetsDataSync(false, reqUrl),
        new Promise((resolve) => setTimeout(resolve, 12000)),
      ]);
    } catch (err: any) {
      console.warn('Middleware Sheets sync notice:', err?.message);
    }
  }
  next();
});

const OWNER_TOKEN_PREFIX = 'secret-owner-token-';
const OWNER_TOKEN = 'secret-owner-token-' + Date.now();

function isAuthorizedOwnerRequest(req: express.Request): boolean {
  const authHeader = req.headers['authorization'] || req.headers['x-owner-token'];
  const token = typeof authHeader === 'string' ? authHeader.replace(/^Bearer\s+/, '').trim() : '';
  const db = getDatabase();
  const currentOwnerPassword = (db.settings?.ownerPassword || '123456').trim();
  const adminPasswordHeader = typeof req.headers['x-admin-password'] === 'string' ? req.headers['x-admin-password'].trim() : '';
  const bodyPassword = typeof req.body?.ownerPassword === 'string' ? req.body.ownerPassword.trim() : '';

  return Boolean(
    (typeof token === 'string' &&
      token.length > 0 &&
      (token.startsWith(OWNER_TOKEN_PREFIX) ||
        token === 'sheets-owner-session' ||
        token === 'local-owner-session')) ||
      (currentOwnerPassword && (token === currentOwnerPassword || token.toLowerCase() === currentOwnerPassword.toLowerCase())) ||
      (currentOwnerPassword &&
        (adminPasswordHeader === currentOwnerPassword ||
          adminPasswordHeader.toLowerCase() === currentOwnerPassword.toLowerCase())) ||
      (currentOwnerPassword && bodyPassword && bodyPassword === currentOwnerPassword)
  );
}

const authMiddleware = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  if (isAuthorizedOwnerRequest(req)) {
    return next();
  }
  return res.status(401).json({ success: false, message: 'Yêu cầu mật khẩu chủ sổ!' });
};

// --- HEALTH CHECK ---
app.get('/api/health', async (req, res) => {
  const reqUrl = resolveRequestScriptUrl(req);
  const cfg = getActiveSheetsConfig(reqUrl);
  res.json({
    status: 'ok',
    backend: 'google_sheets',
    sheetsConfigured: Boolean(cfg.appsScriptUrl),
    sheetsConnected: Boolean((isSheetsDataLoaded || isSheetsSettingsLoaded) && !lastSheetsError),
    needsScriptUpgrade,
    sheetsError: lastSheetsError,
    time: new Date().toISOString(),
  });
});

// --- IMAGE UPLOAD & GOOGLE DRIVE / PROXY ROUTES ---
async function processAndOffloadBillImage(
  rawImage?: string,
  providedMimeType?: string,
  overrideUrl?: string
): Promise<string | undefined> {
  if (!rawImage || typeof rawImage !== 'string') return undefined;
  if (!rawImage.startsWith('data:')) return rawImage;

  try {
    let mimeType = providedMimeType || 'image/jpeg';
    let cleanBase64 = rawImage;

    const matches = rawImage.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (matches && matches.length === 3) {
      mimeType = matches[1];
      cleanBase64 = matches[2];
    } else {
      cleanBase64 = rawImage.split(',')[1] || rawImage;
    }

    let ext = '.jpg';
    if (mimeType.includes('png')) ext = '.png';
    else if (mimeType.includes('webp')) ext = '.webp';
    else if (mimeType.includes('gif')) ext = '.gif';
    else if (mimeType.includes('svg')) ext = '.svg';

    const imageId = `bill_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const safeFilename = `${imageId}${ext}`;
    const buffer = Buffer.from(cleanBase64, 'base64');

    // 1. Local cache when writable
    try {
      fs.writeFileSync(path.join(UPLOADS_DIR, safeFilename), buffer);
    } catch {
      // ignore on read-only serverless
    }

    // 2. Upload to Google Drive via Apps Script v3 (returns public Drive URL)
    const driveRes = await uploadBillImageToDrive(cleanBase64, mimeType, safeFilename, overrideUrl);
    if (driveRes && driveRes.url) {
      return driveRes.url;
    }

    // 3. Fallback: if compact enough for Sheets cell (<38KB), return inline; else local route
    if (rawImage.length < 38000) {
      return rawImage;
    }
    return `/api/images/${safeFilename}`;
  } catch (err: any) {
    console.warn('Could not offload base64 bill image:', err?.message);
    return rawImage;
  }
}

app.post('/api/upload-image', async (req, res) => {
  try {
    const reqUrl = resolveRequestScriptUrl(req);
    const { image, mimeType: providedMimeType } = req.body || {};
    if (!image || typeof image !== 'string') {
      return res.status(400).json({ success: false, message: 'Dữ liệu hình ảnh không hợp lệ' });
    }

    const imageUrl = await processAndOffloadBillImage(image, providedMimeType, reqUrl);
    const safeFilename =
      imageUrl && imageUrl.startsWith('/api/images/') ? path.basename(imageUrl) : 'bill.jpg';

    return res.json({
      success: true,
      url: imageUrl || image,
      filename: safeFilename,
      mimeType: providedMimeType || 'image/jpeg',
    });
  } catch (err: any) {
    console.error('Error handling /api/upload-image:', err);
    return res.status(500).json({ success: false, message: err?.message || 'Lỗi lưu trữ hình ảnh' });
  }
});

// Proxy Google Drive image cleanly if Safari/ITP blocks external Drive thumbnail cookies
app.get('/api/images/gdrive_:fileId', async (req, res) => {
  try {
    const fileId = String(req.params.fileId || '').replace(/[^a-zA-Z0-9_-]/g, '');
    if (!fileId) return res.status(400).send('Invalid fileId');

    const candidates = [
      `https://drive.google.com/thumbnail?id=${fileId}&sz=w2000`,
      `https://drive.google.com/uc?export=view&id=${fileId}`,
    ];
    for (const url of candidates) {
      try {
        const up = await fetch(url, { redirect: 'follow' });
        const contentType = up.headers.get('content-type') || '';
        if (up.ok && contentType.startsWith('image/')) {
          const buf = Buffer.from(await up.arrayBuffer());
          res.setHeader('Content-Type', contentType);
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          return res.end(buf);
        }
      } catch {
        // try next candidate
      }
    }
    return res.status(404).send('Không tìm thấy ảnh trên Google Drive');
  } catch (err: any) {
    return res.status(500).send(err?.message || 'Lỗi tải ảnh Google Drive');
  }
});

app.get('/api/images/:filename', async (req, res) => {
  try {
    const safeFilename = path.basename(req.params.filename);
    const localFilePath = path.join(UPLOADS_DIR, safeFilename);
    const getContentType = (fn: string) => {
      if (fn.endsWith('.png')) return 'image/png';
      if (fn.endsWith('.webp')) return 'image/webp';
      if (fn.endsWith('.gif')) return 'image/gif';
      if (fn.endsWith('.svg')) return 'image/svg+xml';
      return 'image/jpeg';
    };

    if (fs.existsSync(localFilePath)) {
      res.setHeader('Content-Type', getContentType(safeFilename));
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      return res.sendFile(localFilePath);
    }
    return res.status(404).send('Không tìm thấy hình ảnh chứng từ');
  } catch {
    return res.status(500).send('Lỗi tải hình ảnh');
  }
});

app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '365d', immutable: true }));

// --- VIETQR PROXY & BASE64 GENERATOR ---
const VIETQR_BANK_BIN_MAP: Record<string, string> = {
  ICB: '970415', VCB: '970436', BIDV: '970418', VBA: '970405', OCB: '970448',
  MB: '970422', TCB: '970407', ACB: '970416', VPB: '970432', TPB: '970423',
  STB: '970403', HDB: '970437', VCCB: '970454', SCB: '970429', VIB: '970441',
  SHB: '970443', EIB: '970431', MSB: '970426', CAKE: '546034', TIMO: '963388',
  VTLMONEY: '971005', VNPTMONEY: '971011', SGICB: '970400', BAB: '970409',
  momo: '971025', PVCB: '970412', MBV: '970414', NCB: '970419', SHBVN: '970424',
  ABB: '970425', VAB: '970427', NAB: '970428', PGB: '970430', VIETBANK: '970433',
  BVB: '970438', SEAB: '970440', COOPBANK: '970446', LPB: '970449', KLB: '970452',
  KBank: '668888', ZALOPAY: '971101',
};

const vietQrCache = new Map<string, { dataUrl: string; buffer: Buffer; timestamp: number }>();

app.get('/api/proxy-vietqr', async (req, res) => {
  try {
    const rawUrl = String(req.query.url || '').trim();
    const format = String(req.query.format || '').trim();
    let bankId = String(req.query.bankId || '').trim();
    let accountNo = String(req.query.accountNo || '').trim();
    let accountName = String(req.query.accountName || '').trim();
    let amount = Number(req.query.amount) || 0;
    let addInfo = String(req.query.addInfo || req.query.memo || '').trim();
    let template = String(req.query.template || 'compact2').trim();

    if (rawUrl) {
      try {
        const parsed = new URL(rawUrl);
        const pathFilename = parsed.pathname.split('/').pop() || '';
        const parts = pathFilename.replace(/\.(png|jpg|svg)$/i, '').split('-');
        if (parts.length >= 2) {
          if (!bankId) bankId = parts[0];
          if (!accountNo) accountNo = parts[1];
          if (parts[2] && (!template || template === 'compact2')) template = parts[2];
        }
        if (!accountName && parsed.searchParams.get('accountName')) {
          accountName = parsed.searchParams.get('accountName') || '';
        }
        if (!amount && parsed.searchParams.get('amount')) {
          amount = Number(parsed.searchParams.get('amount')) || 0;
        }
        if (!addInfo && parsed.searchParams.get('addInfo')) {
          addInfo = parsed.searchParams.get('addInfo') || '';
        }
      } catch {
        // ignore
      }
    }

    const cacheKey = `${bankId}-${accountNo}-${accountName}-${amount}-${template}-${addInfo}`;
    const cached = vietQrCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 3600000) {
      if (format === 'json') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.json({ success: true, dataUrl: cached.dataUrl, isEmbeddedPng: true });
      }
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.end(cached.buffer);
    }

    let finalDataUrl: string | null = null;
    let finalBuffer: Buffer | null = null;

    if (accountNo && bankId) {
      const cleanBank = bankId.trim().toUpperCase();
      const acqId = VIETQR_BANK_BIN_MAP[cleanBank] || cleanBank;
      try {
        const genRes = await fetch('https://api.vietqr.io/v2/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accountNo,
            accountName: accountName ? accountName.toUpperCase() : undefined,
            acqId,
            amount: amount > 0 ? amount : undefined,
            addInfo: addInfo ? addInfo.slice(0, 50) : undefined,
            template: template || 'compact2',
          }),
        });
        if (genRes.ok) {
          const genData = await genRes.json();
          if (genData?.code === '00' && genData.data?.qrDataURL) {
            finalDataUrl = genData.data.qrDataURL;
            finalBuffer = Buffer.from(finalDataUrl!.replace(/^data:image\/png;base64,/, ''), 'base64');
          }
        }
      } catch {
        // ignore
      }
    }

    if (!finalDataUrl && rawUrl) {
      try {
        const upstreamRes = await fetch(rawUrl);
        if (upstreamRes.ok) {
          const cType = upstreamRes.headers.get('content-type') || 'image/png';
          const rawBuf = Buffer.from(await upstreamRes.arrayBuffer());
          if (cType.includes('svg')) {
            const svgText = rawBuf.toString('utf-8');
            const match =
              svgText.match(/href="(data:image\/png;base64,[^"]+)"/) ||
              svgText.match(/xlink:href="(data:image\/png;base64,[^"]+)"/);
            if (match && match[1]) {
              finalDataUrl = match[1];
              finalBuffer = Buffer.from(match[1].replace(/^data:image\/png;base64,/, ''), 'base64');
            }
          } else if (cType.includes('png') || cType.includes('jpeg')) {
            finalDataUrl = `data:${cType};base64,${rawBuf.toString('base64')}`;
            finalBuffer = rawBuf;
          }
        }
      } catch {
        // ignore
      }
    }

    if (!finalDataUrl) {
      const qrContent = rawUrl || `2|99|${accountNo}|${accountName}|${bankId}|0|0|${amount}|${addInfo}`;
      finalDataUrl = await QRCode.toDataURL(qrContent, {
        errorCorrectionLevel: 'M',
        width: 360,
        margin: 1,
        color: { dark: '#0f172a', light: '#ffffff' },
      });
      finalBuffer = Buffer.from(finalDataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');
    }

    if (finalDataUrl && finalBuffer) {
      vietQrCache.set(cacheKey, { dataUrl: finalDataUrl, buffer: finalBuffer, timestamp: Date.now() });
    }

    if (format === 'json') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.json({ success: true, dataUrl: finalDataUrl, isEmbeddedPng: true });
    }

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.end(finalBuffer);
  } catch {
    try {
      const emergencyDataUrl = await QRCode.toDataURL('https://vietqr.me', { width: 300 });
      if (req.query.format === 'json') {
        return res.json({ success: true, dataUrl: emergencyDataUrl, isEmbeddedPng: true });
      }
      res.setHeader('Content-Type', 'image/png');
      return res.end(Buffer.from(emergencyDataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
    } catch {
      return res.status(500).json({ success: false, message: 'Lỗi tạo mã QR' });
    }
  }
});

// --- PUBLIC SETTINGS ---
app.get('/api/settings', async (req, res) => {
  try {
    const reqUrl = resolveRequestScriptUrl(req);
    const cfg = getActiveSheetsConfig(reqUrl);
    await ensureSheetsSettingsSync(false, reqUrl);
    const db = getDatabase();
    const {
      ownerPassword,
      reminderMessageTemplate,
      googleAppsScriptUrl,
      ...publicSettings
    } = (db.settings || {}) as any;

    return res.json({
      success: true,
      settings: publicSettings,
      backend: 'google_sheets',
      sheetsConfigured: Boolean(cfg.appsScriptUrl),
      sheetsConnected: Boolean((isSheetsDataLoaded || isSheetsSettingsLoaded) && !lastSheetsError),
      needsScriptUpgrade,
      sheetsError: lastSheetsError,
      sheetsErrorCode: lastSheetsErrorCode,
    });
  } catch (err: any) {
    const info = recordSheetsError(err);
    return res.status(503).json({
      success: false,
      code: info.code,
      sheetsConfigured: Boolean(getActiveSheetsConfig(resolveRequestScriptUrl(req)).appsScriptUrl),
      sheetsConnected: false,
      sheetsError: info.message,
      sheetsErrorCode: info.code,
      message: info.message,
    });
  }
});

// --- OWNER LOGIN ---
app.post('/api/auth/login', async (req, res) => {
  try {
    const { password } = req.body || {};
    const inputPass = String(password || '').trim();
    const reqUrl = resolveRequestScriptUrl(req);
    const cfg = getActiveSheetsConfig(reqUrl);

    if (!inputPass) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập mật khẩu quản trị',
      });
    }

    if (!cfg.appsScriptUrl) {
      return res.status(503).json({
        success: false,
        code: 'SHEETS_NOT_CONFIGURED',
        message: 'Chưa kết nối URL Google Apps Script Web App. Vui lòng dán URL Apps Script để kết nối cơ sở dữ liệu Google Sheets.',
      });
    }

    await ensureSheetsSettingsSync(false, reqUrl);

    if (!isSheetsSettingsLoaded && !isSheetsDataLoaded) {
      return res.status(503).json({
        success: false,
        code: lastSheetsErrorCode || 'SHEETS_UNAVAILABLE',
        needsScriptUpgrade,
        sheetsError: lastSheetsError,
        message:
          lastSheetsError ||
          'Không thể kết nối cơ sở dữ liệu Google Sheets (Apps Script Web App) để kiểm tra mật khẩu.',
      });
    }

    const db = getDatabase();
    let correctPassword = (db.settings?.ownerPassword || '').trim();
    let ownerPhone = (db.settings?.ownerPhone || '').trim();

    const cleanInput = inputPass.toLowerCase();
    const cleanPhone = ownerPhone.replace(/[\s.-]+/g, '');
    const cleanInputPhone = inputPass.replace(/[\s.-]+/g, '');

    let isMatched =
      (correctPassword && (inputPass === correctPassword || cleanInput === correctPassword.toLowerCase())) ||
      (ownerPhone && cleanInputPhone === cleanPhone);

    if (!isMatched && Date.now() - lastSettingsSyncAt > 8000) {
      try {
        const freshSettings = await loadSettingsFromSheets(cfg.appsScriptUrl);
        db.settings = { ...db.settings, ...freshSettings, googleAppsScriptUrl: cfg.appsScriptUrl };
        isSheetsSettingsLoaded = true;
        lastSettingsSyncAt = Date.now();
        clearSheetsError();
        const rPass = (freshSettings.ownerPassword || '').trim();
        const rPhone = (freshSettings.ownerPhone || '').trim();
        if (
          (rPass && (inputPass === rPass || cleanInput === rPass.toLowerCase())) ||
          (rPhone && cleanInputPhone === rPhone.replace(/[\s.-]+/g, ''))
        ) {
          isMatched = true;
        }
        correctPassword = rPass;
      } catch (err: any) {
        recordSheetsError(err);
      }
    }

    if (!isMatched && (!correctPassword || correctPassword === '123456') && inputPass === '123456') {
      isMatched = true;
    }

    if (isMatched) {
      return res.json({
        success: true,
        token: OWNER_TOKEN,
        settings: db.settings,
      });
    }

    return res.status(401).json({
      success: false,
      code: 'INVALID_CREDENTIALS',
      message: 'Mật khẩu hoặc mã xác thực không đúng. Vui lòng thử lại.',
    });
  } catch (err: any) {
    const info = recordSheetsError(err);
    return res.status(503).json({
      success: false,
      code: info.code,
      needsScriptUpgrade: info.needsUpgrade,
      message: info.message || 'Không thể xác thực quản trị với Google Sheets.',
    });
  }
});

// --- OWNER DATA & CRUD ---
app.get('/api/owner/data', authMiddleware, async (req, res) => {
  const reqUrl = resolveRequestScriptUrl(req);
  const cfg = getActiveSheetsConfig(reqUrl);
  const force = req.query.force === '1' || req.query.force === 'true';

  if (!cfg.appsScriptUrl) {
    const db = getDatabase();
    return res.json({
      success: true,
      sheetsConfigured: false,
      sheetsConnected: false,
      needsScriptUpgrade: false,
      sheetsError: 'Chưa cấu hình URL Google Apps Script Web App.',
      sheetsErrorCode: 'SHEETS_NOT_CONFIGURED',
      debtors: db.debtors,
      transactions: db.transactions,
      parties: db.parties,
      settings: db.settings,
    });
  }

  const shouldFetchFull = force || !isSheetsDataLoaded || Date.now() - lastFullSyncAt > 8000;
  if (shouldFetchFull) {
    try {
      const remote = await loadAllDataFromSheets(cfg.appsScriptUrl);
      remote.settings = {
        ...remote.settings,
        googleAppsScriptUrl: cfg.appsScriptUrl,
      };
      inMemoryDb = remote;
      isSheetsDataLoaded = true;
      isSheetsSettingsLoaded = true;
      lastFullSyncAt = Date.now();
      lastSettingsSyncAt = Date.now();
      clearSheetsError();
      if (cfg.source === 'override') {
        saveSheetsConfig(cfg.appsScriptUrl, remote.settings.googleSheetUrl || cfg.googleSheetUrl);
      }
      return res.json({
        success: true,
        sheetsConfigured: true,
        sheetsConnected: true,
        needsScriptUpgrade: false,
        sheetsError: null,
        sheetsErrorCode: null,
        debtors: remote.debtors,
        transactions: remote.transactions,
        parties: remote.parties,
        settings: remote.settings,
      });
    } catch (err: any) {
      const info = recordSheetsError(err);
      console.info('[Sheets sync notice] /api/owner/data:', info.message);
      const db = getDatabase();
      return res.json({
        success: true,
        sheetsConfigured: true,
        sheetsConnected: false,
        needsScriptUpgrade: info.needsUpgrade,
        sheetsError: info.message,
        sheetsErrorCode: info.code,
        debtors: db.debtors,
        transactions: db.transactions,
        parties: db.parties,
        settings: db.settings,
      });
    }
  }

  const db = getDatabase();
  return res.json({
    success: true,
    sheetsConfigured: true,
    sheetsConnected: isSheetsDataLoaded,
    needsScriptUpgrade,
    sheetsError: lastSheetsError,
    sheetsErrorCode: lastSheetsErrorCode,
    debtors: db.debtors,
    transactions: db.transactions,
    parties: db.parties,
    settings: db.settings,
  });
});

async function persistFullStateToSheets(db: SheetsDatabaseSchema, overrideUrl?: string) {
  const synced = await saveAllDataToSheets(db, overrideUrl);
  db.debtors = synced.debtors;
  db.transactions = synced.transactions;
  db.parties = synced.parties;
  saveDatabase(db);
  isSheetsDataLoaded = true;
  isSheetsSettingsLoaded = true;
  lastFullSyncAt = Date.now();
  lastSettingsSyncAt = Date.now();
  clearSheetsError();
}

app.post('/api/owner/debtor', authMiddleware, async (req, res) => {
  const reqUrl = resolveRequestScriptUrl(req);
  const { id, name, phone, pin, note } = req.body || {};
  if (!name || !pin) {
    return res.status(400).json({ success: false, message: 'Tên và mật khẩu là bắt buộc' });
  }

  const trimmedPin = String(pin).trim();
  if (trimmedPin.length < 2) {
    return res.status(400).json({ success: false, message: 'Mật khẩu phải từ 2 ký tự trở lên' });
  }

  const db = getDatabase();
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
    if (existingIdx !== -1) {
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
        id,
        name: name.trim(),
        phone: phone ? phone.trim() : undefined,
        pin: trimmedPin,
        note: note ? note.trim() : undefined,
        createdAt: now,
        updatedAt: now,
      };
      db.debtors.push(savedDebtor);
    }
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
    await persistFullStateToSheets(db, reqUrl);
    return res.json({ success: true, debtor: savedDebtor, debtors: db.debtors });
  } catch (err: any) {
    const info = recordSheetsError(err);
    return res.status(503).json({
      success: false,
      code: info.code,
      message: `Không thể lưu người nợ lên Google Sheets: ${info.message}`,
    });
  }
});

app.delete('/api/owner/debtor/:id', authMiddleware, async (req, res) => {
  const reqUrl = resolveRequestScriptUrl(req);
  const { id } = req.params;
  const db = getDatabase();
  db.debtors = db.debtors.filter((d) => d.id !== id);
  db.transactions = db.transactions.filter((tx) => tx.debtorId !== id);
  saveDatabase(db);

  try {
    await persistFullStateToSheets(db, reqUrl);
    return res.json({ success: true, debtors: db.debtors, transactions: db.transactions });
  } catch (err: any) {
    const info = recordSheetsError(err);
    return res.status(503).json({
      success: false,
      code: info.code,
      message: `Không thể xóa người nợ trên Google Sheets: ${info.message}`,
    });
  }
});

app.post('/api/owner/transaction', authMiddleware, async (req, res) => {
  const reqUrl = resolveRequestScriptUrl(req);
  const { id, debtorId, type, amount, date, note, category, billImage, partyId } = req.body || {};
  if (!debtorId || !amount || !date) {
    return res.status(400).json({ success: false, message: 'Thiếu thông tin giao dịch' });
  }

  const processedBillImage = await processAndOffloadBillImage(billImage, undefined, reqUrl);
  const db = getDatabase();
  const txId = id || `tx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const newTx: Transaction = {
    id: txId,
    debtorId,
    type,
    amount: Number(amount),
    date,
    note: note || '',
    category: category || 'SINGLE',
    ...(processedBillImage ? { billImage: processedBillImage } : {}),
    ...(partyId ? { partyId } : {}),
    createdAt: req.body?.createdAt || new Date().toISOString(),
  };

  db.transactions = [newTx, ...db.transactions.filter((t) => t.id !== txId)];
  saveDatabase(db);

  try {
    await persistFullStateToSheets(db, reqUrl);
    const updatedTx = db.transactions.find((t) => t.id === txId) || newTx;
    return res.json({ success: true, transaction: updatedTx, transactions: db.transactions });
  } catch (err: any) {
    const info = recordSheetsError(err);
    return res.status(503).json({
      success: false,
      code: info.code,
      message: `Không thể lưu giao dịch lên Google Sheets: ${info.message}`,
    });
  }
});

app.put('/api/owner/transaction/:id', authMiddleware, async (req, res) => {
  const reqUrl = resolveRequestScriptUrl(req);
  const { id } = req.params;
  const { type, amount, date, note, category, billImage, debtorId, partyId, customNote } = req.body || {};
  const db = getDatabase();
  const index = db.transactions.findIndex((t) => t.id === id);

  const existing: Partial<Transaction> = index !== -1 ? db.transactions[index] : {};
  const updatedTx: Transaction = {
    ...existing,
    id,
    type: type || existing.type || 'ADD',
    amount: amount !== undefined ? Number(amount) : Number(existing.amount || 0),
    date: date || existing.date || new Date().toISOString().split('T')[0],
    note: note !== undefined ? note : existing.note || '',
    category: category !== undefined ? category : existing.category || 'SINGLE',
    debtorId: debtorId || existing.debtorId || '',
    createdAt: existing.createdAt || req.body?.createdAt || new Date().toISOString(),
    ...(customNote !== undefined ? { customNote } : {}),
  };

  if (billImage !== undefined) {
    if (billImage) {
      updatedTx.billImage = await processAndOffloadBillImage(billImage, undefined, reqUrl);
    } else {
      delete updatedTx.billImage;
    }
  }
  if (partyId !== undefined) {
    if (partyId) updatedTx.partyId = partyId;
    else delete updatedTx.partyId;
  }

  if (index !== -1) {
    db.transactions[index] = updatedTx;
  } else {
    db.transactions.unshift(updatedTx);
  }
  saveDatabase(db);

  try {
    await persistFullStateToSheets(db, reqUrl);
    const savedTx = db.transactions.find((t) => t.id === id) || updatedTx;
    return res.json({ success: true, transaction: savedTx, transactions: db.transactions });
  } catch (err: any) {
    const info = recordSheetsError(err);
    return res.status(503).json({
      success: false,
      code: info.code,
      message: `Không thể cập nhật giao dịch lên Google Sheets: ${info.message}`,
    });
  }
});

app.delete('/api/owner/transaction/:id', authMiddleware, async (req, res) => {
  const reqUrl = resolveRequestScriptUrl(req);
  const { id } = req.params;
  const db = getDatabase();
  db.transactions = db.transactions.filter((t) => t.id !== id);
  saveDatabase(db);

  try {
    await persistFullStateToSheets(db, reqUrl);
    return res.json({ success: true, transactions: db.transactions });
  } catch (err: any) {
    const info = recordSheetsError(err);
    return res.status(503).json({
      success: false,
      code: info.code,
      message: `Không thể xóa giao dịch trên Google Sheets: ${info.message}`,
    });
  }
});

app.post('/api/owner/clean-orphans', authMiddleware, async (req, res) => {
  const reqUrl = resolveRequestScriptUrl(req);
  const db = getDatabase();
  const debtorIdSet = new Set(db.debtors.map((d) => d.id));
  const orphans = db.transactions.filter((t) => !debtorIdSet.has(t.debtorId));

  if (orphans.length === 0) {
    return res.json({
      success: true,
      removedCount: 0,
      message: 'Dữ liệu hoàn toàn sạch sẽ, không có giao dịch mồ côi nào!',
      debtorsCount: db.debtors.length,
      transactionsCount: db.transactions.length,
    });
  }

  createSnapshotBackup(db, 'pre_clean_orphans');
  db.transactions = db.transactions.filter((t) => debtorIdSet.has(t.debtorId));
  saveDatabase(db);

  try {
    await persistFullStateToSheets(db, reqUrl);
    return res.json({
      success: true,
      removedCount: orphans.length,
      message: `Đã dọn dẹp thành công ${orphans.length} giao dịch mồ côi trên Google Sheets!`,
      debtorsCount: db.debtors.length,
      transactionsCount: db.transactions.length,
    });
  } catch (err: any) {
    const info = recordSheetsError(err);
    return res.status(503).json({
      success: false,
      removedCount: 0,
      message: `Lỗi ghi lên Google Sheets: ${info.message}`,
    });
  }
});

app.post('/api/owner/party-split', authMiddleware, async (req, res) => {
  const reqUrl = resolveRequestScriptUrl(req);
  const { party, transactions: newTxs } = req.body || {};
  if (!party || !Array.isArray(newTxs)) {
    return res.status(400).json({ success: false, message: 'Dữ liệu chia tiền không hợp lệ' });
  }

  const db = getDatabase();
  const partyId = party.id || `party-${Date.now()}`;
  const existingIndex = db.parties.findIndex((p) => p.id === partyId);
  if (existingIndex >= 0) {
    return res.json({
      success: true,
      party: db.parties[existingIndex],
      parties: db.parties,
      transactions: db.transactions,
    });
  }

  const processedPartyImage = party.billImage
    ? await processAndOffloadBillImage(party.billImage, undefined, reqUrl)
    : undefined;

  const savedParty: PartySplit = {
    ...party,
    id: partyId,
    ...(processedPartyImage ? { billImage: processedPartyImage } : {}),
    createdAt: party.createdAt || new Date().toISOString(),
  };

  const savedTransactions: Transaction[] = newTxs.map((tx: any, idx: number) => ({
    ...tx,
    id: tx.id || `tx-party-${partyId}-${tx.debtorId || idx}`,
    partyId,
    ...(processedPartyImage && !tx.billImage ? { billImage: processedPartyImage } : {}),
    createdAt: tx.createdAt || new Date().toISOString(),
  }));

  db.parties.unshift(savedParty);
  const existingTxIds = new Set(savedTransactions.map((t) => t.id));
  db.transactions = [...savedTransactions, ...db.transactions.filter((t) => !existingTxIds.has(t.id))];
  saveDatabase(db);

  try {
    await persistFullStateToSheets(db, reqUrl);
    return res.json({
      success: true,
      party: savedParty,
      parties: db.parties,
      transactions: db.transactions,
    });
  } catch (err: any) {
    const info = recordSheetsError(err);
    return res.status(503).json({
      success: false,
      code: info.code,
      message: `Không thể lưu chia tiền lên Google Sheets: ${info.message}`,
    });
  }
});

app.delete('/api/owner/party-split/:id', authMiddleware, async (req, res) => {
  const reqUrl = resolveRequestScriptUrl(req);
  const { id } = req.params;
  const db = getDatabase();
  db.parties = db.parties.filter((p) => p.id !== id);
  db.transactions = db.transactions.filter((t) => t.partyId !== id);
  saveDatabase(db);

  try {
    await persistFullStateToSheets(db, reqUrl);
    return res.json({ success: true, parties: db.parties, transactions: db.transactions });
  } catch (err: any) {
    const info = recordSheetsError(err);
    return res.status(503).json({
      success: false,
      code: info.code,
      message: `Không thể xóa cuộc chia tiền trên Google Sheets: ${info.message}`,
    });
  }
});

app.put('/api/owner/party-split/:id', authMiddleware, async (req, res) => {
  const reqUrl = resolveRequestScriptUrl(req);
  const { id } = req.params;
  const { party, transactions: newTxs } = req.body || {};
  if (!party || !Array.isArray(newTxs)) {
    return res.status(400).json({ success: false, message: 'Dữ liệu chia tiền không hợp lệ' });
  }

  const db = getDatabase();
  const existingIndex = db.parties.findIndex((p) => p.id === id);
  const processedPartyImage = party.billImage
    ? await processAndOffloadBillImage(party.billImage, undefined, reqUrl)
    : undefined;

  const updatedParty: PartySplit = {
    ...party,
    id,
    ...(party.billImage !== undefined ? { billImage: processedPartyImage } : {}),
    createdAt: existingIndex >= 0 ? db.parties[existingIndex].createdAt : new Date().toISOString(),
  };

  if (existingIndex >= 0) db.parties[existingIndex] = updatedParty;
  else db.parties.unshift(updatedParty);

  const filteredTxs = db.transactions.filter((t) => t.partyId !== id);
  const savedTransactions: Transaction[] = newTxs.map((tx: any, idx: number) => ({
    ...tx,
    id: tx.id || `tx-party-${id}-${tx.debtorId || idx}`,
    partyId: id,
    ...(processedPartyImage ? { billImage: processedPartyImage } : {}),
    createdAt: tx.createdAt || new Date().toISOString(),
  }));

  db.transactions = [...savedTransactions, ...filteredTxs];
  saveDatabase(db);

  try {
    await persistFullStateToSheets(db, reqUrl);
    return res.json({
      success: true,
      party: updatedParty,
      parties: db.parties,
      transactions: db.transactions,
    });
  } catch (err: any) {
    const info = recordSheetsError(err);
    return res.status(503).json({
      success: false,
      code: info.code,
      message: `Không thể cập nhật chia tiền lên Google Sheets: ${info.message}`,
    });
  }
});

app.put('/api/owner/settings', authMiddleware, async (req, res) => {
  const reqUrl = resolveRequestScriptUrl(req);
  if (!isSheetsSettingsLoaded) {
    await ensureSheetsSettingsSync(false, reqUrl);
  }
  const newSettings = req.body || {};
  const db = getDatabase();
  const { reminderMessageTemplate, ...cleanedNewSettings } = (newSettings || {}) as any;

  const existingScriptUrl = (db.settings?.googleAppsScriptUrl || '').trim();
  db.settings = {
    ...db.settings,
    ...cleanedNewSettings,
    ...(existingScriptUrl && !cleanedNewSettings?.googleAppsScriptUrl
      ? { googleAppsScriptUrl: existingScriptUrl }
      : {}),
  };
  saveDatabase(db);

  const targetUrl = db.settings.googleAppsScriptUrl?.trim() || reqUrl;
  try {
    await saveSettingsToSheets(db.settings, targetUrl);
    if (db.settings.googleAppsScriptUrl?.trim().startsWith('https://script.google.com/')) {
      saveSheetsConfig(db.settings.googleAppsScriptUrl.trim(), db.settings.googleSheetUrl);
    }
    isSheetsSettingsLoaded = true;
    lastSettingsSyncAt = Date.now();
    clearSheetsError();
    return res.json({ success: true, settings: db.settings });
  } catch (err: any) {
    const info = recordSheetsError(err);
    return res.status(503).json({
      success: false,
      code: info.code,
      message: `Không thể lưu cài đặt lên Google Sheets: ${info.message}`,
      settings: db.settings,
    });
  }
});

const handleClearAllSampleData = async (req: express.Request, res: express.Response) => {
  const reqUrl = resolveRequestScriptUrl(req);
  const { adminPassword, password } = req.body || {};
  const db = getDatabase();
  const currentOwnerPassword = (db.settings?.ownerPassword || '123456').trim();
  const inputPassword = (
    typeof adminPassword === 'string'
      ? adminPassword
      : typeof password === 'string'
      ? password
      : ''
  ).trim();

  if (!inputPassword || inputPassword !== currentOwnerPassword) {
    return res.status(401).json({
      success: false,
      message: 'Mật khẩu quản trị chủ sổ không đúng. Vui lòng nhập đúng mật khẩu để xác nhận!',
    });
  }

  try {
    createSnapshotBackup(db, 'pre_clear_sample');
  } catch {
    // ignore
  }

  db.debtors = [];
  db.transactions = [];
  db.parties = [];
  saveDatabase(db);

  try {
    await persistFullStateToSheets(db, reqUrl);
    return res.json({
      success: true,
      message: 'Đã xóa toàn bộ dữ liệu mẫu thành công trên Google Sheets và bộ nhớ!',
      debtors: [],
      transactions: [],
      parties: [],
    });
  } catch (err: any) {
    const info = recordSheetsError(err);
    return res.status(503).json({
      success: false,
      code: info.code,
      message: `Lỗi xóa dữ liệu trên Google Sheets: ${info.message}`,
    });
  }
};

app.post('/api/owner/clear-all', handleClearAllSampleData);
app.post('/api/owner/clear-sample-data', handleClearAllSampleData);

const handleResetSampleData = async (req: express.Request, res: express.Response) => {
  const reqUrl = resolveRequestScriptUrl(req);
  const { adminPassword, password } = req.body || {};
  const db = getDatabase();
  const currentOwnerPassword = (db.settings?.ownerPassword || '123456').trim();
  const inputPassword = (
    typeof adminPassword === 'string'
      ? adminPassword
      : typeof password === 'string'
      ? password
      : ''
  ).trim();

  if (!inputPassword || inputPassword !== currentOwnerPassword) {
    return res.status(401).json({
      success: false,
      message: 'Mật khẩu quản trị chủ sổ không đúng. Vui lòng nhập đúng mật khẩu để xác nhận!',
    });
  }

  try {
    createSnapshotBackup(db, 'pre_reset_sample');
  } catch {
    // ignore
  }

  db.debtors = JSON.parse(JSON.stringify(INITIAL_DEBTORS));
  db.transactions = JSON.parse(JSON.stringify(INITIAL_TRANSACTIONS));
  db.parties = JSON.parse(JSON.stringify(INITIAL_PARTIES));
  saveDatabase(db);

  try {
    await persistFullStateToSheets(db, reqUrl);
    return res.json({
      success: true,
      message: 'Đã nạp lại toàn bộ dữ liệu mẫu ban đầu vào Google Sheets thành công!',
      debtors: db.debtors,
      transactions: db.transactions,
      parties: db.parties,
    });
  } catch (err: any) {
    const info = recordSheetsError(err);
    return res.status(503).json({
      success: false,
      code: info.code,
      message: `Lỗi nạp mẫu lên Google Sheets: ${info.message}`,
    });
  }
};

app.post('/api/owner/reset-sample', handleResetSampleData);
app.post('/api/owner/reset-sample-data', handleResetSampleData);

const handleSyncAllData = async (req: express.Request, res: express.Response) => {
  const reqUrl = resolveRequestScriptUrl(req);
  try {
    if (!isSheetsSettingsLoaded) {
      await ensureSheetsSettingsSync(false, reqUrl);
    }
    const clientData = req.body || {};
    const db = getDatabase();

    if (Array.isArray(clientData.debtors)) {
      db.debtors = clientData.debtors;
    }
    if (Array.isArray(clientData.transactions)) {
      db.transactions = clientData.transactions;
    }
    if (Array.isArray(clientData.parties)) {
      db.parties = clientData.parties;
    }
    if (clientData.settings && typeof clientData.settings === 'object') {
      const existingScriptUrl = (db.settings?.googleAppsScriptUrl || '').trim();
      const existingPass = (db.settings?.ownerPassword || '').trim();
      db.settings = {
        ...db.settings,
        ...clientData.settings,
        ...(existingScriptUrl && !clientData.settings.googleAppsScriptUrl
          ? { googleAppsScriptUrl: existingScriptUrl }
          : {}),
        ...(existingPass && !clientData.settings.ownerPassword
          ? { ownerPassword: existingPass }
          : {}),
      };
    }

    saveDatabase(db);
    await persistFullStateToSheets(db, reqUrl);
    if (db.settings.googleAppsScriptUrl?.trim().startsWith('https://script.google.com/')) {
      saveSheetsConfig(db.settings.googleAppsScriptUrl.trim(), db.settings.googleSheetUrl);
    }

    return res.json({
      success: true,
      message: `Đã lưu và đồng bộ toàn bộ ${db.debtors.length} người nợ, ${db.transactions.length} giao dịch, ${db.parties.length} đợt chia tiền lên Google Sheets thành công!`,
      debtors: db.debtors,
      transactions: db.transactions,
      parties: db.parties,
      settings: db.settings,
      stats: {
        debtorsCount: db.debtors.length,
        transactionsCount: db.transactions.length,
        partiesCount: db.parties.length,
      },
      syncedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    const info = recordSheetsError(err);
    return res.status(503).json({
      success: false,
      code: info.code,
      message: `Lỗi đồng bộ Google Sheets: ${info.message}`,
    });
  }
};

app.post('/api/owner/sync-all', authMiddleware, handleSyncAllData);
app.post('/api/owner/sync-now', authMiddleware, handleSyncAllData);

app.post('/api/owner/sync/external', authMiddleware, async (req, res) => {
  const { url, apiKey, mode } = req.body || {};
  if (!url) {
    return res.status(400).json({ success: false, message: 'Thiếu URL máy chủ đồng bộ' });
  }
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
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
      if (Array.isArray(data.debtors)) db.debtors = data.debtors;
      if (Array.isArray(data.transactions)) db.transactions = data.transactions;
      if (Array.isArray(data.parties)) db.parties = data.parties;
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
      const db = getDatabase();
      const payload = {
        debtors: db.debtors,
        transactions: db.transactions,
        parties: db.parties,
        settings: db.settings,
        syncedAt: new Date().toISOString(),
      };
      const remoteRes = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
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

// --- GOOGLE SHEETS CLOUD DATABASE MANAGEMENT APIS (plus legacy /api/firestore/* aliases) ---
const handleGetSheetsStatus = async (req: express.Request, res: express.Response) => {
  try {
    const reqUrl = resolveRequestScriptUrl(req);
    const testRes = await testSheetsConnection(reqUrl);
    const currentDb = getDatabase();
    const isOwner = isAuthorizedOwnerRequest(req);

    if (!isOwner) {
      return res.json({
        success: true,
        backend: 'google_sheets',
        configured: testRes.configured,
        connected: testRes.success,
        latencyMs: testRes.latencyMs,
        version: testRes.version,
        needsUpgrade: testRes.needsUpgrade,
        error: testRes.error || null,
        lastChecked: new Date().toISOString(),
      });
    }

    return res.json({
      success: true,
      backend: 'google_sheets',
      configured: testRes.configured,
      connected: testRes.success,
      latencyMs: testRes.latencyMs,
      version: testRes.version,
      supportsFullDb: testRes.supportsFullDb,
      supportsLogSync: testRes.supportsLogSync,
      supportsDriveUpload: testRes.supportsDriveUpload,
      needsUpgrade: testRes.needsUpgrade,
      source: testRes.source,
      googleSheetUrl: testRes.googleSheetUrl || currentDb.settings?.googleSheetUrl,
      databaseId: testRes.configured ? `Google Sheets (Apps Script v${testRes.version || 3})` : 'Chưa cấu hình',
      stats: {
        debtors: currentDb.debtors.length,
        transactions: currentDb.transactions.length,
        parties: currentDb.parties.length,
      },
      error: testRes.error || null,
      lastChecked: new Date().toISOString(),
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      configured: false,
      connected: false,
      error: err?.message || 'Lỗi kiểm tra trạng thái Google Sheets',
    });
  }
};

app.get(['/api/sheets/status', '/api/firestore/status'], handleGetSheetsStatus);

const handleTestSheetsConnection = async (req: express.Request, res: express.Response) => {
  try {
    const customUrl = typeof req.body?.appsScriptUrl === 'string' ? req.body.appsScriptUrl.trim() : undefined;
    const testRes = await testSheetsConnection(customUrl || resolveRequestScriptUrl(req));
    return res.json(testRes);
  } catch (err: any) {
    return res.json({
      success: false,
      configured: false,
      latencyMs: 0,
      version: 0,
      error: err?.message || 'Không thể kiểm tra kết nối Google Sheets',
    });
  }
};

app.post(['/api/sheets/test-connection', '/api/firestore/test-connection'], handleTestSheetsConnection);

app.post('/api/sheets/configure', async (req, res) => {
  try {
    const rawUrl = String(req.body?.appsScriptUrl || '').trim();
    const rawSheetUrl = typeof req.body?.googleSheetUrl === 'string' ? req.body.googleSheetUrl.trim() : undefined;
    if (!rawUrl || !rawUrl.startsWith('https://script.google.com/')) {
      return res.status(400).json({
        success: false,
        message: 'Đường link Google Apps Script phải bắt đầu bằng https://script.google.com/macros/s/...',
      });
    }

    const existingCfg = getActiveSheetsConfig();
    if (
      existingCfg.appsScriptUrl &&
      existingCfg.appsScriptUrl !== rawUrl &&
      !isAuthorizedOwnerRequest(req)
    ) {
      const existingHealth = await testSheetsConnection(existingCfg.appsScriptUrl).catch(() => ({
        success: false,
        needsUpgrade: false,
      }));
      if (existingHealth.success && !existingHealth.needsUpgrade) {
        return res.status(401).json({
          success: false,
          message: 'Cần đăng nhập chủ sổ để thay đổi đường dẫn Google Apps Script.',
        });
      }
    }

    const testRes = await testSheetsConnection(rawUrl);
    if (!testRes.success) {
      return res.status(400).json({
        success: false,
        message: `Không thể kết nối đến Apps Script: ${testRes.error || 'Kiểm tra lại quyền Anyone khi Deploy'}`,
      });
    }

    saveSheetsConfig(rawUrl, rawSheetUrl);
    const db = getDatabase();
    db.settings = {
      ...db.settings,
      googleAppsScriptUrl: rawUrl,
      ...(rawSheetUrl ? { googleSheetUrl: rawSheetUrl } : {}),
      autoSyncGoogleSheets: true,
    };
    saveDatabase(db);

    if (testRes.needsUpgrade) {
      needsScriptUpgrade = true;
      lastSheetsErrorCode = 'SHEETS_LEGACY_SCRIPT';
      lastSheetsError = 'Google Apps Script hiện tại đang dùng mã cũ (v1/v2). Hãy cập nhật mã v3 trong Code.gs và Deploy phiên bản mới.';
      return res.json({
        success: true,
        configured: true,
        connected: true,
        needsUpgrade: true,
        version: testRes.version,
        message: lastSheetsError,
      });
    }

    // Try hydrating existing data & settings from this Sheet
    isSheetsDataLoaded = false;
    lastFullSyncAt = 0;
    await ensureSheetsSettingsSync(true, rawUrl);
    const hydratedDb = getDatabase();
    if (hydratedDb.settings.googleAppsScriptUrl !== rawUrl) {
      hydratedDb.settings.googleAppsScriptUrl = rawUrl;
      saveDatabase(hydratedDb);
    }
    // Heal Tab 5 if it previously stored a stale/old Apps Script URL
    saveSettingsToSheets(hydratedDb.settings, rawUrl).catch(() => {});
    return res.json({
      success: true,
      configured: true,
      connected: true,
      needsUpgrade: false,
      version: testRes.version,
      message: 'Đã kết nối Google Sheets Cloud Database thành công!',
    });
  } catch (err: any) {
    const info = recordSheetsError(err);
    return res.status(503).json({
      success: false,
      code: info.code,
      message: info.message || 'Lỗi cấu hình kết nối Google Sheets',
    });
  }
});

app.get(['/api/sheets/backups', '/api/firestore/backups'], authMiddleware, (_req, res) => {
  try {
    return res.json({ success: true, backups: listSnapshotBackups() });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message });
  }
});

app.post(['/api/sheets/create-backup', '/api/firestore/create-backup'], authMiddleware, (req, res) => {
  try {
    const filename = createSnapshotBackup(getDatabase(), req.body?.label || 'manual_backup');
    return res.json({ success: true, filename, message: 'Đã tạo bản sao lưu snapshot thành công!' });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message });
  }
});

app.post(['/api/sheets/restore-backup', '/api/firestore/restore-backup'], authMiddleware, async (req, res) => {
  const reqUrl = resolveRequestScriptUrl(req);
  const filename = req.body?.filename;
  if (!filename) {
    return res.status(400).json({ success: false, message: 'Thiếu tên tệp sao lưu!' });
  }
  try {
    const backupData = restoreSnapshotBackup(filename);
    if (!backupData) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy tệp sao lưu hợp lệ!' });
    }
    const currentDb = getDatabase();
    createSnapshotBackup(currentDb, 'pre_restore_snapshot');
    if (currentDb.settings?.ownerPassword) {
      backupData.settings = { ...backupData.settings, ownerPassword: currentDb.settings.ownerPassword };
    }
    inMemoryDb = backupData;
    await persistFullStateToSheets(backupData, reqUrl);
    return res.json({
      success: true,
      message: `Đã khôi phục thành công từ bản sao lưu: ${backupData.debtors.length} người nợ, ${backupData.transactions.length} giao dịch!`,
      data: backupData,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message });
  }
});

app.post(['/api/sheets/upload-json', '/api/firestore/upload-json'], authMiddleware, async (req, res) => {
  const reqUrl = resolveRequestScriptUrl(req);
  const cfg = getActiveSheetsConfig(reqUrl);
  if (!cfg.appsScriptUrl) {
    return res.status(503).json({
      success: false,
      code: 'SHEETS_NOT_CONFIGURED',
      message: 'Chưa cấu hình URL Google Apps Script Web App để lưu dữ liệu lên Google Sheets.',
    });
  }

  let raw = req.body?.data !== undefined ? req.body.data : req.body;
  const mode = req.body?.mode === 'merge' ? 'merge' : 'replace';

  if (!raw || (typeof raw !== 'object' && !Array.isArray(raw))) {
    return res.status(400).json({ success: false, message: 'Dữ liệu JSON không hợp lệ!' });
  }
  if (
    raw.data &&
    (Array.isArray(raw.data.debtors) ||
      Array.isArray(raw.data.transactions) ||
      Array.isArray(raw.data))
  ) {
    raw = raw.data;
  }

  try {
    if (mode === 'merge') {
      await ensureSheetsDataSync(false, reqUrl);
    } else if (!isSheetsSettingsLoaded) {
      await ensureSheetsSettingsSync(false, reqUrl);
    }

    const currentDb = getDatabase();
    let inputDebtors: any[] = [];
    let inputTransactions: any[] = [];
    let inputParties: any[] = [];
    let inputSettings: any = null;

    if (Array.isArray(raw)) {
      if (raw.length > 0 && raw[0].debtorId !== undefined && raw[0].amount !== undefined) inputTransactions = raw;
      else inputDebtors = raw;
    } else {
      if (Array.isArray(raw.debtors)) inputDebtors = raw.debtors;
      if (Array.isArray(raw.transactions)) inputTransactions = raw.transactions;
      if (Array.isArray(raw.parties)) inputParties = raw.parties;
      if (raw.settings && typeof raw.settings === 'object') inputSettings = raw.settings;
    }

    const cleanDebtors: Debtor[] = inputDebtors.map((d: any, idx: number) => ({
      id: String(d.id || `d_${Date.now()}_${idx}`).trim(),
      name: String(d.name || 'Người nợ không tên').trim(),
      phone: d.phone ? String(d.phone) : undefined,
      note: d.note ? String(d.note) : '',
      pin: String(d.pin !== undefined && d.pin !== null && String(d.pin).trim() !== '' ? d.pin : Math.floor(100000 + Math.random() * 900000)).trim(),
      createdAt: String(d.createdAt || new Date().toISOString()),
      updatedAt: String(d.updatedAt || d.createdAt || new Date().toISOString()),
    }));

    const cleanTransactions: Transaction[] = inputTransactions.map((t: any, idx: number) => {
      let typeVal: 'ADD' | 'SUB' = 'ADD';
      const rawType = String(t.type || '').trim().toUpperCase();
      if (
        rawType === 'SUB' ||
        rawType === 'REPAYMENT' ||
        rawType === 'PAYMENT' ||
        rawType.includes('TRẢ NỢ')
      ) {
        typeVal = 'SUB';
      }
      const rawImg = t.billImage || t.billImageUrl ? String(t.billImage || t.billImageUrl) : undefined;
      const safeImg = rawImg && rawImg.startsWith('data:') && rawImg.length > 38000 ? undefined : rawImg;
      return {
        id: String(t.id || `tx_${Date.now()}_${idx}`).trim(),
        debtorId: String(t.debtorId || '').trim(),
        amount: typeof t.amount === 'number' ? t.amount : Number(String(t.amount || 0).replace(/,/g, '')) || 0,
        type: typeVal,
        note: String(t.note || t.description || ''),
        category: (t.category || 'SINGLE') as any,
        date: String(t.date || new Date().toISOString().split('T')[0]),
        ...(safeImg ? { billImage: safeImg } : {}),
        partyId: t.partyId ? String(t.partyId).trim() : undefined,
        createdAt: String(t.createdAt || new Date().toISOString()),
      };
    });

    const cleanParties: PartySplit[] = inputParties.map((p: any, idx: number) => {
      const participantIds = Array.isArray(p.participantDebtorIds)
        ? p.participantDebtorIds
        : Array.isArray(p.participants)
        ? p.participants.map((item: any) => (typeof item === 'string' ? item : item.debtorId || item.id))
        : [];
      const total = typeof p.totalAmount === 'number' ? p.totalAmount : Number(String(p.totalAmount || 0).replace(/,/g, '')) || 0;
      const count = participantIds.length + (p.includeMe !== false ? 1 : 0);
      const split =
        typeof p.splitAmountPerPerson === 'number'
          ? p.splitAmountPerPerson
          : count > 0
          ? Math.round(total / count)
          : total;
      const rawPartyImg = p.billImage || p.billImageUrl ? String(p.billImage || p.billImageUrl) : undefined;
      const safePartyImg = rawPartyImg && rawPartyImg.startsWith('data:') && rawPartyImg.length > 38000 ? undefined : rawPartyImg;

      return {
        id: String(p.id || `p_${Date.now()}_${idx}`).trim(),
        name: String(p.name || p.title || 'Đợt chia tiền'),
        date: String(p.date || new Date().toISOString().split('T')[0]),
        totalAmount: total,
        payerType: (p.payerType === 'DEBTOR' ? 'DEBTOR' : 'ME') as 'ME' | 'DEBTOR',
        payerDebtorId:
          p.payerDebtorId || p.paidByDebtorId ? String(p.payerDebtorId || p.paidByDebtorId).trim() : undefined,
        participantDebtorIds: participantIds.map((x: any) => String(x).trim()),
        includeMe: p.includeMe !== false,
        splitAmountPerPerson: split,
        ...(safePartyImg ? { billImage: safePartyImg } : {}),
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
    } else {
      finalDebtors = cleanDebtors;
      finalTransactions = cleanTransactions;
      finalParties = cleanParties;
    }

    const activeScriptUrl = cfg.appsScriptUrl || currentDb.settings?.googleAppsScriptUrl || '';
    const activeSheetUrl = cfg.googleSheetUrl || currentDb.settings?.googleSheetUrl || '';

    if (inputSettings) {
      const {
        ownerPassword: _ignoredPass,
        reminderMessageTemplate,
        shareMessageTemplate,
        googleAppsScriptUrl: _ignoredScriptUrl,
        googleSheetUrl: _ignoredSheetUrl,
        ...safeInputSettings
      } = inputSettings;
      finalSettings = {
        ...currentDb.settings,
        ...safeInputSettings,
        ownerPassword: currentDb.settings.ownerPassword,
        ...(activeScriptUrl ? { googleAppsScriptUrl: activeScriptUrl } : {}),
        ...(activeSheetUrl ? { googleSheetUrl: activeSheetUrl } : {}),
      };
    } else {
      finalSettings = {
        ...currentDb.settings,
        ...(activeScriptUrl ? { googleAppsScriptUrl: activeScriptUrl } : {}),
        ...(activeSheetUrl ? { googleSheetUrl: activeSheetUrl } : {}),
      };
    }

    const validDebtorIds = new Set(finalDebtors.map((d) => d.id));
    finalTransactions = finalTransactions.filter((t) => validDebtorIds.has(t.debtorId));

    const newState: SheetsDatabaseSchema = {
      debtors: finalDebtors,
      transactions: finalTransactions,
      parties: finalParties,
      settings: finalSettings,
    };

    await persistFullStateToSheets(newState, reqUrl || activeScriptUrl);

    return res.json({
      success: true,
      message: `Khôi phục thành công ${finalDebtors.length} người nợ, ${finalTransactions.length} giao dịch, ${finalParties.length} đợt chia tiền lên Google Sheets!`,
      data: newState,
      stats: {
        debtorsCount: finalDebtors.length,
        transactionsCount: finalTransactions.length,
        partiesCount: finalParties.length,
      },
    });
  } catch (err: any) {
    const info = recordSheetsError(err);
    return res.status(503).json({
      success: false,
      code: info.code,
      needsScriptUpgrade: info.needsUpgrade,
      message: `Lỗi khôi phục dữ liệu JSON lên Google Sheets: ${info.message}`,
    });
  }
});

app.post(['/api/sheets/force-sync', '/api/firestore/force-sync'], authMiddleware, async (req, res) => {
  const reqUrl = resolveRequestScriptUrl(req);
  const { direction } = req.body || {};
  try {
    if (direction === 'PUSH') {
      const current = getDatabase();
      await persistFullStateToSheets(current, reqUrl);
      return res.json({
        success: true,
        message: 'Đã ghi đè toàn bộ dữ liệu từ máy lên Google Sheets thành công!',
        data: current,
      });
    } else {
      const fresh = await loadAllDataFromSheets(reqUrl);
      inMemoryDb = fresh;
      isSheetsDataLoaded = true;
      isSheetsSettingsLoaded = true;
      lastFullSyncAt = Date.now();
      lastSettingsSyncAt = Date.now();
      clearSheetsError();
      return res.json({
        success: true,
        message: 'Đã tải toàn bộ dữ liệu mới nhất từ Google Sheets về máy!',
        data: fresh,
      });
    }
  } catch (err: any) {
    const info = recordSheetsError(err);
    return res.status(503).json({
      success: false,
      code: info.code,
      message: `Lỗi đồng bộ Google Sheets: ${info.message}`,
    });
  }
});

// --- CROSS-DEVICE AUDIT LOG BRIDGE (TAB 4 APPEND-ONLY) ---
let serverAuditLogs: AuditLog[] = [];
let pendingAppsScriptLogs: AuditLog[] = [];
let appsScriptFlushTimer: ReturnType<typeof setTimeout> | null = null;

function sanitizeAuditLogInput(raw: any): AuditLog | null {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' ? raw.id.trim().slice(0, 120) : '';
  if (!id || id.startsWith('log-init-')) return null;
  const action = typeof raw.action === 'string' ? raw.action.trim().slice(0, 64) : '';
  const title = typeof raw.title === 'string' ? raw.title.slice(0, 300) : '';
  if (!action || !title) return null;

  const timestamp =
    typeof raw.timestamp === 'string' && raw.timestamp.trim()
      ? raw.timestamp.trim().slice(0, 64)
      : new Date().toISOString();

  return {
    id,
    timestamp,
    action: action as AuditLog['action'],
    actor: typeof raw.actor === 'string' ? raw.actor.slice(0, 160) : 'Người dùng',
    title,
    description: typeof raw.description === 'string' ? raw.description.slice(0, 2000) : '',
    ...(typeof raw.debtorId === 'string' ? { debtorId: raw.debtorId.slice(0, 120) } : {}),
    ...(typeof raw.debtorName === 'string' ? { debtorName: raw.debtorName.slice(0, 160) } : {}),
    ...(raw.amount !== undefined && !Number.isNaN(Number(raw.amount)) ? { amount: Number(raw.amount) } : {}),
    ...(raw.beforeState !== undefined ? { beforeState: raw.beforeState } : {}),
    ...(raw.afterState !== undefined ? { afterState: raw.afterState } : {}),
    ...(Array.isArray(raw.changes) ? { changes: raw.changes.slice(0, 30) } : {}),
    ...(raw.metadata && typeof raw.metadata === 'object' ? { metadata: raw.metadata } : {}),
  };
}

function mergeIntoServerAuditLogs(incoming: AuditLog[]): AuditLog[] {
  const map = new Map<string, AuditLog>();
  for (const item of serverAuditLogs) {
    if (item?.id) map.set(item.id, item);
  }
  const newlyAdded: AuditLog[] = [];
  for (const item of incoming) {
    if (item?.id && !map.has(item.id)) newlyAdded.push(item);
    if (item?.id) map.set(item.id, item);
  }
  serverAuditLogs = Array.from(map.values())
    .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''))
    .slice(0, 500);
  return newlyAdded;
}

function resolveLogScriptUrl(overrideUrl?: string): string {
  const cfg = getActiveSheetsConfig(overrideUrl);
  if (cfg.appsScriptUrl) return cfg.appsScriptUrl;
  const db = getDatabase();
  const sUrl = (db.settings?.googleAppsScriptUrl || '').trim();
  return sUrl.startsWith('https://script.google.com/') ? sUrl : '';
}

async function flushPendingLogsToAppsScript(overrideUrl?: string) {
  if (pendingAppsScriptLogs.length === 0) return;
  const scriptUrl = resolveLogScriptUrl(overrideUrl);
  if (!scriptUrl) {
    pendingAppsScriptLogs = [];
    return;
  }

  const db = getDatabase();
  const batch = pendingAppsScriptLogs.splice(0, 100);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    await fetch(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'APPEND_LOGS',
        ownerName: db.settings?.ownerName || 'Chủ Sổ',
        timestamp: new Date().toISOString(),
        auditLogs: batch,
      }),
      redirect: 'follow',
      signal: controller.signal,
    });
    clearTimeout(timer);
  } catch (err: any) {
    console.warn('Apps Script APPEND_LOGS bridge notice:', err?.message || err);
  }

  if (!IS_VERCEL && pendingAppsScriptLogs.length > 0) {
    appsScriptFlushTimer = setTimeout(() => {
      appsScriptFlushTimer = null;
      flushPendingLogsToAppsScript(overrideUrl);
    }, 1000);
  }
}

function queueLogsForAppsScript(logs: AuditLog[], overrideUrl?: string) {
  if (logs.length === 0) return;
  const scriptUrl = resolveLogScriptUrl(overrideUrl);
  if (!scriptUrl) return;

  const existingIds = new Set(pendingAppsScriptLogs.map((l) => l.id));
  for (const log of logs) {
    if (!existingIds.has(log.id)) {
      pendingAppsScriptLogs.push(log);
      existingIds.add(log.id);
    }
  }
  if (pendingAppsScriptLogs.length > 500) {
    pendingAppsScriptLogs = pendingAppsScriptLogs.slice(-500);
  }
  if (!IS_VERCEL && !appsScriptFlushTimer) {
    appsScriptFlushTimer = setTimeout(() => {
      appsScriptFlushTimer = null;
      flushPendingLogsToAppsScript(overrideUrl);
    }, 900);
  }
}

app.post('/api/audit-logs/push', async (req, res) => {
  try {
    const reqUrl = resolveRequestScriptUrl(req);
    const rawList = Array.isArray(req.body?.logs)
      ? req.body.logs
      : req.body?.log
      ? [req.body.log]
      : [];

    const validLogs: AuditLog[] = [];
    for (const raw of rawList.slice(0, 50)) {
      const clean = sanitizeAuditLogInput(raw);
      if (clean) validLogs.push(clean);
    }

    if (validLogs.length === 0) {
      return res.json({ success: true, accepted: 0, forwardedToSheets: false });
    }

    const newlyAdded = mergeIntoServerAuditLogs(validLogs);
    const scriptUrl = resolveLogScriptUrl(reqUrl);
    queueLogsForAppsScript(newlyAdded.length > 0 ? newlyAdded : validLogs, scriptUrl);

    if (IS_VERCEL && pendingAppsScriptLogs.length > 0) {
      await Promise.race([
        flushPendingLogsToAppsScript(scriptUrl),
        new Promise<void>((resolve) => setTimeout(resolve, 4000)),
      ]);
    }

    return res.json({
      success: true,
      accepted: validLogs.length,
      forwardedToSheets: Boolean(scriptUrl),
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: err?.message || 'Lỗi ghi nhận nhật ký',
    });
  }
});

app.get('/api/owner/audit-logs', authMiddleware, async (req, res) => {
  const reqUrl = resolveRequestScriptUrl(req);
  const limit = Math.min(Math.max(Number(req.query.limit) || 500, 1), 500);
  const scriptUrl = resolveLogScriptUrl(reqUrl);

  if (!scriptUrl) {
    return res.json({
      success: true,
      logs: serverAuditLogs.slice(0, limit),
      source: 'server_memory',
      hasAppsScriptUrl: false,
      needsAppsScriptUpgrade: false,
    });
  }

  try {
    const separator = scriptUrl.includes('?') ? '&' : '?';
    const fetchUrl = `${scriptUrl}${separator}action=GET_LOGS&limit=${limit}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);

    const response = await fetch(fetchUrl, { method: 'GET', redirect: 'follow', signal: controller.signal });
    clearTimeout(timer);

    const text = await response.text();
    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }

    if (data && data.success === true && Array.isArray(data.logs)) {
      const sanitizedRemote: AuditLog[] = [];
      for (const item of data.logs) {
        const clean = sanitizeAuditLogInput(item);
        if (clean) sanitizedRemote.push(clean);
      }
      mergeIntoServerAuditLogs(sanitizedRemote);
      return res.json({
        success: true,
        logs: serverAuditLogs.slice(0, limit),
        source: 'google_sheets',
        hasAppsScriptUrl: true,
        needsAppsScriptUpgrade: false,
        totalSheetRows: data.totalRows ?? sanitizedRemote.length,
      });
    }

    const isOldScript = Boolean(data && data.status === 'ok' && !Array.isArray(data.logs));
    return res.json({
      success: true,
      logs: serverAuditLogs.slice(0, limit),
      source: 'server_memory',
      hasAppsScriptUrl: true,
      needsAppsScriptUpgrade: isOldScript,
    });
  } catch (err: any) {
    return res.json({
      success: true,
      logs: serverAuditLogs.slice(0, limit),
      source: 'server_memory',
      hasAppsScriptUrl: true,
      needsAppsScriptUpgrade: false,
      sheetsError: err?.message || 'Không thể kết nối Google Apps Script',
    });
  }
});

// --- GUEST APIS (STRICT PRIVACY) ---
app.post('/api/guest/lookup', async (req, res) => {
  try {
    const reqUrl = resolveRequestScriptUrl(req);
    const { pin } = req.body || {};
    if (!pin || typeof pin !== 'string') {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập mật khẩu (pass) tra cứu.' });
    }

    const cfg = getActiveSheetsConfig(reqUrl);
    if (!cfg.appsScriptUrl) {
      return res.status(503).json({
        success: false,
        code: 'SHEETS_NOT_CONFIGURED',
        message: 'Ứng dụng chưa được kết nối cơ sở dữ liệu Google Sheets. Vui lòng liên hệ chủ sổ.',
      });
    }

    const cleanPin = pin.trim();
    const trimmedPin = cleanPin.toLowerCase();

    let targetDebtor: Debtor | undefined;
    let sourceTransactions: Transaction[] = [];
    let sourceParties: PartySplit[] = [];
    let sourceDebtorsMap: Array<{ id: string; name: string }> = [];
    let sourceSettings: AppSettings = DEFAULT_SETTINGS;

    if (isSheetsDataLoaded && inMemoryDb && Date.now() - lastFullSyncAt < 8000) {
      targetDebtor = inMemoryDb.debtors.find((d) => d.pin.trim().toLowerCase() === trimmedPin);
      sourceTransactions = inMemoryDb.transactions;
      sourceParties = inMemoryDb.parties || [];
      sourceDebtorsMap = inMemoryDb.debtors.map((d) => ({ id: d.id, name: d.name }));
      sourceSettings = inMemoryDb.settings || DEFAULT_SETTINGS;
    } else {
      try {
        const lookupRes = await lookupGuestInSheets(cleanPin, cfg.appsScriptUrl);
        isSheetsSettingsLoaded = true;
        lastSettingsSyncAt = Date.now();
        clearSheetsError();
        targetDebtor = lookupRes.debtor || undefined;
        sourceTransactions = lookupRes.transactions;
        sourceParties = lookupRes.parties;
        sourceDebtorsMap = lookupRes.debtorsMapSource;
        sourceSettings = lookupRes.settings;
      } catch (err: any) {
        const info = recordSheetsError(err);
        return res.status(503).json({
          success: false,
          code: info.code,
          needsScriptUpgrade: info.needsUpgrade,
          sheetsError: info.message,
          message: info.message,
        });
      }
    }

    if (!targetDebtor) {
      return res.status(404).json({
        success: false,
        code: 'INVALID_CREDENTIALS',
        message: 'Mật khẩu (pass) không tồn tại hoặc không chính xác. Vui lòng liên hệ chủ sổ.',
      });
    }

    const debtorTransactions = sourceTransactions
      .filter((tx) => tx.debtorId === targetDebtor!.id)
      .map((tx) => {
        if (tx.partyId || tx.category === 'PARTY_SPLIT') {
          const party = sourceParties.find((p) => p.id === tx.partyId);
          if (party) {
            const participantNames: string[] = [];
            if (party.includeMe) participantNames.push(sourceSettings.ownerName || 'Tôi (Chủ sổ)');
            (party.participantDebtorIds || []).forEach((id) => {
              const d = sourceDebtorsMap.find((deb) => deb.id === id);
              if (d && !participantNames.includes(d.name)) participantNames.push(d.name);
            });
            const payerName =
              party.payerType === 'ME'
                ? sourceSettings.ownerName || 'Tôi (Chủ sổ)'
                : sourceDebtorsMap.find((d) => d.id === party.payerDebtorId)?.name || 'Người này';

            return {
              ...tx,
              partyTotalAmount: tx.partyTotalAmount || party.totalAmount,
              partySplitAmount: tx.partySplitAmount || party.splitAmountPerPerson,
              partyTotalPeople: tx.partyTotalPeople || party.totalPeopleCount,
              partyParticipants:
                tx.partyParticipants && tx.partyParticipants.length > 0
                  ? tx.partyParticipants
                  : participantNames,
              partyPayerName: tx.partyPayerName || payerName,
              partyName: tx.partyName || party.name,
              customNote: tx.customNote || party.note,
              billImage: tx.billImage || party.billImage,
            };
          }
        }
        return tx;
      });

    return res.json({
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
        ownerName: sourceSettings.ownerName,
        ownerPhone: sourceSettings.ownerPhone || '',
        bankId: sourceSettings.bankId,
        bankName: sourceSettings.bankName,
        accountNumber: sourceSettings.accountNumber,
        accountName: sourceSettings.accountName,
        defaultMemoPrefix: sourceSettings.defaultMemoPrefix,
        appTitle: sourceSettings.appTitle,
        appSubtitle: sourceSettings.appSubtitle,
        guestAnnouncement: sourceSettings.guestAnnouncement,
        settledThankYouNote: sourceSettings.settledThankYouNote,
        defaultQrMode: sourceSettings.defaultQrMode || 'MANUAL_AMOUNT',
        vietQrTemplate: sourceSettings.vietQrTemplate || 'compact2',
        lookupInstructionText: sourceSettings.lookupInstructionText,
        themeColor: sourceSettings.themeColor,
        currencySuffix: sourceSettings.currencySuffix,
      },
    });
  } catch (err: any) {
    const info = recordSheetsError(err);
    return res.status(503).json({
      success: false,
      code: info.code,
      needsScriptUpgrade: info.needsUpgrade,
      message: info.message || 'Không thể kết nối cơ sở dữ liệu Google Sheets để tra cứu.',
    });
  }
});

app.post('/api/guest/report-payment', async (req, res) => {
  try {
    const reqUrl = resolveRequestScriptUrl(req);
    const { pin, amount, note, billImage } = req.body || {};
    if (!pin || !amount) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin thanh toán' });
    }

    const trimmedPin = String(pin).trim();
    const processedBillImage = billImage
      ? await processAndOffloadBillImage(billImage, undefined, reqUrl)
      : undefined;

    const newTx: Transaction = {
      id: `tx-report-${Date.now()}`,
      debtorId: '',
      type: 'SUB',
      amount: Number(amount),
      date: new Date().toISOString().split('T')[0],
      note: note ? note.trim() : 'Chuyển khoản thanh toán',
      category: 'PAYMENT_SETTLED',
      ...(processedBillImage ? { billImage: processedBillImage } : {}),
      createdAt: new Date().toISOString(),
    };

    const result = await guestReportPaymentToSheets(trimmedPin, newTx, reqUrl);
    if (isSheetsDataLoaded && inMemoryDb) {
      inMemoryDb.transactions = [result.transaction, ...inMemoryDb.transactions];
      lastFullSyncAt = Date.now();
    }
    return res.json({
      success: true,
      transaction: result.transaction,
      transactions: result.transactions,
    });
  } catch (err: any) {
    const info = recordSheetsError(err);
    return res.status(503).json({
      success: false,
      code: info.code,
      message: `Không thể gửi báo thanh toán lên Google Sheets: ${info.message}`,
    });
  }
});

// --- DYNAMIC PWA WEB MANIFEST ---
app.get(['/site.webmanifest', '/manifest.webmanifest'], async (req, res) => {
  try {
    await ensureSheetsSettingsSync(false, resolveRequestScriptUrl(req));
    const db = getDatabase();
    const rawTitle = db.settings?.appTitle?.trim();
    const appTitle = rawTitle && rawTitle.length > 0 ? rawTitle : 'Sổ Ghi Nợ';
    const appSubtitle = db.settings?.appSubtitle?.trim() || 'Ứng dụng quản lý tài chính, chia tiền và sao kê';
    const shortName = appTitle.length <= 14 ? appTitle : appTitle.slice(0, 14);

    const dynamicManifest = {
      id: '/',
      name: appTitle,
      short_name: shortName,
      description: appSubtitle,
      start_url: '/',
      scope: '/',
      display: 'standalone',
      orientation: 'portrait',
      background_color: '#f8fafc',
      theme_color: '#059669',
      icons: [
        { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
      ],
    };

    res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.json(dynamicManifest);
  } catch {
    res.sendFile(path.resolve('./public/site.webmanifest'));
  }
});

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Express API error:', err?.message || err);
  if (res.headersSent) return;
  const status =
    typeof err?.status === 'number' && err.status >= 400 && err.status < 600
      ? err.status
      : 500;
  return res.status(status).json({
    success: false,
    code: 'SHEETS_UNAVAILABLE',
    message: err?.message || 'Lỗi máy chủ khi xử lý yêu cầu Google Sheets.',
  });
});

// --- VITE MIDDLEWARE / STATIC ASSETS & LISTEN ---
async function startStandaloneServer() {
  if (IS_VERCEL) return;
  if (process.env.NODE_ENV !== 'production') {
    const viteModuleName = 'vite';
    const { createServer: createViteServer } = await import(/* @vite-ignore */ viteModuleName);
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, ws: false },
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

  app.listen(PORT, HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}`);
  });
}

if (!IS_VERCEL) {
  startStandaloneServer();
}

export default app;
export { app };
