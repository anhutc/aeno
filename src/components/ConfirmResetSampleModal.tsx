import React, { useState } from 'react';
import { RefreshCw, X, Lock, Eye, EyeOff, RotateCcw } from 'lucide-react';
import { apiResetSampleData } from '../utils/api';

interface ConfirmResetSampleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const ConfirmResetSampleModal: React.FC<ConfirmResetSampleModalProps> = ({
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
    setIsLoading(true);
    setError('');

    const passTrimmed = adminPassword.trim();
    if (!passTrimmed) {
      setError('Chủ nợ vui lòng nhập mật để xác nhận.');
      setIsLoading(false);
      return;
    }

    try {
      const res = await apiResetSampleData(passTrimmed);
      if (res.success) {
        setAdminPassword('');
        onSuccess();
        onClose();
      } else {
        setError(res.message || 'Mật khẩu chủ nợ không đúng. Không thể nạp dữ liệu mẫu!');
      }
    } catch {
      setError('Lỗi kết nối máy chủ khi nạp lại dữ liệu');
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
      id="confirm-reset-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-150"
    >
      <div
        id="confirm-reset-modal-card"
        className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150 relative"
      >
        {/* Header */}
        <div className="bg-amber-600 text-white px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-white/20 flex items-center justify-center">
              <RotateCcw className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-base tracking-wide uppercase">
                Xác Nhận Nạp Lại Dữ Liệu Mẫu
              </h2>
              <p className="text-[11px] text-amber-100">
                Khôi phục 4 người nợ mẫu (Nam, Bình, An, Cường) &amp; lịch sử giao dịch
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="text-amber-100 hover:text-white p-1 hover:bg-amber-700 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-slate-800 text-sm">
          <div className="p-3.5 bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl text-xs space-y-1.5 leading-relaxed">
            <div className="font-bold flex items-center gap-1.5 text-amber-950">
              <span>ℹ️ Thông tin khôi phục:</span>
            </div>
            <p>
              Hệ thống sẽ nạp lại 4 người nợ mẫu kèm lịch sử vay trả và tiệc chia tiền mẫu để bạn xem trước cách hoạt động.
            </p>
            <p className="font-semibold text-amber-800">
              ⚠️ Dữ liệu người nợ hiện tại sẽ được ghi đè bằng dữ liệu mẫu. Thông tin tài khoản VietQR và mật khẩu quản trị vẫn giữ nguyên.
            </p>
          </div>

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-semibold leading-relaxed animate-in fade-in">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label
              htmlFor="reset-sample-admin-password"
              className="block text-xs font-bold text-slate-700 uppercase tracking-wider"
            >
              Chủ Nợ Nhập Mật Khẩu Để Xác Nhận:
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Lock className="w-4 h-4" />
              </div>
              <input
                id="reset-sample-admin-password"
                type={showPassword ? 'text' : 'password'}
                autoFocus
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="Nhập mật khẩu quản trị Chủ Sổ của bạn..."
                className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white font-medium"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                title={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mt-2">
              Chủ nợ vui lòng nhập chính xác mật khẩu để xác nhận.
            </p>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={handleClose}
              disabled={isLoading}
              className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              Hủy Bỏ
            </button>
            <button
              type="submit"
              disabled={isLoading || !adminPassword.trim()}
              className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white text-xs font-bold rounded-xl transition-all shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Đang nạp lại...</span>
                </>
              ) : (
                <>
                  <RotateCcw className="w-4 h-4" />
                  <span>Xác Nhận Nạp Lại Dữ Liệu Mẫu</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
