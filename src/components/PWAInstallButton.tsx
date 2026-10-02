import React, { useState } from 'react';
import {
  Download,
  Smartphone,
  Share,
  PlusSquare,
  CheckCircle2,
  X,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'header' | 'button' | 'card' | 'settings' | 'inline';
  className?: string;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  variant = 'button',
  className = '',
}) => {
  const { isInstallable, isInstalled, isIOS, isInIframe, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [, setJustInstalled] = useState(false);

  // If already installed and running standalone:
  if (isInstalled) {
    if (variant === 'settings') {
      return (
        <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 text-xs text-emerald-800 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <div>
            <div className="font-bold text-emerald-950">Ứng dụng đã được cài đặt</div>
            <p className="text-[11px] text-emerald-700 mt-0.5">
              Bạn đang sử dụng phiên bản ứng dụng PWA trên thiết bị.
            </p>
          </div>
        </div>
      );
    }
    return null;
  }

  const handleInstallClick = async () => {
    if (isInstallable) {
      const success = await install();
      if (success) {
        setJustInstalled(true);
      }
    } else {
      setShowGuideModal(true);
    }
  };

  return (
    <>
      {/* 1. Header Variant: Đồng bộ phong cách nút trên thanh Header */}
      {variant === 'header' && (
        <button
          type="button"
          onClick={handleInstallClick}
          className={`h-9 w-9 sm:w-auto px-0 sm:px-3 rounded-xl text-xs font-semibold transition-all border border-slate-200/80 bg-slate-100 hover:bg-slate-200/80 active:bg-slate-300 text-slate-700 shadow-2xs cursor-pointer inline-flex items-center justify-center gap-1.5 active:scale-95 shrink-0 ${className}`}
          title="Cài đặt ứng dụng vào điện thoại / máy tính"
          aria-label="Cài đặt ứng dụng"
        >
          <Download className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="hidden sm:inline">Cài App</span>
        </button>
      )}

      {/* 2. Inline Variant: Gọn gàng đặt trong thanh footer của thẻ đăng nhập */}
      {variant === 'inline' && (
        <button
          type="button"
          onClick={handleInstallClick}
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 active:bg-emerald-100 font-bold text-[11px] sm:text-xs transition-colors cursor-pointer shrink-0 border border-emerald-200/60 ${className}`}
          title="Cài đặt ứng dụng lên màn hình chính"
        >
          <Download className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span>Cài App</span>
        </button>
      )}

      {/* 3. Button Variant */}
      {variant === 'button' && (
        <button
          type="button"
          onClick={handleInstallClick}
          className={`inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs sm:text-sm font-bold shadow-xs transition-all cursor-pointer active:scale-95 ${className}`}
        >
          <Download className="w-4 h-4 shrink-0" />
          <span>Cài Đặt Ứng Dụng</span>
        </button>
      )}

      {/* 4. Card Variant */}
      {variant === 'card' && (
        <div
          className={`p-4 sm:p-5 rounded-3xl bg-gradient-to-br from-emerald-500/10 via-teal-500/5 to-white border border-emerald-200/90 text-slate-800 space-y-3 shadow-xs ${className}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-emerald-600/20">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-extrabold text-sm sm:text-base text-slate-900 leading-tight">
                  Cài Đặt Ứng Dụng
                </h4>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  Mở 1 chạm từ màn hình chính, giao diện toàn màn hình mượt mà.
                </p>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleInstallClick}
            className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-xs sm:text-sm rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98"
          >
            <Download className="w-4 h-4 shrink-0" />
            <span>Thêm Vào Màn Hình Chính</span>
            <ArrowRight className="w-3.5 h-3.5 shrink-0" />
          </button>
        </div>
      )}

      {/* 5. Settings Section Variant */}
      {variant === 'settings' && (
        <div className={`p-5 bg-slate-50 rounded-3xl border border-slate-200/80 space-y-3.5 ${className}`}>
          <div className="flex items-center gap-2.5 text-slate-900 font-bold text-xs uppercase tracking-wider">
            <Smartphone className="w-4 h-4 text-emerald-600" />
            <span>Cài Đặt Ứng Dụng (PWA)</span>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            Bạn có thể cài đặt <strong>Sổ Ghi Nợ & Chia Tiền</strong> trực tiếp lên màn hình chính của iPhone, Android hoặc máy tính để truy cập nhanh chóng không cần mở trình duyệt web.
          </p>

          <button
            type="button"
            onClick={handleInstallClick}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer active:scale-95"
          >
            <Download className="w-4 h-4 shrink-0" />
            <span>{isInstallable ? 'Cài Đặt Ngay' : 'Xem Hướng Dẫn Cài Đặt'}</span>
          </button>
        </div>
      )}

      {/* Modal Hướng Dẫn Cài Đặt Dành Cho iOS Safari / Trình duyệt khác */}
      <AnimatePresence>
        {showGuideModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto"
            onClick={() => setShowGuideModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-3xl border border-slate-200 max-w-sm sm:max-w-md w-full shadow-2xl relative my-auto max-h-[88vh] flex flex-col overflow-hidden"
            >
              {/* Header cố định trên cùng - luôn luôn nhìn thấy rõ */}
              <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 bg-white shrink-0">
                <div className="flex items-center gap-2 text-slate-900 font-extrabold text-sm sm:text-base">
                  <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                    <Smartphone className="w-4 h-4" />
                  </div>
                  <span>Hướng Dẫn Cài Đặt App</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowGuideModal(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
                  aria-label="Đóng"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Phần thân có thể cuộn trượt nếu màn hình nhỏ */}
              <div className="p-4 sm:p-5 overflow-y-auto space-y-3.5 flex-1 overscroll-contain">
                {isIOS ? (
                  // Hướng dẫn dành riêng cho iPhone / iPad (Safari)
                  <div className="space-y-3 text-xs sm:text-sm text-slate-700">
                    <p className="font-semibold text-slate-900 flex items-center gap-1.5 text-emerald-800 bg-emerald-50 p-2.5 rounded-xl border border-emerald-100">
                      <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Cách thêm vào màn hình chính trên iPhone/iPad:</span>
                    </p>

                    <div className="space-y-2.5">
                      <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-200/80">
                        <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-800 font-mono font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                          1
                        </div>
                        <div className="leading-relaxed">
                          Chạm vào nút <strong>Chia sẻ</strong> (biểu tượng <Share className="w-3.5 h-3.5 inline mx-0.5 text-blue-600" />) ở thanh dưới cùng trình duyệt Safari.
                        </div>
                      </div>

                      <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-200/80">
                        <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-800 font-mono font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                          2
                        </div>
                        <div className="leading-relaxed">
                          Cuộn danh sách xuống và chọn <strong>"Thêm vào MH chính"</strong> (hoặc <strong>"Add to Home Screen"</strong> <PlusSquare className="w-3.5 h-3.5 inline mx-0.5 text-slate-700" />).
                        </div>
                      </div>

                      <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-200/80">
                        <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-800 font-mono font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                          3
                        </div>
                        <div className="leading-relaxed">
                          Nhấn <strong>"Thêm"</strong> (Add) ở góc trên bên phải màn hình. Biểu tượng ứng dụng sẽ xuất hiện ngay trên màn hình chính!
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  // Hướng dẫn dành cho Android / Chrome / Edge / Máy tính
                  <div className="space-y-3 text-xs sm:text-sm text-slate-700">
                    {isInIframe ? (
                      <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200/80 text-amber-900 text-xs space-y-1">
                        <strong className="block font-bold">Lưu ý khi xem trong môi trường thử nghiệm:</strong>
                        <p className="leading-relaxed text-amber-800">
                          Trình duyệt chặn hộp thoại tự động cài đặt khi ứng dụng đang nằm trong khung xem trước (iframe). Để cài đặt tự động 1 chạm, hãy mở đường link ứng dụng trực tiếp trên trình duyệt điện thoại.
                        </p>
                      </div>
                    ) : null}

                    <p className="font-semibold text-slate-900">
                      Cách thêm nhanh vào màn hình chính trên Android / Chrome:
                    </p>

                    <div className="space-y-2.5">
                      <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-200/80">
                        <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-800 font-mono font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                          1
                        </div>
                        <div className="leading-relaxed">
                          Bấm vào biểu tượng <strong>Menu ba chấm (⋮)</strong> ở góc trên bên phải trình duyệt Chrome / Cốc Cốc.
                        </div>
                      </div>

                      <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-200/80">
                        <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-800 font-mono font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                          2
                        </div>
                        <div className="leading-relaxed">
                          Chọn <strong>"Cài đặt ứng dụng"</strong> (hoặc <strong>"Thêm vào màn hình chính"</strong>). Máy sẽ tự động tải biểu tượng app và ghim ra màn hình chính.
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Nút hành động cố định ở đáy modal */}
              <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50/80 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowGuideModal(false)}
                  className="w-full py-2.5 sm:py-3 bg-slate-900 hover:bg-slate-800 active:bg-black text-white rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer text-center"
                >
                  Đã hiểu
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
