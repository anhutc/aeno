import React, { useState, useEffect } from 'react';
import {
  Users,
  Calendar,
  Pencil,
  Receipt,
  ChevronRight,
} from 'lucide-react';
import { PartySplit, Transaction, Debtor, AppSettings } from '../types';
import { formatVND } from '../utils/vietqr';
import { resolveBillImageFallback } from '../utils/imageUploader';

export interface GroupedPartyRowProps {
  party: PartySplit;
  transactions?: Transaction[];
  debtorsMap: Map<string, Debtor>;
  settings: AppSettings;
  onSelectDebtor?: (debtor: Debtor) => void;
  onViewImage: (url: string, title?: string) => void;
  onEditParty?: (party: PartySplit) => void;
  readOnly?: boolean;
}

const SafeReceiptThumbnail: React.FC<{ src: string }> = ({ src }) => {
  const [thumbSrc, setThumbSrc] = useState<string>(src);
  const retriedRef = React.useRef(false);

  useEffect(() => {
    retriedRef.current = false;
    setThumbSrc(src);
  }, [src]);

  return (
    <img
      src={thumbSrc}
      alt="Hóa đơn"
      onError={() => {
        if (retriedRef.current) return;
        const fallback = resolveBillImageFallback(thumbSrc);
        if (fallback && fallback !== thumbSrc) {
          retriedRef.current = true;
          setThumbSrc(fallback);
        }
      }}
      className="w-8 h-8 rounded-lg object-cover border border-amber-300 shrink-0 shadow-2xs bg-white"
    />
  );
};

