import { Debtor, Transaction, PartySplit, AppSettings } from '../types';
import {
  DEFAULT_APP_TITLE,
  DEFAULT_APP_SUBTITLE,
  DEFAULT_SHARE_MESSAGE,
  DEFAULT_GUEST_ANNOUNCEMENT,
  DEFAULT_SETTLED_NOTE,
} from '../utils/textTemplate';

export const DEFAULT_SETTINGS: AppSettings = {
  ownerName: 'Ánh',
  ownerPhone: '0971492399',
  bankId: 'VCB',
  bankName: 'Vietcombank',
  accountNumber: '1028912673',
  accountName: 'DANG VAN ANH',
  defaultMemoPrefix: '',
  ownerPassword: 'anhbn11',
  appTitle: 'AENO',
  appSubtitle: DEFAULT_APP_SUBTITLE,
  shareMessageTemplate: DEFAULT_SHARE_MESSAGE,
  lookupGuideTemplate: DEFAULT_SHARE_MESSAGE,
  guestAnnouncement: DEFAULT_GUEST_ANNOUNCEMENT,
  settledThankYouNote: DEFAULT_SETTLED_NOTE,
  autoLockTimeout: 'OFF',
};

export const INITIAL_DEBTORS: Debtor[] = [];
export const INITIAL_TRANSACTIONS: Transaction[] = [];
export const INITIAL_PARTIES: PartySplit[] = [];
