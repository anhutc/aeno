import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ShieldCheck, Lock } from 'lucide-react';
import { AppSettings } from '../types';

interface MultitaskPrivacyShieldProps {
  settings: AppSettings;
  isOwnerAuthenticated?: boolean;
}

export const MultitaskPrivacyShield: React.FC<MultitaskPrivacyShieldProps> = ({
  settings,
}) => {
  const isEnabled = settings.blurOnMultitask !== false;
  const shieldStyle = settings.multitaskShieldStyle || 'BLUR_SHIELD';

  const [isPreviewing, setIsPreviewing] = useState(false);
  const isPreviewingRef = useRef(false);
  const previewTimerRef = useRef<number | null>(null);

  useEffect(() => {
    isPreviewingRef.current = isPreviewing;
  }, [isPreviewing]);

  useEffect(() => {
    if (!isEnabled) {
      document.documentElement.classList.remove('multitask-blur-active');
      document.body.classList.remove('multitask-blur-active');
      const shield = document.getElementById('multitask-privacy-shield');
      if (shield) {
        shield.style.opacity = '0';
        shield.style.visibility = 'hidden';
        shield.style.pointerEvents = 'none';
      }
      return;
    }

    // Áp dụng làm mờ VÀ bật màn che bảo mật ngay lập tức (0ms, synchronous)
    // khi người dùng nhấn nút đa nhiệm (Recent Apps) hoặc chuyển sang ứng dụng khác
    const applyBlur = () => {
      document.documentElement.classList.add('multitask-blur-active');
      document.body.classList.add('multitask-blur-active');
      const shield = document.getElementById('multitask-privacy-shield');
      if (shield) {
        shield.style.opacity = '1';
        shield.style.visibility = 'visible';
        shield.style.pointerEvents = 'auto';
      }
    };

    const removeBlur = () => {
      // Chỉ gỡ blur nếu không đang trong chế độ xem thử nghiệm (preview)
      if (isPreviewingRef.current) return;
      document.documentElement.classList.remove('multitask-blur-active');
      document.body.classList.remove('multitask-blur-active');
      const shield = document.getElementById('multitask-privacy-shield');
      if (shield) {
        shield.style.opacity = '0';
        shield.style.visibility = 'hidden';
        shield.style.pointerEvents = 'none';
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        applyBlur();
      } else if (document.visibilityState === 'visible') {
        removeBlur();
      }
    };

    // Khi người dùng nhấn nút đa nhiệm (Recent Apps) hoặc vuốt App Switcher:
    // QUAN TRỌNG: Phải bỏ qua hoàn toàn các sự kiện blur phát ra từ thẻ input, button, select...
    // Tránh việc ấn nút đăng nhập hoặc rời ô nhập mật khẩu bị kích hoạt làm mờ nhầm.
    const handleWindowBlur = (e: FocusEvent) => {
      if (e.target && e.target !== window && e.target !== document) {
        return;
      }
      if (typeof document.hasFocus === 'function' && document.hasFocus()) {
        return;
      }
      applyBlur();
    };

    const handleWindowFocus = () => {
      removeBlur();
    };

    const handlePageHide = () => {
      applyBlur();
    };

    const handlePageShow = () => {
      removeBlur();
    };

    const handleFreeze = () => {
      applyBlur();
    };

    // Khi người dùng tương tác trực tiếp trên màn hình (chạm, click, gõ phím),
    // ứng dụng chắc chắn đang ở foreground -> lập tức đảm bảo không bị dính làm mờ
    const handleUserInteraction = () => {
      if (!isPreviewingRef.current) {
        removeBlur();
      }
    };

    // Lắng nghe sự kiện xem thử (preview) được kích hoạt từ trang Cài đặt
    const handlePreviewEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ duration?: number }>;
      const duration = customEvent?.detail?.duration || 3000;
      setIsPreviewing(true);
      applyBlur();

      if (previewTimerRef.current) {
        window.clearTimeout(previewTimerRef.current);
      }
      previewTimerRef.current = window.setTimeout(() => {
        previewTimerRef.current = null;
        setIsPreviewing(false);
        document.documentElement.classList.remove('multitask-blur-active');
        document.body.classList.remove('multitask-blur-active');
        const shield = document.getElementById('multitask-privacy-shield');
        if (shield) {
          shield.style.opacity = '0';
          shield.style.visibility = 'hidden';
          shield.style.pointerEvents = 'none';
        }
      }, duration);
    };

    // KHÔNG dùng capture cho blur để tránh bắt sự kiện blur của input/button
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur, false);
    window.addEventListener('focus', handleWindowFocus, false);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('pageshow', handlePageShow);
    document.addEventListener('freeze', handleFreeze);
    window.addEventListener('pointerdown', handleUserInteraction, { passive: true });
    window.addEventListener('keydown', handleUserInteraction, { passive: true });
    window.addEventListener('preview-multitask-shield', handlePreviewEvent);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur, false);
      window.removeEventListener('focus', handleWindowFocus, false);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('pageshow', handlePageShow);
      document.removeEventListener('freeze', handleFreeze);
      window.removeEventListener('pointerdown', handleUserInteraction);
      window.removeEventListener('keydown', handleUserInteraction);
      window.removeEventListener('preview-multitask-shield', handlePreviewEvent);
      document.documentElement.classList.remove('multitask-blur-active');
      document.body.classList.remove('multitask-blur-active');
      if (previewTimerRef.current) {
        window.clearTimeout(previewTimerRef.current);
      }
    };
  }, [isEnabled]);

  // Luôn giữ phần tử trong DOM để sẵn sàng 0ms khi chụp ảnh App Switcher
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      id="multitask-privacy-shield"
      className={`fixed inset-0 z-[99999] flex flex-col items-center justify-center p-6 bg-slate-900/40 backdrop-blur-2xl transition-all duration-150 select-none ${
        !isEnabled ? 'hidden' : ''
      }`}
      style={{
        opacity: isPreviewing ? 1 : 0,
        visibility: isPreviewing ? 'visible' : 'hidden',
        pointerEvents: isPreviewing ? 'auto' : 'none',
        paddingBottom: 'max(calc(env(safe-area-inset-bottom, 0px) + 24px), 32px)',
      }}
      aria-hidden="true"
    >
      {shieldStyle === 'BLUR_SHIELD' ? (
        <div className="bg-white/95 backdrop-blur-xl border border-slate-200/80 rounded-3xl p-6 sm:p-7 max-w-xs sm:max-w-sm w-full text-center shadow-2xl space-y-4">
          <div className="relative mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center shadow-lg shadow-emerald-600/20">
            <ShieldCheck className="w-9 h-9" />
            <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-slate-900 text-white flex items-center justify-center shadow-xs">
              <Lock className="w-2.5 h-2.5" />
            </div>
          </div>

          <div className="space-y-1">
            <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
              {settings.appTitle || 'SỔ GHI NỢ'}
            </h3>
            <p className="text-xs text-slate-500 font-medium leading-relaxed">
              Thông tin công nợ &amp; số dư tài chính đang được bảo mật tự động khi đa nhiệm.
            </p>
          </div>

          <div className="pt-1 flex items-center justify-center gap-1.5 text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200/80 py-1.5 px-3 rounded-full">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Chống nhìn trộm (Anti-Snooping)</span>
          </div>

          {isPreviewing && (
            <p className="text-[10px] text-amber-600 font-bold animate-pulse">
              ⏱️ Đang xem thử nghiệm (Tự tắt sau 3 giây)...
            </p>
          )}
        </div>
      ) : (
        // Chế độ BLUR_ONLY: Chỉ làm mờ toàn màn hình
        <div className="w-full h-full flex items-center justify-center">
          <div className="p-3 rounded-2xl bg-white/80 backdrop-blur-md border border-slate-200/80 shadow-md flex items-center gap-2 text-xs font-bold text-slate-700">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Nội dung đã được làm mờ bảo vệ</span>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
};
