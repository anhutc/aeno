/**
 * Google Sheets & Google Drive Integration Service (100% Cloud via Apps Script v3)
 * - No Firebase Auth / No OAuth Client ID required
 * - Pure Google Apps Script Web App 5-Tab Cloud Database (Debtors, Transactions, Parties, Logs, Settings)
 */

import { loadAuditLogs, recordAuditLog, loadSettings, saveSettings } from '../utils/storage';
import { Debtor, Transaction, PartySplit, AppSettings, AuditLog } from '../types';

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
    case 'CLOUD_SYNC': return 'Google Sheets Cloud & Sao lưu';
    case 'RESTORE_DATA': return 'Khôi phục sao lưu';
    case 'CLEAR_DATA': return 'Dọn dẹp dữ liệu';
    case 'LOGIN_SUCCESS': return 'Đăng nhập thành công';
    case 'LOGIN_FAILED': return 'Đăng nhập thất bại';
    case 'LOGOUT': return 'Đăng xuất';
    case 'AUTO_LOCK': return 'Tự động khóa phiên';
    case 'BIOMETRIC_AUTH': return 'Xác thực FaceID / Vân tay';
    case 'LOOKUP_FAILED': return 'Tra cứu thất bại';
    case 'EXPORT_DATA': return 'Xuất dữ liệu / JSON / CSV';
    case 'EXPORT_STATEMENT': return 'Xuất ảnh bảng kê / QR';
    case 'SHARE_REMINDER': return 'Chia sẻ / Chép nhắc nợ';
    case 'VIEW_RECEIPT': return 'Xem ảnh chứng từ';
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
  csvContent += `"STT","Thời Gian","Người Thực Hiện","Loại Thao Tác","Tiêu Đề","Đối Tượng / Người Nợ","Số Tiền (VNĐ)","Nội Dung Chi Tiết","Trước Thay Đổi (Before)","Sau Thay Đổi (After)","Thiết Bị & Ngữ Cảnh (Metadata)"\n`;

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

    const metaStr = l.metadata
      ? Object.entries(l.metadata)
          .filter(([, v]) => v !== undefined && v !== null && v !== '')
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`)
          .join(' | ')
      : '-';

    csvContent += `"${idx + 1}","${new Date(l.timestamp).toLocaleString('vi-VN')}","${l.actor}","${getLogActionFriendlyName(l.action)}","${(l.title || '').replace(/"/g, '""')}","${l.debtorName || '-'}","${l.amount || 0}","${(l.description || '').replace(/"/g, '""')}","${beforeStr.replace(/"/g, '""')}","${afterStr.replace(/"/g, '""')}","${metaStr.replace(/"/g, '""')}"\n`;
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `SoNo_GoogleSheets_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

let autoSyncTimer: any = null;
let isAutoSyncingActive = false;
const autoSyncState = {
  isAutoSyncing: false,
  lastAutoSyncAt: undefined as string | undefined,
  lastError: undefined as string | undefined,
};

export const getAutoSyncStatus = () => ({ ...autoSyncState });

export const GOOGLE_APPS_SCRIPT_TEMPLATE = `// === GOOGLE APPS SCRIPT CSDL TOÀN PHẦN SỔ GHI NỢ AENO (v3 - 5 TAB + ẢNH DRIVE + NHẬT KÝ ĐA THIẾT BỊ) ===
// Hướng dẫn triển khai / cập nhật (chỉ 1 phút):
// 1. Mở trang Google Sheet của bạn > Tiện ích mở rộng (Extensions) > Apps Script
// 2. Xóa hết code cũ trong Code.gs, dán toàn bộ mã v3 này vào > Lưu (Ctrl+S)
// 3. Bấm "Triển khai" (Deploy) > "Quản lý các bản triển khai" (hoặc Triển khai mới) > Chỉnh sửa (Edit) > Chọn "Phiên bản mới" > "Triển khai"
//    - Người thực thi (Execute as): Tôi (tài khoản của bạn)
//    - Ai có quyền truy cập (Who has access): Bất kỳ ai (Anyone)
// 4. Sao chép URL ứng dụng web (/exec) dán vào ứng dụng Sổ Nợ AENO (hoặc biến GOOGLE_APPS_SCRIPT_URL trên Vercel)!

