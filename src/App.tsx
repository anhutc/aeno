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
import { Debtor, Transaction, PartySplit, AppSettings } from './types';
import {
  fetchOwnerData,
  smartMergeTransactions,
  smartMergeDebtors,
  smartMergeParties,
  apiSaveDebtor,
  apiDeleteDebtor,
  apiSaveTransaction,
  apiUpdateTransaction,
  apiDeleteTransaction,
  apiSavePartySplit,
  apiUpdatePartySplit,
  apiDeletePartySplit,
  apiSaveSettings,
  getStoredOwnerToken,
  removeStoredOwnerToken,
} from './utils/api';
import { getSettingsDirect } from './services/firestoreClient';
import {
  loadSettings,
  saveSettings,
  saveDebtors,
  saveTransactions,
  saveParties,
  getDebtorBalance,
  deepCleanSessionData,
} from './utils/storage';
import { triggerSettledCelebration } from './utils/confetti';
import { subscribeToFirestoreData } from './services/firestoreClient';
import { Header } from './components/Header';
import { OwnerDashboard } from './components/OwnerDashboard';
import { GuestPortal } from './components/GuestPortal';
import { UnifiedLoginView } from './components/UnifiedLoginView';
import { SettingsView } from './components/SettingsView';
import { AddDebtorModal } from './components/AddDebtorModal';
import { AddTransactionModal } from './components/AddTransactionModal';
import { EditTransactionModal } from './components/EditTransactionModal';
import { SplitBillModal } from './components/SplitBillModal';
import { DebtorDetailModal } from './components/DebtorDetailModal';
import { ImageViewerModal } from './components/ImageViewerModal';
import { BottomNavBar } from './components/BottomNavBar';
import { OfflineIndicator } from './components/OfflineIndicator';
import { AdminAutoLockModal } from './components/AdminAutoLockModal';

