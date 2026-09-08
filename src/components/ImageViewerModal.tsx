import React, { useState } from 'react';
import {
  X,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Download,
  Maximize2,
  Minimize2,
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

  if (!imageUrl) return null;

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
        `<body style="margin:0;background:#0f172a;display:flex;align-items:center;justify-content:center;min-height:100vh;"><img src="${imageUrl}" style="max-width:100%;height:auto;" /></body>`
      );
    }
  };

  return (
    <div
      id="image-viewer-modal-backdrop"
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-2 sm:p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        id="image-viewer-modal-content"
        className="relative max-w-4xl w-full max-h-[96vh] h-[92vh] bg-slate-900 border border-slate-700/80 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Bar */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-slate-800 bg-slate-950/70 shrink-0 text-white">
          <div className="flex items-center gap-2 min-w-0 font-medium text-xs sm:text-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0"></span>
            <span className="truncate">{title}</span>
          </div>

          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            {/* Controls */}
            <div className="flex items-center bg-slate-800 rounded-xl p-0.5 border border-slate-700">
              <button
                type="button"
                onClick={handleZoomOut}
                disabled={zoomLevel <= 0.6}
                className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-30 cursor-pointer"
                title="Thu nhỏ"
              >
                <ZoomOut className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={handleResetZoom}
                className="px-2 py-1 text-[11px] font-mono text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
                title="Đặt lại kích thước ban đầu"
              >
                {Math.round(zoomLevel * 100)}%
              </button>

              <button
                type="button"
                onClick={handleZoomIn}
                disabled={zoomLevel >= 3}
                className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-30 cursor-pointer"
                title="Phóng to"
              >
                <ZoomIn className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={handleRotate}
                className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
                title="Xoay 90 độ"
              >
                <RotateCw className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={handleOpenNewTab}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              title="Mở ảnh trong tab mới"
            >
              <ExternalLink className="w-4 h-4" />
            </button>

            <a
              href={imageUrl}
              download={`chung-tu-${Date.now()}.png`}
              className="p-2 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              title="Tải ảnh về máy"
            >
              <Download className="w-4 h-4" />
            </a>

            <button
              id="close-image-viewer-btn"
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-rose-950/60 rounded-xl transition-colors cursor-pointer ml-1"
              title="Đóng (ESC)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Image viewport with scroll and pan */}
        <div className="flex-1 overflow-auto bg-slate-950 p-4 flex items-center justify-center select-none relative">
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
              className="max-w-full max-h-[80vh] w-auto h-auto object-contain rounded-lg shadow-2xl transition-all"
              style={{
                imageRendering: 'auto',
              }}
            />
          </div>
        </div>

        {/* Footer tip */}
        <div className="px-4 py-2 bg-slate-950/80 border-t border-slate-800/80 text-[11px] text-slate-400 flex items-center justify-between shrink-0">
          <span>Dùng thanh công cụ ở trên để phóng to xem rõ số tiền và nội dung chuyển khoản</span>
          <button
            type="button"
            onClick={handleResetZoom}
            className="text-emerald-400 hover:underline cursor-pointer"
          >
            Khung nhìn gốc
          </button>
        </div>
      </div>
    </div>
  );
};