function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) ? String(e.parameter.action).toUpperCase() : "";
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    if (action === "GET_LOGS") {
      var limit = Number((e && e.parameter && e.parameter.limit) || 500);
      if (!limit || limit < 1) limit = 500;
      if (limit > 1000) limit = 1000;
      var logsResult = readLogsFromSheet_(ss, limit);
      return jsonOut_({
        success: true,
        version: 3,
        logs: logsResult.logs,
        totalRows: logsResult.totalRows
      });
    }

    if (action === "GET_SETTINGS") {
      var settingsRes = readSettingsFromSheet_(ss);
      return jsonOut_({
        success: true,
        version: 3,
        hasSettingsSheet: settingsRes.hasSettingsSheet,
        settings: settingsRes.settings
      });
    }

    if (action === "LOAD_ALL") {
      var debtors = readDebtorsFromSheet_(ss);
      var transactions = readTransactionsFromSheet_(ss);
      var parties = readPartiesFromSheet_(ss);
      var settingsRes2 = readSettingsFromSheet_(ss);
      return jsonOut_({
        success: true,
        version: 3,
        hasSettingsSheet: settingsRes2.hasSettingsSheet,
        debtors: debtors,
        transactions: transactions,
        parties: parties,
        settings: settingsRes2.settings
      });
    }

    if (action === "GUEST_LOOKUP") {
      var pinRaw = (e && e.parameter && e.parameter.pin) ? String(e.parameter.pin).trim() : "";
      if (!pinRaw) {
        return jsonOut_({ success: false, version: 3, message: "Thiếu mã PIN tra cứu" });
      }
      var pinLower = pinRaw.toLowerCase();
      var allDebtors = readDebtorsFromSheet_(ss);
      var targetDebtor = null;
      for (var dIdx = 0; dIdx < allDebtors.length; dIdx++) {
        if (String(allDebtors[dIdx].pin || "").trim().toLowerCase() === pinLower) {
          targetDebtor = allDebtors[dIdx];
          break;
        }
      }

      var settingsRes3 = readSettingsFromSheet_(ss);
      if (!targetDebtor) {
        return jsonOut_({
          success: true,
          version: 3,
          found: false,
          debtor: null,
          transactions: [],
          parties: [],
          settings: settingsRes3.settings
        });
      }

      var allTxs = readTransactionsFromSheet_(ss);
      var debtorTxs = [];
      var neededPartyIds = {};
      for (var tIdx = 0; tIdx < allTxs.length; tIdx++) {
        if (allTxs[tIdx].debtorId === targetDebtor.id) {
          debtorTxs.push(allTxs[tIdx]);
          if (allTxs[tIdx].partyId) neededPartyIds[allTxs[tIdx].partyId] = true;
        }
      }

      var allParties = readPartiesFromSheet_(ss);
      var relatedParties = [];
      for (var pIdx = 0; pIdx < allParties.length; pIdx++) {
        if (neededPartyIds[allParties[pIdx].id]) {
          relatedParties.push(allParties[pIdx]);
        }
      }

      return jsonOut_({
        success: true,
        version: 3,
        found: true,
        debtor: targetDebtor,
        transactions: debtorTxs,
        parties: relatedParties,
        debtorsMapSource: allDebtors.map(function(x) { return { id: x.id, name: x.name }; }),
        settings: settingsRes3.settings
      });
    }

    return jsonOut_({
      status: "ok",
      version: 3,
      supportsFullDb: true,
      supportsLogSync: true,
      supportsDriveUpload: true,
      message: "Google Apps Script Web App AENO v3 đang hoạt động (CSDL Google Sheets 5 Tab + Google Drive + Nhật Ký Đa Thiết Bị)!",
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return jsonOut_({
      success: false,
      version: 3,
      error: err.toString()
    });
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  var hasLock = false;
  try {
    lock.waitLock(20000);
    hasLock = true;
  } catch (lockErr) {
    return jsonOut_({ success: false, version: 3, error: "Máy chủ Google Sheets đang bận xử lý đồng thời, vui lòng thử lại." });
  }

  try {
    var raw = e && e.postData && e.postData.contents ? e.postData.contents : "{}";
    var data = JSON.parse(raw);
    var action = data && data.action ? String(data.action).toUpperCase() : "SYNC_ALL";
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // 1. Fast path: Chỉ nối thêm nhật ký vào Tab 4
    if (action === "APPEND_LOGS") {
      var appended = appendAuditLogsToSheet(ss, data.auditLogs || []);
      return jsonOut_({
        success: true,
        version: 3,
        appended: appended,
        message: "Đã ghi thêm " + appended + " nhật ký vào Tab 4."
      });
    }

    // 2. Upload ảnh hóa đơn lên Google Drive
    if (action === "UPLOAD_IMAGE") {
      var base64Data = String(data.base64Data || data.image || "");
      var mimeType = String(data.mimeType || "image/jpeg");
      var filename = String(data.filename || ("bill_" + new Date().getTime() + ".jpg"));
      var uploaded = saveRawImageToDrive_(base64Data, mimeType, filename);
      return jsonOut_(uploaded);
    }

    // 3. Lưu riêng Tab 5: Cài Đặt Hệ Thống
    if (action === "SAVE_SETTINGS") {
      writeSettingsToSheet_(ss, data.settings || {});
      return jsonOut_({
        success: true,
        version: 3,
        message: "Đã lưu Cài Đặt Hệ Thống lên Tab 5 Google Sheets!"
      });
    }

    // 4. Khách báo chuyển khoản nguyên tử (tránh ghi đè giao dịch khác)
    if (action === "GUEST_REPORT_PAYMENT") {
      var reportPin = String(data.pin || "").trim().toLowerCase();
      var allDebtors = readDebtorsFromSheet_(ss);
      var matchedDebtor = null;
      for (var i = 0; i < allDebtors.length; i++) {
        if (String(allDebtors[i].pin || "").trim().toLowerCase() === reportPin) {
          matchedDebtor = allDebtors[i];
          break;
        }
      }
      if (!matchedDebtor) {
        return jsonOut_({ success: false, version: 3, message: "Mã PIN tra cứu không hợp lệ" });
      }
      var allTxs = readTransactionsFromSheet_(ss);
      var newTx = data.transaction || {};
      newTx.debtorId = matchedDebtor.id;
      if (newTx.billImage && String(newTx.billImage).indexOf("data:") === 0) {
        newTx.billImage = saveDataUrlToDrive_(newTx.billImage, "tx_" + (newTx.id || new Date().getTime()));
      }
      allTxs.unshift(newTx);
      var allParties = readPartiesFromSheet_(ss);
      writeDebtorsToSheet_(ss, allDebtors, allTxs);
      writeTransactionsToSheet_(ss, allTxs, allDebtors);
      var dTxs = allTxs.filter(function(t) { return t.debtorId === matchedDebtor.id; });
      return jsonOut_({
        success: true,
        version: 3,
        transaction: newTx,
        transactions: dTxs,
        partiesCount: allParties.length
      });
    }

    // 5. Mặc định: SYNC_ALL / SAVE_DATA (Ghi đồng bộ 3 bảng chính + Tab 5 Settings nếu có + nối thêm Tab 4 Logs nếu có)
    var debtors = Array.isArray(data.debtors) ? data.debtors : [];
    var txs = Array.isArray(data.transactions) ? data.transactions : [];
    var parties = Array.isArray(data.parties) ? data.parties : [];

    var processedTxs = writeTransactionsToSheet_(ss, txs, debtors);
    writeDebtorsToSheet_(ss, debtors, processedTxs);
    var processedParties = writePartiesToSheet_(ss, parties);

    if (data.settings && typeof data.settings === "object") {
      writeSettingsToSheet_(ss, data.settings);
    }

    if (Array.isArray(data.auditLogs) && data.auditLogs.length > 0) {
      appendAuditLogsToSheet(ss, data.auditLogs);
    }

    return jsonOut_({
      success: true,
      version: 3,
      debtors: debtors,
      transactions: processedTxs,
      parties: processedParties,
      message: "Đã đồng bộ toàn bộ 5 tab lên Google Sheets thành công!"
    });
  } catch (err) {
    return jsonOut_({ success: false, version: 3, error: err.toString() });
  } finally {
    if (hasLock) {
      try { lock.releaseLock(); } catch (relErr) {}
    }
  }
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// --- DRIVE IMAGE HELPERS ---
function getOrCreateBillFolder_() {
  var folderName = "AENO - Ảnh Hóa Đơn";
  var folders = DriveApp.getFoldersByName(folderName);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
}

function saveRawImageToDrive_(base64OrDataUrl, mimeType, filename) {
  var cleanBase64 = String(base64OrDataUrl || "");
  var resolvedMime = String(mimeType || "image/jpeg");
  var match = cleanBase64.match(/^data:([^;]+);base64,(.+)$/);
  if (match && match.length >= 3) {
    resolvedMime = match[1];
    cleanBase64 = match[2];
  } else if (cleanBase64.indexOf(",") !== -1 && cleanBase64.indexOf("data:") === 0) {
    cleanBase64 = cleanBase64.split(",")[1] || cleanBase64;
  }
  var bytes = Utilities.base64Decode(cleanBase64);
  var folder = getOrCreateBillFolder_();
  var blob = Utilities.newBlob(bytes, resolvedMime, filename);
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  var fileId = file.getId();
  return {
    success: true,
    version: 3,
    fileId: fileId,
    url: "https://drive.google.com/thumbnail?id=" + fileId + "&sz=w2000",
    proxyUrl: "/api/images/gdrive_" + fileId
  };
}

function saveDataUrlToDrive_(dataUrl, prefixName) {
  if (!dataUrl || typeof dataUrl !== "string") return "";
  if (dataUrl.indexOf("data:") !== 0) return dataUrl;
  try {
    var match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match || match.length < 3) return "";
    var mimeType = match[1] || "image/jpeg";
    var ext = mimeType.indexOf("png") !== -1 ? ".png" : (mimeType.indexOf("webp") !== -1 ? ".webp" : ".jpg");
    var res = saveRawImageToDrive_(match[2], mimeType, (prefixName || ("bill_" + new Date().getTime())) + ext);
    return res.url;
  } catch (err) {
    if (dataUrl.length < 38000) return dataUrl;
    return "";
  }
}

// --- SAFE CELL SERIALIZATION ---
function safeJsonCell_(obj) {
  var str = JSON.stringify(obj);
  if (str.length <= 49000) return str;
  var copy = JSON.parse(str);
  if (copy.billImage && String(copy.billImage).length > 500) {
    copy.billImage = "";
  }
  return JSON.stringify(copy).slice(0, 49000);
}

// --- TAB 1: DEBTORS ---
function writeDebtorsToSheet_(ss, debtors, txs) {
  var sheet1 = getOrCreateSheet(ss, "Tổng Hợp Công Nợ");
  sheet1.clear();
  var headers1 = [["STT", "Họ Và Tên Người Nợ", "Số Dư Nợ Hiện Tại (VNĐ)", "Trạng Thái", "Tổng Nợ Thêm (+)", "Tổng Đã Trả (-)", "Số Giao Dịch", "Mã PIN Tra Cứu", "Ghi Chú", "Dữ Liệu Hệ Thống (JSON)"]];
  var rows1 = [headers1[0]];
  for (var i = 0; i < debtors.length; i++) {
    var d = debtors[i];
    var dTxs = txs.filter(function(t) { return t.debtorId === d.id; });
    var add = dTxs.filter(function(t) { return t.type === "ADD"; }).reduce(function(s, t) { return s + (Number(t.amount) || 0); }, 0);
    var sub = dTxs.filter(function(t) { return t.type === "SUB"; }).reduce(function(s, t) { return s + (Number(t.amount) || 0); }, 0);
    var bal = add - sub;
    var status = bal > 0 ? "Đang còn nợ" : (bal < 0 ? "Chủ nợ đang nợ lại" : "Đã hết nợ");
    rows1.push([i + 1, d.name || "", bal, status, add, sub, dTxs.length, String(d.pin || ""), d.note || "", safeJsonCell_(d)]);
  }
  var range1 = sheet1.getRange(1, 1, rows1.length, rows1[0].length);
  if (rows1.length > 1) {
    sheet1.getRange(2, 8, rows1.length - 1, 1).setNumberFormat("@");
  }
  range1.setValues(rows1);
  formatHeader(sheet1, "#047857");
}

function readDebtorsFromSheet_(ss) {
  var sheet1 = ss.getSheetByName("Tổng Hợp Công Nợ");
  if (!sheet1 || sheet1.getLastRow() <= 1) return [];
  var lastCol = Math.max(9, sheet1.getLastColumn());
  var values = sheet1.getRange(2, 1, sheet1.getLastRow() - 1, lastCol).getValues();
  var result = [];
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var jsonStr = row.length >= 10 ? String(row[9] || "").trim() : "";
    if (jsonStr && jsonStr.charAt(0) === "{") {
      try {
        var parsed = JSON.parse(jsonStr);
        if (parsed && parsed.id) {
          if (row[1]) parsed.name = String(row[1]).trim();
          result.push(parsed);
          continue;
        }
      } catch (e) {}
    }
    var nameFallback = String(row[1] || "").trim();
    var pinFallback = String(row[7] || "").trim();
    if (!nameFallback) continue;
    var nowIso = new Date().toISOString();
    result.push({
      id: "debtor-sheet-" + (i + 2),
      name: nameFallback,
      pin: pinFallback || String(1000 + i),
      note: String(row[8] || "").trim() || undefined,
      createdAt: nowIso,
      updatedAt: nowIso
    });
  }
  return result;
}

