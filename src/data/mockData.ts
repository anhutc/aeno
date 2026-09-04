/**
 * ============================================================================
 * GHI CHÚ CHỈNH SỬA / CHANGELOG:
 * - Xóa toàn bộ số điện thoại (phone) của người nợ trong dữ liệu mẫu (INITIAL_DEBTORS,
 *   TRAVEL_DEBTORS, OFFICE_DEBTORS, BUSINESS_DEBTORS).
 * - Bổ sung số điện thoại Chủ Nợ (ownerPhone: '0987654321') vào DEFAULT_SETTINGS.
 * ============================================================================
 */

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

// --- PRESET 2: HỘI NHÓM DU LỊCH & DÃ NGOẠI (TRAVEL) ---
export const TRAVEL_DEBTORS: Debtor[] = [
  {
    id: 'travel-tuan',
    name: 'Nguyễn Anh Tuấn (Trưởng đoàn)',
    pin: 'tuan88',
    note: 'Thuê xe 16 chỗ và lái chính',
    createdAt: '2026-09-01T08:00:00.000Z',
    updatedAt: '2026-09-05T10:00:00.000Z',
  },
  {
    id: 'travel-huong',
    name: 'Lê Thu Hương',
    pin: 'huong92',
    note: 'Đặt phòng homestay',
    createdAt: '2026-09-01T08:00:00.000Z',
    updatedAt: '2026-09-05T10:00:00.000Z',
  },
  {
    id: 'travel-minh',
    name: 'Trần Quang Minh',
    pin: 'minh95',
    note: 'Thành viên nhóm xe 1',
    createdAt: '2026-09-01T08:00:00.000Z',
    updatedAt: '2026-09-05T10:00:00.000Z',
  },
  {
    id: 'travel-trang',
    name: 'Vũ Phương Trang',
    pin: 'trang96',
    note: 'Thủ quỹ đồ ăn vặt',
    createdAt: '2026-09-01T08:00:00.000Z',
    updatedAt: '2026-09-05T10:00:00.000Z',
  },
  {
    id: 'travel-hung',
    name: 'Đỗ Hoàng Hùng',
    pin: 'hung90',
    note: 'Mua than và đồ nướng BBQ',
    createdAt: '2026-09-01T08:00:00.000Z',
    updatedAt: '2026-09-05T10:00:00.000Z',
  },
];

export const TRAVEL_PARTIES: PartySplit[] = [
  {
    id: 'party-travel-1',
    name: 'Thuê Homestay Biển 2N1Đ',
    date: '2026-09-02',
    totalAmount: 3000000,
    payerType: 'ME',
    participantDebtorIds: ['travel-tuan', 'travel-huong', 'travel-minh', 'travel-trang', 'travel-hung'],
    includeMe: true,
    splitAmountPerPerson: 500000,
    createdAt: '2026-09-02T10:00:00.000Z',
  },
  {
    id: 'party-travel-2',
    name: 'Tiệc Nướng BBQ Hải Sản Bãi Biển',
    date: '2026-09-02',
    totalAmount: 1800000,
    payerType: 'ME',
    participantDebtorIds: ['travel-tuan', 'travel-huong', 'travel-minh', 'travel-trang', 'travel-hung'],
    includeMe: true,
    splitAmountPerPerson: 300000,
    createdAt: '2026-09-02T19:30:00.000Z',
  },
];

