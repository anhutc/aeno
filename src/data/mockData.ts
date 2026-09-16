import { Debtor, Transaction, PartySplit, AppSettings } from '../types';
import {
  DEFAULT_APP_TITLE,
  DEFAULT_APP_SUBTITLE,
  DEFAULT_SHARE_MESSAGE,
  DEFAULT_REMINDER_MESSAGE,
  DEFAULT_GUEST_ANNOUNCEMENT,
  DEFAULT_SETTLED_NOTE,
} from '../utils/textTemplate';

export const DEFAULT_SETTINGS: AppSettings = {
  ownerName: 'Chủ Tài Khoản (Tôi)',
  ownerPhone: '0987654321',
  bankId: 'MB',
  bankName: 'MB Bank',
  accountNumber: '0987654321',
  accountName: 'CHU TAI KHOAN',
  defaultMemoPrefix: 'TRA NO',
  ownerPassword: '123456',
  appTitle: DEFAULT_APP_TITLE,
  appSubtitle: DEFAULT_APP_SUBTITLE,
  shareMessageTemplate: DEFAULT_SHARE_MESSAGE,
  reminderMessageTemplate: DEFAULT_REMINDER_MESSAGE,
  guestAnnouncement: DEFAULT_GUEST_ANNOUNCEMENT,
  settledThankYouNote: DEFAULT_SETTLED_NOTE,
};

export const INITIAL_DEBTORS: Debtor[] = [
  {
    id: 'debtor-nam',
    name: 'Nguyễn Văn Nam',
    pin: '1234',
    note: 'Bạn cấp 3, hay đi ăn lẩu',
    createdAt: '2026-09-01T08:00:00.000Z',
    updatedAt: '2026-09-06T12:00:00.000Z',
  },
  {
    id: 'debtor-binh',
    name: 'Trần Thị Bình',
    pin: '2345',
    note: 'Đồng nghiệp cùng phòng ban',
    createdAt: '2026-09-02T09:30:00.000Z',
    updatedAt: '2026-09-03T20:00:00.000Z',
  },
  {
    id: 'debtor-an',
    name: 'Lê Văn An',
    pin: '3456',
    note: 'Nhóm đá banh chiều thứ 7',
    createdAt: '2026-09-02T10:00:00.000Z',
    updatedAt: '2026-09-03T20:00:00.000Z',
  },
  {
    id: 'debtor-cuong',
    name: 'Phạm Văn Cường',
    pin: '4567',
    note: 'Hàng xóm chung cư',
    createdAt: '2026-09-01T15:00:00.000Z',
    updatedAt: '2026-09-01T15:00:00.000Z',
  },
];

export const INITIAL_TRANSACTIONS: Transaction[] = [
  {
    id: 'tx-1',
    debtorId: 'debtor-nam',
    type: 'ADD',
    amount: 100000,
    date: '2026-09-01',
    note: 'Vay tiền mặt đổ xăng',
    category: 'SINGLE',
    createdAt: '2026-09-01T08:30:00.000Z',
  },
  {
    id: 'tx-2',
    debtorId: 'debtor-nam',
    type: 'ADD',
    amount: 300000,
    date: '2026-09-03',
    note: 'Chia tiền cuộc ăn chơi: Đi ăn Lẩu Bò',
    category: 'PARTY_SPLIT',
    partyId: 'party-1',
    createdAt: '2026-09-03T21:00:00.000Z',
  },
  {
    id: 'tx-3',
    debtorId: 'debtor-binh',
    type: 'ADD',
    amount: 300000,
    date: '2026-09-03',
    note: 'Chia tiền cuộc ăn chơi: Đi ăn Lẩu Bò',
    category: 'PARTY_SPLIT',
    partyId: 'party-1',
    createdAt: '2026-09-03T21:00:00.000Z',
  },
  {
    id: 'tx-4',
    debtorId: 'debtor-an',
    type: 'ADD',
    amount: 300000,
    date: '2026-09-03',
    note: 'Chia tiền cuộc ăn chơi: Đi ăn Lẩu Bò',
    category: 'PARTY_SPLIT',
    partyId: 'party-1',
    createdAt: '2026-09-03T21:00:00.000Z',
  },
  {
    id: 'tx-5',
    debtorId: 'debtor-nam',
    type: 'SUB',
    amount: 200000,
    date: '2026-09-05',
    note: 'Chuyển khoản trả bớt tiền lẩu',
    category: 'PAYMENT_SETTLED',
    createdAt: '2026-09-05T14:20:00.000Z',
  },
  {
    id: 'tx-6',
    debtorId: 'debtor-nam',
    type: 'SUB',
    amount: 50000,
    date: '2026-09-06',
    note: 'Nam mua hộ ly cà phê',
    category: 'SINGLE',
    createdAt: '2026-09-06T09:15:00.000Z',
  },
  {
    id: 'tx-7',
    debtorId: 'debtor-cuong',
    type: 'ADD',
    amount: 50000,
    date: '2026-09-01',
    note: 'Mượn tiền mặt ăn sáng',
    category: 'SINGLE',
    createdAt: '2026-09-01T07:45:00.000Z',
  },
];

export const INITIAL_PARTIES: PartySplit[] = [
  {
    id: 'party-1',
    name: 'Đi ăn Lẩu Bò',
    date: '2026-09-03',
    totalAmount: 1200000,
    payerType: 'ME',
    participantDebtorIds: ['debtor-nam', 'debtor-binh', 'debtor-an'],
    includeMe: true,
    splitAmountPerPerson: 300000,
    createdAt: '2026-09-03T21:00:00.000Z',
  },
];

export interface DatasetPreset {
  id: string;
  name: string;
  description: string;
  tag: string;
  scenarioTag: string;
  icon: string;
  debtorCount: number;
  debtorsCount: number;
  txCount: number;
  transactionsCount: number;
  getData: () => {
    debtors: Debtor[];
    transactions: Transaction[];
    parties: PartySplit[];
    settings?: Partial<AppSettings>;
  };
}

export const DATASET_PRESETS: DatasetPreset[] = [
  {
    id: 'DEFAULT',
    name: 'Dữ liệu mẫu mặc định (4 người nợ)',
    description: '4 người nợ mẫu: Nam, Bình, An, Cường và các giao dịch mẫu.',
    tag: 'Mặc định',
    scenarioTag: 'Dữ liệu mẫu cơ bản',
    icon: '👥',
    debtorCount: INITIAL_DEBTORS.length,
    debtorsCount: INITIAL_DEBTORS.length,
    txCount: INITIAL_TRANSACTIONS.length,
    transactionsCount: INITIAL_TRANSACTIONS.length,
    getData: () => ({
      debtors: JSON.parse(JSON.stringify(INITIAL_DEBTORS)),
      transactions: JSON.parse(JSON.stringify(INITIAL_TRANSACTIONS)),
      parties: JSON.parse(JSON.stringify(INITIAL_PARTIES)),
    }),
  },
  {
    id: 'EMPTY',
    name: 'Làm sạch hoàn toàn (Sổ trắng tinh)',
    description: 'Xóa toàn bộ người nợ và lịch sử giao dịch để tự nhập từ đầu.',
    tag: 'Khởi tạo mới',
    scenarioTag: 'Làm sạch hoàn toàn',
    icon: '🧹',
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