// --- TAB 2: TRANSACTIONS ---
function writeTransactionsToSheet_(ss, txs, debtors) {
  var sheet2 = getOrCreateSheet(ss, "Lịch Sử Giao Dịch");
  sheet2.clear();
  var dMap = {};
  for (var j = 0; j < debtors.length; j++) { dMap[debtors[j].id] = debtors[j].name; }
  var rows2 = [["STT", "Ngày Giao Dịch", "Người Nợ", "Loại", "Số Tiền (VNĐ)", "Nội Dung", "Phân Loại", "Cuộc Vui", "Ảnh Hóa Đơn (URL)", "Dữ Liệu Hệ Thống (JSON)"]];
  var processed = [];
  for (var k = 0; k < txs.length; k++) {
    var t = JSON.parse(JSON.stringify(txs[k]));
    if (t.billImage && String(t.billImage).indexOf("data:") === 0) {
      t.billImage = saveDataUrlToDrive_(t.billImage, "tx_" + (t.id || k));
    }
    processed.push(t);
    var dateStr = (t.date instanceof Date) ? t.date.toISOString().slice(0, 10) : String(t.date || "");
    rows2.push([
      k + 1,
      dateStr,
      dMap[t.debtorId] || "Không xác định",
      t.type === "ADD" ? "Ghi Nợ (+)" : "Trả Nợ (-)",
      Number(t.amount) || 0,
      t.note || "",
      t.category || "SINGLE",
      t.partyName || "",
      t.billImage || "",
      safeJsonCell_(t)
    ]);
  }
  if (rows2.length > 1) {
    sheet2.getRange(2, 2, rows2.length - 1, 1).setNumberFormat("@");
  }
  sheet2.getRange(1, 1, rows2.length, rows2[0].length).setValues(rows2);
  formatHeader(sheet2, "#0284c7");
  return processed;
}

