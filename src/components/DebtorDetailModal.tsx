/**
 * ============================================================================
 * GHI CHÚ CHỈNH SỬA / CHANGELOG:
 * - Khắc phục lỗi chức năng xóa không hoạt động: Thay thế hoàn toàn hàm confirm()
 *   của trình duyệt (vốn bị sandbox iframe chặn không mở được) bằng hộp thoại
 *   xác nhận xóa nội bộ ConfirmDeleteDebtorModal và modal xác nhận xóa giao dịch.
 * - Xóa bỏ hiển thị số điện thoại của con nợ trong tiêu đề modal thông tin chi tiết.
 * - Hộp thoại chi tiết & sao kê của con nợ / người nợ (DebtorDetailModal, z-50).
 * ============================================================================
 */

import React, { useState } from 'react';
import {
  X,
  Plus,
  KeyRound,
  Calendar,
  Eye,
  Trash2,
  Edit3,
  Pencil,
  Receipt,
  ArrowUpRight,
  ArrowDownLeft,
  BookOpen,
  AlertTriangle,
  Lock,
} from 'lucide-react';
import { Debtor, Transaction, AppSettings } from '../types';
import { formatVND } from '../utils/vietqr';
import { getDebtorBalance, getDebtorStatement } from '../utils/storage';
import { LookupGuideModal } from './LookupGuideModal';
import { ConfirmDeleteDebtorModal } from './ConfirmDeleteDebtorModal';
import { EditTransactionModal } from './EditTransactionModal';

interface DebtorDetailModalProps {
  debtor: Debtor | null;
  transactions: Transaction[];
  settings: AppSettings;
  onClose: () => void;
  onOpenAddTx: (debtorId: string) => void;
  onEditDebtor: (debtor: Debtor) => void;
  onDeleteDebtor: (debtorId: string) => void;
  onDeleteTx: (txId: string) => void;
  onEditTx?: (updatedTx: Transaction) => Promise<void> | void;
  onViewImage: (url: string, title?: string) => void;
  onDirectGuestView: (debtor: Debtor) => void;
  onOpenChangePin?: (debtor: Debtor) => void;
}

