import { Transaction, PartySplit, Debtor } from '../types';
import { loadParties, loadDebtors, loadSettings } from './storage';

export interface SplitParticipant {
  name: string;
  isCurrent: boolean;
}

export interface SplitBillDetails {
  isSplit: boolean;
  partyName: string;
  totalAmount: number;
  splitAmount: number;
  participantCount: number;
  participantNames: SplitParticipant[];
  extraCount: number; // Số người tham gia khác không rõ danh tính
  payerName?: string;
  billImage?: string;
}

/**
 * Robust helper to resolve split-bill details for a transaction.
 * Never leaves totalAmount or participants as '—' or empty, even for legacy
 * transactions that were saved before explicit split metadata existed.
 */
export function resolveSplitBillDetails(
  tx: Transaction,
  currentDebtor?: Debtor | null,
  partiesPool?: PartySplit[],
  debtorsPool?: Debtor[]
): SplitBillDetails {
  const isSplit =
    tx.category === 'PARTY_SPLIT' ||
    Boolean(tx.partyId) ||
    Boolean(tx.partyTotalAmount) ||
    Boolean(
      tx.note &&
        /(?:ăn\s*chia|gán\s*nợ|chia\s*tiền|cuộc\s*(?:ăn\s*chơi|vui)|trả\s*(?:tiền\s*cuộc\s*vui|bill))/i.test(
          tx.note
        )
    );

  if (!isSplit) {
    return {
      isSplit: false,
      partyName: '',
      totalAmount: 0,
      splitAmount: tx.amount,
      participantCount: 0,
      participantNames: [],
      extraCount: 0,
    };
  }

  // Load fallback reference pools
  const allParties = partiesPool && partiesPool.length > 0 ? partiesPool : loadParties();
  const allDebtors = debtorsPool && debtorsPool.length > 0 ? debtorsPool : loadDebtors();
  const settings = loadSettings();
  const ownerName = settings?.ownerName?.trim() || 'Tôi (Chủ sổ)';
  const currentDebtorName = currentDebtor?.name?.trim() || '';

  // 1. Matched party
  const matchedParty = allParties.find((p) => p.id === tx.partyId);

  // 2. Resolve party name
  let partyName = tx.partyName?.trim() || matchedParty?.name?.trim() || '';
  if (!partyName && tx.note) {
    partyName = tx.note
      .replace(/^(?:Ăn\s*Chia|Ăn\s*uống|Chia\s*tiền|Cuộc\s*vui)\s*(?:\(gán\s*nợ\s*từ\s*.*?\))?\s*:\s*/i, '')
      .replace(/^.*?\s*trả\s*bill\s*&\s*gán\s*nợ\s*:\s*/i, '')
      .replace(/\s*\(\s*Tổng\s*bill[\s\S]*?\)\s*$/i, '')
      .replace(/\s*\(\s*\d+\s*(?:người|bạn|nguoi|ban)\s*chia\s*\)\s*$/i, '')
      .replace(/^.*?\s*trả\s*tiền\s*cuộc\s*vui\s*:\s*/i, '')
      .trim();
  }
  if (partyName) {
    partyName = partyName
      .replace(/\s*\(\s*Tổng[\s\S]*?\)\s*$/i, '')
      .replace(/\s*\(\s*\d+\s*(?:người|bạn)[\s\S]*?\)\s*$/i, '')
      .trim();
  }
  if (!partyName || partyName.toLowerCase() === 'cuộc vui') {
    partyName = matchedParty?.name || 'Cuộc ăn chia nhóm';
  }

  // 3. Resolve total and split amounts first to enable mathematical derivation
  let totalAmount = tx.partyTotalAmount || matchedParty?.totalAmount || 0;
  if (!totalAmount && tx.note) {
    const totalMatch = tx.note.match(/Tổng\s*(?:bill|tiền|hóa\s*đơn)?\s*:\s*([\d.,]+)/i);
    if (totalMatch) {
      const cleanNum = parseFloat(totalMatch[1].replace(/\./g, '').replace(/,/g, ''));
      if (!isNaN(cleanNum) && cleanNum > 0) totalAmount = cleanNum;
    }
  }
  const splitAmount = tx.partySplitAmount || matchedParty?.splitAmountPerPerson || tx.amount;

  // 4. Resolve participant count with rock-solid hierarchy
  let participantCount = 0;
  if (tx.partyTotalPeople && tx.partyTotalPeople > 0) {
    participantCount = tx.partyTotalPeople;
  } else if (matchedParty?.totalPeopleCount && matchedParty.totalPeopleCount > 0) {
    participantCount = matchedParty.totalPeopleCount;
  } else if (tx.note) {
    const countMatch = tx.note.match(/(?:chia\s*(\d+)\s*(?:người|bạn|nguoi|ban)|(\d+)\s*(?:người|bạn|nguoi|ban)\s*chia)/i);
    if (countMatch) {
      participantCount = parseInt(countMatch[1] || countMatch[2], 10);
    }
  }

  // If mathematical ratio gives a valid count (> 1) and differs from a truncated count, prefer the math
  if (totalAmount > 0 && splitAmount > 0) {
    const derivedCount = Math.round(totalAmount / splitAmount);
    if (derivedCount > 1) {
      if (participantCount <= 0 || (participantCount === 2 && derivedCount > 2) || (!tx.partyTotalPeople && !matchedParty?.totalPeopleCount)) {
        participantCount = derivedCount;
      }
    }
  }

  if (participantCount <= 0 && tx.partyParticipants && tx.partyParticipants.length > 0) {
    participantCount = tx.partyParticipants.length;
  } else if (participantCount <= 0 && matchedParty) {
    participantCount =
      (matchedParty.participantDebtorIds?.length || 0) +
      (matchedParty.includeMe !== false ? 1 : 0);
  }

  if (participantCount <= 0) {
    participantCount = 2; // fallback minimum
  }

  if (!totalAmount && tx.amount > 0 && participantCount > 0) {
    totalAmount = tx.amount * participantCount;
  }

  // 6. Payer name
  let payerName = tx.partyPayerName?.trim() || '';
  if (!payerName && matchedParty) {
    payerName =
      matchedParty.payerType === 'ME'
        ? ownerName
        : allDebtors.find((d) => d.id === matchedParty.payerDebtorId)?.name || 'Một người bạn';
  }
  if (!payerName && tx.note) {
    const payerMatch = tx.note.match(/^(.*?)\s*(?:trả\s*tiền\s*cuộc\s*vui|trả\s*bill\s*&\s*gán\s*nợ)\s*:/i);
    if (payerMatch) payerName = payerMatch[1].trim();
    if (!payerName) {
      const assignedMatch = tx.note.match(/gán\s*nợ\s*từ\s*(.*?)\)/i);
      if (assignedMatch) payerName = assignedMatch[1].trim();
    }
  }

  // 7. Participant names
  let rawNames: string[] = [];
  if (tx.partyParticipants && tx.partyParticipants.length > 0) {
    rawNames = [...tx.partyParticipants];
  } else if (matchedParty) {
    if (matchedParty.includeMe !== false) {
      rawNames.push(ownerName);
    }
    if (
      matchedParty.payerType === 'DEBTOR_ASSIGNED' &&
      matchedParty.payerDebtorId &&
      matchedParty.payerIncluded !== false
    ) {
      const payerObj = allDebtors.find((d) => d.id === matchedParty.payerDebtorId);
      if (payerObj && !rawNames.includes(payerObj.name)) {
        rawNames.push(payerObj.name);
      }
    }
    (matchedParty.participantDebtorIds || []).forEach((id) => {
      const d = allDebtors.find((deb) => deb.id === id);
      if (d && !rawNames.includes(d.name)) {
        rawNames.push(d.name);
      } else if (
        id === currentDebtor?.id &&
        currentDebtorName &&
        !rawNames.includes(currentDebtorName)
      ) {
        rawNames.push(currentDebtorName);
      }
    });
  }

  // Ensure rawNames has at least owner and debtor if available
  if (!rawNames.includes(ownerName) && matchedParty?.includeMe !== false) {
    rawNames.push(ownerName);
  }
  if (currentDebtorName && !rawNames.includes(currentDebtorName)) {
    rawNames.push(currentDebtorName);
  }

  // Lọc bỏ bất kỳ placeholder giả mạo nào ("Bạn 1", "Bạn 2"...) được tạo trước đây
  const cleanRealNames = rawNames.filter((name) => !/^Bạn\s*\d+$/i.test(name.trim()));

  // Tính số lượng người tham gia khác (không biết tên hoặc chưa có trong sổ)
  const extraCount = Math.max(0, participantCount - cleanRealNames.length);

  const participantNames: SplitParticipant[] = cleanRealNames.map((name) => {
    const isCurrent = Boolean(
      currentDebtorName &&
        (name.toLowerCase().trim() === currentDebtorName.toLowerCase().trim() ||
          name.toLowerCase().includes(currentDebtorName.toLowerCase()) ||
          currentDebtorName.toLowerCase().includes(name.toLowerCase()))
    );
    return { name, isCurrent };
  });

  const billImage = tx.billImage || matchedParty?.billImage;

  return {
    isSplit: true,
    partyName,
    totalAmount,
    splitAmount,
    participantCount: Math.max(participantCount, participantNames.length + extraCount),
    participantNames,
    extraCount,
    payerName,
    billImage,
  };
}