function readTransactionsFromSheet_(ss) {
  var sheet2 = ss.getSheetByName("Lịch Sử Giao Dịch");
  if (!sheet2 || sheet2.getLastRow() <= 1) return [];
  var lastCol = Math.max(8, sheet2.getLastColumn());
  var values = sheet2.getRange(2, 1, sheet2.getLastRow() - 1, lastCol).getValues();
  var result = [];
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var jsonStr = row.length >= 10 ? String(row[9] || "").trim() : (row.length >= 9 && String(row[8]).trim().charAt(0) === "{" ? String(row[8]).trim() : "");
    if (jsonStr && jsonStr.charAt(0) === "{") {
      try {
        var parsed = JSON.parse(jsonStr);
        if (parsed && parsed.id) {
          result.push(parsed);
          continue;
        }
      } catch (e) {}
    }
  }
  return result;
}

// --- TAB 3: PARTIES ---
function writePartiesToSheet_(ss, parties) {
  var sheet3 = getOrCreateSheet(ss, "Các Cuộc Chia Tiền");
  sheet3.clear();
  var rows3 = [["STT", "Ngày Tổ Chức", "Tên Cuộc Vui", "Tổng Tiền (VNĐ)", "Số Người", "Tiền/Người (VNĐ)", "Ghi Chú", "Ảnh Hóa Đơn (URL)", "Dữ Liệu Hệ Thống (JSON)"]];
  var processed = [];
  for (var p = 0; p < parties.length; p++) {
    var pt = JSON.parse(JSON.stringify(parties[p]));
    if (pt.billImage && String(pt.billImage).indexOf("data:") === 0) {
      pt.billImage = saveDataUrlToDrive_(pt.billImage, "party_" + (pt.id || p));
    }
    processed.push(pt);
    rows3.push([
      p + 1,
      String(pt.date || ""),
      pt.name || "",
      Number(pt.totalAmount) || 0,
      Number(pt.totalPeopleCount) || 0,
      Number(pt.splitAmountPerPerson) || 0,
      pt.note || "",
      pt.billImage || "",
      safeJsonCell_(pt)
    ]);
  }
  if (rows3.length > 1) {
    sheet3.getRange(2, 2, rows3.length - 1, 1).setNumberFormat("@");
  }
  sheet3.getRange(1, 1, rows3.length, rows3[0].length).setValues(rows3);
  formatHeader(sheet3, "#9333ea");
  return processed;
}

