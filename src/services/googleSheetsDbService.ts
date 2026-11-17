/**
 * Google Sheets Cloud Database Service (Server-Side)
 * - Replaces Cloud Firestore completely with zero read/write quota limits.
 * - Communicates directly with the user's Google Apps Script Web App v3 (5-Tab Sheet + Google Drive).
 */

import fs from 'fs';
import path from 'path';
import { Debtor, Transaction, PartySplit, AppSettings, AuditLog } from '../types.js';
import { DEFAULT_SETTINGS } from '../data/mockData.js';

export interface SheetsDatabaseSchema {
  debtors: Debtor[];
  transactions: Transaction[];
  parties: PartySplit[];
  settings: AppSettings;
  auditLogs?: AuditLog[];
}

export interface SheetsConnectionConfig {
  appsScriptUrl: string;
  googleSheetUrl?: string;
  source: 'env' | 'file' | 'override' | 'none';
}

export type SheetsErrorCode =
  | 'SHEETS_NOT_CONFIGURED'
  | 'SHEETS_LEGACY_SCRIPT'
  | 'SHEETS_UNAVAILABLE';

export class SheetsDbError extends Error {
  code: SheetsErrorCode;
  constructor(code: SheetsErrorCode, message: string) {
    super(message);
    this.name = 'SheetsDbError';
    this.code = code;
  }
}

const IS_VERCEL = Boolean(process.env.VERCEL);
const DATA_DIR = IS_VERCEL ? path.join('/tmp', 'debt-app-data') : path.join(process.cwd(), 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'sheets-config.json');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');

function ensureDirs() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  } catch {
    // ignore in read-only env
  }
}

function isValidAppsScriptUrl(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  return trimmed.startsWith('https://script.google.com/macros/s/') || trimmed.startsWith('https://script.google.com/');
}

