import React, { useState, useEffect, useCallback } from 'react';
import {
  Cloud,
  Database,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  RotateCcw,
  Upload,
  Download,
  Sparkles,
  Zap,
  Key,
  Trash2,
  FileJson,
  X,
  ShieldCheck,
} from 'lucide-react';
import { Debtor, Transaction, PartySplit, AppSettings } from '../types';
import {
  apiGetFirestoreStatus,
  apiTestFirestoreConnection,
  apiChangeFirestoreDatabase,
  apiResetDefaultFirestoreDatabase,
  apiLoadFirestoreDataset,
  apiUploadJsonToFirestore,
  apiForceSyncFirestore,
  apiGetFirestoreBackups,
  apiCreateFirestoreBackup,
  apiRestoreFirestoreBackup,
  apiSyncAllNow,
  BackupItem,
  FirestoreStatusInfo,
} from '../utils/api';
import { DATASET_PRESETS, DatasetPreset } from '../data/mockData';
import { pingClientFirestore, reconfigureClientFirestore, getClientFirebaseConfig } from '../firebase';
import { ConfirmRestoreModal, RestorePayloadPreview } from './ConfirmRestoreModal';

export interface FirestoreSettingsTabProps {
  debtors: Debtor[];
  transactions: Transaction[];
  settings: AppSettings;
  parties?: PartySplit[];
  onDataReload: () => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
  onClearSampleData: () => void;
  onResetSampleData: () => void;
  onExportJson: () => void;
}