function readPartiesFromSheet_(ss) {
  var sheet3 = ss.getSheetByName("Các Cuộc Chia Tiền");
  if (!sheet3 || sheet3.getLastRow() <= 1) return [];
  var lastCol = Math.max(7, sheet3.getLastColumn());
  var values = sheet3.getRange(2, 1, sheet3.getLastRow() - 1, lastCol).getValues();
  var result = [];
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var jsonStr = row.length >= 9 ? String(row[8] || "").trim() : "";
    if (jsonStr && jsonStr.charAt(0) === "{") {
      try {
        var parsed = JSON.parse(jsonStr);
        if (parsed && parsed.id) {
          result.push(parsed);
          continue;
        }
      } catch (e) {}
    }
  }
  return result;
}

// --- TAB 5: SETTINGS ---
function writeSettingsToSheet_(ss, settings) {
  var sheet5 = getOrCreateSheet(ss, "Cài Đặt Hệ Thống (Settings)");
  sheet5.clear();
  var nowIso = new Date().toISOString();
  var clean = JSON.parse(JSON.stringify(settings || {}));
  var rows5 = [
    ["Khóa Cấu Hình (Key)", "Giá Trị (Value)", "Cập Nhật Lúc"],
    ["settings_json", safeJsonCell_(clean), nowIso],
    ["ownerName", String(clean.ownerName || ""), nowIso],
    ["ownerPhone", String(clean.ownerPhone || ""), nowIso],
    ["ownerPassword", String(clean.ownerPassword || ""), nowIso],
    ["bankId", String(clean.bankId || ""), nowIso],
    ["bankName", String(clean.bankName || ""), nowIso],
    ["accountNumber", String(clean.accountNumber || ""), nowIso],
    ["accountName", String(clean.accountName || ""), nowIso],
    ["appTitle", String(clean.appTitle || ""), nowIso],
    ["appSubtitle", String(clean.appSubtitle || ""), nowIso],
    ["googleSheetUrl", String(clean.googleSheetUrl || ""), nowIso]
  ];
  sheet5.getRange(2, 2, rows5.length - 1, 1).setNumberFormat("@");
  sheet5.getRange(1, 1, rows5.length, 3).setValues(rows5);
  formatHeader(sheet5, "#334155");
}

