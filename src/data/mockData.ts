import { Debtor, Transaction, PartySplit, AppSettings } from '../types';
import {
  DEFAULT_APP_TITLE,
  DEFAULT_APP_SUBTITLE,
  DEFAULT_SHARE_MESSAGE,
  DEFAULT_GUEST_ANNOUNCEMENT,
  DEFAULT_SETTLED_NOTE,
} from '../utils/textTemplate';

export const DEFAULT_SETTINGS: AppSettings = {
  ownerName: 'Chủ Sổ',
  ownerPhone: '',
  bankId: 'VCB',
  bankName: 'Vietcombank',
  accountNumber: '',
  accountName: '',
  defaultMemoPrefix: '',
  ownerPassword: '', // Mật khẩu thực tế được bảo mật và lưu trữ riêng trên Cloud Firestore, tuyệt đối không hardcode trong mã nguồn
  appTitle: 'Sổ Ghi Nợ',
  appSubtitle: DEFAULT_APP_SUBTITLE,
  shareMessageTemplate: DEFAULT_SHARE_MESSAGE,
  lookupGuideTemplate: DEFAULT_SHARE_MESSAGE,
  guestAnnouncement: DEFAULT_GUEST_ANNOUNCEMENT,
  settledThankYouNote: DEFAULT_SETTLED_NOTE,
  autoLockTimeout: 'OFF',
  autoSyncGoogleSheets: true,
};

export const INITIAL_DEBTORS: Debtor[] = [];
export const INITIAL_TRANSACTIONS: Transaction[] = [];
export const INITIAL_PARTIES: PartySplit[] = [];