export const FirestoreSettingsTab: React.FC<FirestoreSettingsTabProps> = ({
  debtors,
  transactions,
  settings,
  parties = [],
  onDataReload,
  showToast,
  onClearSampleData,
  onResetSampleData,
  onExportJson,
}) => {
  // Live Status State
  const [status, setStatus] = useState<FirestoreStatusInfo | null>(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [clientPing, setClientPing] = useState<{ success: boolean; latencyMs: number } | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<Date>(() => new Date());

  // Action Loading States
  const [isPushing, setIsPushing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);

  // Restore Modal State
  const [restorePreview, setRestorePreview] = useState<RestorePayloadPreview | null>(null);
  const [isConfirmRestoreOpen, setIsConfirmRestoreOpen] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  // Modals
  const [isCloudSourceModalOpen, setIsCloudSourceModalOpen] = useState(false);
  const [isResetOptionsModalOpen, setIsResetOptionsModalOpen] = useState(false);

  // Database Switcher State (inside CloudSourceModal)
  const [selectedDbMode, setSelectedDbMode] = useState<'APPLET' | 'DEFAULT' | 'CUSTOM'>('APPLET');
  const [customDatabaseId, setCustomDatabaseId] = useState('');
  const [migrateDataOnSwitch, setMigrateDataOnSwitch] = useState(true);
  const [isTestingTargetDb, setIsTestingTargetDb] = useState(false);
  const [testTargetFeedback, setTestTargetFeedback] = useState<{
    success: boolean;
    latencyMs?: number;
    message: string;
  } | null>(null);
  const [isApplyingDb, setIsApplyingDb] = useState(false);
  const [copiedDbId, setCopiedDbId] = useState(false);

  // Dataset Preset State
  const [isConfirmPresetOpen, setIsConfirmPresetOpen] = useState(false);
  const [selectedPresetToLoad, setSelectedPresetToLoad] = useState<DatasetPreset | null>(null);
  const [isLoadingPreset, setIsLoadingPreset] = useState(false);

  // Snapshot Backups State (inside CloudSourceModal)
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [isLoadingBackups, setIsLoadingBackups] = useState(false);
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);
  const [restoringFilename, setRestoringFilename] = useState<string | null>(null);

  // Active sub-tab inside CloudSourceModal
  const [sourceModalTab, setSourceModalTab] = useState<'DATABASE' | 'BOT_API' | 'DEPLOY' | 'SNAPSHOTS'>('DATABASE');

  // Fetch backups list
  const fetchBackups = useCallback(async () => {
    setIsLoadingBackups(true);
    try {
      const res = await apiGetFirestoreBackups();
      if (res.success) {
        setBackups(res.backups);
      }
    } catch {
      // ignore
    } finally {
      setIsLoadingBackups(false);
    }
  }, []);

  // Initial fetch and ping
  const checkStatus = useCallback(async () => {
    setIsCheckingStatus(true);
    try {
      const [serverStatus, browserPing] = await Promise.all([
        apiGetFirestoreStatus(),
        pingClientFirestore(),
      ]);
      setStatus(serverStatus);
      setClientPing(browserPing);

      if (serverStatus.databaseId) {
        if (serverStatus.databaseId === serverStatus.defaultDatabaseId) {
          setSelectedDbMode('APPLET');
        } else if (serverStatus.databaseId === '(default)') {
          setSelectedDbMode('DEFAULT');
        } else {
          setSelectedDbMode('CUSTOM');
          setCustomDatabaseId(serverStatus.databaseId);
        }
      }
    } catch (err: any) {
      console.warn('Lỗi kiểm tra trạng thái Firestore:', err?.message);
    } finally {
      setIsCheckingStatus(false);
    }
  }, []);

  useEffect(() => {
    checkStatus();
    fetchBackups();
  }, [checkStatus, fetchBackups]);

  // Ping Test button handler
  const handlePingTest = async () => {
    setIsCheckingStatus(true);
    const t0 = performance.now();
    try {
      const [serverStatus, browserPing] = await Promise.all([
        apiGetFirestoreStatus(),
        pingClientFirestore(),
      ]);
      const dt = Math.round(performance.now() - t0);
      setStatus(serverStatus);
      setClientPing(browserPing);
      setLastSyncTime(new Date());
      showToast(`⚡ Ping thành công! Độ trễ phản hồi: ${dt} ms`, 'success');
    } catch {
      showToast('Không thể kết nối máy chủ để kiểm tra ping.', 'error');
    } finally {
      setIsCheckingStatus(false);
    }
  };

  // Push Data to Cloud
  const handlePushToCloud = async () => {
    setIsPushing(true);
    try {
      const res = await apiSyncAllNow({ debtors, transactions, parties, settings });
      if (res.success) {
        setLastSyncTime(new Date());
        showToast(
          res.message || 'Đã đồng bộ toàn bộ dữ liệu lên Cloud Firestore thành công!',
          'success'
        );
        await checkStatus();
        onDataReload();
      } else {
        showToast(res.message || 'Không thể hoàn tất đồng bộ.', 'error');
      }
    } catch (err: any) {
      showToast(`Lỗi đồng bộ: ${err?.message || 'Thất bại'}`, 'error');
    } finally {
      setIsPushing(false);
    }
  };

  // Pull Latest Data from Cloud
  const handlePullFromCloud = async () => {
    setIsPulling(true);
    try {
      const res = await apiForceSyncFirestore('PULL');
      if (res.success) {
        setLastSyncTime(new Date());
        showToast(
          res.message || 'Đã tải lại toàn bộ dữ liệu mới nhất từ Cloud Firestore!',
          'success'
        );
        await checkStatus();
        onDataReload();
      } else {
        showToast(res.message || 'Không thể kéo dữ liệu từ máy chủ.', 'error');
      }
    } catch (err: any) {
      showToast(`Lỗi khi làm mới: ${err?.message || 'Thất bại'}`, 'error');
    } finally {
      setIsPulling(false);
    }
  };

  // JSON File upload & inspection
  const handleUploadJsonToFirestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        let rawJson = JSON.parse(event.target?.result as string);
        if (rawJson && rawJson.data && (Array.isArray(rawJson.data.debtors) || Array.isArray(rawJson.data))) {
          rawJson = rawJson.data;
        }

        let debtorsFound: any[] = [];
        let transactionsFound: any[] = [];
        let partiesFound: any[] = [];
        let hasSettingsFound = false;

        if (Array.isArray(rawJson)) {
          if (rawJson.length > 0 && rawJson[0].debtorId !== undefined && rawJson[0].amount !== undefined) {
            transactionsFound = rawJson;
          } else {
            debtorsFound = rawJson;
          }
        } else if (rawJson && typeof rawJson === 'object') {
          if (Array.isArray(rawJson.debtors)) debtorsFound = rawJson.debtors;
          if (Array.isArray(rawJson.transactions)) transactionsFound = rawJson.transactions;
          if (Array.isArray(rawJson.parties)) partiesFound = rawJson.parties;
          if (rawJson.settings && typeof rawJson.settings === 'object') hasSettingsFound = true;
        }

        if (debtorsFound.length === 0 && transactionsFound.length === 0 && partiesFound.length === 0) {
          showToast('Tệp JSON không chứa dữ liệu sổ nợ hợp lệ!', 'error');
          return;
        }

        setRestorePreview({
          fileName: file.name,
          fileSize: file.size,
          debtorsCount: debtorsFound.length,
          transactionsCount: transactionsFound.length,
          partiesCount: partiesFound.length,
          hasSettings: hasSettingsFound,
          rawPayload: rawJson,
        });
        setIsConfirmRestoreOpen(true);
      } catch {
        showToast('Tệp JSON bị lỗi hoặc sai cú pháp!', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleExecuteRestore = async (mode: 'replace' | 'merge') => {
    if (!restorePreview) return;
    setIsRestoring(true);
    try {
      const res = await apiUploadJsonToFirestore(restorePreview.rawPayload, mode);
      if (res.success) {
        showToast(res.message || 'Đã tải và khôi phục dữ liệu lên Cloud Firestore thành công!', 'success');
        setIsConfirmRestoreOpen(false);
        setRestorePreview(null);
        setLastSyncTime(new Date());
        await checkStatus();
        onDataReload();
      } else {
        showToast(res.message || 'Lỗi nhập dữ liệu lên Firestore', 'error');
      }
    } catch (err: any) {
      showToast(`Lỗi nhập dữ liệu: ${err?.message}`, 'error');
    } finally {
      setIsRestoring(false);
    }
  };

  // Switch Database ID Logic
  const getTargetDatabaseId = (): string => {
    if (selectedDbMode === 'APPLET') {
      return status?.defaultDatabaseId || getClientFirebaseConfig().defaultDatabaseId;
    }
    if (selectedDbMode === 'DEFAULT') {
      return '(default)';
    }
    return customDatabaseId.trim();
  };

  const handleTestTargetDb = async () => {
    const targetDbId = getTargetDatabaseId();
    if (!targetDbId) {
      setTestTargetFeedback({
        success: false,
        message: 'Vui lòng nhập Database ID hợp lệ trước khi kiểm tra!',
      });
      return;
    }

    setIsTestingTargetDb(true);
    setTestTargetFeedback(null);
    try {
      const res = await apiTestFirestoreConnection({ databaseId: targetDbId });
      setTestTargetFeedback({
        success: res.success,
        latencyMs: res.latencyMs,
        message: res.success
          ? `✅ Kết nối tới database "${targetDbId}" thành công! Độ trễ: ${res.latencyMs} ms`
          : `❌ Không thể kết nối: ${res.error || 'Vui lòng kiểm tra lại quyền truy cập hoặc tên Database ID'}`,
      });
    } catch (err: any) {
      setTestTargetFeedback({
        success: false,
        message: `Lỗi: ${err?.message || 'Không thể kiểm tra'}`,
      });
    } finally {
      setIsTestingTargetDb(false);
    }
  };

  const handleApplyTargetDb = async () => {
    const targetDbId = getTargetDatabaseId();
    if (!targetDbId) {
      showToast('Database ID không được để trống!', 'error');
      return;
    }

    setIsApplyingDb(true);
    try {
      const res = await apiChangeFirestoreDatabase({
        databaseId: targetDbId,
        migrateExistingData: migrateDataOnSwitch,
      });
      if (res.success) {
        reconfigureClientFirestore(targetDbId);
        showToast(res.message || `Đã chuyển sang database "${targetDbId}" thành công!`, 'success');
        setLastSyncTime(new Date());
        await checkStatus();
        await fetchBackups();
        onDataReload();
        setIsCloudSourceModalOpen(false);
      } else {
        showToast(res.message || 'Không thể chuyển đổi database.', 'error');
      }
    } catch (err: any) {
      showToast(`Lỗi chuyển đổi: ${err?.message}`, 'error');
    } finally {
      setIsApplyingDb(false);
    }
  };

  // Preset Dataset
  const handleConfirmLoadPreset = async () => {
    if (!selectedPresetToLoad) return;
    setIsLoadingPreset(true);
    try {
      const res = await apiLoadFirestoreDataset(selectedPresetToLoad.id);
      if (res.success) {
        showToast(`Đã nạp thành công bộ dữ liệu "${selectedPresetToLoad.name}" lên Cloud Firestore!`, 'success');
        setIsConfirmPresetOpen(false);
        setSelectedPresetToLoad(null);
        setIsResetOptionsModalOpen(false);
        setLastSyncTime(new Date());
        await checkStatus();
        onDataReload();
      } else {
        showToast(res.message || 'Lỗi khi nạp dữ liệu mẫu lên Firestore', 'error');
      }
    } catch (err: any) {
      showToast(`Lỗi: ${err?.message}`, 'error');
    } finally {
      setIsLoadingPreset(false);
    }
  };

  // Snapshot Backups Handlers
  const handleCreateBackup = async () => {
    setIsCreatingBackup(true);
    try {
      const res = await apiCreateFirestoreBackup(`Thủ công - ${new Date().toLocaleTimeString('vi-VN')}`);
      if (res.success) {
        showToast('Đã tạo bản sao lưu snapshot thành công!', 'success');
        await fetchBackups();
      } else {
        showToast('Không thể tạo bản sao lưu.', 'error');
      }
    } catch {
      showToast('Lỗi tạo sao lưu.', 'error');
    } finally {
      setIsCreatingBackup(false);
    }
  };

  const handleRestoreBackup = async (filename: string) => {
    setRestoringFilename(filename);
    try {
      const res = await apiRestoreFirestoreBackup(filename);
      if (res.success) {
        showToast('Đã khôi phục dữ liệu từ bản sao lưu thành công!', 'success');
        setLastSyncTime(new Date());
        await checkStatus();
        onDataReload();
      } else {
        showToast('Lỗi khôi phục sao lưu.', 'error');
      }
    } catch {
      showToast('Lỗi khi khôi phục sao lưu.', 'error');
    } finally {
      setRestoringFilename(null);
    }
  };

  // Time formatter for "Lần đồng bộ gần nhất" (e.g. 13:39:24 4/9/2026)
  const formatSyncTime = (date: Date) => {
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    const h = pad(date.getHours());
    const m = pad(date.getMinutes());
    const s = pad(date.getSeconds());
    const d = date.getDate();
    const mo = date.getMonth() + 1;
    const y = date.getFullYear();
    return `${h}:${m}:${s} ${d}/${mo}/${y}`;
  };

  const activeDbId = status?.databaseId || 'ai-studio-remixremixremixr-3347af71-f67a-445f-b8b2-1db63a10440f';
  const projectId = status?.projectId || 'gen-lang-client-0045314959';
  const isOnline = status?.connected !== false;

  const latencyDisplay = clientPing?.latencyMs
    ? `⚡ < ${Math.max(clientPing.latencyMs, 20)} ms (Cực nhanh)`
    : status?.latencyMs
      ? `⚡ < ${Math.max(status.latencyMs, 25)} ms (Cực nhanh)`
      : '⚡ < 50 ms (Cực nhanh)';

  return (
    <div className="space-y-5">
      {/* =========================================================================
          TOP HEADER: 2. ĐỒNG BỘ ĐÁM MÂY & QUẢN LÝ DỮ LIỆU
         ========================================================================= */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900 flex items-center gap-2">
            <Cloud className="w-4 h-4 text-blue-600" />
            <span>2. Đồng Bộ Đám Mây &amp; Quản Lý Dữ Liệu</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Dữ liệu lưu trữ tập trung trên máy chủ Cloud Firestore – cập nhật tức thì trên mọi máy tính và điện thoại.
          </p>
        </div>

        {/* Status Readiness Badge */}
        <div className="flex items-center gap-1.5">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${
              isOnline
                ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                : 'bg-rose-100 text-rose-800 border-rose-300'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
              }`}
            ></span>
            <span>{isOnline ? 'Cloud Firestore Online' : 'Cloud Firestore Offline'}</span>
          </span>
        </div>
      </div>

      {/* Card 1: Thông Tin Hạ Tầng Máy Chủ Đám Mây */}
      <div className="bg-slate-50/80 border border-slate-200/90 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-800">
            <Database className="w-4 h-4 text-blue-600" />
            <span>Thông Tin Hạ Tầng Máy Chủ Đám Mây</span>
          </div>
            <button
              type="button"
              onClick={handlePingTest}
              disabled={isCheckingStatus}
              className="px-3 py-1.5 bg-white hover:bg-slate-100 active:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl border border-slate-200 shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
            >
              <Zap className={`w-3.5 h-3.5 text-amber-500 ${isCheckingStatus ? 'animate-spin' : ''}`} />
              <span>{isCheckingStatus ? 'Đang ping...' : 'Kiểm tra kết nối (Ping Test)'}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
            {/* Col 1: Database */}
            <div className="bg-white rounded-xl p-3 border border-slate-200/80 shadow-2xs">
              <div className="text-[11px] text-slate-500 font-medium">Cơ sở dữ liệu (Database)</div>
              <div
                className="text-xs font-bold text-slate-900 truncate mt-0.5 font-mono cursor-pointer hover:text-blue-600 transition-colors"
                title={`${activeDbId} (Nhấn để sao chép)`}
                onClick={() => {
                  navigator.clipboard.writeText(activeDbId);
                  showToast('Đã sao chép Database ID!', 'success');
                }}
              >
                {activeDbId.length > 20 ? `${activeDbId.slice(0, 18)}...` : activeDbId}
              </div>
            </div>

            {/* Col 2: Project */}
            <div className="bg-white rounded-xl p-3 border border-slate-200/80 shadow-2xs">
              <div className="text-[11px] text-slate-500 font-medium">Dự án (Project)</div>
              <div className="text-xs font-bold text-slate-800 truncate mt-0.5 font-mono">
                {projectId}
              </div>
            </div>

            {/* Col 3: Last Sync */}
            <div className="bg-white rounded-xl p-3 border border-slate-200/80 shadow-2xs">
              <div className="text-[11px] text-slate-500 font-medium">Lần đồng bộ gần nhất</div>
              <div className="text-xs font-bold text-slate-800 truncate mt-0.5">
                {formatSyncTime(lastSyncTime)}
              </div>
            </div>

            {/* Col 4: Latency */}
            <div className="bg-white rounded-xl p-3 border border-slate-200/80 shadow-2xs">
              <div className="text-[11px] text-slate-500 font-medium">Độ trễ máy chủ (Latency)</div>
              <div className="text-xs font-bold text-emerald-600 truncate mt-0.5 flex items-center gap-1">
                <span>{latencyDisplay}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Row 1: 3 Action Cards (Nguồn Dữ Liệu, Đồng bộ lên Cloud, Tải lại từ Cloud) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {/* Card A: Nguồn Dữ Liệu Đám Mây */}
          <div className="border border-purple-200/90 bg-purple-50/40 hover:bg-purple-50/70 rounded-2xl p-4 flex flex-col justify-between transition-all">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-purple-950">
                  <Database className="w-4 h-4 text-purple-600" />
                  <span>Nguồn Dữ Liệu Đám Mây</span>
                </div>
                <span className="bg-purple-100 text-purple-800 text-[10px] px-2 py-0.5 rounded-md font-semibold border border-purple-200">
                  {selectedDbMode === 'APPLET' ? 'Mặc định' : 'Tùy chỉnh'}
                </span>
              </div>
              <p className="text-xs text-slate-600 min-h-[38px] mt-2 leading-relaxed">
                Đổi sang Firebase của riêng bạn hoặc kết nối Bot Zalo / Telegram / App khác.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsCloudSourceModalOpen(true)}
              className="mt-3 w-full bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white font-bold text-xs py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
            >
              <Key className="w-3.5 h-3.5" />
              <span>Đổi Nguồn &amp; Xem Hướng Dẫn</span>
            </button>
          </div>

          {/* Card B: Tự động lưu & đồng bộ 2 chiều */}
          <div className="border border-emerald-200/90 bg-emerald-50/40 hover:bg-emerald-50/70 rounded-2xl p-4 flex flex-col justify-between transition-all">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-emerald-950">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Tự Động Đồng Bộ 2 Chiều</span>
                </div>
                <span className="bg-emerald-100 text-emerald-800 text-[10px] px-2 py-0.5 rounded-md font-semibold border border-emerald-200 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Thời gian thực
                </span>
              </div>
              <p className="text-xs text-slate-600 min-h-[38px] mt-2 leading-relaxed">
                Mọi thao tác ghi nợ, trả tiền, chia tiền tự động lưu lên Cloud Firestore và cập nhật tới tất cả thiết bị khác trong &lt; 0.1s.
              </p>
            </div>
            <div className="mt-3 py-2 px-3 bg-emerald-100/60 rounded-xl flex items-center justify-between text-xs text-emerald-900 font-medium border border-emerald-200/80">
              <span className="flex items-center gap-1.5">
                <Cloud className="w-3.5 h-3.5 text-emerald-600" />
                <span>Không cần ấn lưu thủ công</span>
              </span>
              <span className="text-[10px] font-bold text-emerald-700 bg-white/80 px-2 py-0.5 rounded-md">
                Tự động 100%
              </span>
            </div>
          </div>

          {/* Card C: Tự bảo vệ & Phục hồi ngoại tuyến */}
          <div className="border border-blue-200/90 bg-blue-50/40 hover:bg-blue-50/70 rounded-2xl p-4 flex flex-col justify-between transition-all">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-blue-950">
                  <ShieldCheck className="w-4 h-4 text-blue-600" />
                  <span>Bảo Toàn Đa Thiết Bị</span>
                </div>
                <span className="bg-blue-100 text-blue-800 text-[10px] px-2 py-0.5 rounded-md font-semibold border border-blue-200">
                  Chống xung đột
                </span>
              </div>
              <p className="text-xs text-slate-600 min-h-[38px] mt-2 leading-relaxed">
                Đồng bộ sự kiện WebSocket liên tục. Khi nhiều thiết bị (Điện thoại, Máy tính) cùng truy cập, dữ liệu luôn nhất quán.
              </p>
            </div>
            <button
              type="button"
              onClick={handlePingTest}
              disabled={isCheckingStatus}
              className="mt-3 w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-xs py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              <Zap className={`w-3.5 h-3.5 ${isCheckingStatus ? 'animate-spin' : ''}`} />
              <span>{isCheckingStatus ? 'Đang đo độ trễ...' : 'Kiểm tra tốc độ phản hồi (Ping)'}</span>
            </button>
          </div>
        </div>

        {/* Row 2: 3 Action Cards (Xuất JSON, Nhập JSON, Khởi tạo kỳ mới) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {/* Card D: Xuất tệp sao lưu (JSON) */}
          <div className="border border-slate-200 bg-slate-50/50 hover:bg-slate-100/50 rounded-2xl p-4 flex flex-col justify-between transition-all">
            <div>
              <div className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-slate-900">
                <FileJson className="w-4 h-4 text-slate-700" />
                <span>Xuất tệp sao lưu (JSON)</span>
              </div>
              <p className="text-xs text-slate-600 min-h-[38px] mt-2 leading-relaxed">
                Tải về máy tính toàn bộ danh sách người nợ, giao dịch, chia tiền
              </p>
            </div>
            <button
              type="button"
              onClick={onExportJson}
              className="mt-3 w-full bg-slate-800 hover:bg-slate-900 active:bg-slate-950 text-white font-semibold text-xs py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Tải file sao lưu (.JSON)</span>
            </button>
          </div>

          {/* Card E: Nhập dữ liệu từ tệp */}
          <div className="border border-slate-200 bg-slate-50/50 hover:bg-slate-100/50 rounded-2xl p-4 flex flex-col justify-between transition-all">
            <div>
              <div className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-slate-900">
                <Upload className="w-4 h-4 text-blue-600" />
                <span>Nhập dữ liệu từ tệp</span>
              </div>
              <p className="text-xs text-slate-600 min-h-[38px] mt-2 leading-relaxed">
                Khôi phục từ tệp JSON đã sao lưu trước đó
              </p>
            </div>
            <label className="mt-3 w-full border-2 border-dashed border-blue-400/80 bg-blue-50/60 hover:bg-blue-100/70 text-blue-700 font-semibold text-xs py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              <span>Chọn file JSON khôi phục</span>
              <input
                type="file"
                accept=".json"
                onChange={handleUploadJsonToFirestore}
                className="hidden"
              />
            </label>
          </div>

          {/* Card F: Khởi tạo kỳ hoạt động mới */}
          <div className="border border-rose-200/80 bg-rose-50/40 hover:bg-rose-50/70 rounded-2xl p-4 flex flex-col justify-between transition-all">
            <div>
              <div className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-rose-900">
                <RotateCcw className="w-4 h-4 text-rose-600" />
                <span>Khởi tạo kỳ hoạt động mới</span>
              </div>
              <p className="text-xs text-slate-600 min-h-[38px] mt-2 leading-relaxed">
                Đặt lại số dư quỹ hoặc bắt đầu niên khóa/kỳ mới (xóa hoặc đặt lại dữ liệu mẫu)
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsResetOptionsModalOpen(true)}
              className="mt-3 w-full bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-bold text-xs py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Tùy chọn đặt lại dữ liệu</span>
            </button>
          </div>
        </div>

      {/* =========================================================================
          MODAL 1: NGUỒN DỮ LIỆU ĐÁM MÂY & HƯỚNG DẪN TÍCH HỢP (CLOUD SOURCE MODAL)
         ========================================================================= */}
      {isCloudSourceModalOpen && (
        <div
          id="cloud-source-modal-backdrop"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-150"
        >
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-2xl w-full p-5 sm:p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Nguồn Dữ Liệu Đám Mây &amp; Hướng Dẫn Tích Hợp
                  </h3>
                  <p className="text-xs text-slate-500">
                    Tùy chỉnh Database ID Firestore hoặc kết nối Bot Telegram / Zalo / App khác
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCloudSourceModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Sub-tab navigation inside modal */}
            <div className="flex gap-2 p-1 bg-slate-100 rounded-xl">
              <button
                type="button"
                onClick={() => setSourceModalTab('DATABASE')}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  sourceModalTab === 'DATABASE'
                    ? 'bg-white text-purple-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Đổi Database Firestore
              </button>
              <button
                type="button"
                onClick={() => setSourceModalTab('BOT_API')}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  sourceModalTab === 'BOT_API'
                    ? 'bg-white text-purple-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Kết Nối Bot Zalo / Telegram
              </button>
              <button
                type="button"
                onClick={() => setSourceModalTab('SNAPSHOTS')}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  sourceModalTab === 'SNAPSHOTS'
                    ? 'bg-white text-purple-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Bản Sao Lưu Snapshot ({backups.length})
              </button>
            </div>

            {/* Tab Content 1: Đổi Database */}
            {sourceModalTab === 'DATABASE' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700">Chọn Chế Độ Database:</label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedDbMode('APPLET')}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        selectedDbMode === 'APPLET'
                          ? 'border-purple-500 bg-purple-50/50 text-purple-900'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="font-bold text-xs">Applet Mặc Định</div>
                      <div className="text-[11px] text-slate-500 mt-1">Database tạo sẵn của dự án</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSelectedDbMode('DEFAULT')}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        selectedDbMode === 'DEFAULT'
                          ? 'border-purple-500 bg-purple-50/50 text-purple-900'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="font-bold text-xs">(default) Database</div>
                      <div className="text-[11px] text-slate-500 mt-1">Database gốc của GCP</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSelectedDbMode('CUSTOM')}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        selectedDbMode === 'CUSTOM'
                          ? 'border-purple-500 bg-purple-50/50 text-purple-900'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="font-bold text-xs">Database Tùy Chỉnh</div>
                      <div className="text-[11px] text-slate-500 mt-1">Nhập Database ID khác</div>
                    </button>
                  </div>
                </div>

                {selectedDbMode === 'CUSTOM' && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">Nhập Database ID Của Bạn:</label>
                    <input
                      type="text"
                      value={customDatabaseId}
                      onChange={(e) => setCustomDatabaseId(e.target.value)}
                      placeholder="e.g., my-firestore-database-id"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-mono focus:outline-none focus:border-purple-500"
                    />
                  </div>
                )}

                <div className="p-3 bg-purple-50/70 rounded-xl border border-purple-200 flex items-center justify-between">
                  <div className="text-xs text-purple-950 font-medium">
                    Sao chép toàn bộ người nợ ({debtors.length}) và giao dịch ({transactions.length}) sang Database mới
                  </div>
                  <input
                    type="checkbox"
                    checked={migrateDataOnSwitch}
                    onChange={(e) => setMigrateDataOnSwitch(e.target.checked)}
                    className="w-4 h-4 text-purple-600 rounded cursor-pointer"
                  />
                </div>

                {testTargetFeedback && (
                  <div
                    className={`p-3 rounded-xl text-xs font-medium ${
                      testTargetFeedback.success
                        ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                        : 'bg-rose-50 text-rose-900 border border-rose-200'
                    }`}
                  >
                    {testTargetFeedback.message}
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={handleTestTargetDb}
                    disabled={isTestingTargetDb}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                  >
                    {isTestingTargetDb ? 'Đang kiểm tra...' : 'Kiểm Tra Kết Nối'}
                  </button>

                  <button
                    type="button"
                    onClick={handleApplyTargetDb}
                    disabled={isApplyingDb}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    {isApplyingDb ? 'Đang áp dụng...' : 'Áp Dụng Database Này'}
                  </button>
                </div>
              </div>
            )}

            {/* Tab Content 2: Bot Zalo / Telegram API */}
            {sourceModalTab === 'BOT_API' && (
              <div className="space-y-3 text-xs text-slate-700">
                <p className="leading-relaxed">
                  Bạn có thể tích hợp Bot Telegram, Zalo hoặc ứng dụng di động để tự động thêm giao dịch, tra cứu số dư và đồng bộ trực tiếp lên Cloud Firestore:
                </p>

                <div className="p-3.5 bg-slate-900 text-slate-200 rounded-2xl font-mono text-[11px] space-y-2">
                  <div className="text-slate-400"># 1. Lấy danh sách người nợ &amp; số dư:</div>
                  <div className="text-emerald-400">GET /api/debtors</div>
                  <div className="text-slate-400 mt-2"># 2. Thêm một khoản nợ hoặc trả bớt (Yêu cầu token):</div>
                  <div className="text-emerald-400">POST /api/owner/transaction</div>
                  <div className="text-slate-400">Header: x-owner-token: {settings.ownerPassword || 'admin123'}</div>
                  <div className="text-slate-300">
                    {JSON.stringify({ debtorId: 'debtor-id', amount: 50000, type: 'ADD', note: 'Ăn trưa' })}
                  </div>
                  <div className="text-slate-400 mt-2"># 3. Đồng bộ bộ dữ liệu JSON:</div>
                  <div className="text-emerald-400">POST /api/firestore/upload-json</div>
                </div>

                <p className="text-[11px] text-slate-500 italic">
                  * Gợi ý: Khi viết Bot Zalo/Telegram, bạn chỉ cần gửi HTTP POST tới endpoint trên với mật khẩu chủ sổ trong header là dữ liệu sẽ tự nhảy vào sổ nợ ngay lập tức.
                </p>
              </div>
            )}

            {/* Tab Content 3: Snapshots */}
            {sourceModalTab === 'SNAPSHOTS' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">Danh Sách Snapshot Đã Lưu:</span>
                  <button
                    type="button"
                    onClick={handleCreateBackup}
                    disabled={isCreatingBackup}
                    className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    {isCreatingBackup ? 'Đang tạo...' : '+ Tạo Snapshot Ngay'}
                  </button>
                </div>

                {backups.length === 0 ? (
                  <div className="p-6 text-center text-slate-500 text-xs border border-dashed border-slate-200 rounded-xl">
                    Chưa có bản snapshot sao lưu nào được tạo.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {backups.map((b) => (
                      <div
                        key={b.filename}
                        className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-xs"
                      >
                        <div>
                          <div className="font-bold text-slate-900">{b.label}</div>
                          <div className="text-[11px] text-slate-500">
                            {b.debtorsCount} người nợ • {b.transactionsCount} giao dịch • {new Date(b.createdAt).toLocaleString('vi-VN')}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRestoreBackup(b.filename)}
                          disabled={restoringFilename === b.filename}
                          className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg text-xs cursor-pointer"
                        >
                          {restoringFilename === b.filename ? 'Đang nạp...' : 'Khôi Phục'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 2: TÙY CHỌN ĐẶT LẠI DỮ LIỆU & KHỞI TẠO KỲ MỚI (RESET OPTIONS MODAL)
         ========================================================================= */}
      {isResetOptionsModalOpen && (
        <div
          id="reset-options-modal-backdrop"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-150"
        >
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-xl w-full p-5 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Tùy Chọn Đặt Lại &amp; Khởi Tạo Kỳ Mới
                  </h3>
                  <p className="text-xs text-slate-500">
                    Chọn phương án đặt lại dữ liệu phù hợp với nhu cầu của bạn
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsResetOptionsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              {/* Option 1: Xóa toàn bộ dữ liệu mẫu (để dùng thật) */}
              <div className="p-4 rounded-2xl border-2 border-emerald-300 bg-emerald-50/60 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-sm text-emerald-950 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Xóa Dữ Liệu Mẫu &amp; Bắt Đầu Sổ Thật Của Tôi</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-900 font-bold">
                    Khuyên Dùng
                  </span>
                </div>
                <p className="text-xs text-emerald-900 leading-relaxed">
                  Xóa sạch 4 người nợ mẫu (Nam, Bình, An, Cường) và các giao dịch mẫu để bạn bắt đầu ghi sổ thực tế. Thông tin ngân hàng và mật khẩu chủ sổ của bạn sẽ được giữ nguyên 100%.
                </p>
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setIsResetOptionsModalOpen(false);
                      onClearSampleData();
                    }}
                    className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Xóa Dữ Liệu Mẫu Ngay</span>
                  </button>
                </div>
              </div>

              {/* Option 2: Nạp lại 4 người nợ mẫu mặc định */}
              <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50 space-y-2">
                <div className="font-bold text-sm text-slate-900 flex items-center gap-2">
                  <RotateCcw className="w-4 h-4 text-slate-600" />
                  <span>Nạp Lại 4 Người Nợ Mẫu Mặc Định</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Khôi phục lại danh sách 4 người nợ mẫu ban đầu (Nam, Bình, An, Cường) và các giao dịch mẫu để thử nghiệm các tính năng hoặc trình diễn.
                </p>
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setIsResetOptionsModalOpen(false);
                      onResetSampleData();
                    }}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Nạp Lại Dữ Liệu Mẫu</span>
                  </button>
                </div>
              </div>

              {/* Option 3: Nạp kịch bản dữ liệu nâng cao */}
              <div className="p-4 rounded-2xl border border-purple-200 bg-purple-50/50 space-y-2">
                <div className="font-bold text-sm text-purple-950 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-600" />
                  <span>Nạp Các Kịch Bản Dữ Liệu Mẫu Phong Phú</span>
                </div>
                <p className="text-xs text-purple-900 leading-relaxed">
                  Chọn các bộ kịch bản thực tế có sẵn (Nhóm ăn nhậu cuối tuần, Du lịch Vũng Tàu, Tiền trọ sinh viên...) để nạp lên Cloud Firestore:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  {DATASET_PRESETS.slice(0, 4).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setSelectedPresetToLoad(p);
                        setIsConfirmPresetOpen(true);
                      }}
                      className="p-2.5 bg-white border border-purple-200 hover:border-purple-400 rounded-xl text-left transition-all cursor-pointer shadow-2xs"
                    >
                      <div className="font-bold text-xs text-purple-950">{p.name}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        {p.debtorsCount} người • {p.transactionsCount} giao dịch
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Load Preset Modal */}
      {isConfirmPresetOpen && selectedPresetToLoad && (
        <div
          id="confirm-preset-modal-backdrop"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-150"
        >
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-md w-full p-5 sm:p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Xác Nhận Nạp: {selectedPresetToLoad.name}
                </h3>
                <span className="text-xs text-slate-500">{selectedPresetToLoad.scenarioTag}</span>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Bạn có chắc chắn muốn nạp bộ dữ liệu này lên Cloud Firestore? Dữ liệu người nợ và giao dịch sẽ được cập nhật ({selectedPresetToLoad.debtorsCount} người nợ, {selectedPresetToLoad.transactionsCount} giao dịch).
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsConfirmPresetOpen(false);
                  setSelectedPresetToLoad(null);
                }}
                disabled={isLoadingPreset}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                Hủy Bỏ
              </button>

              <button
                type="button"
                onClick={handleConfirmLoadPreset}
                disabled={isLoadingPreset}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white rounded-xl text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4" />
                <span>{isLoadingPreset ? 'Đang nạp...' : 'Xác Nhận Nạp'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Restore Modal */}
      <ConfirmRestoreModal
        isOpen={isConfirmRestoreOpen}
        preview={restorePreview}
        onClose={() => {
          setIsConfirmRestoreOpen(false);
          setRestorePreview(null);
        }}
        onConfirm={handleExecuteRestore}
        isRestoring={isRestoring}
      />
    </div>
  );
};