/**
 * Thống nhất thông tin hóa đơn (ảnh và tiêu đề hiển thị) giữa giao dịch Ăn chia và Ghi nợ thông thường
 */
export function getResolvedBillInfo(
  tx: Transaction,
  splitDetails?: SplitBillDetails
): { billImage?: string; billTitle: string } {
  const billImage = tx.billImage || splitDetails?.billImage;
  const billTitle = splitDetails?.isSplit
    ? `Hóa đơn: ${splitDetails.partyName || 'Cuộc ăn chia'}`
    : `Hóa đơn: ${tx.note || 'Chứng từ ghi nợ'}`;
  return { billImage, billTitle };
}

/**
 * Trích xuất ghi chú tùy chỉnh của người dùng (nếu có),
 * tự động loại bỏ các chuỗi mẫu mặc định ("Chia tiền cuộc ăn chơi: ...", "Ăn Chia: ...", "X người chia", "Tổng bill: ...")
 * để tránh hiển thị "Ghi chú:" thừa thãi, rác giao diện cho người tra cứu khi không có ghi chú thực sự.
 */
export function getCustomSplitNote(
  note?: string,
  partyName?: string,
  explicitCustomNote?: string
): string {
  if (explicitCustomNote && explicitCustomNote.trim()) {
    return explicitCustomNote.trim();
  }
  if (!note) return '';
  const trimmed = note.trim();
  if (!trimmed) return '';

  const normalizedTrimmed = trimmed.toLowerCase();
  const normalizedParty = (partyName || '').toLowerCase().trim();

  // 1. Kiểm tra nếu note chỉ là tên cuộc vui đơn thuần hoặc tiền tố cơ bản
  if (
    normalizedParty &&
    (normalizedTrimmed === normalizedParty ||
      normalizedTrimmed === `ăn chia: ${normalizedParty}` ||
      normalizedTrimmed === `cuộc vui: ${normalizedParty}` ||
      normalizedTrimmed === `chia tiền: ${normalizedParty}`)
  ) {
    return '';
  }

  // 2. Mẫu nhận diện tự động sinh từ hệ thống (kể cả phiên bản cũ hay mới)
  const isAutoPrefix = /^(?:ăn\s*chia|ăn\s*uống|chia\s*tiền(?:\s*cuộc\s*(?:ăn\s*chơi|vui))?|cuộc\s*(?:vui|ăn\s*chơi)|.*?\s*trả\s*(?:tiền\s*cuộc\s*vui|bill\s*&\s*gán\s*nợ))\s*(?:\(gán\s*nợ\s*từ\s*.*?\))?\s*:\s*/i;

  if (isAutoPrefix.test(trimmed)) {
    // Tách phần thân sau tiền tố tự sinh
    let body = trimmed.replace(isAutoPrefix, '').trim();

    // Loại bỏ các mẫu tự sinh: (Tổng bill: ...), (X người chia), (chia X người), (ứng hộ: ...), (phần của tôi: ...)
    body = body
      .replace(/\s*\(\s*(?:Tổng\s*bill[\s\S]*?|\d+\s*(?:người|bạn|nguoi|ban)\s*chia|chia\s*\d+\s*(?:người|bạn|nguoi|ban)|phần\s*của\s*(?:Tôi|tôi)[\s\S]*?|ứng\s*hộ[\s\S]*?)\s*\)/gi, '')
      .trim();

    // Nếu sau khi bóc tách chỉ còn tên cuộc vui (hoặc rỗng) -> không có ghi chú thêm!
    if (!body || (normalizedParty && body.toLowerCase() === normalizedParty)) {
      return '';
    }

    // Nếu người dùng nối thêm ghi chú (VD: "Tên cuộc vui - Ghi chú thêm")
    if (normalizedParty && body.toLowerCase().startsWith(normalizedParty)) {
      const rest = body.slice(normalizedParty.length).replace(/^[\s-–:;,]+/, '').trim();
      return rest;
    }

    const cleaned = body.replace(/^[\s-–:;,]+/, '').trim();
    if (cleaned.toLowerCase() === normalizedParty) return '';
    return cleaned;
  }

  // Nếu note không có tiền tố tự sinh nhưng lại trùng tên cuộc vui
  if (normalizedParty && normalizedTrimmed === normalizedParty) {
    return '';
  }

  return '';
}