function readSettingsFromSheet_(ss) {
  var sheet5 = ss.getSheetByName("Cài Đặt Hệ Thống (Settings)");
  if (!sheet5 || sheet5.getLastRow() <= 1) {
    return { hasSettingsSheet: false, settings: {} };
  }
  var values = sheet5.getRange(2, 1, sheet5.getLastRow() - 1, Math.max(2, sheet5.getLastColumn())).getValues();
  var parsedSettings = {};
  var overrides = {};
  for (var i = 0; i < values.length; i++) {
    var k = String(values[i][0] || "").trim();
    var v = values[i][1];
    if (!k) continue;
    if (k === "settings_json") {
      try {
        var jsonObj = JSON.parse(String(v || "{}"));
        if (jsonObj && typeof jsonObj === "object") {
          parsedSettings = jsonObj;
        }
      } catch (e) {}
    } else if (v !== "" && v !== null && v !== undefined) {
      overrides[k] = String(v);
    }
  }
  var merged = {};
  for (var key in parsedSettings) {
    if (Object.prototype.hasOwnProperty.call(parsedSettings, key)) {
      merged[key] = parsedSettings[key];
    }
  }
  for (var ok in overrides) {
    if (Object.prototype.hasOwnProperty.call(overrides, ok) && !merged[ok]) {
      merged[ok] = overrides[ok];
    }
  }
  return { hasSettingsSheet: true, settings: merged };
}

