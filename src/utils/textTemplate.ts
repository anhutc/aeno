/**
 * ============================================================================
 * GHI CHÚ CHỈNH SỬA / CHANGELOG:
 * - Thêm biến mẫu {ownerPhone} và {sdt_chu_no} để hiển thị số điện thoại của Chủ Nợ
 *   trong mẫu tin nhắn hướng dẫn và tin nhắn nhắc nợ.
 * ============================================================================
 */

import { formatVND } from './vietqr';

export const DEFAULT_APP_TITLE = 'Sổ Ghi Nợ & Chia Tiền';
export const DEFAULT_APP_SUBTITLE =
  'Ghi chép minh bạch, chia tiền ăn chơi, sao kê chi tiết & thanh toán VietQR';

export const DEFAULT_LOOKUP_GUIDE = `📋 HƯỚNG DẪN TRUY CẬP TRA CỨU SỔ GIAO DỊCH
Chào {name},
Dưới đây là thông tin để bạn tự kiểm tra lịch sử chi tiêu và số dư giao dịch:
🔗 Link tra cứu chung: {url}
🔑 Mật khẩu (Pass) riêng của bạn: {pass}

👉 Các bước tra cứu rất đơn giản:
1. Bấm vào Link tra cứu chung ở trên.
2. Nhập Mật khẩu (Pass): {pass}
3. Bạn sẽ xem được toàn bộ sao kê chi tiết từng khoản cộng/trừ và mã VietQR để thanh toán nhanh (quét xong tự nhập số tiền tùy ý trên app ngân hàng).`;

export const DEFAULT_REMINDER_TEMPLATE = `👋 Chào {name},
Mình gửi bạn thông báo số dư nợ hiện tại trong sổ:
💰 Số tiền cần thanh toán: {balance}
🔗 Link xem sao kê chi tiết: {url} (Mật khẩu: {pass})

💳 Thông tin chuyển khoản VietQR:
- Ngân hàng: {bank}
- Số tài khoản: {account}
- Chủ tài khoản: {accountName}
- Nội dung chuyển khoản: TRA NO {name}

Khi nào thuận tiện bạn sắp xếp chuyển khoản giúp mình nhé. Cảm ơn bạn nhiều!`;

// Backward-compatibility aliases
export const DEFAULT_SHARE_MESSAGE = DEFAULT_LOOKUP_GUIDE;
export const DEFAULT_REMINDER_MESSAGE = DEFAULT_REMINDER_TEMPLATE;

export const DEFAULT_GUEST_ANNOUNCEMENT =
  'Sổ giao dịch cập nhật tự động. Khi chuyển khoản xin giữ nguyên nội dung để hệ thống đối soát chính xác nhé!';

export const DEFAULT_SETTLED_NOTE =
  '🎉 Tuyệt vời! Bạn đã thanh toán xong toàn bộ các khoản nợ. Cảm ơn bạn nhiều!';

export const DEFAULT_LOOKUP_INSTRUCTION =
  'Nhập mật khẩu (pass) cá nhân được chủ sổ cung cấp để tra cứu lịch sử chi tiêu, sao kê nợ và quét mã VietQR chuyển khoản nhanh.';

export interface TemplateVariables {
  name: string;
  pin: string; // also mapped to {pass}
  pass: string;
  url: string;
  balance: string;
  owner: string;
  ownerPhone?: string;
  bank: string;
  account: string;
  accountName: string;
  // Optional aliases for flexibility
  ten_nguoi_no?: string;
  so_du?: string;
  so_du_so?: string;
  link_tra_cuu?: string;
  ten_chu_so?: string;
  sdt_chu_no?: string;
  ten_ngan_hang?: string;
  stk?: string;
  ten_chu_tk?: string;
}

export const TEMPLATE_TAG_DESCRIPTIONS: { tag: string; label: string; example: string }[] = [
  { tag: '{name}', label: 'Tên người nợ ({TEN_KHACH})', example: 'Nguyễn Văn Nam' },
  { tag: '{pass}', label: 'Mật khẩu / Pass ({PASS})', example: 'nam123' },
  { tag: '{url}', label: 'Link tra cứu chung ({LINK})', example: 'https://.../#guest' },
  { tag: '{balance}', label: 'Số tiền dư nợ ({SO_TIEN})', example: '250.000 đ' },
  { tag: '{bank}', label: 'Tên ngân hàng ({NGAN_HANG})', example: 'MB Bank' },
  { tag: '{account}', label: 'Số tài khoản ({SO_TK})', example: '0987654321' },
  { tag: '{accountName}', label: 'Chủ tài khoản ({CHU_TK})', example: 'NGUYEN VAN A' },
  { tag: '{owner}', label: 'Tên chủ sổ ({CHU_SO})', example: 'Anh Dũng' },
  { tag: '{ownerPhone}', label: 'SĐT Chủ Nợ ({SDT_CHU_NO})', example: '0987654321' },
];

export function renderMessageTemplate(
  template: string | undefined,
  vars: TemplateVariables,
  fallbackTemplate: string = DEFAULT_LOOKUP_GUIDE
): string {
  const tpl = template && template.trim() ? template : fallbackTemplate;
  const passValue = vars.pass || vars.pin || '';
  return tpl
    .replace(/\{name\}|\{TEN_KHACH\}|\{ten_nguoi_no\}/gi, vars.name || '')
    .replace(/\{pass\}|\{pin\}|\{PASS\}/gi, passValue)
    .replace(/\{url\}|\{link\}|\{LINK\}|\{link_tra_cuu\}/gi, vars.url || '')
    .replace(/\{balance\}|\{SO_TIEN\}|\{so_du\}/gi, vars.balance || '0 đ')
    .replace(/\{owner\}|\{CHU_SO\}|\{ten_chu_so\}/gi, vars.owner || '')
    .replace(/\{ownerPhone\}|\{SDT_CHU_NO\}|\{sdt_chu_no\}/gi, vars.ownerPhone || '')
    .replace(/\{bank\}|\{NGAN_HANG\}|\{ten_ngan_hang\}/gi, vars.bank || '')
    .replace(/\{account\}|\{SO_TK\}|\{stk\}/gi, vars.account || '')
    .replace(/\{accountName\}|\{CHU_TK\}|\{ten_chu_tk\}/gi, vars.accountName || '');
}

export function getDebtorTemplateVariables(params: {
  debtorName: string;
  debtorPin: string;
  balance: number;
  ownerName: string;
  ownerPhone?: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
}): TemplateVariables {
  const url = `${window.location.origin}${window.location.pathname}#guest`;
  const formattedBalance =
    params.balance > 0
      ? `+${formatVND(params.balance)}`
      : formatVND(params.balance);

  const pass = params.debtorPin;

  return {
    name: params.debtorName,
    pin: pass,
    pass,
    url,
    balance: formattedBalance,
    owner: params.ownerName,
    ownerPhone: params.ownerPhone || '',
    bank: params.bankName,
    account: params.accountNumber,
    accountName: params.accountName,
  };
}
