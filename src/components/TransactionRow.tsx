import React from 'react';
import {
  Users,
  ArrowUpRight,
  ArrowDownLeft,
  ChevronRight,
  Receipt,
  Pencil,
  Trash2,
  Calendar,
  Lock,
  Clock,
} from 'lucide-react';
import { Debtor, Transaction, PartySplit } from '../types';
import { formatVND } from '../utils/vietqr';
import { resolveSplitBillDetails, getCustomSplitNote } from '../utils/splitBillHelper';

export interface TransactionRowProps {
  transaction: Transaction;
  currentDebtor?: Debtor;
  debtors?: Debtor[];
  debtorsMap?: Map<string, Debtor>;
  parties?: PartySplit[];
  runningBalance?: number;
  showDebtorName?: boolean;
  onSelectDebtor?: (debtor: Debtor) => void;
  onViewImage: (url: string, title?: string) => void;
  onEditTx?: (tx: Transaction) => void;
  onDeleteTx?: (tx: Transaction) => void;
  onEditParty?: (party: PartySplit) => void;
  readOnly?: boolean;
}

const TransactionRowComponent: React.FC<TransactionRowProps> = ({
  transaction: tx,
  currentDebtor,
  debtors = [],
  debtorsMap,
  parties = [],
  runningBalance,
  showDebtorName = false,
  onSelectDebtor,
  onViewImage,
  onEditTx,
  onDeleteTx,
  onEditParty,
  readOnly = false,
}) => {
  const debtor =
    currentDebtor ||
    (debtorsMap ? debtorsMap.get(tx.debtorId) : debtors.find((d) => d.id === tx.debtorId));
  const isAdd = tx.type === 'ADD';
  const split = resolveSplitBillDetails(tx, debtor, parties, debtors);
  const resolvedBillImg = tx.billImage || split.billImage;

  const allImgs = Array.from(
    new Set([
      ...(resolvedBillImg ? [resolvedBillImg] : []),
      ...(tx.imageUrls || []),
    ])
  ).filter(Boolean);

  const customNote = split.isSplit ? getCustomSplitNote(tx.note, split.partyName, tx.customNote) : '';
  const isParty = Boolean(tx.partyId || tx.category === 'PARTY_SPLIT');

  const associatedParty =
    isParty && parties.length > 0
      ? parties.find((p) => p.id === tx.partyId || (split.partyName && p.name === split.partyName))
      : undefined;

  // Format time if available in createdAt
  const formattedTime = (() => {
    if (!tx.createdAt || !tx.createdAt.includes('T')) return null;
    try {
      const d = new Date(tx.createdAt);
      if (isNaN(d.getTime())) return null;
      return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return null;
    }
  })();

  return (
    <div
      className={`p-3 sm:p-4 rounded-2xl border transition-all space-y-2.5 shadow-2xs ${
        isParty
          ? 'bg-amber-50/20 hover:bg-amber-50/40 border-amber-200/80 border-l-4 border-l-amber-500'
          : isAdd
          ? 'bg-rose-50/20 hover:bg-rose-50/40 border-rose-200/80 border-l-4 border-l-rose-500'
          : 'bg-emerald-50/20 hover:bg-emerald-50/40 border-emerald-200/80 border-l-4 border-l-emerald-500'
      }`}
    >
      {/* 1. Header Level: Category Icon + Title/Debtor on Left, Formatted Amount on Right */}
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex items-start gap-2.5 min-w-0 flex-1">
          {/* Category Icon Badge */}
          <div
            className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
              isParty
                ? 'bg-amber-100 text-amber-800'
                : isAdd
                ? 'bg-rose-100 text-rose-700'
                : 'bg-emerald-100 text-emerald-700'
            }`}
          >
            {isParty ? (
              <Users className="w-4 h-4" />
            ) : isAdd ? (
              <ArrowUpRight className="w-4 h-4" />
            ) : (
              <ArrowDownLeft className="w-4 h-4" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            {showDebtorName && debtor && (
              <div className="mb-0.5">
                <button
                  type="button"
                  onClick={() => onSelectDebtor && onSelectDebtor(debtor)}
                  className="text-emerald-700 hover:text-emerald-800 hover:underline font-bold text-xs cursor-pointer transition-colors inline-flex items-center gap-0.5"
                  title={`Bấm để xem chi tiết ${debtor.name}`}
                >
                  <span>{debtor.name}</span>
                  <ChevronRight className="w-3 h-3 text-emerald-500 opacity-70" />
                </button>
              </div>
            )}

            <h3 className="font-bold text-slate-900 text-xs sm:text-sm leading-snug break-words">
              {isParty ? split.partyName : tx.note || (isAdd ? 'Ghi nhận khoản nợ' : 'Đã thanh toán')}
            </h3>
          </div>
        </div>

        {/* Right: Amount */}
        <div className="text-right shrink-0">
          <div
            className={`font-black font-mono text-base sm:text-lg tabular-nums tracking-tight ${
              isAdd ? 'text-rose-600' : 'text-emerald-600'
            }`}
          >
            {isAdd ? `+${formatVND(tx.amount)}` : `-${formatVND(tx.amount)}`}
          </div>
        </div>
      </div>

      {/* 2. Subline Level: Classification Tag, Date, Time & Running Balance - Optimized for Mobile & Desktop */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-xs text-slate-500">
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          {/* Tag phân loại giao dịch */}
          {isParty ? (
            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100/90 text-amber-900 border border-amber-200/90 shrink-0">
              Cuộc vui chia tiền
            </span>
          ) : isAdd ? (
            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-100/90 text-rose-800 border border-rose-200/90 shrink-0">
              Khoản nợ (+)
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100/90 text-emerald-800 border border-emerald-200/90 shrink-0">
              Đã trả (-)
            </span>
          )}

          {/* Ngày tháng */}
          <span className="inline-flex items-center gap-1 font-mono text-[11px] text-slate-500 shrink-0">
            <Calendar className="w-3 h-3 text-slate-400" />
            <span>{tx.date}</span>
          </span>

          {formattedTime && (
            <span className="inline-flex items-center gap-0.5 text-slate-400 font-mono text-[10.5px] shrink-0">
              <Clock className="w-2.5 h-2.5" />
              <span>{formattedTime}</span>
            </span>
          )}

          {isParty ? (
            <span className="text-[11px] font-medium text-slate-600 truncate">
              <span aria-hidden="true" className="text-slate-300 mr-1">·</span>
              Tổng bill: <strong className="text-slate-800 font-mono">{formatVND(split.totalAmount)}</strong> ({split.participantCount} người)
            </span>
          ) : (
            <span className={isAdd ? 'text-rose-600 font-medium text-[11px]' : 'text-emerald-600 font-medium text-[11px]'}>
              <span aria-hidden="true" className="text-slate-300 mr-1">·</span>
              {isAdd ? 'Ghi nợ trực tiếp' : 'Thanh toán trực tiếp'}
            </span>
          )}
        </div>

        {/* Dư nợ sau GD - Luôn căn gọn gàng, không bị rớt chữ lộn xộn */}
        {runningBalance !== undefined && (
          <div className="self-start sm:self-auto inline-flex items-center gap-1 text-[11px] text-slate-500 font-mono tabular-nums bg-white px-2 py-0.5 rounded-md border border-slate-200 shadow-2xs shrink-0">
            <span>Dư nợ sau GD:</span>
            <strong className="text-slate-800 font-semibold">{formatVND(runningBalance)}</strong>
          </div>
        )}
      </div>

      {/* 3. Middle Level: Split Participants Chips & Custom Note */}
      {isParty && split.participantNames.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100 text-xs text-slate-600">
          <span className="text-slate-400 font-medium text-[11px]">Tham gia:</span>
          <div className="flex flex-wrap items-center gap-1">
            {split.participantNames.map((p, pIdx) => (
              <span
                key={pIdx}
                className={`px-2 py-0.5 rounded-md text-[10.5px] font-medium border ${
                  p.isCurrent
                    ? 'font-bold text-amber-900 bg-amber-100 border-amber-300 shadow-2xs'
                    : 'bg-white text-slate-700 border-slate-200'
                }`}
              >
                {p.name}
                {p.isCurrent ? (readOnly ? ' (Bạn)' : ' (Đang xem)') : ''}
              </span>
            ))}
            {split.extraCount > 0 && (
              <span className="text-slate-500 text-[10.5px] font-medium ml-0.5">
                và {split.extraCount} người khác
              </span>
            )}
          </div>

          {split.payerName && (
            <span className="text-slate-500 text-[11px] ml-auto">
              Người trả: <strong className="text-slate-800">{split.payerName}</strong>
            </span>
          )}
        </div>
      )}

      {customNote && (
        <div className="text-xs text-slate-600 italic bg-white/70 px-2.5 py-1 rounded-lg border border-slate-100">
          📝 Ghi chú: {customNote}
        </div>
      )}

      {/* 4. Bottom Level: Bill receipt thumbnail + Action Controls */}
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100/90 text-xs">
        {/* Bill receipt viewer */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {allImgs.length > 0 ? (
            allImgs.map((img, imgIdx) => (
              <button
                key={imgIdx}
                type="button"
                onClick={() =>
                  onViewImage(
                    img,
                    isParty ? `Hóa đơn: ${split.partyName}` : `Hóa đơn: ${tx.note || 'Chứng từ'}`
                  )
                }
                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white hover:bg-slate-50 text-emerald-800 border border-emerald-200/90 rounded-xl text-xs font-semibold transition-colors cursor-pointer shadow-2xs"
                title="Xem ảnh hóa đơn / chứng từ đính kèm"
              >
                <img
                  src={img}
                  alt="Hóa đơn"
                  className="w-4 h-4 rounded object-cover border border-emerald-300 shrink-0"
                />
                <Receipt className="w-3.5 h-3.5 text-emerald-600" />
                <span>Xem hóa đơn {allImgs.length > 1 ? `#${imgIdx + 1}` : ''}</span>
              </button>
            ))
          ) : (
            <span className="text-[11px] text-slate-400">
              {isParty ? (
                <span className="inline-flex items-center gap-1 text-amber-800/80">
                  <Lock className="w-3 h-3 text-amber-600" />
                  <span>Khoản chia theo bill chung</span>
                </span>
              ) : (
                <span>Giao dịch trực tiếp</span>
              )}
            </span>
          )}
        </div>

        {/* Action Controls */}
        {readOnly ? (
          <div className="text-[11px] text-slate-400 italic flex items-center gap-1 shrink-0">
            <Lock className="w-3 h-3 text-slate-400" />
            <span>Chế độ chỉ xem</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 shrink-0">
            {isParty ? (
              // Khoản nợ tạo từ Cuộc vui chia tiền -> CHỈ MỞ SplitBillModal, TUYỆT ĐỐI KHÔNG mở EditTransactionModal hay Xóa lẻ
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onEditParty) {
                    const partyToEdit =
                      associatedParty ||
                      (parties.length > 0
                        ? parties.find(
                            (p) => p.name === split.partyName || p.id === tx.partyId
                          )
                        : undefined);
                    if (partyToEdit) {
                      onEditParty(partyToEdit);
                    } else {
                      alert('Cuộc vui này không còn trong danh sách hoặc đã được cập nhật.');
                    }
                  }
                }}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 font-semibold rounded-xl border border-amber-200 transition-colors text-xs cursor-pointer shadow-2xs"
                title="Khoản nợ chia từ cuộc vui chung. Chỉnh sửa hóa đơn hoặc thành viên tại Cuộc vui để hệ thống tự động cập nhật lại cho tất cả mọi người."
              >
                <Pencil className="w-3.5 h-3.5 text-amber-700" />
                <span>Sửa cuộc vui</span>
              </button>
            ) : (
              // Giao dịch nợ / trả trực tiếp
              <>
                {onEditTx && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditTx(tx);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold rounded-xl border border-slate-200 transition-colors text-xs cursor-pointer shadow-2xs"
                    title="Chỉnh sửa số tiền, ngày hoặc nội dung của giao dịch này"
                  >
                    <Pencil className="w-3.5 h-3.5 text-slate-600" />
                    <span>Sửa</span>
                  </button>
                )}

                {onDeleteTx && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteTx(tx);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 font-semibold rounded-xl transition-colors text-xs cursor-pointer"
                    title="Xóa giao dịch này"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Xóa</span>
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export const TransactionRow = React.memo(TransactionRowComponent);