export const TRAVEL_TRANSACTIONS: Transaction[] = [
  {
    id: 'tx-tr-1',
    debtorId: 'travel-tuan',
    type: 'ADD',
    amount: 500000,
    date: '2026-09-02',
    note: 'Chia tiền: Thuê Homestay Biển 2N1Đ',
    category: 'PARTY_SPLIT',
    partyId: 'party-travel-1',
    createdAt: '2026-09-02T10:00:00.000Z',
  },
  {
    id: 'tx-tr-2',
    debtorId: 'travel-huong',
    type: 'ADD',
    amount: 500000,
    date: '2026-09-02',
    note: 'Chia tiền: Thuê Homestay Biển 2N1Đ',
    category: 'PARTY_SPLIT',
    partyId: 'party-travel-1',
    createdAt: '2026-09-02T10:00:00.000Z',
  },
  {
    id: 'tx-tr-3',
    debtorId: 'travel-minh',
    type: 'ADD',
    amount: 500000,
    date: '2026-09-02',
    note: 'Chia tiền: Thuê Homestay Biển 2N1Đ',
    category: 'PARTY_SPLIT',
    partyId: 'party-travel-1',
    createdAt: '2026-09-02T10:00:00.000Z',
  },
  {
    id: 'tx-tr-4',
    debtorId: 'travel-trang',
    type: 'ADD',
    amount: 500000,
    date: '2026-09-02',
    note: 'Chia tiền: Thuê Homestay Biển 2N1Đ',
    category: 'PARTY_SPLIT',
    partyId: 'party-travel-1',
    createdAt: '2026-09-02T10:00:00.000Z',
  },
  {
    id: 'tx-tr-5',
    debtorId: 'travel-hung',
    type: 'ADD',
    amount: 500000,
    date: '2026-09-02',
    note: 'Chia tiền: Thuê Homestay Biển 2N1Đ',
    category: 'PARTY_SPLIT',
    partyId: 'party-travel-1',
    createdAt: '2026-09-02T10:00:00.000Z',
  },
  {
    id: 'tx-tr-6',
    debtorId: 'travel-tuan',
    type: 'ADD',
    amount: 300000,
    date: '2026-09-02',
    note: 'Chia tiền: Tiệc Nướng BBQ Hải Sản',
    category: 'PARTY_SPLIT',
    partyId: 'party-travel-2',
    createdAt: '2026-09-02T19:30:00.000Z',
  },
  {
    id: 'tx-tr-7',
    debtorId: 'travel-minh',
    type: 'ADD',
    amount: 300000,
    date: '2026-09-02',
    note: 'Chia tiền: Tiệc Nướng BBQ Hải Sản',
    category: 'PARTY_SPLIT',
    partyId: 'party-travel-2',
    createdAt: '2026-09-02T19:30:00.000Z',
  },
  {
    id: 'tx-tr-8',
    debtorId: 'travel-tuan',
    type: 'SUB',
    amount: 400000,
    date: '2026-09-04',
    note: 'Chuyển khoản thanh toán tiền homestay',
    category: 'PAYMENT_SETTLED',
    createdAt: '2026-09-04T12:00:00.000Z',
  },
];

// --- PRESET 3: CÔNG TY & CƠM TRƯA VĂN PHÒNG (OFFICE) ---
export const OFFICE_DEBTORS: Debtor[] = [
  {
    id: 'office-maianh',
    name: 'Hoàng Mai Anh',
    pin: 'maianh',
    note: 'Phòng Thiết kế',
    createdAt: '2026-09-01T08:00:00.000Z',
    updatedAt: '2026-09-05T12:00:00.000Z',
  },
  {
    id: 'office-bao',
    name: 'Bùi Quốc Bảo',
    pin: 'baobq',
    note: 'Developer Backend',
    createdAt: '2026-09-01T08:00:00.000Z',
    updatedAt: '2026-09-05T12:00:00.000Z',
  },
  {
    id: 'office-yen',
    name: 'Đặng Hải Yến',
    pin: 'yenhai',
    note: 'Kế toán tổng hợp',
    createdAt: '2026-09-01T08:00:00.000Z',
    updatedAt: '2026-09-05T12:00:00.000Z',
  },
  {
    id: 'office-long',
    name: 'Nguyễn Văn Long',
    pin: 'longnv',
    note: 'Marketing & SEO',
    createdAt: '2026-09-01T08:00:00.000Z',
    updatedAt: '2026-09-05T12:00:00.000Z',
  },
];

export const OFFICE_PARTIES: PartySplit[] = [
  {
    id: 'party-off-1',
    name: 'Cơm Trưa Cơm Tấm Sài Gòn (Thứ 4)',
    date: '2026-09-03',
    totalAmount: 225000,
    payerType: 'ME',
    participantDebtorIds: ['office-maianh', 'office-bao', 'office-yen', 'office-long'],
    includeMe: true,
    splitAmountPerPerson: 45000,
    createdAt: '2026-09-03T12:30:00.000Z',
  },
  {
    id: 'party-off-2',
    name: 'Trà Sữa Gong Cha Chiều Thứ 6',
    date: '2026-09-05',
    totalAmount: 260000,
    payerType: 'ME',
    participantDebtorIds: ['office-maianh', 'office-bao', 'office-yen', 'office-long'],
    includeMe: true,
    splitAmountPerPerson: 52000,
    createdAt: '2026-09-05T15:30:00.000Z',
  },
];

