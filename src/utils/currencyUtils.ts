/**
 * Utilities for Vietnamese Currency (VNĐ) parsing, formatting,
 * thousands-unit input optimization, and number-to-words translation.
 */

// Đọc số tiếng Việt thành chữ chuẩn xác
const VI_DIGITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];

function readThreeDigits(n: number, readZeroHundred: boolean = true): string {
  const hundred = Math.floor(n / 100);
  const ten = Math.floor((n % 100) / 10);
  const unit = n % 10;
  let res = '';

  if (hundred > 0 || readZeroHundred) {
    res += `${VI_DIGITS[hundred]} trăm `;
  }

  if (ten > 1) {
    res += `${VI_DIGITS[ten]} mươi `;
    if (unit === 1) res += 'mốt ';
    else if (unit === 4) res += 'tư ';
    else if (unit === 5) res += 'lăm ';
    else if (unit > 0) res += `${VI_DIGITS[unit]} `;
  } else if (ten === 1) {
    res += 'mười ';
    if (unit === 1) res += 'một ';
    else if (unit === 4) res += 'bốn ';
    else if (unit === 5) res += 'lăm ';
    else if (unit > 0) res += `${VI_DIGITS[unit]} `;
  } else if (unit > 0) {
    if (hundred > 0 || readZeroHundred) res += 'lẻ ';
    res += `${VI_DIGITS[unit]} `;
  }

  return res.trim();
}

/**
 * Đọc số tiền thành chữ tiếng Việt (VNĐ)
 * Ví dụ: 50000 -> "Năm mươi nghìn đồng"
 *        1500000 -> "Một triệu năm trăm nghìn đồng"
 */
export function formatCurrencyInWords(amount: number): string {
  if (!amount || amount <= 0) return '';
  const num = Math.round(amount);
  if (num === 0) return 'Không đồng';

  const scales = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ', 'triệu tỷ'];
  let temp = num;
  const groups: number[] = [];

  while (temp > 0) {
    groups.push(temp % 1000);
    temp = Math.floor(temp / 1000);
  }

  let words = '';
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i];
    if (g > 0) {
      const readZero = i !== groups.length - 1;
      const gWord = readThreeDigits(g, readZero);
      words += `${gWord} ${scales[i]} `;
    }
  }

  words = words.trim().replace(/\s+/g, ' ');
  if (!words) return '';

  // Viết hoa chữ cái đầu và thêm đuôi "đồng"
  const capitalized = words.charAt(0).toUpperCase() + words.slice(1);
  return `${capitalized} đồng`;
}

/**
 * Phân tích chuỗi người dùng gõ (hỗ trợ gõ tắt: 50k, 100k, 1.5tr, 1tr5, 2m, ...)
 * Hoặc chế độ nhập theo nghìn (nhập 50 -> hiểu là 50.000).
 */
export function parseSmartAmount(input: string, inThousandsMode: boolean = false): number {
  if (!input) return 0;
  const trimmed = input.trim().toLowerCase().replace(/\s+/g, '');
  if (!trimmed) return 0;

  // 1. Kiểm tra nếu có dạng kết hợp như "1tr5" hoặc "1m5" (nghĩa là 1.5 triệu)
  const compoundMatch = trimmed.match(/^(\d+)(?:tr|m)(\d+)(?:k)?$/i);
  if (compoundMatch) {
    const tr = parseInt(compoundMatch[1], 10) || 0;
    const sub = compoundMatch[2];
    // Ví dụ "1tr5" -> 1.500.000, "1tr25" -> 1.250.000
    const fraction = sub.length === 1 ? parseInt(sub, 10) * 100000 : parseInt(sub.padEnd(6, '0'), 10);
    return tr * 1000000 + fraction;
  }

  // 2. Triệu / m (vd: 1.5tr, 2m, 0.5trieu)
  if (trimmed.endsWith('tr') || trimmed.endsWith('m') || trimmed.endsWith('trieu') || trimmed.endsWith('triệu')) {
    const raw = trimmed.replace(/tr|m|trieu|triệu/g, '').replace(',', '.');
    const val = parseFloat(raw);
    return isNaN(val) ? 0 : Math.round(val * 1000000);
  }

  // 3. Nghìn / k (vd: 50k, 150.5k, 20nghin, 20ngan)
  if (trimmed.endsWith('k') || trimmed.endsWith('nghin') || trimmed.endsWith('nghìn') || trimmed.endsWith('ngan') || trimmed.endsWith('ngàn')) {
    const raw = trimmed.replace(/k|nghin|nghìn|ngan|ngàn/g, '').replace(',', '.');
    const val = parseFloat(raw);
    return isNaN(val) ? 0 : Math.round(val * 1000);
  }

  // 4. Nếu người dùng đang ở chế độ nhập theo nghìn (Thousands Mode)
  if (inThousandsMode) {
    const cleaned = trimmed.replace(/\./g, '').replace(/,/g, '.');
    const val = parseFloat(cleaned);
    if (!isNaN(val) && val > 0) {
      return Math.round(val * 1000);
    }
  }

  // 5. Chuỗi số thông thường (chỉ giữ các chữ số)
  const digitsOnly = trimmed.replace(/\D/g, '');
  return digitsOnly ? parseInt(digitsOnly, 10) : 0;
}

/**
 * Định dạng số thành định dạng tiền tệ VNĐ ngắn gọn hoặc chuẩn
 */
export function formatThousandsDisplay(amount: number): string {
  if (!amount || isNaN(amount)) return '0';
  return new Intl.NumberFormat('vi-VN').format(Math.round(amount));
}
