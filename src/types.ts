/**
 * ============================================================================
 * GHI CHÚ CHỈNH SỬA / CHANGELOG:
 * - Xóa bỏ số điện thoại người nợ: Tinh gọn thực thể Debtor (không còn dùng phone).
 * - Bổ sung số điện thoại Chủ Nợ (ownerPhone) trong AppSettings để người nợ dễ dàng
 *   gọi điện, liên hệ Zalo khi cần đối soát hoặc xác nhận chuyển khoản.
 * ============================================================================
 */

export interface Debtor {
  id: string;
  name: string;
  phone?: string; // Đã loại bỏ trong UI và dữ liệu mới
  pin: string; // Mật khẩu (Pass) tra cứu cá nhân (chữ hoặc số)
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export type TransactionType = 'ADD' | 'SUB'; // ADD = Cộng vào nợ (Họ nợ thêm); SUB = Trừ khỏi nợ (Họ trả bớt / mua hộ)

export type TransactionCategory = 'SINGLE' | 'PARTY_SPLIT' | 'PAYMENT_SETTLED' | 'SELF_REPORTED';

export interface Transaction {
  id: string;
  debtorId: string;
  type: TransactionType;
  amount: number;
  date: string; // YYYY-MM-DD
  note: string;
  category: TransactionCategory;
  billImage?: string; // base64 or receipt image URL
  partyId?: string;
  // Chi tiết ăn chia nhóm để người tra cứu biết tổng tiền trước khi chia và danh sách tham gia
  partyTotalAmount?: number; // Tổng số tiền trước khi chia (VD: 1.200.000đ)
  partyParticipants?: string[]; // Danh sách tên những người tham gia (VD: ['Tôi (Chủ sổ)', 'Nguyễn Văn Nam', 'Bạn Tuấn'])
  partySplitAmount?: number; // Số tiền mỗi người (VD: 300.000đ)
  partyTotalPeople?: number; // Tổng số người chia bill (VD: 5)
  partyPayerName?: string; // Tên người đã thanh toán trước (VD: 'Tôi (Chủ sổ)')
  partyName?: string; // Tên cuộc vui (VD: 'Đi ăn Lẩu Bò')
  customNote?: string; // Ghi chú tùy chọn riêng của người dùng cho cuộc vui / giao dịch
  createdAt: string;
}

export interface PartySplit {
  id: string;
  name: string; // e.g., "Đi ăn Lẩu Bò"
  date: string;
  totalAmount: number;
  payerType: 'ME' | 'DEBTOR' | 'DEBTOR_ASSIGNED'; // Who paid upfront (ME = Tôi trả; DEBTOR = Họ trả phần tôi; DEBTOR_ASSIGNED = Họ trả & gán nợ cho tôi)
  payerDebtorId?: string; // If a debtor paid
  participantDebtorIds: string[]; // List of debtor IDs participating
  includeMe: boolean; // Did "Tôi" also participate
  payerIncluded?: boolean; // Did the payer also participate in the split
  splitAmountPerPerson: number;
  totalPeopleCount?: number; // Tổng số người tham gia chia tiền (kể cả khi tôi nợ họ)
  billImage?: string;
  note?: string; // Ghi chú thêm tùy chọn của cuộc vui
  createdAt: string;
}

export interface AppSettings {
  ownerName: string;
  ownerPhone?: string; // Số điện thoại Chủ Nợ (để người nợ gọi điện / Zalo liên hệ)
  bankId: string; // MB, VCB, TCB, etc.
  bankName: string;
  accountNumber: string;
  accountName: string;
  defaultMemoPrefix: string;
  ownerPassword?: string; // Mật khẩu bảo vệ link riêng của Chủ Sổ

  // Tùy biến QR code
  defaultQrMode?: 'MANUAL_AMOUNT' | 'FULL_AMOUNT'; // MANUAL_AMOUNT = Tự nhập trên app ngân hàng khi quét (mặc định)
  vietQrTemplate?: 'compact2' | 'compact' | 'qr_only';

  // Tùy biến văn bản & Hướng dẫn tra cứu
  appTitle?: string; // Tên hiển thị sổ nợ / tiêu đề chính
  appSubtitle?: string; // Slogan / Mô tả phụ
  lookupGuideTemplate?: string; // Mẫu hướng dẫn truy cập tra cứu gửi cho người nợ
  shareMessageTemplate?: string; // Tương thích ngược
  guestAnnouncement?: string; // Lời nhắn ghim của chủ sổ gửi đến khách
  settledThankYouNote?: string; // Lời cảm ơn khi đã hoàn tất thanh toán
  lookupInstructionText?: string; // Hướng dẫn 3 bước ở trang đăng nhập của khách

  // Tùy biến giao diện & hiển thị
  themeColor?: 'emerald' | 'blue' | 'indigo' | 'slate' | 'violet';
  debtorCardLayout?: 'grid' | 'compact';
  showSummaryStats?: boolean;
  currencySuffix?: string;

  // Trạng thái hệ thống & đồng bộ
  isInitialized?: boolean;
  lastClearedAt?: string;
  autoLockTimeout?: 'IMMEDIATE' | '30_SEC' | '1_MIN' | '5_MIN' | 'OFF'; // Tự động khóa khi rời ứng dụng

  // Cài đặt đồng bộ máy chủ & đám mây (Cloud Sync Server)
  syncServerUrl?: string;
  syncApiKey?: string;
  autoSyncEnabled?: boolean;
  lastSyncTime?: string;
}

export interface BankOption {
  id: string;
  name: string;
  shortName: string;
  logo?: string;
}