export default function App() {
  // App Core State - Chỉ lưu dữ liệu khi đã đăng nhập
  const [debtors, setDebtors] = useState<Debtor[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [parties, setParties] = useState<PartySplit[]>([]);
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());

  // View & Auth State (OWNER | GUEST | SETTINGS)
  // Khởi tạo view ban đầu theo hash URL
  const [currentView, setCurrentView] = useState<'OWNER' | 'GUEST' | 'SETTINGS'>(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.toLowerCase();
      if (hash.startsWith('#settings')) return 'SETTINGS';
      if (hash.startsWith('#owner') || hash.startsWith('#admin')) return 'OWNER';
      if (hash.startsWith('#guest')) return 'GUEST';
    }
    return 'GUEST';
  });

  // Luôn bắt đầu với false khi tải hoặc tải lại trang để bắt buộc nhập lại mật khẩu
  const [isOwnerAuthenticated, setIsOwnerAuthenticated] = useState<boolean>(false);

  // Tự động khóa màn hình Admin khi rời ứng dụng
  const [isAppLocked, setIsAppLocked] = useState(false);
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
    // Nếu chưa xác thực Chủ Nợ, chỉ cập nhật cấu hình công khai (Settings)
    if (!getStoredOwnerToken()) {
      try {
        const sRes = await fetch('/api/settings');
        if (sRes.ok) {
          const sData = await sRes.json();
          if (sData.success && sData.settings) {
            setSettings(sData.settings);
            saveSettings(sData.settings);
            return;
          }
        }
      } catch {
        // ignore
      }

      // Direct Firestore settings hydration fallback (essential for InPrivate mode)
      try {
        const directSettings = await getSettingsDirect();
        if (directSettings) {
          setSettings(directSettings);
          saveSettings(directSettings);
        }
      } catch {
        // ignore
      }
      return;
    }

    // If a user action happened in the last 4 seconds and this isn't a forced sync, skip to avoid race condition overwrite
    if (!force && Date.now() - lastActionTimeRef.current < 4000) {
      return;
    }
    try {
      const data = await fetchOwnerData();
      if (!data) return;

      setDebtors((prevDebtors) => {
        return smartMergeDebtors(data.debtors || [], prevDebtors);
      });

      setParties((prevParties) => {
        return smartMergeParties(data.parties || [], prevParties);
      });

      if (data.settings) {
        setSettings(data.settings);
      }

      setTransactions((prevTxs) => {
        return smartMergeTransactions(data.transactions || [], prevTxs);
      });
    } catch (err) {
      console.error('Error refreshing data from server:', err);
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

  // Real-time synchronization: CHỈ kích hoạt khi Chủ Nợ đã đăng nhập thành công
  useEffect(() => {
    if (!isOwnerAuthenticated) {
      return;
    }

    let unsubscribe: (() => void) | null = null;
    try {
      unsubscribe = subscribeToFirestoreData({
        onDebtors: (remoteDebtors) => {
          if (Array.isArray(remoteDebtors)) {
            setDebtors(remoteDebtors);
            saveDebtors(remoteDebtors);
          }
        },
        onTransactions: (remoteTxs) => {
          if (Array.isArray(remoteTxs)) {
            setTransactions(remoteTxs);
            saveTransactions(remoteTxs);
          }
        },
        onParties: (remoteParties) => {
          if (Array.isArray(remoteParties)) {
            setParties(remoteParties);
            saveParties(remoteParties);
          }
        },
        onSettings: (remoteSettings) => {
          if (remoteSettings && remoteSettings.appTitle) {
            setSettings(remoteSettings);
            saveSettings(remoteSettings);
          }
        },
      });
    } catch (e) {
      console.warn('Realtime listener error:', e);
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [isOwnerAuthenticated]);

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

  // Lắng nghe khi Admin rời khỏi ứng dụng và quay lại để tự động khóa
  useEffect(() => {
    if (!isOwnerAuthenticated) {
      setIsAppLocked(false);
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

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        lastLeaveTimeRef.current = Date.now();
        if (threshold === 0) {
          setIsAppLocked(true);
        }
      } else if (document.visibilityState === 'visible') {
        if (lastLeaveTimeRef.current) {
          const elapsed = Date.now() - lastLeaveTimeRef.current;
          if (elapsed >= threshold) {
            setIsAppLocked(true);
          }
        }
        lastLeaveTimeRef.current = null;
      }
    };

    const handlePageHide = () => {
      lastLeaveTimeRef.current = Date.now();
      if (threshold === 0) {
        setIsAppLocked(true);
      }
    };

    const handlePageShow = () => {
      if (lastLeaveTimeRef.current) {
        const elapsed = Date.now() - lastLeaveTimeRef.current;
        if (elapsed >= threshold) {
          setIsAppLocked(true);
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
  }, [isOwnerAuthenticated, settings.autoLockTimeout]);

  const handleLogoutOwner = useCallback(() => {
    deepCleanSessionData();
    removeStoredOwnerToken();
    setIsOwnerAuthenticated(false);
    setIsAppLocked(false);
    setDebtors([]);
    setTransactions([]);
    setParties([]);
    setGuestInitialDebtor(null);
    setSelectedDetailDebtor(null);
    setEditingDebtor(null);
    setEditingTransaction(null);
    setEditingParty(null);
    setCurrentView('GUEST');
    window.location.hash = '';
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  // Handle URL hash changes
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.toLowerCase();
      if (hash.startsWith('#settings')) {
        setCurrentView('SETTINGS');
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
  const handleViewChange = (view: 'OWNER' | 'GUEST' | 'SETTINGS') => {
    setCurrentView(view);
    if (view === 'OWNER') {
      window.location.hash = 'owner';
    } else if (view === 'SETTINGS') {
      window.location.hash = 'settings';
    } else {
      if (window.location.hash) {
        window.history.replaceState(null, '', window.location.pathname);
      }
    }
  };

  const handleOwnerLoginSuccess = () => {
    setIsOwnerAuthenticated(true);
    setCurrentView('OWNER');
    window.location.hash = 'owner';
    refreshDataFromServer();
  };

  const handleOwnerLogout = handleLogoutOwner;

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
    } else {
      alert(res.message || 'Lỗi khi lưu người nợ');
      return null;
    }
  };

  const handleDeleteDebtor = async (debtorId: string) => {
    lastActionTimeRef.current = Date.now();
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
    } else {
      alert(res.message || 'Lỗi khi lưu giao dịch');
    }
  };

  const handleUpdateTransaction = async (updatedTx: Transaction) => {
    lastActionTimeRef.current = Date.now();
    const prevBalance = getDebtorBalance(updatedTx.debtorId, transactions);
    // Optimistic local state update
    setTransactions((prev) => prev.map((t) => (t.id === updatedTx.id ? updatedTx : t)));
    const res = await apiUpdateTransaction(updatedTx);
    if (res.success && res.transactions) {
      setTransactions(res.transactions);
      const newBalance = getDebtorBalance(updatedTx.debtorId, res.transactions);
      if (prevBalance > 0 && newBalance <= 0) {
        triggerSettledCelebration();
      }
    } else if (!res.success) {
      alert(res.message || 'Lỗi khi cập nhật giao dịch');
    }
  };

  const handleDeleteTransaction = async (txId: string) => {
    lastActionTimeRef.current = Date.now();
    // Optimistic local state update
    setTransactions((prev) => prev.filter((t) => t.id !== txId));
    const res = await apiDeleteTransaction(txId);
    if (res.success && res.transactions) {
      setTransactions(res.transactions);
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
    } else {
      alert(res.message || 'Lỗi khi lưu nhóm chia tiền');
    }
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
    } else {
      alert(res.message || 'Lỗi khi cập nhật nhóm chia tiền');
    }
  };

  const handleDeletePartySplit = async (partyId: string) => {
    lastActionTimeRef.current = Date.now();
    // Optimistic local state update: remove party and cascade remove all related transactions
    setParties((prev) => prev.filter((p) => p.id !== partyId));
    setTransactions((prev) => prev.filter((t) => t.partyId !== partyId));

    const res = await apiDeletePartySplit(partyId);
    if (res.success && res.parties && res.transactions) {
      setParties(res.parties);
      setTransactions(res.transactions);
    }
  };

  // --- Settings Handlers (Synchronized & Instant UI Reaction) ---
  const handleSaveSettings = async (newSettings: AppSettings) => {
    // 1. Optimistic immediate local state update so the whole UI re-renders in 0ms
    setSettings(newSettings);
    saveSettings(newSettings);
    if (newSettings.appTitle) {
      document.title = newSettings.appTitle;
    }

    // 2. Persist to server and Firestore in background
    try {
      const res = await apiSaveSettings(newSettings);
      if (res.success && res.settings) {
        setSettings(res.settings);
        saveSettings(res.settings);
        if (res.settings.appTitle) {
          document.title = res.settings.appTitle;
        }
      }
    } catch (err) {
      console.error('Lỗi khi đồng bộ cài đặt:', err);
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
  };

  const handleDirectGuestView = (debtor: Debtor) => {
    setSelectedDetailDebtor(null);
    setGuestInitialDebtor(debtor);
    setCurrentView('GUEST');
    if (window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  };

  return (
    <div className="h-full h-dvh flex flex-col bg-slate-100/70 text-slate-800 font-sans antialiased overflow-hidden">
      {/* Top Navigation - Cố định ở trên cùng, không bị trôi khi cuộn */}
      <Header
        currentView={currentView}
        isOwnerAuthenticated={isOwnerAuthenticated}
        onViewChange={handleViewChange}
        onOwnerLogout={handleOwnerLogout}
        settings={settings}
        activeGuestDebtor={guestInitialDebtor}
        onGuestLogout={() => {
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
                  if (validTxs.length > 0) {
                    setTransactions(validTxs);
                  }
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
            currentView === 'SETTINGS' ? (
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
                  onDataReload={refreshDataFromServer}
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
                  onDataReload={refreshDataFromServer}
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

      {/* Offline Status Awareness Indicator */}
      <OfflineIndicator />

      {/* Mobile Bottom Navigation Dock (Chỉ cho Chủ Sổ) */}
      {isOwnerAuthenticated && (
        <BottomNavBar
          currentView={currentView}
          isOwnerAuthenticated={isOwnerAuthenticated}
          onViewChange={handleViewChange}
          onOpenAddTx={() => {
            setDefaultTxDebtorId(undefined);
            setIsAddTxOpen(true);
          }}
          onOpenSplitParty={() => {
            setEditingParty(null);
            setIsSplitPartyOpen(true);
          }}
          onOpenAddDebtor={() => {
            setEditingDebtor(null);
            setIsAddDebtorOpen(true);
          }}
        />
      )}

      {/* Tự động khóa màn hình Admin khi rời ứng dụng */}
      <AdminAutoLockModal
        isOpen={isOwnerAuthenticated && isAppLocked}
        settings={settings}
        onUnlockSuccess={() => setIsAppLocked(false)}
        onLogout={handleLogoutOwner}
      />
    </div>
  );
}