function readPersistedSheetsConfig(): { appsScriptUrl?: string; googleSheetUrl?: string } | null {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

export function saveSheetsConfig(appsScriptUrl: string, googleSheetUrl?: string): void {
  ensureDirs();
  const cleanUrl = (appsScriptUrl || '').trim();
  const cleanSheetUrl = (googleSheetUrl || '').trim();
  try {
    const existing = readPersistedSheetsConfig() || {};
    const payload = {
      appsScriptUrl: cleanUrl || existing.appsScriptUrl || '',
      googleSheetUrl: cleanSheetUrl || existing.googleSheetUrl || '',
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(payload, null, 2), 'utf-8');
  } catch (err: any) {
    console.warn('Could not persist sheets-config.json:', err?.message);
  }
}

export function getActiveSheetsConfig(overrideUrl?: string): SheetsConnectionConfig {
  const cleanOverride = (overrideUrl || '').trim();
  if (isValidAppsScriptUrl(cleanOverride)) {
    const fileCfg = readPersistedSheetsConfig();
    return {
      appsScriptUrl: cleanOverride,
      googleSheetUrl: process.env.GOOGLE_SHEET_URL || fileCfg?.googleSheetUrl || undefined,
      source: 'override',
    };
  }

  const envUrl = (
    process.env.GOOGLE_APPS_SCRIPT_URL ||
    process.env.VITE_GOOGLE_APPS_SCRIPT_URL ||
    ''
  ).trim();
  const fileCfg = readPersistedSheetsConfig();

  if (isValidAppsScriptUrl(envUrl)) {
    return {
      appsScriptUrl: envUrl,
      googleSheetUrl: (process.env.GOOGLE_SHEET_URL || fileCfg?.googleSheetUrl || '').trim() || undefined,
      source: 'env',
    };
  }

  if (fileCfg?.appsScriptUrl && isValidAppsScriptUrl(fileCfg.appsScriptUrl)) {
    return {
      appsScriptUrl: fileCfg.appsScriptUrl.trim(),
      googleSheetUrl: (process.env.GOOGLE_SHEET_URL || fileCfg.googleSheetUrl || '').trim() || undefined,
      source: 'file',
    };
  }

  return {
    appsScriptUrl: '',
    googleSheetUrl: (process.env.GOOGLE_SHEET_URL || '').trim() || undefined,
    source: 'none',
  };
}

export function sanitizeSheetsErrorMessage(raw: unknown, fallback = 'Không thể kết nối đến máy chủ cơ sở dữ liệu.'): string {
  const str = String(raw || '').trim();
  if (!str) return fallback;
  const cleaned = str
    .replace(/https?:\/\/[^\s)"'<>]+/gi, '[địa chỉ máy chủ]')
    .replace(/script\.google\.com[^\s)"'<>]*/gi, '[máy chủ dữ liệu]')
    .replace(/docs\.google\.com[^\s)"'<>]*/gi, '[máy chủ dữ liệu]')
    .replace(/\(\s*HTTP\s*\d{3}\s*\)/gi, '')
    .replace(/\bHTTP\s*\d{3}\b/gi, '')
    .trim();
  const lower = cleaned.toLowerCase();
  if (
    !cleaned ||
    lower.includes('fetch failed') ||
    lower.includes('econnrefused') ||
    lower.includes('enotfound') ||
    lower.includes('etimedout') ||
    lower.includes('econnreset') ||
    lower.includes('socket') ||
    lower.includes('networkerror') ||
    lower.includes('aborted') ||
    cleaned.includes('[địa chỉ máy chủ]') ||
    cleaned.includes('[máy chủ dữ liệu]')
  ) {
    return fallback;
  }
  return cleaned;
}

export function classifySheetsError(err: any): {
  code: SheetsErrorCode;
  message: string;
  needsUpgrade: boolean;
  notConfigured: boolean;
} {
  if (err instanceof SheetsDbError) {
    return {
      code: err.code,
      message: sanitizeSheetsErrorMessage(err.message),
      needsUpgrade: err.code === 'SHEETS_LEGACY_SCRIPT',
      notConfigured: err.code === 'SHEETS_NOT_CONFIGURED',
    };
  }
  const msg = String(err?.message || err || '');
  if (msg.includes('SHEETS_NOT_CONFIGURED') || msg.includes('Chưa cấu hình')) {
    return {
      code: 'SHEETS_NOT_CONFIGURED',
      message: 'Hệ thống chưa được cấu hình kết nối cơ sở dữ liệu.',
      needsUpgrade: false,
      notConfigured: true,
    };
  }
  if (msg.includes('SHEETS_LEGACY_SCRIPT') || msg.includes('phiên bản cũ')) {
    return {
      code: 'SHEETS_LEGACY_SCRIPT',
      message: 'Phiên bản dịch vụ dữ liệu hiện tại đã cũ. Vui lòng cập nhật và thử lại.',
      needsUpgrade: true,
      notConfigured: false,
    };
  }
  return {
    code: 'SHEETS_UNAVAILABLE',
    message: sanitizeSheetsErrorMessage(msg, 'Không thể kết nối đến máy chủ cơ sở dữ liệu.'),
    needsUpgrade: false,
    notConfigured: false,
  };
}

async function callAppsScriptGet(
  action: string,
  params: Record<string, string> = {},
  overrideUrl?: string,
  timeoutMs = 15000
): Promise<any> {
  const cfg = getActiveSheetsConfig(overrideUrl);
  if (!cfg.appsScriptUrl) {
    throw new SheetsDbError('SHEETS_NOT_CONFIGURED', 'Hệ thống chưa được cấu hình kết nối cơ sở dữ liệu.');
  }

  const url = new URL(cfg.appsScriptUrl);
  if (action) url.searchParams.set('action', action);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url.toString(), {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
    });
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      console.warn(`[SheetsDb GET ${action}] non-JSON response HTTP ${res.status}`);
      if (text.includes('accounts.google.com') || text.includes('Sign in')) {
        throw new SheetsDbError(
          'SHEETS_UNAVAILABLE',
          'Kết nối cơ sở dữ liệu chưa được cấp quyền truy cập công khai.'
        );
      }
      throw new SheetsDbError(
        'SHEETS_UNAVAILABLE',
        'Không thể nhận phản hồi hợp lệ từ máy chủ cơ sở dữ liệu.'
      );
    }

    if (!res.ok || json?.success === false) {
      console.warn(`[SheetsDb GET ${action}] upstream error HTTP ${res.status}:`, json?.error || json?.message);
      throw new SheetsDbError(
        'SHEETS_UNAVAILABLE',
        sanitizeSheetsErrorMessage(json?.error || json?.message, 'Không thể tải dữ liệu từ máy chủ cơ sở dữ liệu.')
      );
    }

    return json;
  } catch (err: any) {
    if (err instanceof SheetsDbError) throw err;
    console.warn(`[SheetsDb GET ${action}] fetch failed:`, err?.message || err);
    if (err?.name === 'AbortError') {
      throw new SheetsDbError('SHEETS_UNAVAILABLE', 'Hết thời gian chờ kết nối đến máy chủ cơ sở dữ liệu.');
    }
    throw new SheetsDbError('SHEETS_UNAVAILABLE', 'Không thể kết nối đến máy chủ cơ sở dữ liệu.');
  } finally {
    clearTimeout(timer);
  }
}

async function callAppsScriptPost(
  payload: Record<string, any>,
  overrideUrl?: string,
  timeoutMs = 25000
): Promise<any> {
  const cfg = getActiveSheetsConfig(overrideUrl);
  if (!cfg.appsScriptUrl) {
    throw new SheetsDbError('SHEETS_NOT_CONFIGURED', 'Hệ thống chưa được cấu hình kết nối cơ sở dữ liệu.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(cfg.appsScriptUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify(payload),
      redirect: 'follow',
      signal: controller.signal,
    });

    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      console.warn(`[SheetsDb POST ${payload?.action || 'SYNC'}] non-JSON response HTTP ${res.status}`);
      if (text.includes('accounts.google.com') || text.includes('Sign in')) {
        throw new SheetsDbError(
          'SHEETS_UNAVAILABLE',
          'Kết nối cơ sở dữ liệu chưa được cấp quyền ghi công khai.'
        );
      }
      throw new SheetsDbError(
        'SHEETS_UNAVAILABLE',
        'Không thể nhận phản hồi hợp lệ từ máy chủ cơ sở dữ liệu khi lưu.'
      );
    }

    if (!res.ok || json?.success === false) {
      console.warn(`[SheetsDb POST ${payload?.action || 'SYNC'}] upstream error HTTP ${res.status}:`, json?.error || json?.message);
      throw new SheetsDbError(
        'SHEETS_UNAVAILABLE',
        sanitizeSheetsErrorMessage(json?.error || json?.message, 'Không thể lưu dữ liệu lên máy chủ cơ sở dữ liệu.')
      );
    }

    return json;
  } catch (err: any) {
    if (err instanceof SheetsDbError) throw err;
    console.warn(`[SheetsDb POST ${payload?.action || 'SYNC'}] fetch failed:`, err?.message || err);
    if (err?.name === 'AbortError') {
      throw new SheetsDbError('SHEETS_UNAVAILABLE', 'Hết thời gian chờ ghi dữ liệu lên máy chủ cơ sở dữ liệu.');
    }
    throw new SheetsDbError('SHEETS_UNAVAILABLE', 'Không thể ghi dữ liệu lên máy chủ cơ sở dữ liệu.');
  } finally {
    clearTimeout(timer);
  }
}