export const OFFICE_TRANSACTIONS: Transaction[] = [
  {
    id: 'tx-off-1',
    debtorId: 'office-maianh',
    type: 'ADD',
    amount: 45000,
    date: '2026-09-03',
    note: 'Cơm sườn bì chả trưa thứ 4',
    category: 'PARTY_SPLIT',
    partyId: 'party-off-1',
    createdAt: '2026-09-03T12:30:00.000Z',
  },
  {
    id: 'tx-off-2',
    debtorId: 'office-bao',
    type: 'ADD',
    amount: 45000,
    date: '2026-09-03',
    note: 'Cơm tấm sườn ốp la',
    category: 'PARTY_SPLIT',
    partyId: 'party-off-1',
    createdAt: '2026-09-03T12:30:00.000Z',
  },
  {
    id: 'tx-off-3',
    debtorId: 'office-yen',
    type: 'ADD',
    amount: 45000,
    date: '2026-09-03',
    note: 'Cơm đùi gà nướng',
    category: 'PARTY_SPLIT',
    partyId: 'party-off-1',
    createdAt: '2026-09-03T12:30:00.000Z',
  },
  {
    id: 'tx-off-4',
    debtorId: 'office-long',
    type: 'ADD',
    amount: 45000,
    date: '2026-09-03',
    note: 'Cơm sườn non ram',
    category: 'PARTY_SPLIT',
    partyId: 'party-off-1',
    createdAt: '2026-09-03T12:30:00.000Z',
  },
  {
    id: 'tx-off-5',
    debtorId: 'office-maianh',
    type: 'ADD',
    amount: 52000,
    date: '2026-09-05',
    note: 'Trà ô long sữa trân châu trắng',
    category: 'PARTY_SPLIT',
    partyId: 'party-off-2',
    createdAt: '2026-09-05T15:30:00.000Z',
  },
  {
    id: 'tx-off-6',
    debtorId: 'office-bao',
    type: 'ADD',
    amount: 52000,
    date: '2026-09-05',
    note: 'Trà đen macchiato',
    category: 'PARTY_SPLIT',
    partyId: 'party-off-2',
    createdAt: '2026-09-05T15:30:00.000Z',
  },
  {
    id: 'tx-off-7',
    debtorId: 'office-maianh',
    type: 'SUB',
    amount: 97000,
    date: '2026-09-05',
    note: 'Chuyển khoản quyết toán cơm & trà sữa',
    category: 'PAYMENT_SETTLED',
    createdAt: '2026-09-05T16:00:00.000Z',
  },
];

// --- PRESET 4: CỬA HÀNG KINH DOANH & BÁN BUÔN (BUSINESS) ---
export const BUSINESS_DEBTORS: Debtor[] = [
  {
    id: 'biz-lan',
    name: 'Đại lý Chị Lan (Chợ Lớn)',
    pin: 'lancl',
    note: 'Lấy sỉ tạp hóa, thanh toán gối đầu theo tuần',
    createdAt: '2026-09-01T08:00:00.000Z',
    updatedAt: '2026-09-06T09:00:00.000Z',
  },
  {
    id: 'biz-duc',
    name: 'Anh Đức (Cửa hàng VLXD)',
    pin: 'ducvlxd',
    note: 'Vật liệu công trình, đặt hàng đợt 1',
    createdAt: '2026-09-01T08:00:00.000Z',
    updatedAt: '2026-09-06T09:00:00.000Z',
  },
  {
    id: 'biz-tri',
    name: 'Tiệm Tạp Hóa Minh Trí',
    pin: 'minhtri',
    note: 'Khách quen lấy bánh kẹo',
    createdAt: '2026-09-02T10:00:00.000Z',
    updatedAt: '2026-09-06T09:00:00.000Z',
  },
];

export const BUSINESS_TRANSACTIONS: Transaction[] = [
  {
    id: 'tx-biz-1',
    debtorId: 'biz-lan',
    type: 'ADD',
    amount: 4500000,
    date: '2026-09-01',
    note: 'Xuất 10 thùng dầu ăn & 5 thùng mì',
    category: 'SINGLE',
    createdAt: '2026-09-01T09:00:00.000Z',
  },
  {
    id: 'tx-biz-2',
    debtorId: 'biz-lan',
    type: 'SUB',
    amount: 2000000,
    date: '2026-09-03',
    note: 'Thanh toán đợt 1 tiền hàng',
    category: 'PAYMENT_SETTLED',
    createdAt: '2026-09-03T14:00:00.000Z',
  },
  {
    id: 'tx-biz-3',
    debtorId: 'biz-duc',
    type: 'ADD',
    amount: 8200000,
    date: '2026-09-02',
    note: 'Giao 2 tấn xi măng và sắt thép phi 10',
    category: 'SINGLE',
    createdAt: '2026-09-02T11:00:00.000Z',
  },
  {
    id: 'tx-biz-4',
    debtorId: 'biz-duc',
    type: 'SUB',
    amount: 5000000,
    date: '2026-09-04',
    note: 'Chuyển khoản đặt cọc 60%',
    category: 'PAYMENT_SETTLED',
    createdAt: '2026-09-04T16:30:00.000Z',
  },
  {
    id: 'tx-biz-5',
    debtorId: 'biz-tri',
    type: 'ADD',
    amount: 1450000,
    date: '2026-09-03',
    note: 'Giao 3 thùng bánh kẹo Oishi & nước ngọt',
    category: 'SINGLE',
    createdAt: '2026-09-03T08:45:00.000Z',
  },
];

