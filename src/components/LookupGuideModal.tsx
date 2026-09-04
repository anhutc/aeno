/**
 * ============================================================================
 * GHI CHÚ CHỈNH SỬA / CHANGELOG:
 * - Truyền biến sdt_chu_no / ownerPhone vào bộ sinh mẫu tin nhắn tra cứu gửi cho bạn bè.
 * - Tối ưu giao diện hiển thị mẫu tin nhắn và hướng dẫn truy cập.
 * ============================================================================
 */

import React, { useState } from 'react';
import { X, Copy, Check, QrCode, BookOpen } from 'lucide-react';
import { Debtor, AppSettings } from '../types';
import {
  getDebtorTemplateVariables,
  renderMessageTemplate,
  DEFAULT_LOOKUP_GUIDE,
} from '../utils/textTemplate';

interface LookupGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  debtor: Debtor | null;
  balance: number;
  settings: AppSettings;
}

export const LookupGuideModal: React.FC<LookupGuideModalProps> = ({
  isOpen,
  onClose,
  debtor,
  balance,
  settings,
}) => {
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedPass, setCopiedPass] = useState(false);

  if (!isOpen || !debtor) return null;

  const vars = getDebtorTemplateVariables({
    debtorName: debtor.name,
    debtorPin: debtor.pin,
    balance,
    ownerName: settings.ownerName,
    ownerPhone: settings.ownerPhone,
    bankName: settings.bankName,
    accountNumber: settings.accountNumber,
    accountName: settings.accountName,
  });

  const guideText = renderMessageTemplate(
    settings.lookupGuideTemplate || settings.shareMessageTemplate,
    vars,
    DEFAULT_LOOKUP_GUIDE
  );

  const directLink = vars.url;

  const handleCopyAll = () => {
    navigator.clipboard.writeText(guideText);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2500);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(directLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyPass = () => {
    navigator.clipboard.writeText(debtor.pin);
    setCopiedPass(true);
    setTimeout(() => setCopiedPass(false), 2000);
  };

  // QR Code to open the link directly
  const qrLinkUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(
    directLink
  )}`;

  return (
    <div
      id="lookup-guide-modal-backdrop"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-150"
    >
      <div
        id="lookup-guide-modal-card"
        className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col max-h-[92vh]"
      >
        {/* Header */}
        <div className="bg-slate-900 text-white px-5 sm:px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-bold text-sm sm:text-base leading-tight">
                Hướng Dẫn Cho {debtor.name}
              </h2>
              <p className="text-[11px] text-slate-400">
                Gửi thông tin này để con nợ tự tra cứu và chuyển khoản
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1 text-xs sm:text-sm">
          {/* Quick Credential Badges */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <span className="text-[11px] text-slate-500 font-medium">Đường dẫn tra cứu:</span>
              <div className="flex items-center justify-between gap-1">
                <span className="font-mono text-xs text-slate-800 truncate font-semibold">
                  {directLink}
                </span>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="px-2 py-1 bg-white hover:bg-slate-200 border border-slate-300 rounded-md text-[11px] text-slate-700 font-medium shrink-0 flex items-center gap-1 cursor-pointer"
                >
                  {copiedLink ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedLink ? 'Đã chép' : 'Sao chép'}</span>
                </button>
              </div>
            </div>

            <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl space-y-1">
              <span className="text-[11px] text-amber-800 font-medium">Mật khẩu của {debtor.name}:</span>
              <div className="flex items-center justify-between gap-1">
                <span className="font-mono text-sm font-bold text-amber-900 bg-white px-2 py-0.5 rounded border border-amber-300">
                  {debtor.pin}
                </span>
                <button
                  type="button"
                  onClick={handleCopyPass}
                  className="px-2 py-1 bg-white hover:bg-amber-100 border border-amber-300 rounded-md text-[11px] text-amber-800 font-semibold shrink-0 flex items-center gap-1 cursor-pointer"
                >
                  {copiedPass ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedPass ? 'Đã chép' : 'Sao chép'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Full Guide Text Preview */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="font-bold text-slate-700 text-xs uppercase tracking-wider flex items-center gap-1">
                <span>Nội dung:</span>
              </label>
            </div>
            <div className="relative">
              <pre className="p-3.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-sans text-slate-800 whitespace-pre-wrap leading-relaxed max-h-56 overflow-y-auto">
                {guideText}
              </pre>
            </div>
          </div>

          {/* QR Code Quick Scan Helper */}
          <div className="p-3.5 bg-blue-50/60 border border-blue-200 rounded-xl flex items-center gap-3 text-xs">
            <img
              src={qrLinkUrl}
              alt="QR mở link tra cứu"
              className="w-16 h-16 rounded-lg border border-blue-200 bg-white p-1 shrink-0"
            />
            <div className="space-y-1">
              <div className="font-bold text-blue-900 flex items-center gap-1">
                <QrCode className="w-3.5 h-3.5 text-blue-700" />
                <span>Mã QR mở nhanh trang tra cứu</span>
              </div>
              <p className="text-slate-600 text-[11px] leading-relaxed">
                Bạn bè có thể dùng camera điện thoại hoặc Zalo quét mã này để mở thẳng trang tra cứu mà không cần gõ đường dẫn.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-slate-600 hover:text-slate-800 text-xs font-semibold rounded-xl hover:bg-slate-200/70 transition-colors cursor-pointer"
          >
            Đóng
          </button>

          <button
            type="button"
            onClick={handleCopyAll}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer"
          >
            {copiedAll ? <Check className="w-4 h-4 text-white" /> : <Copy className="w-4 h-4" />}
            <span>{copiedAll ? 'Đã Sao Chép Hướng Dẫn!' : 'Sao Chép Hướng Dẫn'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
