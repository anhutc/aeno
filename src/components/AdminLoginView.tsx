/**
 * ============================================================================
 * GHI CHÚ CHỈNH SỬA / CHANGELOG:
 * - YÊU CẦU: Nhập lại mật khẩu nếu load lại trang.
 * - Cập nhật giao diện Đăng Nhập Quản Lý: Hiển thị ghi chú an toàn thông tin
 *   rõ ràng, giải thích hệ thống tự động yêu cầu xác thực lại mật khẩu mỗi khi
 *   tải lại trang (F5 / reload) hoặc mở phiên mới để bảo vệ an toàn cho sổ ghi nợ.
 * ============================================================================
 */

import React, { useState } from 'react';
import { Lock, Eye, EyeOff, Unlock, RefreshCw, ArrowLeft, ShieldCheck } from 'lucide-react';
import { loginOwner } from '../utils/api';
import { AppSettings } from '../types';

interface AdminLoginViewProps {
  settings: AppSettings;
  onLoginSuccess: () => void;
  onGoToGuest: () => void;
}

export const AdminLoginView: React.FC<AdminLoginViewProps> = ({
  settings,
  onLoginSuccess,
  onGoToGuest,
}) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setError('Vui lòng nhập mật khẩu chủ nợ');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const res = await loginOwner(password.trim());
      if (res.success) {
        setPassword('');
        onLoginSuccess();
      } else {
        setError(res.message || 'Mật khẩu chủ nợ không chính xác. Vui lòng thử lại.');
      }
    } catch {
      setError('Lỗi kết nối máy chủ. Vui lòng kiểm tra lại mạng.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[72vh] flex items-center justify-center p-3 sm:p-4 w-full animate-in fade-in duration-200">
      <div
        id="admin-login-card"
        className="w-full max-w-xl bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden relative"
      >
        {/* Top Header Card */}
        <div className="bg-slate-900 text-white p-6 sm:p-7 text-center relative border-b border-slate-800">
          <button
            type="button"
            onClick={onGoToGuest}
            className="absolute left-4 top-5 p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors text-xs flex items-center gap-1.5 font-medium cursor-pointer"
            title="Quay lại giao diện khách tra cứu"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden xs:inline">Khách Tra Cứu</span>
          </button>

          <div className="w-14 h-14 rounded-2xl bg-amber-500/20 text-amber-400 mx-auto flex items-center justify-center mb-3 shadow-inner">
            <Lock className="w-7 h-7" />
          </div>

          <h1 className="text-lg sm:text-xl font-bold uppercase tracking-wider text-white">
            Chủ Nợ Đăng Nhập
          </h1>
          <p className="text-xs text-slate-400 mt-1.5 max-w-sm mx-auto leading-relaxed">
            Khu vực bảo mật dành cho {settings.ownerName || 'chủ nợ'}. Chủ nợ quản lý danh sách con nợ.
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="p-6 sm:p-7 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-medium leading-relaxed animate-in fade-in">
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="admin-password-input"
              className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 text-center"
            >
              Mật khẩu quản lý của chủ nợ:
            </label>
            <div className="relative">
              <input
                id="admin-password-input"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Nhập mật khẩu chủ nợ..."
                autoFocus
                className="w-full px-4 py-3.5 text-center text-lg sm:text-xl font-bold font-mono tracking-wider bg-slate-50 border border-slate-300 rounded-2xl text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all shadow-inner"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-4 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                title={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500 mt-2">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Dữ liệu được bảo vệ an toàn trên hệ thống</span>
            </div>
          </div>

          <button
            type="submit"
            id="submit-admin-login-btn"
            disabled={isLoading || password.trim().length === 0}
            className="w-full py-3.5 px-4 bg-slate-900 hover:bg-slate-800 active:bg-slate-950 disabled:opacity-50 text-white font-bold text-sm rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            {isLoading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Đang xác thực...</span>
              </>
            ) : (
              <>
                <Unlock className="w-4 h-4 text-amber-400" />
                <span>Chủ Nợ Truy Cập</span>
              </>
            )}
          </button>
        </form>

        {/* Footer Navigation Switcher */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 text-center">
          <button
            type="button"
            onClick={onGoToGuest}
            className="text-xs text-slate-600 hover:text-slate-900 font-semibold cursor-pointer transition-colors"
          >
            Bạn là con nợ muốn tra cứu? Bấm vào đây
          </button>
        </div>
      </div>
    </div>
  );
};