function mergeWithDefaultSettings(rawSettings: any, cfg: SheetsConnectionConfig): AppSettings {
  const cleaned: AppSettings = {
    ...DEFAULT_SETTINGS,
    ...(rawSettings && typeof rawSettings === 'object' ? rawSettings : {}),
  };
  if (cfg.appsScriptUrl) {
    cleaned.googleAppsScriptUrl = cfg.appsScriptUrl;
  }
  if (cfg.googleSheetUrl && !cleaned.googleSheetUrl) {
    cleaned.googleSheetUrl = cfg.googleSheetUrl;
  }
  return cleaned;
}

export async function testSheetsConnection(customUrl?: string): Promise<{
  success: boolean;
  configured: boolean;
  latencyMs: number;
  version: number;
  supportsFullDb: boolean;
  supportsLogSync: boolean;
  supportsDriveUpload: boolean;
  needsUpgrade: boolean;
  source: SheetsConnectionConfig['source'];
  googleSheetUrl?: string;
  message?: string;
  error?: string;
}> {
  const t0 = Date.now();
  const cfg = getActiveSheetsConfig(customUrl);
  if (!cfg.appsScriptUrl) {
    return {
      success: false,
      configured: false,
      latencyMs: 0,
      version: 0,
      supportsFullDb: false,
      supportsLogSync: false,
      supportsDriveUpload: false,
      needsUpgrade: false,
      source: 'none',
      googleSheetUrl: cfg.googleSheetUrl,
      error: 'Chưa cấu hình URL Google Apps Script Web App.',
    };
  }

  try {
    const res = await callAppsScriptGet('PING', {}, cfg.appsScriptUrl, IS_VERCEL ? 7500 : 9000);
    const version = Number(res.version || (res.supportsFullDb ? 3 : res.supportsLogSync ? 2 : 1));
    const supportsFullDb = Boolean(res.supportsFullDb || version >= 3);
    return {
      success: true,
      configured: true,
      latencyMs: Date.now() - t0,
      version,
      supportsFullDb,
      supportsLogSync: Boolean(res.supportsLogSync || version >= 2),
      supportsDriveUpload: Boolean(res.supportsDriveUpload || version >= 3),
      needsUpgrade: !supportsFullDb,
      source: cfg.source,
      googleSheetUrl: cfg.googleSheetUrl,
      message: res.message || 'Kết nối Google Sheets thành công!',
    };
  } catch (err: any) {
    return {
      success: false,
      configured: true,
      latencyMs: Date.now() - t0,
      version: 0,
      supportsFullDb: false,
      supportsLogSync: false,
      supportsDriveUpload: false,
      needsUpgrade: false,
      source: cfg.source,
      googleSheetUrl: cfg.googleSheetUrl,
      error: sanitizeSheetsErrorMessage(err?.message, 'Không thể kết nối đến máy chủ cơ sở dữ liệu.'),
    };
  }
}

