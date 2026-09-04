/**
 * ============================================================================
 * GHI CHÚ CHỈNH SỬA / CHANGELOG:
 * - Hộp thoại xác nhận xóa con nợ hoàn toàn trên giao diện (In-App Modal).
 * - Khắc phục triệt để lỗi window.confirm() bị trình duyệt / iframe chặn không cho hiển thị.
 * - Hiển thị tên con nợ, số dư hiện tại và số giao dịch sẽ bị xóa kèm theo.
 * - Thao tác xác nhận rõ ràng, an toàn với 2 nút "Hủy bỏ" và "Xác Nhận Xóa".
 * ============================================================================
 */

import React from 'react';
import { Trash2, AlertTriangle, X } from 'lucide-react';
import { Debtor } from '../types';
import { formatVND } from '../utils/vietqr';

interface ConfirmDeleteDebtorModalProps {
  isOpen: boolean;
  onClose: () => void;
  debtor: Debtor | null;
  balance?: number;
  transactionCount?: number;
  onConfirm: () => void;
}

export const ConfirmDeleteDebtorModal: React.FC<ConfirmDeleteDebtorModalProps> = ({
  isOpen,
  onClose,
  debtor,
  balance = 0,
  transactionCount = 0,
  onConfirm,
}) => {
  if (!isOpen || !debtor) return null;

  return (
    <div
      id="confirm-delete-debtor-backdrop"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-150"
    >
      <div
        id="confirm-delete-debtor-card"
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
                Xác Nhận Xóa Con Nợ
              </h2>
              <p className="text-[11px] text-rose-100">
                Hành động này không thể hoàn tác
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/80 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 sm:p-6 space-y-4 text-xs text-slate-600 leading-relaxed">
          <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl space-y-1.5 text-rose-950">
            <div className="font-bold flex items-center gap-1.5 text-rose-900 text-sm">
              <span>Bạn có chắc chắn muốn xóa con nợ:</span>
              <span className="underline underline-offset-2">{debtor.name}</span>?
            </div>
            <p className="text-rose-800 text-[11px]">
              Mật khẩu tra cứu của người này: <strong className="font-mono">{debtor.pin}</strong>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-[11px] text-slate-400 block">Số dư hiện tại</span>
              <strong
                className={`text-sm font-mono ${
                  balance > 0
                    ? 'text-rose-600'
                    : balance < 0
                    ? 'text-emerald-600'
                    : 'text-slate-600'
                }`}
              >
                {balance > 0 ? `+${formatVND(balance)}` : formatVND(balance)}
              </strong>
            </div>
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-[11px] text-slate-400 block">Giao dịch liên quan</span>
              <strong className="text-sm text-slate-800 font-mono">
                {transactionCount} giao dịch
              </strong>
            </div>
          </div>

          <p className="text-slate-500 text-[11px]">
            ⚠️ Toàn bộ lịch sử ghi nợ, trả nợ và chứng từ liên quan của con nợ này sẽ bị xóa vĩnh viễn khỏi sổ và đồng bộ tức thì lên hệ thống.
          </p>

          {/* Action buttons */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold text-xs transition-colors cursor-pointer"
            >
              Hủy bỏ
            </button>
            <button
              type="button"
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              <span>Xác Nhận Xóa Con Nợ</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
