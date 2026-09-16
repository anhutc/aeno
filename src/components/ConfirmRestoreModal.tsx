import React, { useState } from 'react';
import {
  Upload,
  X,
  AlertTriangle,
  FileText,
  Users,
  Receipt,
  Layers,
  Settings2,
  CheckCircle2,
  Loader2,
} from 'lucide-react';

export interface RestorePayloadPreview {
  fileName: string;
  fileSize?: number;
  debtorsCount: number;
  transactionsCount: number;
  partiesCount: number;
  hasSettings: boolean;
  rawPayload: any;
}

interface ConfirmRestoreModalProps {
  isOpen: boolean;
  preview: RestorePayloadPreview | null;
  onClose: () => void;
  onConfirm: (mode: 'replace' | 'merge') => Promise<void>;
  isRestoring: boolean;
}

export const ConfirmRestoreModal: React.FC<ConfirmRestoreModalProps> = ({
  isOpen,
  preview,
  onClose,
  onConfirm,
  isRestoring,
}) => {
  const [mode, setMode] = useState<'replace' | 'merge'>('replace');

  if (!isOpen || !preview) return null;

  const handleExecute = async () => {
    await onConfirm(mode);
  };

  return (
    <div
      id="confirm-restore-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-150"
    >
      <div
        id="confirm-restore-modal-card"
        className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150 relative flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="bg-emerald-700 text-white px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-white/20 flex items-center justify-center">
              <Upload className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-bold leading-tight">Khôi Phục Dữ Liệu Từ Tệp JSON</h3>
              <p className="text-xs text-emerald-100">Kiểm tra thông tin trước khi áp dụng vào sổ nợ</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isRestoring}
            className="w-8 h-8 rounded-full flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4 overflow-y-auto">
          {/* File Info Card */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Tệp sao lưu được chọn</div>
              <div className="text-sm font-bold text-slate-800 truncate" title={preview.fileName}>
                {preview.fileName}
              </div>
            </div>
          </div>

          {/* Stats Grid */}
          <div>
            <div className="text-xs font-semibold text-slate-600 mb-2">Dữ liệu phát hiện trong tệp:</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="bg-emerald-50/60 border border-emerald-100 rounded-xl p-2.5 text-center">
                <Users className="w-4 h-4 text-emerald-600 mx-auto mb-1" />
                <div className="text-lg font-black text-emerald-900 leading-none">{preview.debtorsCount}</div>
                <div className="text-[11px] text-emerald-700 mt-0.5">Người nợ</div>
              </div>

              <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-2.5 text-center">
                <Receipt className="w-4 h-4 text-blue-600 mx-auto mb-1" />
                <div className="text-lg font-black text-blue-900 leading-none">{preview.transactionsCount}</div>
                <div className="text-[11px] text-blue-700 mt-0.5">Giao dịch</div>
              </div>

              <div className="bg-purple-50/60 border border-purple-100 rounded-xl p-2.5 text-center">
                <Layers className="w-4 h-4 text-purple-600 mx-auto mb-1" />
                <div className="text-lg font-black text-purple-900 leading-none">{preview.partiesCount}</div>
                <div className="text-[11px] text-purple-700 mt-0.5">Đợt chia tiền</div>
              </div>

              <div className="bg-amber-50/60 border border-amber-100 rounded-xl p-2.5 text-center">
                <Settings2 className="w-4 h-4 text-amber-600 mx-auto mb-1" />
                <div className="text-sm font-black text-amber-900 leading-none mt-1">
                  {preview.hasSettings ? 'Có' : 'Không'}
                </div>
                <div className="text-[11px] text-amber-700 mt-0.5">Cài đặt QR</div>
              </div>
            </div>
          </div>

          {/* Mode Selection */}
          <div className="space-y-2 pt-1">
            <div className="text-xs font-semibold text-slate-700">Chọn phương thức khôi phục:</div>

            {/* Option Replace */}
            <label
              className={`flex items-start gap-3 p-3 rounded-2xl border cursor-pointer transition-all ${
                mode === 'replace'
                  ? 'bg-emerald-50/60 border-emerald-500 text-slate-900 ring-1 ring-emerald-500'
                  : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
              }`}
            >
              <input
                type="radio"
                name="restoreMode"
                value="replace"
                checked={mode === 'replace'}
                onChange={() => setMode('replace')}
                className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
              />
              <div className="text-xs">
                <div className="font-bold text-slate-900 flex items-center gap-1.5">
                  <span>Ghi đè toàn bộ (Khuyên dùng)</span>
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded-md font-semibold">
                    Chuẩn xác
                  </span>
                </div>
                <p className="text-slate-500 mt-0.5 leading-relaxed">
                  Thay thế toàn bộ sổ nợ hiện tại bằng nội dung trong tệp sao lưu. Đảm bảo dữ liệu đồng nhất và đồng bộ tức thì lên Cloud Firestore.
                </p>
              </div>
            </label>

            {/* Option Merge */}
            <label
              className={`flex items-start gap-3 p-3 rounded-2xl border cursor-pointer transition-all ${
                mode === 'merge'
                  ? 'bg-emerald-50/60 border-emerald-500 text-slate-900 ring-1 ring-emerald-500'
                  : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
              }`}
            >
              <input
                type="radio"
                name="restoreMode"
                value="merge"
                checked={mode === 'merge'}
                onChange={() => setMode('merge')}
                className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
              />
              <div className="text-xs">
                <div className="font-bold text-slate-900">Gộp thêm dữ liệu (Merge)</div>
                <p className="text-slate-500 mt-0.5 leading-relaxed">
                  Giữ nguyên người nợ và giao dịch đang có, chỉ thêm vào các bản ghi mới hoặc cập nhật các mục trùng ID từ tệp sao lưu.
                </p>
              </div>
            </label>
          </div>

          {/* Warning Banner */}
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 flex items-start gap-2.5 text-amber-800 text-xs">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <span>
              Quá trình khôi phục sẽ tự động lưu vào trình duyệt, máy chủ và đồng bộ trực tiếp lên Cloud Firestore.
            </span>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isRestoring}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 rounded-xl transition-colors disabled:opacity-50 cursor-pointer"
          >
            Hủy Bỏ
          </button>
          <button
            type="button"
            onClick={handleExecute}
            disabled={isRestoring}
            className="px-5 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-xl shadow-xs transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            {isRestoring ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Đang khôi phục & đồng bộ...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Xác Nhận Khôi Phục</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
