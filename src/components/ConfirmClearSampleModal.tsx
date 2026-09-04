import React, { useState } from 'react';
import { Trash2, X, Eye, EyeOff, AlertTriangle, RefreshCw } from 'lucide-react';
import { apiClearAllSampleData } from '../utils/api';

interface ConfirmClearSampleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const ConfirmClearSampleModal: React.FC<ConfirmClearSampleModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [adminPassword, setAdminPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminPassword.trim()) {
      setError('Chủ nợ vui lòng nhập mật khẩu để xác nhận');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const res = await apiClearAllSampleData(adminPassword.trim());
      if (res.success) {
        setAdminPassword('');
        onSuccess();
        onClose();
      } else {
        setError(res.message || 'Mật khẩu chủ nợ không chính xác. Không thể xóa dữ liệu!');
      }
    } catch {
      setError('Lỗi kết nối máy chủ khi thực hiện xóa dữ liệu');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setAdminPassword('');
    setError('');
    onClose();
  };

  return (
    <div
      id="confirm-clear-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-150"
    >
      <div
        id="confirm-clear-modal-card"
        className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150 relative"
      >
        {/* Header */}
        <div className="bg-rose-600 text-white px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-white/20 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-base tracking-wide uppercase">
                Xác Nhận Xóa Sạch Dữ Liệu Mẫu
              </h2>
              <p className="text-[11px] text-rose-100">
                Bắt đầu ghi sổ nợ thực tế
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="text-rose-100 hover:text-white p-1 hover:bg-rose-700 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-slate-800 text-sm">
          <div className="p-3.5 bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl text-xs space-y-1 leading-relaxed">
            <div className="font-bold flex items-center gap-1.5 text-amber-950">
              <span>⚠️ Lưu ý quan trọng:</span>
            </div>
            <p>
              Toàn bộ danh sách con nợ và lịch sử giao dịch mẫu (Bình, Cường, Dũng...) sẽ được xóa hoàn toàn và trở về trạng thái trống ban đầu.
            </p>
            <p className="font-semibold text-emerald-800 pt-0.5">
              ✓ Thông tin ngân hàng VietQR và mật khẩu quản trị của bạn được giữ nguyên 100%.
            </p>
          </div>

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-semibold animate-in fade-in">
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="confirm-clear-admin-password"
              className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 text-center"
            >
              Chủ Nợ Nhập Mật Khẩu Để Xác Nhận:
            </label>
            <div className="relative">
              <input
                id="confirm-clear-admin-password"
                type={showPassword ? 'text' : 'password'}
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="Nhập mật khẩu chủ nợ..."
                autoFocus
                className="w-full px-4 py-3.5 text-center text-lg sm:text-xl font-bold font-mono tracking-wider bg-slate-50 border border-slate-300 rounded-2xl text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent transition-all shadow-inner"
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
            <p className="text-[11px] text-slate-500 text-center mt-2">
              Chủ nợ vui lòng nhập chính xác mật khẩu để xác nhận.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5 pt-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={isLoading}
              className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 font-semibold text-xs rounded-xl transition-colors cursor-pointer"
            >
              Hủy Bỏ
            </button>

            <button
              type="submit"
              disabled={isLoading || adminPassword.trim().length === 0}
              className="flex-1 py-3 px-4 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Đang xác thực...</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  <span>Xác Nhận Xóa Sạch</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