export const DebtorDetailModal: React.FC<DebtorDetailModalProps> = ({
  debtor,
  transactions,
  settings,
  onClose,
  onOpenAddTx,
  onEditDebtor,
  onDeleteDebtor,
  onDeleteTx,
  onEditTx,
  onViewImage,
  onDirectGuestView,
  onOpenChangePin,
}) => {
  const [isGuideModalOpen, setIsGuideModalOpen] = useState(false);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const [deletingTxId, setDeletingTxId] = useState<string | null>(null);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);

  if (!debtor) return null;

  const currentBalance = getDebtorBalance(debtor.id, transactions);
  const statement = getDebtorStatement(debtor.id, transactions);

  return (
    <>
      <div
        id="debtor-detail-modal-backdrop"
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4"
      >
        <div
          id="debtor-detail-modal-card"
          className="bg-white w-full max-w-2xl rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150 max-h-[92vh] flex flex-col"
        >
          {/* Header */}
          <div className="bg-slate-900 text-white px-5 sm:px-6 py-4 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center font-bold text-emerald-400 text-lg">
                {debtor.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <h2 className="font-bold text-base sm:text-lg leading-tight flex items-center gap-2">
                  {debtor.name}
                </h2>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mt-0.5">
                  {onOpenChangePin ? (
                    <button
                      type="button"
                      onClick={() => onOpenChangePin(debtor)}
                      className="flex items-center gap-1 text-amber-300 hover:text-amber-200 bg-slate-800/80 hover:bg-slate-700 px-2 py-0.5 rounded font-mono text-xs font-semibold border border-amber-400/40 transition-colors cursor-pointer"
                      title="Bấm để chủ sổ đổi mật khẩu tra cứu của người này"
                    >
                      <KeyRound className="w-3 h-3 text-amber-400" />
                      <span>Pass: {debtor.pin}</span>
                      <Edit3 className="w-2.5 h-2.5 text-amber-400/70 ml-0.5" />
                    </button>
                  ) : (
                    <span className="flex items-center gap-1 text-amber-300 font-mono">
                      <KeyRound className="w-3 h-3" />
                      Pass: {debtor.pin}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onEditDebtor(debtor)}
                title="Chỉnh sửa thông tin"
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              >
                <Edit3 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setIsConfirmDeleteOpen(true)}
                title="Xóa con nợ này"
                className="p-2 text-red-400 hover:text-red-300 hover:bg-red-950/40 rounded-lg transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                id="close-debtor-detail-btn"
                type="button"
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors ml-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Content Body */}
          <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
            {/* Balance card */}
            <div
              className={`p-4 sm:p-5 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                currentBalance > 0
                  ? 'bg-rose-50/70 border-rose-200 text-rose-950'
                  : currentBalance < 0
                  ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                  : 'bg-slate-50 border-slate-200 text-slate-700'
              }`}
            >
              <div className="min-w-0">
                <span className="text-xs uppercase tracking-wider font-bold opacity-75">
                  Số Nợ Hiện Tại
                </span>
                <div className="flex items-baseline gap-1.5 whitespace-nowrap font-mono mt-0.5">
                  <span className="text-2xl sm:text-3xl font-black tracking-tight">
                    {currentBalance > 0
                      ? `+ ${formatVND(currentBalance).replace(' VNĐ', '')}`
                      : formatVND(currentBalance).replace(' VNĐ', '')}
                  </span>
                  <span className="text-xs sm:text-sm font-bold opacity-80">VNĐ</span>
                </div>
                <p className="text-xs font-medium mt-1">
                  {currentBalance > 0 ? (
                    <span className="text-rose-700 font-semibold">
                      👉 {debtor.name} đang nợ bạn
                    </span>
                  ) : currentBalance < 0 ? (
                    <span className="text-emerald-700 font-semibold">
                      👉 Bạn đang nợ {debtor.name} (cần trả lại họ)
                    </span>
                  ) : (
                    <span className="text-slate-500 font-semibold">
                      🎉 Đã thanh toán hết (Không ai nợ ai)
                    </span>
                  )}
                </p>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2 w-full md:w-auto shrink-0 flex-wrap sm:flex-nowrap">
                <button
                  type="button"
                  onClick={() => onOpenAddTx(debtor.id)}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Plus className="w-4 h-4" />
                  <span>Giao dịch</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsGuideModalOpen(true)}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer whitespace-nowrap"
                  title="Xem và sao chép hướng dẫn truy cập tra cứu gửi con nợ"
                >
                  <BookOpen className="w-4 h-4 text-blue-600" />
                  <span>Tra cứu</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onDirectGuestView(debtor);
                  }}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer whitespace-nowrap"
                  title="Chủ nợ xem trực tiếp giao diện tra cứu khách của con nợ này"
                >
                  <Eye className="w-4 h-4 text-amber-400" />
                  <span>Giao diện con nợ</span>
                </button>
              </div>
            </div>

            {/* Statement History */}
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <h3 className="font-bold text-slate-800 text-xs sm:text-sm flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-slate-500" />
                  Lịch sử biến động theo thời gian ({statement.length} giao dịch)
                </h3>
              </div>

              {statement.length === 0 ? (
                <div className="text-center py-8 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-slate-400 text-xs">
                  Chưa có giao dịch nào cho người này.
                </div>
              ) : (
                <div className="border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100 bg-white">
                  {statement.map(({ transaction: tx, runningBalance }) => {
                    const isAdd = tx.type === 'ADD';
                    return (
                      <div
                        key={tx.id}
                        className="p-3.5 hover:bg-slate-50/80 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          <div
                            className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                              isAdd
                                ? 'bg-rose-100 text-rose-700'
                                : 'bg-emerald-100 text-emerald-700'
                            }`}
                          >
                            {isAdd ? (
                              <ArrowUpRight className="w-4 h-4" />
                            ) : (
                              <ArrowDownLeft className="w-4 h-4" />
                            )}
                          </div>

                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 text-sm break-words">
                              {tx.note}
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 mt-0.5">
                              <span>📅 {tx.date}</span>
                              {tx.category === 'PARTY_SPLIT' && (
                                <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-medium">
                                  Chia tiền
                                </span>
                              )}
                              {tx.category === 'PAYMENT_SETTLED' && (
                                <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-medium">
                                  Trả nợ
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                          <div className="text-left sm:text-right">
                            <div
                              className={`font-bold font-mono text-sm ${
                                isAdd ? 'text-rose-600' : 'text-emerald-600'
                              }`}
                            >
                              {isAdd ? `+${formatVND(tx.amount)}` : `-${formatVND(tx.amount)}`}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              Số dư: {formatVND(runningBalance)}
                            </div>
                          </div>

                          <div className="flex items-center gap-1">
                            {tx.billImage && (
                              <button
                                type="button"
                                onClick={() => onViewImage(tx.billImage!, tx.note)}
                                className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                                title="Xem ảnh chứng từ"
                              >
                                <Receipt className="w-4 h-4" />
                              </button>
                            )}

                            {tx.partyId || tx.category === 'PARTY_SPLIT' ? (
                              <span
                                className="inline-flex items-center gap-1 px-2 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-lg text-[10px] font-semibold cursor-help"
                                title="Giao dịch từ cuộc vui chia tiền: Không thể sửa hoặc xóa lẻ từng người. Vui lòng sang tab 'Chia đầu người' ở ngoài trang chủ để chỉnh sửa hoặc xóa cuộc vui, hệ thống sẽ tự động đồng bộ lại cho từng người."
                              >
                                <Lock className="w-3 h-3 text-amber-600" />
                                <span>Chia đầu người</span>
                              </span>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setEditingTx(tx)}
                                  className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                                  title="Chỉnh sửa giao dịch này"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>

                                <button
                                  type="button"
                                  onClick={() => setDeletingTxId(tx.id)}
                                  className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                                  title="Xóa giao dịch"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 sm:px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0">
            <span className="truncate max-w-xs">
              Ghi chú: {debtor.note || 'Không có ghi chú'}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-100 rounded-xl text-slate-700 font-semibold transition-colors cursor-pointer"
            >
              Đóng
            </button>
          </div>
        </div>
      </div>

      {/* Lookup Guide Modal */}
      <LookupGuideModal
        isOpen={isGuideModalOpen}
        onClose={() => setIsGuideModalOpen(false)}
        debtor={debtor}
        balance={currentBalance}
        settings={settings}
      />

      {/* In-App Confirm Delete Debtor Modal */}
      <ConfirmDeleteDebtorModal
        isOpen={isConfirmDeleteOpen}
        onClose={() => setIsConfirmDeleteOpen(false)}
        debtor={debtor}
        balance={currentBalance}
        transactionCount={statement.length}
        onConfirm={() => {
          onDeleteDebtor(debtor.id);
          setIsConfirmDeleteOpen(false);
          onClose();
        }}
      />

      {/* In-App Confirm Delete Transaction Modal */}
      {deletingTxId && (
        <div
          id="confirm-delete-tx-backdrop"
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-150"
        >
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150 p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-100 flex items-center justify-center text-rose-600 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Xóa Giao Dịch</h3>
                <p className="text-xs text-slate-500">Hành động này không thể hoàn tác</p>
              </div>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Bạn có chắc chắn muốn xóa giao dịch này không?
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeletingTxId(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteTx(deletingTxId);
                  setDeletingTxId(null);
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Xác Nhận Xóa</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Chỉnh Sửa Giao Dịch Của Con Nợ Này */}
      <EditTransactionModal
        isOpen={Boolean(editingTx)}
        onClose={() => setEditingTx(null)}
        transaction={editingTx}
        debtor={debtor}
        onSave={async (updatedTx) => {
          if (onEditTx) {
            await onEditTx(updatedTx);
          }
          setEditingTx(null);
        }}
      />
    </>
  );
};
