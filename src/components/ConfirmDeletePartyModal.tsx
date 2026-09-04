import React from 'react';
import { Trash2, AlertTriangle, X, Users } from 'lucide-react';
import { PartySplit } from '../types';
import { formatVND } from '../utils/vietqr';

interface ConfirmDeletePartyModalProps {
  isOpen: boolean;
  onClose: () => void;
  party: PartySplit | null;
  transactionCount?: number;
  onConfirm: () => void;
}

export const ConfirmDeletePartyModal: React.FC<ConfirmDeletePartyModalProps> = ({
  isOpen,
  onClose,
  party,
  transactionCount = 0,
  onConfirm,
}) => {
  if (!isOpen || !party) return null;

  return (
    <div
      id="confirm-delete-party-backdrop"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-150"
    >
      <div
        id="confirm-delete-party-card"
        className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150 relative"
      >
        {/* Header */}
        <div className="bg-rose-600 text-white px-5 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-white/20 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-base tracking-wide uppercase">
                Xác Nhận Xóa Cuộc Vui
              </h2>
              <p className="text-[11px] text-rose-100">
                Tự động xóa tất cả giao dịch liên quan của từng người
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-rose-100 hover:text-white p-1 hover:bg-rose-700 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 sm:p-6 space-y-4 text-slate-800 text-sm">
          <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-rose-700 font-semibold uppercase tracking-wider">
                Cuộc vui chia tiền:
              </span>
              <span className="font-bold text-slate-900 text-sm">{party.name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-600 font-medium">Tổng hóa đơn:</span>
              <span className="font-bold font-mono text-rose-700">
                {formatVND(party.totalAmount)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-600 font-medium">Mỗi người:</span>
              <span className="font-bold font-mono text-slate-900">
                {formatVND(party.splitAmountPerPerson)}
              </span>
            </div>
          </div>

          <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 space-y-1.5">
            <p className="font-bold flex items-center gap-1.5 text-amber-800">
              <Users className="w-4 h-4 text-amber-600" />
              Cơ chế xóa an toàn tự động:
            </p>
            <p className="leading-relaxed">
              Toàn bộ <strong>{transactionCount > 0 ? transactionCount : 'các'}</strong> giao dịch phát sinh từ cuộc vui này của các thành viên sẽ <strong>tự động bị xóa</strong> và hệ thống sẽ <strong>tự động hoàn tác số dư</strong> cho tất cả mọi người.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl font-semibold transition-colors cursor-pointer text-xs"
            >
              HỦY BỎ
            </button>
            <button
              type="button"
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-bold rounded-xl shadow-xs transition-colors cursor-pointer text-xs uppercase tracking-wide"
            >
              <Trash2 className="w-4 h-4" />
              <span>XÁC NHẬN XÓA CUỘC VUI</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
