import { Debtor, Transaction, PartySplit, AppSettings } from '../types';
import {
  DEFAULT_APP_TITLE,
  DEFAULT_APP_SUBTITLE,
  DEFAULT_SHARE_MESSAGE,
  DEFAULT_GUEST_ANNOUNCEMENT,
  DEFAULT_SETTLED_NOTE,
} from '../utils/textTemplate';

export const DEFAULT_SETTINGS: AppSettings = {
  ownerName: 'Tôi (Chủ sổ)',
  ownerPhone: '',
  bankId: 'MB',
  bankName: 'MB Bank',
  accountNumber: '',
  accountName: '',
  defaultMemoPrefix: '',
  ownerPassword: '123456',
  appTitle: DEFAULT_APP_TITLE,
  appSubtitle: DEFAULT_APP_SUBTITLE,
  shareMessageTemplate: DEFAULT_SHARE_MESSAGE,
  lookupGuideTemplate: DEFAULT_SHARE_MESSAGE,
  guestAnnouncement: DEFAULT_GUEST_ANNOUNCEMENT,
  settledThankYouNote: DEFAULT_SETTLED_NOTE,
  autoLockTimeout: 'IMMEDIATE',
  blurOnMultitask: true,
  multitaskShieldStyle: 'BLUR_SHIELD',
};

export const INITIAL_DEBTORS: Debtor[] = [];

export const INITIAL_TRANSACTIONS: Transaction[] = [];

export const INITIAL_PARTIES: PartySplit[] = [];

export interface PresetScenario {
  id: string;
  name: string;
  description: string;
  tag: string;
  scenarioTag?: string;
  icon: string;
  debtorCount: number;
  debtorsCount: number;
  txCount: number;
  transactionsCount: number;
  getData: () => {
    debtors: Debtor[];
    transactions: Transaction[];
    parties: PartySplit[];
  };
}

export const PRESET_SCENARIOS: PresetScenario[] = [
  {
    id: 'EMPTY',
    name: 'Sổ trắng tinh',
    description: 'Bắt đầu ghi chép với danh sách người nợ và giao dịch hoàn toàn mới.',
    tag: 'Mặc định',
    scenarioTag: 'Sổ mới',
    icon: '✨',
    debtorCount: 0,
    debtorsCount: 0,
    txCount: 0,
    transactionsCount: 0,
    getData: () => ({
      debtors: [],
      transactions: [],
      parties: [],
    }),
  },
];
