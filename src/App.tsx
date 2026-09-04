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
  apiSyncAllNow,
  getStoredOwnerToken,
  removeStoredOwnerToken,
} from './utils/api';
import {
  loadDebtors,
  loadTransactions,
  loadParties,
  loadSettings,
  saveSettings,
  saveDebtors,
  saveTransactions,
  saveParties,
} from './utils/storage';
import { subscribeToFirestoreData } from './services/firestoreClient';
import { Header } from './components/Header';
import { OwnerDashboard } from './components/OwnerDashboard';
import { GuestPortal } from './components/GuestPortal';
import { AdminLoginView } from './components/AdminLoginView';
import { SettingsView } from './components/SettingsView';
import { AddDebtorModal } from './components/AddDebtorModal';
import { AddTransactionModal } from './components/AddTransactionModal';
import { EditTransactionModal } from './components/EditTransactionModal';
import { SplitBillModal } from './components/SplitBillModal';
import { DebtorDetailModal } from './components/DebtorDetailModal';
import { ImageViewerModal } from './components/ImageViewerModal';
import { ChangePinModal } from './components/ChangePinModal';

export default function App() {
  // App Core State
  const [debtors, setDebtors] = useState<Debtor[]>(() => loadDebtors());
  const [transactions, setTransactions] = useState<Transaction[]>(() => loadTransactions());
  const [parties, setParties] = useState<PartySplit[]>(() => loadParties());
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

  const [guestInitialPin, setGuestInitialPin] = useState<string | null>(null);
  const [guestInitialDebtor, setGuestInitialDebtor] = useState<Debtor | null>(null);

  // Operational Modals
  const [isAddDebtorOpen, setIsAddDebtorOpen] = useState(false);
  const [editingDebtor, setEditingDebtor] = useState<Debtor | null>(null);
  const [changePinDebtor, setChangePinDebtor] = useState<Debtor | null>(null);

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
    Boolean(editingParty) ||
    Boolean(changePinDebtor)
  );

  // Load / Sync Data from Backend
  const refreshDataFromServer = useCallback(async (force = false) => {
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

  // Sync on mount and periodic interval
  useEffect(() => {
    refreshDataFromServer(true);

    const interval = setInterval(() => {
      // Avoid polling in the background if the user has an open modal
      if (isAnyModalOpenRef.current) {
        return;
      }
      refreshDataFromServer();
    }, 15000);

    const handleFocus = () => {
      if (isAnyModalOpenRef.current) {
        return;
      }
      refreshDataFromServer();
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [refreshDataFromServer]);

  // Real-time synchronization across devices via Firestore listeners
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    try {
      unsubscribe = subscribeToFirestoreData({
        onDebtors: (remoteDebtors) => {
          if (Array.isArray(remoteDebtors) && remoteDebtors.length > 0) {
            // Only update if there are remote debtors to prevent wiping during transient network states
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
  }, []);

  // Handle URL hash changes
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.toLowerCase();
      if (hash.startsWith('#settings')) {
        setCurrentView('SETTINGS');
      } else if (hash.startsWith('#owner') || hash.startsWith('#admin')) {
        setCurrentView('OWNER');
      } else if (hash.startsWith('#guest')) {
        setCurrentView('GUEST');
        const pinMatch = window.location.hash.match(/pin=([^&]+)/i);
        if (pinMatch && pinMatch[1]) {
          setGuestInitialPin(pinMatch[1]);
        }
      } else {
        // Default route: if authenticated, show owner, otherwise guest
        const token = getStoredOwnerToken();
        if (token) {
          setCurrentView('OWNER');
        } else {
          setCurrentView('GUEST');
        }
      }
    };

    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  // Sync document.title with settings appTitle
  useEffect(() => {
    if (settings?.appTitle) {
      document.title = settings.appTitle;
    }
  }, [settings?.appTitle]);

  // View switcher
  const handleViewChange = (view: 'OWNER' | 'GUEST' | 'SETTINGS') => {
    setCurrentView(view);
    if (view === 'OWNER') {
      window.location.hash = 'owner';
    } else if (view === 'SETTINGS') {
      window.location.hash = 'settings';
    } else {
      setGuestInitialPin(null);
      setGuestInitialDebtor(null);
      window.location.hash = 'guest';
    }
  };

  const handleOwnerLoginSuccess = () => {
    setIsOwnerAuthenticated(true);
    refreshDataFromServer();
  };

  const handleOwnerLogout = () => {
    removeStoredOwnerToken();
    setIsOwnerAuthenticated(false);
    setCurrentView('GUEST');
    window.location.hash = 'guest';
  };

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
    const res = await apiSaveTransaction(txData);
    if (res.success && res.transactions) {
      setTransactions(res.transactions);
    } else {
      alert(res.message || 'Lỗi khi lưu giao dịch');
    }
  };

  const handleUpdateTransaction = async (updatedTx: Transaction) => {
    lastActionTimeRef.current = Date.now();
    // Optimistic local state update
    setTransactions((prev) => prev.map((t) => (t.id === updatedTx.id ? updatedTx : t)));
    const res = await apiUpdateTransaction(updatedTx);
    if (res.success && res.transactions) {
      setTransactions(res.transactions);
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
    setGuestInitialPin(debtor.pin);
    setGuestInitialDebtor(debtor);
    setCurrentView('GUEST');
    window.location.hash = 'guest';
  };

  const handleSaveDebtorPin = async (debtorId: string, newPin: string): Promise<boolean> => {
    const target = debtors.find((d) => d.id === debtorId);
    if (!target) return false;
    const res = await handleSaveDebtor(
      {
        name: target.name,
        pin: newPin,
        note: target.note,
      },
      debtorId
    );
    if (res) {
      if (selectedDetailDebtor && selectedDetailDebtor.id === debtorId) {
        setSelectedDetailDebtor((prev) => (prev ? { ...prev, pin: newPin } : null));
      }
      return true;
    }
    return false;
  };

  const [isGlobalSyncing, setIsGlobalSyncing] = useState(false);
  const handleGlobalSync = async () => {
    setIsGlobalSyncing(true);
    try {
      const res = await apiSyncAllNow({ debtors, transactions, parties, settings });
      if (res.success) {
        await refreshDataFromServer();
      }
    } catch (e) {
      console.warn('Global sync error:', e);
    } finally {
      setIsGlobalSyncing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-800 flex flex-col font-sans antialiased">
      {/* Top Navigation */}
      <Header
        currentView={currentView}
        isOwnerAuthenticated={isOwnerAuthenticated}
        onViewChange={handleViewChange}
        onOwnerLogout={handleOwnerLogout}
        settings={settings}
        onQuickSync={handleGlobalSync}
        isSyncing={isGlobalSyncing}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-3 sm:px-6 py-4 sm:py-6">
        {currentView === 'OWNER' ? (
          isOwnerAuthenticated ? (
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
              onOpenChangePin={(debtor) => setChangePinDebtor(debtor)}
              onOpenSettings={() => handleViewChange('SETTINGS')}
              onDataReload={refreshDataFromServer}
              onEditTx={(tx) => setEditingTransaction(tx)}
              onDeleteTx={handleDeleteTransaction}
              onEditParty={(p) => setEditingParty(p)}
              onDeleteParty={handleDeletePartySplit}
            />
          ) : (
            <AdminLoginView
              settings={settings}
              onLoginSuccess={handleOwnerLoginSuccess}
              onGoToGuest={() => handleViewChange('GUEST')}
            />
          )
        ) : currentView === 'SETTINGS' ? (
          isOwnerAuthenticated ? (
            <SettingsView
              settings={settings}
              debtors={debtors}
              transactions={transactions}
              parties={parties}
              onSaveSettings={handleSaveSettings}
              onDataReload={refreshDataFromServer}
              onGoBack={() => handleViewChange('OWNER')}
            />
          ) : (
            <AdminLoginView
              settings={settings}
              onLoginSuccess={() => {
                handleOwnerLoginSuccess();
                setCurrentView('SETTINGS');
              }}
              onGoToGuest={() => handleViewChange('GUEST')}
            />
          )
        ) : (
          <GuestPortal
            onViewImage={handleViewImage}
            onGoToOwnerLogin={() => handleViewChange('OWNER')}
            initialPin={guestInitialPin}
            initialDebtor={guestInitialDebtor}
            isOwnerAuthenticated={isOwnerAuthenticated}
            debtors={debtors}
            allTransactions={transactions}
            appSettings={settings}
            onOpenAddDebtor={() => setIsAddDebtorOpen(true)}
            onDataReload={refreshDataFromServer}
          />
        )}
      </main>

      {/* Base Level Modal: Debtor Full Statement & Detail Modal */}
      <DebtorDetailModal
        debtor={selectedDetailDebtor ? (debtors.find((d) => d.id === selectedDetailDebtor.id) || selectedDetailDebtor) : null}
        transactions={transactions}
        settings={settings}
        onClose={() => setSelectedDetailDebtor(null)}
        onOpenAddTx={(debtorId) => {
          handleOpenAddTxForDebtor(debtorId);
        }}
        onEditDebtor={handleOpenEditDebtor}
        onDeleteDebtor={handleDeleteDebtor}
        onDeleteTx={handleDeleteTransaction}
        onEditTx={handleUpdateTransaction}
        onViewImage={handleViewImage}
        onDirectGuestView={handleDirectGuestView}
        onOpenChangePin={(debtor) => setChangePinDebtor(debtor)}
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
      />

      {/* Admin Change Debtor PIN/Pass Modal */}
      <ChangePinModal
        isOpen={Boolean(changePinDebtor)}
        onClose={() => setChangePinDebtor(null)}
        debtor={changePinDebtor}
        existingDebtors={debtors}
        onSavePin={handleSaveDebtorPin}
      />

      {/* Full Size Image Viewer Modal */}
      <ImageViewerModal
        imageUrl={viewImageUrl}
        title={viewImageTitle}
        onClose={() => setViewImageUrl(null)}
      />
    </div>
  );
}