export const BUSINESS_PARTIES: PartySplit[] = [];

export interface DatasetPreset {
  id: string;
  name: string;
  description: string;
  tag: string;
  scenarioTag?: string;
  icon?: string;
  debtorCount: number;
  debtorsCount?: number;
  txCount: number;
  transactionsCount?: number;
  getData: () => {
    debtors: Debtor[];
    transactions: Transaction[];
    parties: PartySplit[];
    settings?: Partial<AppSettings>;
  };
}

export const DATASET_PRESETS: DatasetPreset[] = [
  {
    id: 'SAMPLE',
    name: 'Sổ Cá Nhân & Bạn Bè (Mặc Định)',
    description: '4 người bạn thân (Nam, Bình, An, Cường) với các giao dịch ăn lẩu, vay mượn nhỏ thường ngày.',
    tag: 'Cơ bản',
    scenarioTag: 'Bạn bè & Gia đình',
    icon: '🧑‍🤝‍🧑',
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
    id: 'TRAVEL',
    name: 'Chuyến Đi Du Lịch & Phượt 2N1Đ',
    description: '6 thành viên đi du lịch biển, chia tiền homestay, tiệc BBQ hải sản, xăng xe công bằng theo đầu người.',
    tag: 'Du lịch',
    scenarioTag: 'Chuyến đi & Phượt',
    icon: '✈️',
    debtorCount: TRAVEL_DEBTORS.length,
    debtorsCount: TRAVEL_DEBTORS.length,
    txCount: TRAVEL_TRANSACTIONS.length,
    transactionsCount: TRAVEL_TRANSACTIONS.length,
    getData: () => ({
      debtors: JSON.parse(JSON.stringify(TRAVEL_DEBTORS)),
      transactions: JSON.parse(JSON.stringify(TRAVEL_TRANSACTIONS)),
      parties: JSON.parse(JSON.stringify(TRAVEL_PARTIES)),
      settings: {
        appTitle: 'Sổ Nợ Du Lịch & Chuyến Đi',
        appSubtitle: 'Chia tiền homestay, tiệc nướng BBQ & chi phí chung',
      },
    }),
  },
  {
    id: 'OFFICE',
    name: 'Cơm Trưa & Trà Sữa Văn Phòng',
    description: 'Nhóm đồng nghiệp công ty đặt cơm tấm, trà sữa chiều, chia đều tiền món và phí giao hàng.',
    tag: 'Văn phòng',
    scenarioTag: 'Đồng nghiệp & Công ty',
    icon: '☕',
    debtorCount: OFFICE_DEBTORS.length,
    debtorsCount: OFFICE_DEBTORS.length,
    txCount: OFFICE_TRANSACTIONS.length,
    transactionsCount: OFFICE_TRANSACTIONS.length,
    getData: () => ({
      debtors: JSON.parse(JSON.stringify(OFFICE_DEBTORS)),
      transactions: JSON.parse(JSON.stringify(OFFICE_TRANSACTIONS)),
      parties: JSON.parse(JSON.stringify(OFFICE_PARTIES)),
      settings: {
        appTitle: 'Sổ Nợ Cơm Trưa & Trà Sữa',
        appSubtitle: 'Gom đơn ăn uống văn phòng, chia tiền nhanh chóng',
      },
    }),
  },
  {
    id: 'BUSINESS',
    name: 'Kinh Doanh Bán Buôn & Khách Nợ',
    description: 'Ghi sổ giao nhận hàng hóa sỉ, đại lý thanh toán gối đầu, vật liệu xây dựng, đặt cọc công trình.',
    tag: 'Kinh doanh',
    scenarioTag: 'Bán sỉ & Cửa hàng',
    icon: '💼',
    debtorCount: BUSINESS_DEBTORS.length,
    debtorsCount: BUSINESS_DEBTORS.length,
    txCount: BUSINESS_TRANSACTIONS.length,
    transactionsCount: BUSINESS_TRANSACTIONS.length,
    getData: () => ({
      debtors: JSON.parse(JSON.stringify(BUSINESS_DEBTORS)),
      transactions: JSON.parse(JSON.stringify(BUSINESS_TRANSACTIONS)),
      parties: JSON.parse(JSON.stringify(BUSINESS_PARTIES)),
      settings: {
        appTitle: 'Sổ Công Nợ Bán Hàng',
        appSubtitle: 'Theo dõi xuất hàng, công nợ đại lý & thanh toán từng đợt',
      },
    }),
  },
  {
    id: 'EMPTY',
    name: 'Làm Sạch 100% (Sổ Trắng Tinh)',
    description: 'Xóa toàn bộ người nợ và lịch sử giao dịch trên Cloud Firestore để bạn tự tay nhập từ đầu.',
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