// --- TAB 4: AUDIT LOGS (APPEND-ONLY) ---
function readLogsFromSheet_(ss, limit) {
  var sheet4 = ss.getSheetByName("Nhật Ký Thao Tác (Logs)");
  if (!sheet4 || sheet4.getLastRow() <= 1) {
    return { logs: [], totalRows: 0 };
  }
  var lastRow = sheet4.getLastRow();
  var lastCol = Math.max(9, sheet4.getLastColumn());
  var startRow = Math.max(2, lastRow - limit + 1);
  var numRows = lastRow - startRow + 1;
  var values = sheet4.getRange(startRow, 1, numRows, lastCol).getValues();
  var logs = [];
  for (var i = values.length - 1; i >= 0; i--) {
    var row = values[i];
    var jsonCol = row.length >= 10 ? String(row[9] || "").trim() : "";
    if (jsonCol && jsonCol.charAt(0) === "{") {
      try {
        var parsed = JSON.parse(jsonCol);
        if (parsed && parsed.id) {
          logs.push(parsed);
          continue;
        }
      } catch (parseErr) {}
    }
    var legacyId = String(row[8] || "").trim();
    if (!legacyId || legacyId.indexOf("log-init-") === 0) continue;
    var tsVal = row[1];
    var tsIso = (tsVal instanceof Date)
      ? tsVal.toISOString()
      : (tsVal ? String(tsVal) : new Date().toISOString());
    logs.push({
      id: legacyId,
      timestamp: tsIso,
      actor: String(row[2] || "Hệ thống"),
      action: String(row[3] || "UPDATE_SETTINGS"),
      title: String(row[4] || ""),
      debtorName: row[5] && row[5] !== "-" ? String(row[5]) : undefined,
      amount: Number(row[6]) || 0,
      description: String(row[7] || "")
    });
  }
  return { logs: logs, totalRows: lastRow - 1 };
}

function appendAuditLogsToSheet(ss, logs) {
  var sheet4 = getOrCreateSheet(ss, "Nhật Ký Thao Tác (Logs)");
  if (sheet4.getLastRow() === 0) {
    sheet4.appendRow(["STT", "Thời Gian Ghi Nhận", "Người Thực Hiện", "Loại Thao Tác", "Tiêu Đề Nhật Ký", "Người Nợ Liên Quan", "Số Tiền (VNĐ)", "Chi Tiết Biến Động", "Mã Log ID", "Dữ Liệu Chi Tiết (JSON)"]);
    formatHeader(sheet4, "#d97706");
  } else if (sheet4.getLastColumn() < 10) {
    sheet4.getRange(1, 10).setValue("Dữ Liệu Chi Tiết (JSON)");
    formatHeader(sheet4, "#d97706");
  }

  var existingIds = {};
  var lastRow = sheet4.getLastRow();
  if (lastRow > 1) {
    var idValues = sheet4.getRange(2, 9, lastRow - 1, 1).getValues();
    for (var r = 0; r < idValues.length; r++) {
      var val = String(idValues[r][0]).trim();
      if (val) existingIds[val] = true;
    }
  }

  var ordered = (logs || []).slice().sort(function(a, b) {
    return String(a.timestamp || "").localeCompare(String(b.timestamp || ""));
  });

  var newRows = [];
  var nextStt = lastRow;
  for (var l = 0; l < ordered.length; l++) {
    var log = ordered[l];
    if (!log || !log.id || String(log.id).indexOf("log-init-") === 0 || existingIds[log.id]) continue;
    existingIds[log.id] = true;

    var actionLabel = log.action || "";
    if (actionLabel.indexOf("DELETE") !== -1 || actionLabel.indexOf("CLEAR") !== -1) {
      actionLabel = "🗑️ " + actionLabel + " (Đã xóa trên app)";
    }

    var jsonStr = "";
    try {
      jsonStr = JSON.stringify(log);
      if (jsonStr.length > 45000) {
        jsonStr = JSON.stringify({
          id: log.id,
          timestamp: log.timestamp,
          action: log.action,
          actor: log.actor,
          title: log.title,
          description: log.description,
          debtorId: log.debtorId,
          debtorName: log.debtorName,
          amount: log.amount,
          metadata: log.metadata
        });
      }
    } catch (jsonErr) {}

    newRows.push([
      nextStt++,
      log.timestamp ? new Date(log.timestamp).toLocaleString("vi-VN") : new Date().toLocaleString("vi-VN"),
      log.actor || "Chủ Sổ",
      actionLabel,
      log.title || "",
      log.debtorName || "-",
      Number(log.amount) || 0,
      log.description || "",
      log.id,
      jsonStr
    ]);
  }

  if (newRows.length > 0) {
    sheet4.getRange(lastRow + 1, 1, newRows.length, 10).setValues(newRows);
  }
  return newRows.length;
}

