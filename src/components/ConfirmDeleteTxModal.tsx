import React from 'react';
import { Trash2, AlertTriangle, X } from 'lucide-react';
import { Transaction } from '../types';
import { formatVND } from '../utils/vietqr';

interface ConfirmDeleteTxModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: Transaction | null;
  debtorName?: string;
  onConfirm: () => void;
}

export const ConfirmDeleteTxModal: React.FC<ConfirmDeleteTxModalProps> = ({
  isOpen,
  onClose,
  transaction,
  debtorName,
  onConfirm,
}) => {
  if (!isOpen || !transaction) return null;

  const isAdd = transaction.type === 'ADD';

  return (
    <div
      id="confirm-delete-tx-backdrop"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-150"
    >
      <div
        id="confirm-delete-tx-card"
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
                Xác Nhận Xóa Giao Dịch
              </h2>
              <p className="text-[11px] text-rose-100">
                Hành động này sẽ cập nhật lại số dư nợ
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
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
            {debtorName && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 font-medium">Người nợ:</span>
                <span className="font-bold text-slate-900">{debtorName}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 font-medium">Nội dung:</span>
              <span className="font-semibold text-slate-800 break-words max-w-[200px] text-right">
                {transaction.note}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 font-medium">Ngày ghi:</span>
              <span className="font-mono text-slate-700">{transaction.date}</span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-slate-200">
              <span className="text-xs font-semibold text-slate-600">Số tiền:</span>
              <span
                className={`font-black font-mono text-base ${
                  isAdd ? 'text-rose-600' : 'text-emerald-600'
                }`}
              >
                {isAdd ? `+${formatVND(transaction.amount)}` : `-${formatVND(transaction.amount)}`}
              </span>
            </div>
          </div>

          <p className="text-xs text-slate-500 leading-relaxed">
            Bạn có chắc chắn muốn xóa giao dịch này? Số dư nợ của người liên quan sẽ được tự động tính toán lại.
          </p>

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
              <span>XÁC NHẬN XÓA</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
