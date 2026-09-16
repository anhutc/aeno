import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Download,
  ExternalLink,
} from 'lucide-react';

interface ImageViewerModalProps {
  imageUrl: string | null;
  title?: string;
  onClose: () => void;
}

export const ImageViewerModal: React.FC<ImageViewerModalProps> = ({
  imageUrl,
  title = 'Ảnh chứng từ hóa đơn',
  onClose,
}) => {
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);

  const handleZoomIn = () => setZoomLevel((prev) => Math.min(prev + 0.3, 3));
  const handleZoomOut = () => setZoomLevel((prev) => Math.max(prev - 0.3, 0.6));
  const handleResetZoom = () => {
    setZoomLevel(1);
    setRotation(0);
  };
  const handleRotate = () => setRotation((prev) => (prev + 90) % 360);

  const handleOpenNewTab = () => {
    const win = window.open();
    if (win) {
      win.document.write(
        `<body style="margin:0;background:#f8fafc;display:flex;align-items:center;justify-content:center;min-height:100vh;"><img src="${imageUrl}" style="max-width:100%;height:auto;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,0.08);" /></body>`
      );
    }
  };

  return (
    <AnimatePresence>
      {imageUrl && (
        <motion.div
          id="image-viewer-modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-2 sm:p-4"
          onClick={onClose}
        >
          <motion.div
            id="image-viewer-modal-content"
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="relative max-w-4xl w-full max-h-[96vh] h-[92vh] bg-white border border-slate-200 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top Bar - Giao diện sáng thanh lịch */}
            <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-slate-200 bg-slate-50/90 shrink-0 text-slate-800">
              <div className="flex items-center gap-2.5 min-w-0 font-semibold text-xs sm:text-sm">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0 shadow-2xs"></span>
                <span className="truncate text-slate-900">{title}</span>
              </div>

              <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                {/* Bộ điều khiển Phóng to / Thu nhỏ */}
                <div className="flex items-center bg-white rounded-xl p-0.5 border border-slate-200 shadow-2xs">
                  <button
                    type="button"
                    onClick={handleZoomOut}
                    disabled={zoomLevel <= 0.6}
                    className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-30 cursor-pointer"
                    title="Thu nhỏ"
                  >
                    <ZoomOut className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={handleResetZoom}
                    className="px-2 py-1 text-[11px] font-mono font-bold text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                    title="Đặt lại kích thước ban đầu"
                  >
                    {Math.round(zoomLevel * 100)}%
                  </button>

                  <button
                    type="button"
                    onClick={handleZoomIn}
                    disabled={zoomLevel >= 3}
                    className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-30 cursor-pointer"
                    title="Phóng to"
                  >
                    <ZoomIn className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={handleRotate}
                    className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                    title="Xoay 90 độ"
                  >
                    <RotateCw className="w-4 h-4" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleOpenNewTab}
                  className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer border border-slate-200/80 bg-white"
                  title="Mở ảnh trong tab mới"
                >
                  <ExternalLink className="w-4 h-4" />
                </button>

                <a
                  href={imageUrl}
                  download={`chung-tu-${Date.now()}.png`}
                  className="p-2 text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-xl transition-colors cursor-pointer border border-slate-200/80 bg-white"
                  title="Tải ảnh về máy"
                >
                  <Download className="w-4 h-4" />
                </a>

                <button
                  id="close-image-viewer-btn"
                  type="button"
                  onClick={onClose}
                  className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer ml-1"
                  title="Đóng (ESC)"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Viewport hiển thị ảnh - nền sáng trang nhã */}
            <div className="flex-1 overflow-auto bg-slate-100/70 p-4 sm:p-6 flex items-center justify-center select-none relative">
              <div
                className="transition-transform duration-150 ease-out flex items-center justify-center"
                style={{
                  transform: `scale(${zoomLevel}) rotate(${rotation}deg)`,
                  transformOrigin: 'center center',
                }}
              >
                <img
                  src={imageUrl}
                  alt={title}
                  className="max-w-full max-h-[76vh] w-auto h-auto object-contain rounded-xl shadow-lg border border-slate-200/80 bg-white transition-all"
                  style={{
                    imageRendering: 'auto',
                  }}
                />
              </div>
            </div>

            {/* Footer tip */}
            <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-500 flex items-center justify-between shrink-0">
              <span>Dùng thanh công cụ ở trên để phóng to, xoay và xem rõ chi tiết hóa đơn</span>
              <button
                type="button"
                onClick={handleResetZoom}
                className="font-semibold text-emerald-600 hover:text-emerald-700 hover:underline cursor-pointer"
              >
                Về kích thước gốc
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