function getOrCreateSheet(ss, name) {
  var s = ss.getSheetByName(name);
  if (!s) { s = ss.insertSheet(name); }
  return s;
}

function formatHeader(sheet, bgColor) {
  var lastCol = sheet.getLastColumn();
  if (lastCol < 1) return;
  var range = sheet.getRange(1, 1, 1, lastCol);
  range.setBackground(bgColor);
  range.setFontColor("#ffffff");
  range.setFontWeight("bold");
  range.setHorizontalAlignment("center");
  sheet.setFrozenRows(1);
}
`;

/**
 * Sync entire database to Google Sheets via Apps Script Web App
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
    settings: payload.settings,
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
  const logsCount = (payload.auditLogs || loadAuditLogs()).length;
  try {
    recordAuditLog({
      action: 'SYNC_SHEETS',
      actor: 'Chủ Sổ (Admin)',
      title: 'Đồng bộ Google Sheets (Apps Script)',
      description: `Đã đồng bộ toàn bộ 5 bảng (${payload.debtors.length} người nợ, ${payload.transactions.length} giao dịch, ${payload.parties.length} cuộc vui, ${logsCount} nhật ký) lên Google Sheets qua Apps Script Web App.`,
      beforeState: 'Bắt đầu gửi dữ liệu sang Google Sheet',
      afterState: 'Đã hoàn tất đồng bộ 5 bảng qua Apps Script Web App',
      changes: [
        { fieldLabel: 'Phương thức', before: '-', after: 'Google Apps Script Web App v3' },
        { fieldLabel: 'Quy mô đồng bộ', before: '-', after: `${payload.debtors.length} người nợ · ${payload.transactions.length} GD · ${payload.parties.length} cuộc vui · ${logsCount} nhật ký` },
      ],
      metadata: {
        debtorsCount: payload.debtors.length,
        transactionsCount: payload.transactions.length,
        partiesCount: payload.parties.length,
        auditLogsCount: logsCount,
      },
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
      auditLogsCount: logsCount,
      totalActiveDebt: 0,
    },
  };
}

/**
 * Triggers a debounced background sync to Google Sheets
 */
export function triggerDebouncedAutoSync(
  payload: SyncDataPayload,
  onSyncComplete?: (result: SyncResult) => void
) {
  if (payload.settings?.autoSyncGoogleSheets === false) {
    if (autoSyncTimer) {
      clearTimeout(autoSyncTimer);
      autoSyncTimer = null;
    }
    return;
  }

  const appsScriptUrl = payload.settings?.googleAppsScriptUrl?.trim();
  if (!appsScriptUrl) {
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

      const result: SyncResult = await syncViaAppsScript(payload, appsScriptUrl);
      try {
        const currentSaved = loadSettings();
        if (currentSaved) {
          saveSettings({ ...currentSaved, lastGoogleSheetSyncAt: result.updatedAt });
        }
      } catch {
        // ignore
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
    } catch (err: any) {
      console.warn('Google Sheets auto-sync notice (non-fatal):', err?.message);
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
  }, 500);
}