export async function loadSettingsFromSheets(overrideUrl?: string): Promise<AppSettings> {
  const cfg = getActiveSheetsConfig(overrideUrl);
  const data = await callAppsScriptGet('GET_SETTINGS', {}, cfg.appsScriptUrl, IS_VERCEL ? 8000 : 9000);
  if (Number(data.version || 0) < 3 && data.status === 'ok') {
    throw new SheetsDbError(
      'SHEETS_LEGACY_SCRIPT',
      'Google Apps Script đang dùng phiên bản cũ (v1/v2), chưa hỗ trợ đọc CSDL & Cài Đặt. Hãy cập nhật mã Apps Script v3 và Triển khai lại.'
    );
  }
  return mergeWithDefaultSettings(data.settings, cfg);
}

export async function loadAllDataFromSheets(overrideUrl?: string): Promise<SheetsDatabaseSchema> {
  const cfg = getActiveSheetsConfig(overrideUrl);
  const data = await callAppsScriptGet('LOAD_ALL', {}, cfg.appsScriptUrl, IS_VERCEL ? 8800 : 12000);
  if (!Array.isArray(data.debtors) && data.status === 'ok') {
    throw new SheetsDbError(
      'SHEETS_LEGACY_SCRIPT',
      'Google Apps Script đang dùng phiên bản cũ (v1/v2), chưa hỗ trợ LOAD_ALL. Hãy cập nhật mã Apps Script v3 và Triển khai lại.'
    );
  }
  return {
    debtors: Array.isArray(data.debtors) ? data.debtors : [],
    transactions: Array.isArray(data.transactions) ? data.transactions : [],
    parties: Array.isArray(data.parties) ? data.parties : [],
    settings: mergeWithDefaultSettings(data.settings, cfg),
  };
}

export async function lookupGuestInSheets(
  pin: string,
  overrideUrl?: string
): Promise<{
  debtor: Debtor | null;
  transactions: Transaction[];
  parties: PartySplit[];
  debtorsMapSource: Array<{ id: string; name: string }>;
  settings: AppSettings;
}> {
  const cfg = getActiveSheetsConfig(overrideUrl);
  const data = await callAppsScriptGet('GUEST_LOOKUP', { pin: pin.trim() }, cfg.appsScriptUrl, IS_VERCEL ? 8500 : 9500);
  if (data.status === 'ok' && data.found === undefined && data.debtor === undefined) {
    throw new SheetsDbError(
      'SHEETS_LEGACY_SCRIPT',
      'Google Apps Script đang dùng phiên bản cũ (v1/v2), chưa hỗ trợ GUEST_LOOKUP. Hãy cập nhật mã Apps Script v3.'
    );
  }
  return {
    debtor: data.debtor || null,
    transactions: Array.isArray(data.transactions) ? data.transactions : [],
    parties: Array.isArray(data.parties) ? data.parties : [],
    debtorsMapSource: Array.isArray(data.debtorsMapSource) ? data.debtorsMapSource : [],
    settings: mergeWithDefaultSettings(data.settings, cfg),
  };
}

export async function saveAllDataToSheets(
  state: SheetsDatabaseSchema,
  overrideUrl?: string
): Promise<{
  debtors: Debtor[];
  transactions: Transaction[];
  parties: PartySplit[];
}> {
  const cfg = getActiveSheetsConfig(overrideUrl);
  const res = await callAppsScriptPost(
    {
      action: 'SYNC_ALL',
      ownerName: state.settings?.ownerName || 'Chủ Sổ',
      timestamp: new Date().toISOString(),
      debtors: state.debtors || [],
      transactions: state.transactions || [],
      parties: state.parties || [],
      settings: state.settings || DEFAULT_SETTINGS,
      ...(Array.isArray(state.auditLogs) && state.auditLogs.length > 0 ? { auditLogs: state.auditLogs } : {}),
    },
    cfg.appsScriptUrl,
    28000
  );

  return {
    debtors: Array.isArray(res.debtors) ? res.debtors : state.debtors,
    transactions: Array.isArray(res.transactions) ? res.transactions : state.transactions,
    parties: Array.isArray(res.parties) ? res.parties : state.parties,
  };
}

