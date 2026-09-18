/**
 * ============================================================================
 * GHI CHÚ CHỈNH SỬA / CHANGELOG:
 * - Truyền biến sdt_chu_no / ownerPhone vào bộ sinh mẫu tin nhắn tra cứu gửi cho bạn bè.
 * - Tối ưu giao diện hiển thị mẫu tin nhắn và hướng dẫn truy cập.
 * ============================================================================
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
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

  const vars = debtor
    ? getDebtorTemplateVariables({
        debtorName: debtor.name,
        debtorPin: debtor.pin,
        balance,
        ownerName: settings.ownerName,
        ownerPhone: settings.ownerPhone,
        bankName: settings.bankName,
        accountNumber: settings.accountNumber,
        accountName: settings.accountName,
      })
    : null;

  const guideText = vars
    ? renderMessageTemplate(
        settings.lookupGuideTemplate || settings.shareMessageTemplate,
        vars,
        DEFAULT_LOOKUP_GUIDE
      )
    : '';

  const directLink = vars?.url || '';

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
    <AnimatePresence>
      {isOpen && debtor && (
        <motion.div
          id="lookup-guide-modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4"
        >
          <motion.div
            id="lookup-guide-modal-card"
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]"
            onClick={(e) => e.stopPropagation()}
          >
        {/* Header - Sáng & Tinh tế */}
        <div className="bg-slate-50 text-slate-900 px-5 sm:px-6 py-4 flex items-center justify-between shrink-0 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-100 border border-blue-200 text-blue-700 flex items-center justify-center shrink-0 shadow-2xs">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-bold text-sm sm:text-base leading-tight text-slate-900">
                Hướng Dẫn Cho {debtor.name}
              </h2>
              <p className="text-[11px] text-slate-500">
                Gửi thông tin này để người nợ tự tra cứu và chuyển khoản
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1.5 hover:bg-slate-200/70 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1 text-xs sm:text-sm">

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
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
