import { BankOption } from '../types';

export const POPULAR_BANKS: BankOption[] = [
  { id: 'MB', name: 'Ngân hàng Quân Đội', shortName: 'MB Bank' },
  { id: 'VCB', name: 'Ngân hàng Ngoại Thương VN', shortName: 'Vietcombank' },
  { id: 'TCB', name: 'Ngân hàng Kỹ Thương VN', shortName: 'Techcombank' },
  { id: 'VPB', name: 'Ngân hàng Việt Nam Thịnh Vượng', shortName: 'VPBank' },
  { id: 'ACB', name: 'Ngân hàng Á Châu', shortName: 'ACB' },
  { id: 'TPB', name: 'Ngân hàng Tiên Phong', shortName: 'TPBank' },
  { id: 'BIDV', name: 'Ngân hàng Đầu tư và Phát triển VN', shortName: 'BIDV' },
  { id: 'ICB', name: 'Ngân hàng Công Thương VN', shortName: 'VietinBank' },
  { id: 'STB', name: 'Ngân hàng Sài Gòn Thương Tín', shortName: 'Sacombank' },
  { id: 'HDB', name: 'Ngân hàng Phát triển TP.HCM', shortName: 'HDBank' },
  { id: 'OCB', name: 'Ngân hàng Phương Đông', shortName: 'OCB' },
  { id: 'VBA', name: 'Ngân hàng Nông nghiệp & PTNT', shortName: 'Agribank' },
  { id: 'MSB', name: 'Ngân hàng Hàng Hải', shortName: 'MSB' },
  { id: 'VIB', name: 'Ngân hàng Quốc tế', shortName: 'VIB' },
];

export function generateVietQrUrl(params: {
  bankId: string;
  accountNumber: string;
  accountName?: string;
  amount?: number;
  memo?: string;
  template?: 'compact2' | 'compact' | 'qr_only';
}): string {
  const {
    bankId,
    accountNumber,
    accountName = '',
    amount = 0,
    memo = '',
    template = 'compact2',
  } = params;

  const cleanAcc = accountNumber.replace(/\s+/g, '');
  const cleanBank = bankId.trim();

  const baseUrl = `https://img.vietqr.io/image/${cleanBank}-${cleanAcc}-${template}.png`;
  const searchParams = new URLSearchParams();

  if (amount && amount > 0) {
    searchParams.append('amount', Math.round(amount).toString());
  }
  if (memo) {
    searchParams.append('addInfo', memo.slice(0, 50));
  }
  if (accountName) {
    searchParams.append('accountName', accountName.trim());
  }

  const queryString = searchParams.toString();
  return queryString ? `${baseUrl}?${queryString}` : baseUrl;
}

export function formatVND(amount: number, suffix: string = 'VNĐ'): string {
  const isNegative = amount < 0;
  const abs = Math.abs(amount);
  const formatted = new Intl.NumberFormat('vi-VN').format(abs) + ' ' + suffix;
  return isNegative ? `-${formatted}` : formatted;
}