export const GroupedPartyRow: React.FC<GroupedPartyRowProps> = ({
  party,
  transactions = [],
  debtorsMap,
  settings,
  onSelectDebtor,
  onViewImage,
  onEditParty,
  readOnly = false,
}) => {
  // Determine who paid upfront
  const payerName =
    party.payerType === 'ME'
      ? (settings.ownerName || 'Tôi (Chủ sổ)')
      : party.payerType === 'DEBTOR_ASSIGNED'
      ? `${debtorsMap.get(party.payerDebtorId || '')?.name || 'Bạn bè'} (gán nợ cho Tôi)`
      : debtorsMap.get(party.payerDebtorId || '')?.name || 'Người khác';

  // Gather participants list
  const participantDebtorIds = party.participantDebtorIds || [];
  const participantList: { id: string; name: string; debtor?: Debtor; isMe?: boolean }[] = [];

  if (party.includeMe) {
    participantList.push({
      id: 'me',
      name: settings.ownerName || 'Tôi',
      isMe: true,
    });
  }

  // Payer debtor if assigned and included
  if (party.payerType === 'DEBTOR_ASSIGNED' && party.payerDebtorId && party.payerIncluded !== false) {
    if (!participantList.some((p) => p.id === party.payerDebtorId)) {
      const d = debtorsMap.get(party.payerDebtorId);
      participantList.push({
        id: party.payerDebtorId,
        name: d?.name || 'Người trả',
        debtor: d,
      });
    }
  }

  // Add all other debtor participants
  participantDebtorIds.forEach((id) => {
    if (!participantList.some((p) => p.id === id)) {
      const d = debtorsMap.get(id);
      participantList.push({
        id,
        name: d?.name || id,
        debtor: d,
      });
    }
  });

  const totalPeople =
    party.totalPeopleCount ||
    (party.totalAmount > 0 && party.splitAmountPerPerson > 0
      ? Math.round(party.totalAmount / party.splitAmountPerPerson)
      : participantList.length);

  // If there are extra anonymous people count
  const extraCount = Math.max(0, totalPeople - participantList.length);

  // Find receipt image
  const billImage =
    party.billImage ||
    transactions.find((t) => t.billImage)?.billImage;

  return (
    <div className="p-3 sm:p-4 rounded-2xl border transition-all space-y-2.5 shadow-2xs bg-amber-50/20 hover:bg-amber-50/40 border-amber-200/80 border-l-4 border-l-amber-500">
      {/* 1. Header Level: Category Icon + Title on Left, Formatted Amount on Right */}
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex items-start gap-2.5 min-w-0 flex-1">
          {/* Category Icon Badge */}
          <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
            <Users className="w-4 h-4 text-amber-700" />
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-slate-900 text-xs sm:text-sm leading-snug break-words">
              {party.name || 'Chia tiền cuộc vui'}
            </h3>
          </div>
        </div>

        {/* Right: Amount */}
        <div className="text-right shrink-0">
          <div className="font-black font-mono text-base sm:text-lg tabular-nums tracking-tight text-rose-600">
            +{formatVND(party.splitAmountPerPerson)}
          </div>
        </div>
      </div>

      {/* 2. Subline Level: Date, Total Bill & Payer Details - Clean without redundant badges */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-xs text-slate-500">
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          {/* Ngày tháng */}
          <span className="inline-flex items-center gap-1 font-mono text-[11px] text-slate-500 shrink-0">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span>{party.date}</span>
          </span>

          <span className="text-[11px] font-medium text-slate-600 truncate">
            <span aria-hidden="true" className="text-slate-300 mr-1">·</span>
            Tổng bill: <strong className="text-slate-800 font-mono">{formatVND(party.totalAmount)}</strong> ({totalPeople} người)
          </span>

          <span className="text-[11px] font-medium text-slate-600 truncate">
            <span aria-hidden="true" className="text-slate-300 mr-1">·</span>
            Người trả: <strong className="text-slate-800">{payerName}</strong>
          </span>
        </div>
      </div>

      {party.note && (
        <div className="text-xs text-slate-600 italic bg-white/70 px-2.5 py-1 rounded-lg border border-slate-100">
          📝 Ghi chú: {party.note}
        </div>
      )}

      {/* 3. Middle Level: Split Participants Chips (Directly Visible - NO Expanding Needed) */}
      <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100 text-xs text-slate-600">
        <span className="text-slate-400 font-medium text-[11px]">Tham gia:</span>
        <div className="flex flex-wrap items-center gap-1">
          {participantList.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={(e) => {
                if (p.debtor && onSelectDebtor) {
                  e.stopPropagation();
                  onSelectDebtor(p.debtor);
                }
              }}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-medium border transition-all ${
                p.isMe
                  ? 'bg-slate-100 text-slate-700 border-slate-200 cursor-default'
                  : p.debtor
                  ? 'bg-white hover:bg-emerald-50 text-slate-800 hover:text-emerald-800 border-amber-200 hover:border-emerald-300 cursor-pointer shadow-2xs'
                  : 'bg-white text-slate-700 border-slate-200 cursor-default'
              }`}
              title={p.debtor ? `Bấm để xem sổ nợ của ${p.name}` : undefined}
            >
              <span>{p.name}</span>
              {p.debtor && (
                <ChevronRight className="w-2.5 h-2.5 text-slate-400 opacity-60" />
              )}
            </button>
          ))}

          {extraCount > 0 && (
            <span className="text-slate-500 text-[10.5px] font-medium ml-0.5">
              và {extraCount} người khác
            </span>
          )}
        </div>
      </div>

      {/* 4. Bottom Level: Bill receipt thumbnail + Action Controls (Matching single transactions) */}
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100/90 text-xs">
        {/* Bill receipt viewer */}
        <div className="flex items-center gap-2 flex-wrap">
          {billImage ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onViewImage(billImage, `Hóa đơn: ${party.name}`);
              }}
              className="inline-flex items-center gap-2 px-2 py-1.5 bg-white hover:bg-slate-50 text-slate-800 border border-slate-200/90 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-2xs hover:scale-102"
              title="Bấm để phóng to ảnh hóa đơn / chứng từ"
            >
              <SafeReceiptThumbnail src={billImage} />
              <div className="text-left">
                <div className="text-[11px] font-bold text-slate-800 flex items-center gap-1">
                  <Receipt className="w-3 h-3 text-slate-600" />
                  <span>Hóa đơn</span>
                </div>
                <span className="text-[10px] text-slate-500 font-medium">Bấm xem ảnh</span>
              </div>
            </button>
          ) : (
            <span className="text-[11px] text-slate-400">
              <span>Khoản chia theo bill chung</span>
            </span>
          )}
        </div>

        {/* Action Controls: Explicit "Sửa cuộc vui" button, identical to TransactionRow */}
        {!readOnly && onEditParty && (
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEditParty(party);
              }}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 font-semibold rounded-xl border border-amber-200 transition-colors text-xs cursor-pointer shadow-2xs"
              title="Chỉnh sửa hóa đơn hoặc thành viên của cuộc vui này"
            >
              <Pencil className="w-3.5 h-3.5 text-amber-700" />
              <span>Sửa cuộc vui</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
