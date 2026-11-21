/**
 * ============================================================================
 * GHI CHÚ CHỈNH SỬA / CHANGELOG:
 * - Xóa số điện thoại người nợ: Loại bỏ hoàn toàn trường phone khi lưu/cập nhật thông tin con nợ.
 * - Thêm số điện thoại chủ nợ: Hỗ trợ cấu hình ownerPhone trong AppSettings.
 * - YÊU CẦU: Bắt buộc nhập lại mật khẩu quản lý khi tải lại trang (F5 / Refresh).
 * - SỬA LỖI MODAL: AddDebtorModal (z-[60]) luôn hiển thị nổi bật ở phía TRÊN hộp thoại thông tin (z-50).
 * ============================================================================
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RefreshCw, AlertCircle, LogOut, CheckCircle2, X } from 'lucide-react';
import { Debtor, Transaction, PartySplit, AppSettings, AuditLog } from './types';
import {
  fetchOwnerData,
  hasInFlightMutation,
  getClientMutationSeq,
  getLastClientMutationAt,
  apiSaveDebtor,
  apiDeleteDebtor,
  apiSaveTransaction,
  apiUpdateTransaction,
  apiDeleteTransaction,
  apiSavePartySplit,
  apiUpdatePartySplit,
  apiDeletePartySplit,
  apiSaveSettings,
  apiFetchRemoteAuditLogs,
  getStoredOwnerToken,
  removeStoredOwnerToken,
} from './utils/api';
import {
  loadSettings,
  saveSettings,
  getDebtorBalance,
  deepCleanSessionData,
  loadAuditLogs,
  recordAuditLog,
  getAuditEnvironmentContext,
} from './utils/storage';
import { triggerSettledCelebration } from './utils/confetti';
import { Header } from './components/Header';
import { OwnerDashboard } from './components/OwnerDashboard';
import { GuestPortal } from './components/GuestPortal';
import { UnifiedLoginView } from './components/UnifiedLoginView';
import { SettingsView } from './components/SettingsView';
import { AdminAuditLogsTab } from './components/AdminAuditLogsTab';
import { AddDebtorModal } from './components/AddDebtorModal';
import { AddTransactionModal } from './components/AddTransactionModal';
import { EditTransactionModal } from './components/EditTransactionModal';
import { SplitBillModal } from './components/SplitBillModal';
import { DebtorDetailModal } from './components/DebtorDetailModal';
import { ImageViewerModal } from './components/ImageViewerModal';
import { BottomNavBar } from './components/BottomNavBar';
import { OfflineIndicator } from './components/OfflineIndicator';
import { StartupConnectionGate } from './components/StartupConnectionGate';
import { WorkspaceDataLoader, WorkspaceConnectionError } from './components/WorkspaceDataLoader';

export default function App() {
  const [debtors, setDebtors] = useState<Debtor[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [parties, setParties] = useState<PartySplit[]>([]);
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(() => loadAuditLogs());
  const [remoteLogsStatus, setRemoteLogsStatus] = useState<{
    isSyncing?: boolean;
    needsAppsScriptUpgrade?: boolean;
    hiddenByClearCount?: number;
    source?: string;
    sheetsError?: string;
  }>({});
  const [cloudStatus, setCloudStatus] = useState<{
    checked?: boolean;
    checking?: boolean;
    configured: boolean;
    connected: boolean;
    needsUpgrade?: boolean;
    error: string | null;
    errorCode?: string | null;
  }>({ checked: false, checking: true, configured: true, connected: false, error: null });

  const [ownerDataStatus, setOwnerDataStatus] = useState<'IDLE' | 'LOADING' | 'READY' | 'ERROR'>('IDLE');
  const ownerDataStatusRef = useRef<'IDLE' | 'LOADING' | 'READY' | 'ERROR'>('IDLE');
  ownerDataStatusRef.current = ownerDataStatus;

  useEffect(() => {
    const handleLogRecorded = (e: any) => {
      if (e?.detail) {
        setAuditLogs((prev) => [e.detail, ...prev]);
      }
    };
    const handleLogsCleared = () => {
      setAuditLogs([]);
      setRemoteLogsStatus((prev) => ({ ...prev, hiddenByClearCount: 0 }));
    };
    window.addEventListener('audit-log-recorded', handleLogRecorded);
    window.addEventListener('audit-logs-cleared', handleLogsCleared);
    return () => {
      window.removeEventListener('audit-log-recorded', handleLogRecorded);
      window.removeEventListener('audit-logs-cleared', handleLogsCleared);
    };
  }, []);

  // View & Auth State (OWNER | GUEST | SETTINGS | LOGS)
  // Khởi tạo view ban đầu theo hash URL
  const [currentView, setCurrentView] = useState<'OWNER' | 'GUEST' | 'SETTINGS' | 'LOGS'>(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.toLowerCase();
      if (hash.startsWith('#settings')) return 'SETTINGS';
      if (hash.startsWith('#logs')) return 'LOGS';
      if (hash.startsWith('#owner') || hash.startsWith('#admin')) return 'OWNER';
      if (hash.startsWith('#guest')) return 'GUEST';
    }
    return 'GUEST';
  });

  // Luôn bắt đầu với false khi tải hoặc tải lại trang để bắt buộc nhập lại mật khẩu
  const [isOwnerAuthenticated, setIsOwnerAuthenticated] = useState<boolean>(false);

  // Theo dõi thời điểm rời ứng dụng để tự động đăng xuất
  const lastLeaveTimeRef = useRef<number | null>(null);

  const [guestInitialDebtor, setGuestInitialDebtor] = useState<Debtor | null>(null);

  // Operational Modals
  const [isAddDebtorOpen, setIsAddDebtorOpen] = useState(false);
  const [editingDebtor, setEditingDebtor] = useState<Debtor | null>(null);

  const [isAddTxOpen, setIsAddTxOpen] = useState(false);
  const [defaultTxDebtorId, setDefaultTxDebtorId] = useState<string | undefined>(undefined);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);

  const [isSplitPartyOpen, setIsSplitPartyOpen] = useState(false);
  const [editingParty, setEditingParty] = useState<PartySplit | null>(null);
  const [selectedDetailDebtor, setSelectedDetailDebtor] = useState<Debtor | null>(null);

  // Image viewer modal
  const [viewImageUrl, setViewImageUrl] = useState<string | null>(null);
  const [viewImageTitle, setViewImageTitle] = useState<string>('Ảnh hóa đơn / Chứng từ');

  // Track timestamp of recent user actions to protect against race condition overwrites
  const lastActionTimeRef = useRef<number>(0);
  const lastFocusRefreshRef = useRef<number>(0);

  // Non-blocking toast notification
  const [appToast, setAppToast] = useState<{ text: string; type: 'error' | 'success' | 'info' } | null>(null);
  const appToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showAppToast = useCallback((text: string, type: 'error' | 'success' | 'info' = 'error') => {
    setAppToast({ text, type });
    if (appToastTimerRef.current) {
      clearTimeout(appToastTimerRef.current);
    }
    appToastTimerRef.current = setTimeout(() => {
      setAppToast(null);
    }, type === 'error' ? 6000 : 3500);
  }, []);

  useEffect(() => {
    return () => {
      if (appToastTimerRef.current) {
        clearTimeout(appToastTimerRef.current);
      }
    };
  }, []);

  // Keep ref of open modals so interval/focus listeners don't re-trigger the sync effect on modal toggle
  const isAnyModalOpenRef = useRef<boolean>(false);
  isAnyModalOpenRef.current = Boolean(
    isAddDebtorOpen ||
    isAddTxOpen ||
    isSplitPartyOpen ||
    Boolean(editingTransaction) ||
    Boolean(editingParty)
  );

  // Load / Sync Data from Backend
  const refreshDataFromServer = useCallback(async (force = false) => {
    // Nếu chưa xác thực Chủ Nợ, kiểm tra kết nối hệ thống & cấu hình hiển thị công khai
    if (!getStoredOwnerToken()) {
      setCloudStatus((prev) => ({ ...prev, checking: true }));
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);
      try {
        const sRes = await fetch(force ? '/api/settings?force=1' : '/api/settings', {
          cache: 'no-store',
          signal: controller.signal,
        });
        const contentType = sRes.headers.get('content-type') || '';
        const isJson = contentType.includes('application/json');
        let sData: any = null;
        if (isJson) {
          sData = await sRes.json().catch(() => null);
        }

        if (sRes.ok && sData) {
          const isConnected = sData.sheetsConnected === true;
          setCloudStatus({
            checked: true,
            checking: false,
            configured: isConnected,
            connected: isConnected,
            needsUpgrade: false,
            error: isConnected ? null : 'Hệ thống đang tạm gián đoạn kết nối. Vui lòng thử lại sau.',
            errorCode: isConnected ? null : 'SERVICE_UNAVAILABLE',
          });

          if (sData.success && sData.settings && isConnected) {
            const existingLocal = loadSettings();
            const mergedPublic: AppSettings = {
              ...existingLocal,
              ...sData.settings,
            };
            setSettings(mergedPublic);
            saveSettings(mergedPublic);
            return;
          }
          return;
        }

        setCloudStatus((prev) => ({
          ...prev,
          checked: true,
          checking: false,
          configured: false,
          connected: false,
          needsUpgrade: false,
          errorCode: 'SERVICE_UNAVAILABLE',
          error: 'Hệ thống đang tạm gián đoạn kết nối. Vui lòng thử lại sau.',
        }));
      } catch {
        setCloudStatus((prev) => ({
          ...prev,
          checked: true,
          checking: false,
          configured: false,
          connected: false,
          errorCode: 'SERVICE_UNAVAILABLE',
          error: 'Hệ thống đang tạm gián đoạn kết nối. Vui lòng thử lại sau.',
        }));
      } finally {
        clearTimeout(timeoutId);
      }
      return;
    }

    // Skip automatic background polling while a mutation is in flight or ran very recently
    if (
      !force &&
      (hasInFlightMutation() ||
        Date.now() - Math.max(lastActionTimeRef.current, getLastClientMutationAt()) < 4000)
    ) {
      return;
    }

    const startMutationSeq = getClientMutationSeq();
    const fetchStartedAt = Date.now();

    if (ownerDataStatusRef.current !== 'READY') {
      setOwnerDataStatus('LOADING');
    }

    try {
      const data = await fetchOwnerData(force);

      // Ignore stale GET responses if owner logged out or any mutation ran while this GET was in flight
      if (!getStoredOwnerToken()) {
        return;
      }
      if (
        getClientMutationSeq() !== startMutationSeq ||
        hasInFlightMutation() ||
        lastActionTimeRef.current > fetchStartedAt ||
        getLastClientMutationAt() > fetchStartedAt
      ) {
        return;
      }

      const isCloudOk = Boolean(data?.cloudStatus?.connected === true);

      if (data?.cloudStatus) {
        setCloudStatus({
          checked: true,
          ...data.cloudStatus,
        });
      } else {
        setCloudStatus({
          checked: true,
          configured: true,
          connected: false,
          error: 'Hệ thống đang tạm gián đoạn kết nối. Vui lòng thử lại sau.',
        });
      }

      if (!isCloudOk) {
        if (ownerDataStatusRef.current !== 'READY') {
          setDebtors([]);
          setParties([]);
          setTransactions([]);
          setOwnerDataStatus('ERROR');
        }
        return;
      }

      const nextDebtors = Array.isArray(data.debtors) ? data.debtors : [];
      const nextParties = Array.isArray(data.parties) ? data.parties : [];
      const nextTransactions = Array.isArray(data.transactions) ? data.transactions : [];

      setDebtors(nextDebtors);
      setParties(nextParties);
      setTransactions(nextTransactions);
      setSelectedDetailDebtor((prev) => (prev ? nextDebtors.find((d) => d.id === prev.id) || null : null));
      setGuestInitialDebtor((prev) => (prev ? nextDebtors.find((d) => d.id === prev.id) || null : null));

      if (data.settings) {
        const existingLocal = loadSettings();
        const mergedSettings: AppSettings = {
          ...existingLocal,
          ...data.settings,
        };
        setSettings(mergedSettings);
        saveSettings(mergedSettings);
      }

      setOwnerDataStatus('READY');
    } catch (err: any) {
      console.error('Error refreshing data from server:', err);
      if (ownerDataStatusRef.current !== 'READY') {
        setDebtors([]);
        setParties([]);
        setTransactions([]);
        setOwnerDataStatus('ERROR');
      }
    }
  }, []);

  // Initial hydrate on mount: đồng bộ cấu hình công khai
  useEffect(() => {
    refreshDataFromServer(true);
  }, [refreshDataFromServer]);

  // Đồng bộ tiêu đề trang, tên hiển thị trên iPhone và Manifest PWA theo tên trong Cài Đặt
  useEffect(() => {
    const rawTitle = settings?.appTitle?.trim();
    const appTitle = rawTitle && rawTitle.length > 0 ? rawTitle : 'OK Sổ Ghi Nợ';

    // 1. Cập nhật tiêu đề tab trình duyệt
    document.title = appTitle;

    // 2. Cập nhật tên ứng dụng khi thêm vào màn hình chính trên iOS (iPhone/iPad)
    const appleTitleMeta = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (appleTitleMeta) {
      appleTitleMeta.setAttribute('content', appTitle);
    }

    // 3. Cập nhật link manifest với query param để trình duyệt Android/Chrome refresh tên mới ngay
    const manifestLink = document.querySelector('link[rel="manifest"]');
    if (manifestLink) {
      manifestLink.setAttribute('href', `/site.webmanifest?v=${encodeURIComponent(appTitle)}`);
    }
  }, [settings?.appTitle]);

  // Đồng bộ nền định kỳ & khi chuyển lại tab/thiết bị cho Chủ Nợ đang đăng nhập
  useEffect(() => {
    if (!isOwnerAuthenticated) return;

    let focusDeferTimer: ReturnType<typeof setTimeout> | null = null;

    const triggerImmediateSync = () => {
      if (focusDeferTimer) clearTimeout(focusDeferTimer);
      focusDeferTimer = setTimeout(() => {
        if (!getStoredOwnerToken()) return;
        if (
          document.visibilityState === 'visible' &&
          !isAnyModalOpenRef.current &&
          !hasInFlightMutation()
        ) {
          const now = Date.now();
          if (now - lastFocusRefreshRef.current < 3000) return;
          lastFocusRefreshRef.current = now;
          refreshDataFromServer(true);
        }
      }, 60);
    };

    const handleVisibilityRefresh = () => {
      if (document.visibilityState === 'visible') {
        triggerImmediateSync();
      }
    };

    const interval = setInterval(() => {
      if (
        document.visibilityState === 'visible' &&
        !isAnyModalOpenRef.current &&
        !hasInFlightMutation()
      ) {
        refreshDataFromServer(false);
      }
    }, 18000);

    window.addEventListener('focus', triggerImmediateSync);
    window.addEventListener('online', triggerImmediateSync);
    document.addEventListener('visibilitychange', handleVisibilityRefresh);
    return () => {
      if (focusDeferTimer) clearTimeout(focusDeferTimer);
      clearInterval(interval);
      window.removeEventListener('focus', triggerImmediateSync);
      window.removeEventListener('online', triggerImmediateSync);
      document.removeEventListener('visibilitychange', handleVisibilityRefresh);
    };
  }, [isOwnerAuthenticated, refreshDataFromServer]);

  // Khi tải hoặc tải lại trang: Xóa sạch phiên đăng nhập cũ & mã PIN hoặc hash guest khỏi URL
  useEffect(() => {
    removeStoredOwnerToken();
    if (
      window.location.hash.includes('pin=') ||
      window.location.search.includes('pin=') ||
      window.location.hash.toLowerCase().includes('guest')
    ) {
      window.history.replaceState(null, '', window.location.pathname);
    }
    setDebtors([]);
    setTransactions([]);
    setParties([]);
  }, []);

  // Đăng xuất hoàn toàn về màn hình đăng nhập (xóa token, dữ liệu phiên và chuyển view)
  const handleLogoutOwner = useCallback((reason: 'MANUAL' | 'AUTO_LOCK' = 'MANUAL', elapsedMs?: number) => {
    try {
      const env = getAuditEnvironmentContext();
      if (reason === 'AUTO_LOCK') {
        recordAuditLog({
          action: 'AUTO_LOCK',
          actor: 'Hệ thống bảo mật',
          title: 'Tự động khóa phiên quản trị',
          description: `Hệ thống đã tự động khóa và đăng xuất Chủ sổ khi rời ứng dụng (Cấu hình: ${settings.autoLockTimeout || 'IMMEDIATE'}${elapsedMs ? `, thời gian ẩn: ${Math.round(elapsedMs / 1000)}s` : ''}) trên ${env.device}.`,
          beforeState: 'Phiên quản trị đang mở',
          afterState: 'Đã tự động khóa an toàn',
          changes: [
            { fieldLabel: 'Cơ chế khóa', before: 'Đang hoạt động', after: `Tự động khóa (${settings.autoLockTimeout || 'IMMEDIATE'})` },
            { fieldLabel: 'Thiết bị', before: '-', after: env.device },
          ],
          metadata: {
            autoLockTimeout: settings.autoLockTimeout || 'IMMEDIATE',
            elapsedMs: elapsedMs ?? 0,
            ...env,
          },
        });
      } else {
        recordAuditLog({
          action: 'LOGOUT',
          actor: `Chủ Sổ (${settings.ownerName || 'Admin'})`,
          title: 'Chủ sổ đăng xuất thủ công',
          description: `Chủ sổ đã chủ động nhấn đăng xuất và khóa phiên làm việc an toàn trên ${env.device}.`,
          beforeState: 'Phiên quản trị đang hoạt động',
          afterState: 'Đã đăng xuất, trở về màn hình khóa',
          changes: [
            { fieldLabel: 'Trạng thái phiên', before: 'Đang hoạt động', after: 'Đã khóa an toàn' },
            { fieldLabel: 'Thiết bị', before: '-', after: env.device },
          ],
          metadata: {
            ...env,
          },
        });
      }
    } catch {
      // ignore
    }
    deepCleanSessionData();
    removeStoredOwnerToken();
    setIsOwnerAuthenticated(false);
    setOwnerDataStatus('IDLE');
    setSettings((prev) => {
      const {
        googleAppsScriptUrl: _gUrl,
        googleSheetUrl: _sUrl,
        googleSheetId: _sId,
        ownerPassword: _pass,
        ...publicOnly
      } = prev as any;
      return publicOnly;
    });
    setDebtors([]);
    setTransactions([]);
    setParties([]);
    setGuestInitialDebtor(null);
    setSelectedDetailDebtor(null);
    setEditingDebtor(null);
    setEditingTransaction(null);
    setEditingParty(null);
    setIsAddDebtorOpen(false);
    setIsAddTxOpen(false);
    setIsSplitPartyOpen(false);
    setViewImageUrl(null);
    setCurrentView('GUEST');
    window.location.hash = '';
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [settings.autoLockTimeout, settings.ownerName]);

  // Lắng nghe khi Admin rời khỏi ứng dụng và quay lại để tự động thoát ra màn hình đăng nhập
  useEffect(() => {
    if (!isOwnerAuthenticated) {
      lastLeaveTimeRef.current = null;
      return;
    }

    const autoLockSetting = settings.autoLockTimeout || 'IMMEDIATE';
    if (autoLockSetting === 'OFF') return;

    const getThresholdMs = (val: string) => {
      switch (val) {
        case 'IMMEDIATE':
          return 0;
        case '30_SEC':
          return 30 * 1000;
        case '1_MIN':
          return 60 * 1000;
        case '5_MIN':
          return 5 * 60 * 1000;
        default:
          return 0;
      }
    };

    const threshold = getThresholdMs(autoLockSetting);

    const isOAuthActive = () => {
      try {
        return (
          typeof window !== 'undefined' &&
          (window.sessionStorage?.getItem('is_oauth_in_progress') === 'true' ||
            (window as any).__IS_OAUTH_ACTIVE__ === true)
        );
      } catch {
        return false;
      }
    };

    const handleVisibilityChange = () => {
      if (isOAuthActive()) {
        return;
      }
      if (document.visibilityState === 'hidden') {
        lastLeaveTimeRef.current = Date.now();
        if (threshold === 0) {
          handleLogoutOwner('AUTO_LOCK', 0);
        }
      } else if (document.visibilityState === 'visible') {
        if (lastLeaveTimeRef.current) {
          const elapsed = Date.now() - lastLeaveTimeRef.current;
          if (elapsed >= threshold) {
            handleLogoutOwner('AUTO_LOCK', elapsed);
          }
        }
        lastLeaveTimeRef.current = null;
      }
    };

    const handlePageHide = () => {
      if (isOAuthActive()) {
        return;
      }
      lastLeaveTimeRef.current = Date.now();
      if (threshold === 0) {
        handleLogoutOwner('AUTO_LOCK', 0);
      }
    };

    const handlePageShow = () => {
      if (isOAuthActive()) {
        lastLeaveTimeRef.current = null;
        return;
      }
      if (lastLeaveTimeRef.current) {
        const elapsed = Date.now() - lastLeaveTimeRef.current;
        if (elapsed >= threshold) {
          handleLogoutOwner('AUTO_LOCK', elapsed);
        }
      }
      lastLeaveTimeRef.current = null;
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('pageshow', handlePageShow);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, [isOwnerAuthenticated, settings.autoLockTimeout, handleLogoutOwner]);

  // Handle URL hash changes
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.toLowerCase();
      if (hash.startsWith('#settings')) {
        setCurrentView('SETTINGS');
      } else if (hash.startsWith('#logs')) {
        setCurrentView('LOGS');
      } else if (hash.startsWith('#owner') || hash.startsWith('#admin')) {
        setCurrentView('OWNER');
      } else {
        setCurrentView('GUEST');
      }
    };

    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  // Sync document.title with settings appTitle and appSubtitle
  useEffect(() => {
    const title = settings?.appTitle || 'OK Sổ Ghi Nợ';
    const subtitle = settings?.appSubtitle ? ` - ${settings.appSubtitle}` : '';
    document.title = `${title}${subtitle}`;

    // Cập nhật meta description và OpenGraph nếu có subtitle
    if (settings?.appSubtitle) {
      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) {
        metaDesc.setAttribute('content', settings.appSubtitle);
      }
      const ogTitle = document.querySelector('meta[property="og:title"]');
      if (ogTitle) {
        ogTitle.setAttribute('content', `${title}${subtitle}`);
      }
    }
  }, [settings?.appTitle, settings?.appSubtitle]);

  // View switcher
  const handleViewChange = (view: 'OWNER' | 'GUEST' | 'SETTINGS' | 'LOGS') => {
    setCurrentView(view);
    if (view === 'OWNER') {
      window.location.hash = 'owner';
    } else if (view === 'SETTINGS') {
      window.location.hash = 'settings';
    } else if (view === 'LOGS') {
      window.location.hash = 'logs';
    } else {
      if (window.location.hash) {
        window.history.replaceState(null, '', window.location.pathname);
      }
    }
  };

  const syncRemoteAuditLogs = useCallback(async (includeCleared = false) => {
    setRemoteLogsStatus((prev) => ({ ...prev, isSyncing: true }));
    try {
      const res = await apiFetchRemoteAuditLogs(500, includeCleared);
      setAuditLogs(res.logs);
      setRemoteLogsStatus({
        isSyncing: false,
        needsAppsScriptUpgrade: res.needsAppsScriptUpgrade,
        hiddenByClearCount: res.hiddenByClearCount,
        source: res.source,
        sheetsError: res.sheetsError,
      });
      return res;
    } catch {
      setRemoteLogsStatus((prev) => ({ ...prev, isSyncing: false }));
      return null;
    }
  }, []);

  const handleOwnerLoginSuccess = () => {
    setOwnerDataStatus('LOADING');
    setIsOwnerAuthenticated(true);
    setCurrentView('OWNER');
    window.location.hash = 'owner';
    refreshDataFromServer(true);
    syncRemoteAuditLogs(false);
  };

  useEffect(() => {
    if (isOwnerAuthenticated && currentView === 'LOGS') {
      syncRemoteAuditLogs(false);
    }
  }, [isOwnerAuthenticated, currentView, syncRemoteAuditLogs]);

  const handleOwnerLogout = useCallback(() => {
    handleLogoutOwner('MANUAL');
  }, [handleLogoutOwner]);

  // Listen for background Google Sheets auto-sync results to keep settings up to date
  useEffect(() => {
    const handleAutoSynced = (e: any) => {
      if (e?.detail) {
        const result = e.detail;
        setSettings((prev) => {
          const updated = {
            ...prev,
            googleSheetId: result.spreadsheetId,
            googleSheetUrl: result.spreadsheetUrl,
            lastGoogleSheetSyncAt: result.updatedAt,
          };
          saveSettings(updated);
          return updated;
        });
      }
    };
    window.addEventListener('googlesheets-autosynced', handleAutoSynced);
    return () => window.removeEventListener('googlesheets-autosynced', handleAutoSynced);
  }, []);

  // --- Debtor Handlers (Synchronized) ---
  const handleSaveDebtor = async (
    debtorData: Omit<Debtor, 'id' | 'createdAt' | 'updatedAt'>,
    editId?: string
  ): Promise<Debtor | null> => {
    lastActionTimeRef.current = Date.now();
    const res = await apiSaveDebtor({
      ...debtorData,
      id: editId,
    });

    if (res.success && res.debtors && res.debtor) {
      setDebtors(res.debtors);
      if (selectedDetailDebtor && editId && res.debtor) {
        setSelectedDetailDebtor(res.debtor);
      }
      return res.debtor;
    }

    const errMsg = res.message || 'Không thể lưu thông tin người nợ lên máy chủ.';
    showAppToast(errMsg, 'error');
    throw new Error(errMsg);
  };

  const handleDeleteDebtor = async (debtorId: string) => {
    lastActionTimeRef.current = Date.now();
    const prevDebtors = debtors;
    const prevTransactions = transactions;
    const prevSelected = selectedDetailDebtor;

    // Optimistic local state update for instant UI feedback
    setDebtors((prev) => prev.filter((d) => d.id !== debtorId));
    setTransactions((prev) => prev.filter((t) => t.debtorId !== debtorId));
    if (selectedDetailDebtor?.id === debtorId) {
      setSelectedDetailDebtor(null);
    }

    const res = await apiDeleteDebtor(debtorId);
    if (res.success && res.debtors && res.transactions) {
      setDebtors(res.debtors);
      setTransactions(res.transactions);
    } else {
      // Roll back optimistic state on server/cloud failure
      setDebtors(prevDebtors);
      setTransactions(prevTransactions);
      if (prevSelected?.id === debtorId) {
        setSelectedDetailDebtor(prevSelected);
      }
      showAppToast(
        res.message || 'Không thể xóa người nợ trên máy chủ. Dữ liệu đã được hoàn tác.',
        'error'
      );
    }
  };

  // --- Transaction Handlers (Synchronized) ---
  const handleSaveTransaction = async (txData: Omit<Transaction, 'id' | 'createdAt'>) => {
    lastActionTimeRef.current = Date.now();
    const prevBalance = getDebtorBalance(txData.debtorId, transactions);
    const res = await apiSaveTransaction(txData);
    if (res.success && res.transactions) {
      setTransactions(res.transactions);
      const newBalance = getDebtorBalance(txData.debtorId, res.transactions);
      // Nếu trước đó đang nợ và sau giao dịch thanh toán này đã trả hết hoặc về 0
      if (prevBalance > 0 && newBalance <= 0) {
        triggerSettledCelebration();
      }
      return;
    }
    const errMsg = res.message || 'Không thể lưu giao dịch lên máy chủ.';
    showAppToast(errMsg, 'error');
    throw new Error(errMsg);
  };

  const handleUpdateTransaction = async (updatedTx: Transaction) => {
    lastActionTimeRef.current = Date.now();
    const prevTransactions = transactions;
    const prevBalance = getDebtorBalance(updatedTx.debtorId, prevTransactions);
    // Optimistic local state update
    setTransactions((prev) => prev.map((t) => (t.id === updatedTx.id ? updatedTx : t)));
    const res = await apiUpdateTransaction(updatedTx);
    if (res.success && res.transactions) {
      setTransactions(res.transactions);
      const newBalance = getDebtorBalance(updatedTx.debtorId, res.transactions);
      if (prevBalance > 0 && newBalance <= 0) {
        triggerSettledCelebration();
      }
      return;
    }

    // Roll back optimistic state on failure and keep modal open with inline error
    setTransactions(prevTransactions);
    const errMsg = res.message || 'Không thể cập nhật giao dịch lên máy chủ.';
    showAppToast(errMsg, 'error');
    throw new Error(errMsg);
  };

  const handleDeleteTransaction = async (txId: string) => {
    lastActionTimeRef.current = Date.now();
    const prevTransactions = transactions;
    // Optimistic local state update
    setTransactions((prev) => prev.filter((t) => t.id !== txId));
    const res = await apiDeleteTransaction(txId);
    if (res.success && res.transactions) {
      setTransactions(res.transactions);
    } else {
      setTransactions(prevTransactions);
      showAppToast(
        res.message || 'Không thể xóa giao dịch trên máy chủ. Dữ liệu đã được hoàn tác.',
        'error'
      );
    }
  };

  // --- Party Split Handlers (Synchronized) ---
  const handleConfirmSplit = async (
    partyData: Omit<PartySplit, 'id' | 'createdAt'>,
    newTxs: Omit<Transaction, 'id' | 'createdAt'>[]
  ) => {
    lastActionTimeRef.current = Date.now();
    const res = await apiSavePartySplit(partyData, newTxs);
    if (res.success && res.parties && res.transactions) {
      setParties(res.parties);
      setTransactions(res.transactions);
      return;
    }
    const errMsg = res.message || 'Không thể lưu nhóm chia tiền lên máy chủ.';
    showAppToast(errMsg, 'error');
    throw new Error(errMsg);
  };

  const handleUpdatePartySplit = async (
    partyId: string,
    partyData: Omit<PartySplit, 'id' | 'createdAt'>,
    newTxs: Omit<Transaction, 'id' | 'createdAt'>[]
  ) => {
    lastActionTimeRef.current = Date.now();
    const res = await apiUpdatePartySplit(partyId, partyData, newTxs);
    if (res.success && res.parties && res.transactions) {
      setParties(res.parties);
      setTransactions(res.transactions);
      return;
    }
    const errMsg = res.message || 'Không thể cập nhật nhóm chia tiền lên máy chủ.';
    showAppToast(errMsg, 'error');
    throw new Error(errMsg);
  };

  const handleDeletePartySplit = async (partyId: string) => {
    lastActionTimeRef.current = Date.now();
    const prevParties = parties;
    const prevTransactions = transactions;
    // Optimistic local state update: remove party and cascade remove all related transactions
    setParties((prev) => prev.filter((p) => p.id !== partyId));
    setTransactions((prev) => prev.filter((t) => t.partyId !== partyId));

    const res = await apiDeletePartySplit(partyId);
    if (res.success && res.parties && res.transactions) {
      setParties(res.parties);
      setTransactions(res.transactions);
    } else {
      setParties(prevParties);
      setTransactions(prevTransactions);
      showAppToast(
        res.message || 'Không thể xóa cuộc chia tiền trên máy chủ. Dữ liệu đã được hoàn tác.',
        'error'
      );
    }
  };

  // --- Settings Handlers (Synchronized & Instant UI Reaction) ---
  const handleSaveSettings = async (newSettings: AppSettings): Promise<boolean> => {
    lastActionTimeRef.current = Date.now();
    const prevSettings = settings;

    // 1. Optimistic immediate local state update so the whole UI re-renders in 0ms
    setSettings(newSettings);
    saveSettings(newSettings);
    if (newSettings.appTitle) {
      document.title = newSettings.appTitle;
    }

    // 2. Persist to server & Google Sheets
    try {
      const res = await apiSaveSettings(newSettings, prevSettings);
      if (res.success) {
        const finalSettings = res.settings || newSettings;
        setSettings(finalSettings);
        saveSettings(finalSettings);
        if (finalSettings.appTitle) {
          document.title = finalSettings.appTitle;
        }
        return true;
      }

      // Roll back on server failure
      setSettings(prevSettings);
      saveSettings(prevSettings);
      if (prevSettings.appTitle) {
        document.title = prevSettings.appTitle;
      }
      showAppToast(
        res.message || 'Không thể lưu cài đặt lên máy chủ. Đã hoàn tác.',
        'error'
      );
      return false;
    } catch (err) {
      console.error('Lỗi khi đồng bộ cài đặt:', err);
      setSettings(prevSettings);
      saveSettings(prevSettings);
      if (prevSettings.appTitle) {
        document.title = prevSettings.appTitle;
      }
      showAppToast('Không thể lưu cài đặt lên máy chủ. Vui lòng thử lại.', 'error');
      return false;
    }
  };

  const handleOpenAddTxForDebtor = (debtorId?: string) => {
    setDefaultTxDebtorId(debtorId);
    setIsAddTxOpen(true);
  };

  const handleOpenEditDebtor = (debtor: Debtor) => {
    setEditingDebtor(debtor);
    setIsAddDebtorOpen(true);
  };

  const handleViewImage = (url: string, title?: string) => {
    setViewImageUrl(url);
    if (title) setViewImageTitle(title);
    try {
      const env = getAuditEnvironmentContext();
      const actor = isOwnerAuthenticated
        ? 'Chủ Sổ (Admin)'
        : guestInitialDebtor
        ? `Khách: ${guestInitialDebtor.name}`
        : 'Người dùng';
      recordAuditLog({
        action: 'VIEW_RECEIPT',
        actor,
        title: 'Xem ảnh hóa đơn / chứng từ',
        description: `${actor} đã mở xem phóng to ảnh chứng từ${title ? `: "${title}"` : ''} trên ${env.device}.`,
        debtorId: guestInitialDebtor?.id || selectedDetailDebtor?.id,
        debtorName: guestInitialDebtor?.name || selectedDetailDebtor?.name,
        beforeState: 'Thu gọn trên giao diện',
        afterState: `Đang xem phóng to (${title || 'Ảnh bill'})`,
        changes: [{ fieldLabel: 'Chứng từ đã xem', before: '-', after: title || 'Ảnh hóa đơn đính kèm' }],
        metadata: {
          ...env,
          ...(guestInitialDebtor?.pin ? { pin: guestInitialDebtor.pin } : {}),
        },
      });
    } catch {
      // ignore
    }
  };

  const handleDirectGuestView = (debtor: Debtor) => {
    try {
      const env = getAuditEnvironmentContext();
      const bal = getDebtorBalance(debtor.id, transactions);
      recordAuditLog({
        action: 'GUEST_LOOKUP',
        actor: 'Chủ Sổ (Xem trước khách)',
        title: `Xem trước giao diện khách: ${debtor.name}`,
        description: `Chủ sổ mở xem trực tiếp giao diện tra cứu công nợ của "${debtor.name}" (PIN: ${debtor.pin}) trên ${env.device}.`,
        debtorId: debtor.id,
        debtorName: debtor.name,
        amount: bal,
        beforeState: 'Giao diện quản trị',
        afterState: `Đang xem chế độ khách của ${debtor.name}`,
        changes: [
          { fieldLabel: 'Chế độ xem', before: 'Quản trị', after: `Xem trước giao diện khách (${debtor.name})` },
          { fieldLabel: 'Mã PIN', before: '-', after: debtor.pin },
        ],
        metadata: {
          pin: debtor.pin,
          balance: bal,
          method: 'OWNER_PREVIEW',
          ...env,
        },
      });
    } catch {
      // ignore
    }
    setSelectedDetailDebtor(null);
    setGuestInitialDebtor(debtor);
    setCurrentView('GUEST');
    if (window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  };

  const isStartupGatePending = !cloudStatus.checked;
  const isStartupGateError = Boolean(
    cloudStatus.checked && (!cloudStatus.configured || !cloudStatus.connected || cloudStatus.error)
  );
  const showStartupGate = !isOwnerAuthenticated && !guestInitialDebtor && (isStartupGatePending || isStartupGateError);

  return (
    <div className="h-full h-dvh flex flex-col bg-slate-100/70 text-slate-800 font-sans antialiased overflow-hidden">
      {showStartupGate ? (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <AnimatePresence mode="wait">
            <StartupConnectionGate
              key={isStartupGatePending ? 'startup-connecting' : 'startup-error'}
              status={isStartupGatePending ? 'connecting' : 'error'}
              isRetrying={Boolean(cloudStatus.checking)}
              onRetry={() => refreshDataFromServer(true)}
            />
          </AnimatePresence>
        </div>
      ) : (
        <>
          {/* Top Navigation - Cố định ở trên cùng, không bị trôi khi cuộn */}
          <Header
            currentView={currentView}
            isOwnerAuthenticated={isOwnerAuthenticated}
            isOwnerDataReady={ownerDataStatus === 'READY'}
            onViewChange={handleViewChange}
            onOwnerLogout={handleOwnerLogout}
            settings={settings}
            activeGuestDebtor={guestInitialDebtor}
            onGuestLogout={() => {
              if (guestInitialDebtor) {
                try {
                  recordAuditLog({
                    action: 'LOGOUT',
                    actor: `Khách: ${guestInitialDebtor.name}`,
                    title: `Khách thoát trang tra cứu: ${guestInitialDebtor.name}`,
                    description: `Khách "${guestInitialDebtor.name}" đã thoát khỏi trang đối soát công nợ.`,
                    debtorId: guestInitialDebtor.id,
                    debtorName: guestInitialDebtor.name,
                    beforeState: 'Đang xem đối soát nợ',
                    afterState: 'Đã quay về màn hình đăng nhập',
                  });
                } catch {
                  // ignore
                }
              }
              setGuestInitialDebtor(null);
              setTransactions([]);
              window.location.hash = '';
            }}
          />

          {/* Vùng cuộn nội dung độc lập - Thanh scroll chỉ giới hạn ở đây, KHÔNG chèn qua Header hay BottomNavBar */}
          <div id="main-scroll-container" className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-contain">
            <main className="max-w-6xl w-full mx-auto px-3 sm:px-6 py-3.5 sm:py-5 pb-5 sm:pb-6">
              <AnimatePresence mode="wait">
              {!isOwnerAuthenticated && !guestInitialDebtor ? (
                <motion.div
                  key="view-login"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                >
                  <UnifiedLoginView
                    settings={settings}
                    onLoginOwnerSuccess={handleOwnerLoginSuccess}
                    onLoginGuestSuccess={(debtor, txs, setts) => {
                      setGuestInitialDebtor(debtor);
                      const validTxs = txs || [];
                      setTransactions(validTxs);
                      if (setts) {
                        setSettings(setts);
                        saveSettings(setts);
                      }
                      setCurrentView('GUEST');
                      if (window.location.hash) {
                        window.history.replaceState(null, '', window.location.pathname);
                      }
                      // Nếu đã hết nợ (số dư <= 0) thì bắn pháo hoa ăn mừng ngay khi tra cứu thành công
                      const balance = getDebtorBalance(debtor.id, validTxs);
                      if (balance <= 0) {
                        setTimeout(() => {
                          triggerSettledCelebration();
                        }, 350);
                      }
                    }}
                  />
                </motion.div>
          ) : isOwnerAuthenticated ? (
            ownerDataStatus !== 'READY' ? (
              ownerDataStatus === 'ERROR' ? (
                <WorkspaceConnectionError
                  isRetrying={Boolean(cloudStatus.checking)}
                  onRetry={() => refreshDataFromServer(true)}
                  onLogout={handleOwnerLogout}
                />
              ) : (
                <WorkspaceDataLoader onCancelSession={handleOwnerLogout} />
              )
            ) : currentView === 'SETTINGS' ? (
              <motion.div
                key="view-settings"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              >
                <SettingsView
                  settings={settings}
                  debtors={debtors}
                  transactions={transactions}
                  parties={parties}
                  onSaveSettings={handleSaveSettings}
                  onDataReload={() => refreshDataFromServer(true)}
                  onApplyRestoredData={(restored) => {
                    if (Array.isArray(restored.debtors)) setDebtors(restored.debtors);
                    if (Array.isArray(restored.transactions)) setTransactions(restored.transactions);
                    if (Array.isArray(restored.parties)) setParties(restored.parties);
                    if (restored.settings) {
                      const existingLocal = loadSettings();
                      const merged = {
                        ...existingLocal,
                        ...restored.settings,
                        ...(existingLocal.googleAppsScriptUrl && !restored.settings.googleAppsScriptUrl
                          ? { googleAppsScriptUrl: existingLocal.googleAppsScriptUrl }
                          : {}),
                      };
                      setSettings(merged);
                      saveSettings(merged);
                    }
                  }}
                  onGoBack={() => handleViewChange('OWNER')}
                />
              </motion.div>
            ) : currentView === 'LOGS' ? (
              <motion.div
                key="view-logs"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              >
                <AdminAuditLogsTab
                  auditLogs={auditLogs}
                  onRefreshLogs={() => syncRemoteAuditLogs(false)}
                  onRestoreClearedLogs={() => syncRemoteAuditLogs(true)}
                  remoteSyncStatus={remoteLogsStatus}
                  debtors={debtors}
                  transactions={transactions}
                  parties={parties}
                  settings={settings}
                  onSaveSettings={handleSaveSettings}
                  onGoBack={() => handleViewChange('OWNER')}
                />
              </motion.div>
            ) : currentView === 'GUEST' && guestInitialDebtor ? (
              <motion.div
                key="view-guest-authed"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              >
                <GuestPortal
                  onViewImage={handleViewImage}
                  onGoToOwnerLogin={() => handleViewChange('OWNER')}
                  initialDebtor={guestInitialDebtor}
                  isOwnerAuthenticated={isOwnerAuthenticated}
                  allTransactions={transactions}
                  appSettings={settings}
                  allParties={parties}
                  allDebtors={debtors}
                />
              </motion.div>
            ) : (
              <motion.div
                key="view-owner"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              >
                <OwnerDashboard
                  debtors={debtors}
                  transactions={transactions}
                  parties={parties}
                  settings={settings}
                  onOpenAddDebtor={() => {
                    setEditingDebtor(null);
                    setIsAddDebtorOpen(true);
                  }}
                  onOpenAddTx={handleOpenAddTxForDebtor}
                  onOpenSplitParty={() => setIsSplitPartyOpen(true)}
                  onSelectDebtor={(d) => setSelectedDetailDebtor(d)}
                  onViewImage={handleViewImage}
                  onDeleteDebtor={handleDeleteDebtor}
                  onOpenSettings={() => handleViewChange('SETTINGS')}
                  onDataReload={() => refreshDataFromServer(true)}
                  onEditTx={(tx) => setEditingTransaction(tx)}
                  onDeleteTx={handleDeleteTransaction}
                  onEditParty={(p) => setEditingParty(p)}
                  onDeleteParty={handleDeletePartySplit}
                />
              </motion.div>
            )
          ) : (
            <motion.div
              key="view-guest-default"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            >
              <GuestPortal
                onViewImage={handleViewImage}
                onGoToOwnerLogin={() => {
                  setGuestInitialDebtor(null);
                  setTransactions([]);
                  window.location.hash = '';
                }}
                initialDebtor={guestInitialDebtor}
                isOwnerAuthenticated={false}
                allTransactions={transactions}
                appSettings={settings}
                allParties={parties}
                allDebtors={debtors}
              />
            </motion.div>
          )}
        </AnimatePresence>
        </main>
      </div>

      {/* Base Level Modal: Debtor Full Statement & Detail Modal */}
      <DebtorDetailModal
        debtor={selectedDetailDebtor ? (debtors.find((d) => d.id === selectedDetailDebtor.id) || selectedDetailDebtor) : null}
        transactions={transactions}
        settings={settings}
        parties={parties}
        allDebtors={debtors}
        onClose={() => setSelectedDetailDebtor(null)}
        onOpenAddTx={(debtorId) => {
          handleOpenAddTxForDebtor(debtorId);
        }}
        onEditDebtor={handleOpenEditDebtor}
        onDeleteDebtor={handleDeleteDebtor}
        onDeleteTx={handleDeleteTransaction}
        onEditTx={handleUpdateTransaction}
        onEditParty={(party) => setEditingParty(party)}
        onViewImage={handleViewImage}
        onDirectGuestView={handleDirectGuestView}
      />

      {/* Action Modals: Rendered on top of detail modal */}
      {/* Form 1: Add/Edit Debtor Modal */}
      <AddDebtorModal
        isOpen={isAddDebtorOpen}
        onClose={() => {
          setIsAddDebtorOpen(false);
          setEditingDebtor(null);
        }}
        onSave={handleSaveDebtor}
        initialDebtor={editingDebtor}
        existingDebtors={debtors}
      />

      {/* Form 2: Single Transaction Modal */}
      <AddTransactionModal
        isOpen={isAddTxOpen}
        onClose={() => setIsAddTxOpen(false)}
        debtors={debtors}
        onSave={handleSaveTransaction}
        onSaveDebtor={handleSaveDebtor}
        defaultDebtorId={defaultTxDebtorId}
      />

      {/* Form 2b: Edit Single Transaction Modal */}
      <EditTransactionModal
        isOpen={Boolean(editingTransaction)}
        onClose={() => setEditingTransaction(null)}
        transaction={editingTransaction}
        debtor={
          editingTransaction
            ? debtors.find((d) => d.id === editingTransaction.debtorId)
            : undefined
        }
        debtors={debtors}
        onSave={async (updatedTx) => {
          await handleUpdateTransaction(updatedTx);
          setEditingTransaction(null);
        }}
      />

      {/* Form 3: Split Party Bill Modal (Create or Edit) */}
      <SplitBillModal
        isOpen={isSplitPartyOpen || Boolean(editingParty)}
        onClose={() => {
          setIsSplitPartyOpen(false);
          setEditingParty(null);
        }}
        debtors={debtors}
        initialParty={editingParty}
        onConfirmSplit={handleConfirmSplit}
        onUpdateSplit={handleUpdatePartySplit}
        onSaveDebtor={handleSaveDebtor}
        settings={settings}
      />

      {/* Full Size Image Viewer Modal */}
      <ImageViewerModal
        imageUrl={viewImageUrl}
        title={viewImageTitle}
        onClose={() => setViewImageUrl(null)}
      />
        </>
      )}

      {/* Offline Status Awareness Indicator */}
      <OfflineIndicator />

      {/* Mobile Bottom Navigation Dock (Chỉ cho Chủ Sổ khi đã tải xong dữ liệu) */}
      {isOwnerAuthenticated && ownerDataStatus === 'READY' && (
        <BottomNavBar
          currentView={currentView}
          isOwnerAuthenticated={isOwnerAuthenticated}
          onViewChange={handleViewChange}
          onOwnerLogout={handleOwnerLogout}
          logsAlertCount={
            auditLogs.filter((l) =>
              ['OPERATION_FAILED', 'LOGIN_FAILED', 'LOOKUP_FAILED'].includes(l.action)
            ).length
          }
        />
      )}


      {/* Non-blocking App Toast */}
      <AnimatePresence>
        {appToast && (
          <motion.div
            key="app-toast"
            initial={{ opacity: 0, y: -16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.96 }}
            transition={{ duration: 0.2 }}
            className="fixed top-4 right-4 z-[200] max-w-sm w-[calc(100vw-2rem)] pointer-events-auto"
          >
            <div
              className={`rounded-2xl px-4 py-3 shadow-xl border flex items-start gap-2.5 text-xs sm:text-sm font-medium ${
                appToast.type === 'error'
                  ? 'bg-rose-50 border-rose-200 text-rose-800'
                  : appToast.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-slate-800 border-slate-700 text-white'
              }`}
            >
              {appToast.type === 'error' ? (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              )}
              <span className="flex-1 leading-snug">{appToast.text}</span>
              <button
                type="button"
                onClick={() => setAppToast(null)}
                className="p-0.5 rounded-lg opacity-70 hover:opacity-100 transition-opacity cursor-pointer shrink-0"
                aria-label="Đóng thông báo"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
