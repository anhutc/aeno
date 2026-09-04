/**
 * ============================================================================
 * GHI CHÚ CHỈNH SỬA / CHANGELOG:
 * - Đặt z-index lên z-[70] để đảm bảo khi xem ảnh chứng từ từ bất kỳ modal nào
 *   (kể cả DebtorDetailModal z-50 hay AddDebtorModal z-[60]), ảnh luôn hiển thị ở lớp cao nhất.
 * ============================================================================
 */

import React from 'react';
import { X, ZoomIn, Download } from 'lucide-react';

interface ImageViewerModalProps {
  imageUrl: string | null;
  title?: string;
  onClose: () => void;
}

export const ImageViewerModal: React.FC<ImageViewerModalProps> = ({
  imageUrl,
  title = 'Ảnh hóa đơn',
  onClose,
}) => {
  if (!imageUrl) return null;

  return (
    <div
      id="image-viewer-modal-backdrop"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        id="image-viewer-modal-content"
        className="relative max-w-3xl w-full max-h-[90vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-2 font-medium text-slate-800 text-sm">
            <ZoomIn className="w-4 h-4 text-slate-500" />
            <span>{title}</span>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={imageUrl}
              download="hoa-don-chung-tu.png"
              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 rounded-lg transition-colors"
              title="Tải ảnh về"
            >
              <Download className="w-4 h-4" />
            </a>
            <button
              id="close-image-viewer-btn"
              onClick={onClose}
              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 rounded-lg transition-colors"
              title="Đóng"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-4 flex items-center justify-center overflow-auto bg-slate-950/5 flex-1 min-h-[300px] max-h-[75vh]">
          <img
            src={imageUrl}
            alt={title}
            className="max-w-full max-h-full object-contain rounded-lg shadow-sm"
          />
        </div>
      </div>
    </div>
  );
};