export async function saveSettingsToSheets(settings: AppSettings, overrideUrl?: string): Promise<void> {
  const cfg = getActiveSheetsConfig(overrideUrl);
  await callAppsScriptPost(
    {
      action: 'SAVE_SETTINGS',
      settings,
      timestamp: new Date().toISOString(),
    },
    cfg.appsScriptUrl,
    15000
  );
}

export async function guestReportPaymentToSheets(
  pin: string,
  transaction: Transaction,
  overrideUrl?: string
): Promise<{
  transaction: Transaction;
  transactions: Transaction[];
}> {
  const cfg = getActiveSheetsConfig(overrideUrl);
  const res = await callAppsScriptPost(
    {
      action: 'GUEST_REPORT_PAYMENT',
      pin,
      transaction,
    },
    cfg.appsScriptUrl,
    18000
  );
  return {
    transaction: res.transaction || transaction,
    transactions: Array.isArray(res.transactions) ? res.transactions : [transaction],
  };
}

export async function uploadBillImageToDrive(
  base64Data: string,
  mimeType: string,
  filename: string,
  overrideUrl?: string
): Promise<{ fileId: string; url: string; proxyUrl: string } | null> {
  const cfg = getActiveSheetsConfig(overrideUrl);
  if (!cfg.appsScriptUrl) return null;
  try {
    const res = await callAppsScriptPost(
      {
        action: 'UPLOAD_IMAGE',
        base64Data,
        mimeType,
        filename,
      },
      cfg.appsScriptUrl,
      20000
    );
    if (res?.success && res?.url) {
      return {
        fileId: String(res.fileId || ''),
        url: String(res.url),
        proxyUrl: String(res.proxyUrl || res.url),
      };
    }
  } catch (err: any) {
    console.warn('Google Drive uploadBillImageToDrive notice:', err?.message);
  }
  return null;
}

// --- SNAPSHOT BACKUPS (JSON LOCAL/TMP) ---
export function createSnapshotBackup(db: SheetsDatabaseSchema, label = 'auto_backup'): string {
  ensureDirs();
  const safeLabel = label.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
  const filename = `snapshot_${Date.now()}_${safeLabel}.json`;
  const filePath = path.join(BACKUPS_DIR, filename);
  const payload = {
    label,
    createdAt: new Date().toISOString(),
    databaseId: 'google_sheets',
    debtorsCount: db.debtors?.length || 0,
    transactionsCount: db.transactions?.length || 0,
    partiesCount: db.parties?.length || 0,
    data: db,
  };
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8');

  // Keep only last 15 snapshots
  try {
    const files = fs
      .readdirSync(BACKUPS_DIR)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .reverse();
    files.slice(15).forEach((old) => {
      try {
        fs.unlinkSync(path.join(BACKUPS_DIR, old));
      } catch {
        // ignore
      }
    });
  } catch {
    // ignore
  }
  return filename;
}

export function listSnapshotBackups(): Array<{
  filename: string;
  label: string;
  createdAt: string;
  debtorCount: number;
  transactionCount: number;
  partyCount: number;
  debtorsCount?: number;
  transactionsCount?: number;
}> {
  ensureDirs();
  try {
    const files = fs
      .readdirSync(BACKUPS_DIR)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .reverse();
    return files
      .map((filename) => {
        try {
          const parsed = JSON.parse(fs.readFileSync(path.join(BACKUPS_DIR, filename), 'utf-8'));
          return {
            filename,
            label: parsed.label || filename,
            createdAt: parsed.createdAt || new Date().toISOString(),
            debtorCount: parsed.debtorsCount || 0,
            transactionCount: parsed.transactionsCount || 0,
            partyCount: parsed.partiesCount || 0,
            debtorsCount: parsed.debtorsCount || 0,
            transactionsCount: parsed.transactionsCount || 0,
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean) as any;
  } catch {
    return [];
  }
}

export function restoreSnapshotBackup(filename: string): SheetsDatabaseSchema | null {
  ensureDirs();
  try {
    const safeName = path.basename(filename);
    const fullPath = path.join(BACKUPS_DIR, safeName);
    if (!fs.existsSync(fullPath)) return null;
    const parsed = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
    const data = parsed?.data || parsed;
    if (!data || !Array.isArray(data.debtors)) return null;
    return {
      debtors: data.debtors || [],
      transactions: data.transactions || [],
      parties: data.parties || [],
      settings: data.settings || DEFAULT_SETTINGS,
    };
  } catch {
    return null;
  }
}
