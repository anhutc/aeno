import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  X,
  Download,
  Copy,
  Check,
  Share2,
  FileSpreadsheet,
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  CreditCard,
  ShieldCheck,
  MessageSquare,
  Maximize2,
  Minimize2,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { toPng, toBlob } from 'html-to-image';
import { Debtor, Transaction, AppSettings } from '../types';
import { formatVND, generateVietQrUrl } from '../utils/vietqr';
import { getDebtorStatement } from '../utils/storage';

interface ShareDebtorImageModalProps {
  debtor: Debtor | null;
  transactions: Transaction[];
  settings: AppSettings;
  onClose: () => void;
}

export const ShareDebtorImageModal: React.FC<ShareDebtorImageModalProps> = ({
  debtor,
  transactions,
  settings,
  onClose,
}) => {
  // Capture Ref: container cố định 600px chuẩn xuất ảnh (không bị ảnh hưởng bởi viewport/scale)
  const captureCardRef = useRef<HTMLDivElement>(null);
  // Preview Container Ref: để đo chiều rộng khung xem trước và tính tỷ lệ scale vừa vặn
  const previewContainerRef = useRef<HTMLDivElement>(null);

  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedStatus, setCopiedStatus] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'fit' | 'actual'>('fit');
  const [showOptions, setShowOptions] = useState(false);
  const [scaleFactor, setScaleFactor] = useState(1);
  const [qrBase64, setQrBase64] = useState<string | null>(null);

  // Customization options
  const [txLimit, setTxLimit] = useState<'all' | '10' | '5'>('all');
  const [txSort, setTxSort] = useState<'asc' | 'desc'>('asc');
  const [showQr, setShowQr] = useState(true);
  const [showRunningBalance, setShowRunningBalance] = useState(true);
  const [showPin, setShowPin] = useState(true);
  const [noteMessage, setNoteMessage] = useState(
    'Nhờ bạn đối soát lại các giao dịch trên và thanh toán giúp mình sớm nhé. Cảm ơn bạn!'
  );

  const statement = useMemo(() => {
    if (!debtor) return [];
    return getDebtorStatement(debtor.id, transactions);
  }, [debtor, transactions]);

  // Calculate totals
  const totalDebt = useMemo(() => {
    if (!debtor) return 0;
    return transactions
      .filter((t) => t.debtorId === debtor.id && t.type === 'ADD')
      .reduce((sum, t) => sum + t.amount, 0);
  }, [debtor, transactions]);

  const totalPaid = useMemo(() => {
    if (!debtor) return 0;
    return transactions
      .filter((t) => t.debtorId === debtor.id && t.type === 'SUB')
      .reduce((sum, t) => sum + t.amount, 0);
  }, [debtor, transactions]);

  const currentBalance = totalDebt - totalPaid;

  // Filter & sort transactions for display in image
  const displayItems = useMemo(() => {
    let list = [...statement];
    if (txSort === 'desc') {
      list.reverse();
    }
    if (txLimit === '5') {
      list = txSort === 'desc' ? list.slice(0, 5) : list.slice(-5);
    } else if (txLimit === '10') {
      list = txSort === 'desc' ? list.slice(0, 10) : list.slice(-10);
    }
    return list;
  }, [statement, txLimit, txSort]);

  // Tính toán scale factor để thẻ 600px luôn vừa vặn 100% trong khung nhìn trên điện thoại
  useEffect(() => {
    const calculateScale = () => {
      if (!previewContainerRef.current) return;
      const containerWidth = previewContainerRef.current.clientWidth;
      if (containerWidth <= 0) return;
      
      const targetCardWidth = 590; // bề rộng chuẩn của tờ sao kê
      const availableWidth = containerWidth - 24; // trừ lề padding 12px mỗi bên
      
      if (availableWidth < targetCardWidth) {
        const factor = Math.max(0.45, Math.min(1, availableWidth / targetCardWidth));
        setScaleFactor(factor);
      } else {
        setScaleFactor(1);
      }
    };

    calculateScale();
    window.addEventListener('resize', calculateScale);
    return () => window.removeEventListener('resize', calculateScale);
  }, [viewMode]);

  // Chuẩn bị URL VietQR
  const memoSuffix = (settings.defaultMemoPrefix ?? 'TRA NO').trim();
  const rawMemo = memoSuffix ? `${debtor?.name || ''} ${memoSuffix}` : (debtor?.name || '');
  const vietQrMemo = rawMemo
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

  const qrUrl = useMemo(() => {
    if (!debtor || !settings.bankId || !settings.accountNumber) return null;
    return generateVietQrUrl({
      bankId: settings.bankId,
      accountNumber: settings.accountNumber,
      accountName: settings.accountName,
      amount: currentBalance > 0 ? currentBalance : undefined,
      memo: vietQrMemo,
      template: settings.vietQrTemplate || 'compact2',
    });
  }, [debtor, settings, currentBalance, vietQrMemo]);

  // Preload VietQR thành Base64 Data URL để html-to-image không bị lỗi CORS hay tải chậm
  useEffect(() => {
    if (!qrUrl) {
      setQrBase64(null);
      return;
    }

    let isMounted = true;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || 400;
        canvas.height = img.naturalHeight || 400;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          const dataUrl = canvas.toDataURL('image/png');
          if (isMounted) setQrBase64(dataUrl);
        }
      } catch (err) {
        console.warn('Lỗi canvas Base64 VietQR, dùng URL gốc:', err);
      }
    };
    img.onerror = () => {
      console.warn('Không thể nạp Base64 VietQR');
    };
    img.src = qrUrl;

    return () => {
      isMounted = false;
    };
  }, [qrUrl]);

  if (!debtor) return null;

  const currentDateStr = new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(new Date());

  // Handle Download Image (Chụp từ captureCardRef kích thước chuẩn 600px đầy đủ)
  const handleDownloadImage = async () => {
    if (!captureCardRef.current) return;
    setIsGenerating(true);
    try {
      await new Promise((r) => setTimeout(r, 150));
      const dataUrl = await toPng(captureCardRef.current, {
        cacheBust: true,
        pixelRatio: 2.5,
        backgroundColor: '#ffffff',
      });

      const safeName = debtor.name.replace(/[^a-zA-Z0-9à-ỹÀ-Ỹ]/g, '_');
      const link = document.createElement('a');
      link.download = `Bang_Ke_Giao_Dich_${safeName}.png`;
      link.href = dataUrl;
      link.click();
      setCopiedStatus('downloaded');
      setTimeout(() => setCopiedStatus(null), 3000);
    } catch (err: any) {
      console.error('Lỗi tạo ảnh giao dịch:', err);
      alert('Không thể tạo file ảnh. Vui lòng thử lại.');
    } finally {
      setIsGenerating(false);
    }
  };

  // Handle Copy to Clipboard (Directly pasteable into Zalo / Messenger)
  const handleCopyImage = async () => {
    if (!captureCardRef.current) return;
    setIsGenerating(true);
    try {
      await new Promise((r) => setTimeout(r, 150));
      const blob = await toBlob(captureCardRef.current, {
        cacheBust: true,
        pixelRatio: 2.5,
        backgroundColor: '#ffffff',
      });

      if (!blob) {
        throw new Error('Không thể tạo blob ảnh');
      }

      if (navigator.clipboard && navigator.clipboard.write) {
        const item = new ClipboardItem({ 'image/png': blob });
        await navigator.clipboard.write([item]);
        setCopiedStatus('copied');
        setTimeout(() => setCopiedStatus(null), 3000);
      } else {
        handleDownloadImage();
      }
    } catch (err: any) {
      console.warn('Lỗi chép ảnh vào clipboard:', err);
      handleDownloadImage();
    } finally {
      setIsGenerating(false);
    }
  };

  // Handle Web Share (Mobile)
  const handleShareMobile = async () => {
    if (!captureCardRef.current) return;
    setIsGenerating(true);
    try {
      await new Promise((r) => setTimeout(r, 150));
      const blob = await toBlob(captureCardRef.current, {
        cacheBust: true,
        pixelRatio: 2.5,
        backgroundColor: '#ffffff',
      });

      if (blob && typeof navigator !== 'undefined' && 'canShare' in navigator) {
        const safeName = debtor.name.replace(/[^a-zA-Z0-9à-ỹÀ-Ỹ]/g, '_');
        const file = new File([blob], `Bang_ke_giao_dich_${safeName}.png`, { type: 'image/png' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: `Bảng kê giao dịch - ${debtor.name}`,
            text: `Gửi bạn ${debtor.name} bảng kê chi tiết các giao dịch công nợ.`,
          });
          return;
        }
      }
      handleDownloadImage();
    } catch (err: any) {
      console.warn('Lỗi chia sẻ file:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  // Component render nội dung tờ bảng kê chi tiết
  const renderCardContent = () => (
    <div className="w-[590px] bg-white rounded-2xl border border-slate-300 overflow-hidden text-slate-800 font-sans p-5 space-y-4 relative shadow-sm">
      {/* Thanh viền trên trang nhã */}
      <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-blue-600 via-emerald-600 to-teal-600" />

      {/* Header phiếu */}
      <div className="flex items-start justify-between border-b border-slate-200 pb-3 pt-1">
        <div className="space-y-0.5">
          <div className="text-[10px] font-bold uppercase tracking-widest text-blue-700 flex items-center gap-1">
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>BẢNG KÊ CHI TIẾT GIAO DỊCH &amp; ĐỐI SOÁT CÔNG NỢ</span>
          </div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight">
            {settings.appTitle || 'SỔ GHI NỢ'}
          </h1>
          <div className="text-[11px] text-slate-500 font-medium">
            Ngày lập: {currentDateStr}
          </div>
        </div>

        <div className="text-right space-y-0.5">
          <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
            Bên gửi (Chủ nợ)
          </span>
          <span className="text-sm font-bold text-slate-900 block">
            {settings.ownerName || 'Chủ Sổ'}
          </span>
          {settings.ownerPhone && (
            <span className="text-[11px] text-slate-500 block font-mono">
              SĐT: {settings.ownerPhone}
            </span>
          )}
        </div>
      </div>

      {/* Thông tin đối tượng nợ */}
      <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center justify-between">
        <div>
          <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
            Khách hàng / Đối tượng nợ
          </span>
          <div className="text-base font-black text-slate-900 mt-0.5">
            {debtor.name}
            {debtor.phone && (
              <span className="text-xs font-normal text-slate-500 ml-2 font-mono">
                ({debtor.phone})
              </span>
            )}
          </div>
        </div>
        {showPin && debtor.pin && (
          <div className="text-right">
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
              Mã tra cứu trực tuyến
            </span>
            <span className="inline-block px-2.5 py-0.5 mt-0.5 bg-blue-100 text-blue-900 rounded-md font-mono font-bold text-xs border border-blue-200">
              {debtor.pin}
            </span>
          </div>
        )}
      </div>

      {/* Thanh tóm tắt tài chính 3 chỉ số */}
      <div className="grid grid-cols-3 gap-2.5 text-center">
        <div className="p-2.5 bg-rose-50/90 rounded-xl border border-rose-200">
          <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 block">
            Tổng Nợ (+)
          </span>
          <span className="text-sm font-black font-mono text-rose-800 mt-0.5 block">
            +{formatVND(totalDebt).replace(' VNĐ', '')}
          </span>
        </div>

        <div className="p-2.5 bg-emerald-50/90 rounded-xl border border-emerald-200">
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 block">
            Đã Trả (-)
          </span>
          <span className="text-sm font-black font-mono text-emerald-800 mt-0.5 block">
            -{formatVND(totalPaid).replace(' VNĐ', '')}
          </span>
        </div>

        <div
          className={`p-2.5 rounded-xl border ${
            currentBalance > 0
              ? 'bg-rose-100/90 border-rose-300 text-rose-950'
              : currentBalance < 0
              ? 'bg-emerald-100/90 border-emerald-300 text-emerald-950'
              : 'bg-slate-100 border-slate-300 text-slate-800'
          }`}
        >
          <span className="text-[10px] font-bold uppercase tracking-wider block opacity-85">
            {currentBalance > 0
              ? 'Dư Nợ Còn Lại'
              : currentBalance < 0
              ? 'Bạn Đang Dư Tiền'
              : 'Đã Hết Nợ'}
          </span>
          <span className="text-sm font-black font-mono mt-0.5 block">
            {formatVND(Math.abs(currentBalance)).replace(' VNĐ', '')}
            <span className="text-[10px] font-normal ml-0.5">đ</span>
          </span>
        </div>
      </div>

      {/* BẢNG CHI TIẾT GIAO DỊCH */}
      <div className="space-y-1.5">
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-700 flex items-center justify-between">
          <span>
            CHI TIẾT CÁC GIAO DỊCH ({displayItems.length}/{statement.length})
          </span>
          <span className="text-[10px] text-slate-400 font-normal">
            Đơn vị tính: VNĐ
          </span>
        </div>

        <div className="border border-slate-300 rounded-xl overflow-hidden shadow-2xs">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-300 text-[11px]">
                <th className="py-2 px-2.5 w-8 text-center">#</th>
                <th className="py-2 px-2 w-22">Ngày</th>
                <th className="py-2 px-2.5">Nội dung giao dịch</th>
                <th className="py-2 px-2.5 text-right text-rose-700 whitespace-nowrap">
                  Ghi Nợ (+)
                </th>
                <th className="py-2 px-2.5 text-right text-emerald-700 whitespace-nowrap">
                  Đã Trả (-)
                </th>
                {showRunningBalance && (
                  <th className="py-2 px-2.5 text-right text-slate-800 whitespace-nowrap">
                    Dư Nợ
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {displayItems.length === 0 ? (
                <tr>
                  <td
                    colSpan={showRunningBalance ? 6 : 5}
                    className="py-4 text-center text-slate-400 italic"
                  >
                    Chưa có giao dịch nào
                  </td>
                </tr>
              ) : (
                displayItems.map((item, index) => {
                  const tx = item.transaction;
                  const isAdd = tx.type === 'ADD';
                  return (
                    <tr
                      key={tx.id}
                      className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50/75'}
                    >
                      <td className="py-2 px-2.5 text-center text-slate-400 font-mono text-[11px]">
                        {index + 1}
                      </td>
                      <td className="py-2 px-2 text-slate-600 font-mono text-[11px] whitespace-nowrap">
                        {tx.date || tx.createdAt?.slice(0, 10)}
                      </td>
                      <td className="py-2 px-2.5">
                        <div className="font-semibold text-slate-800 break-words leading-tight">
                          {tx.note || (isAdd ? 'Khoản nợ phát sinh' : 'Thanh toán nợ')}
                        </div>
                        {tx.category === 'PARTY_SPLIT' && (
                          <span className="inline-block text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 mt-0.5">
                            Chia tiệc
                          </span>
                        )}
                        {tx.category === 'PAYMENT_SETTLED' && (
                          <span className="inline-block text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 mt-0.5">
                            Tất toán
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-2.5 text-right font-mono font-bold text-rose-700 whitespace-nowrap">
                        {isAdd ? `+${formatVND(tx.amount).replace(' VNĐ', '')}` : '-'}
                      </td>
                      <td className="py-2 px-2.5 text-right font-mono font-bold text-emerald-700 whitespace-nowrap">
                        {!isAdd ? `-${formatVND(tx.amount).replace(' VNĐ', '')}` : '-'}
                      </td>
                      {showRunningBalance && (
                        <td className="py-2 px-2.5 text-right font-mono font-semibold text-slate-800 whitespace-nowrap">
                          {formatVND(item.runningBalance).replace(' VNĐ', '')}
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100/90 font-black border-t-2 border-slate-300 text-slate-900 text-xs">
                <td colSpan={3} className="py-2.5 px-2.5 text-right uppercase tracking-wide">
                  Tổng cộng:
                </td>
                <td className="py-2.5 px-2.5 text-right font-mono text-rose-700 whitespace-nowrap">
                  +{formatVND(totalDebt).replace(' VNĐ', '')}
                </td>
                <td className="py-2.5 px-2.5 text-right font-mono text-emerald-700 whitespace-nowrap">
                  -{formatVND(totalPaid).replace(' VNĐ', '')}
                </td>
                {showRunningBalance && (
                  <td className="py-2.5 px-2.5 text-right font-mono text-slate-950 whitespace-nowrap">
                    {formatVND(currentBalance).replace(' VNĐ', '')}
                  </td>
                )}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Lời nhắn gửi kèm */}
      {noteMessage && (
        <div className="p-2.5 bg-amber-50/90 border border-amber-200/80 rounded-xl text-xs text-amber-950 leading-relaxed italic flex items-start gap-1.5">
          <MessageSquare className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
          <span>"{noteMessage}"</span>
        </div>
      )}

      {/* Thông tin chuyển khoản VietQR */}
      {showQr && settings.accountNumber && (
        <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
            <CreditCard className="w-3.5 h-3.5 text-blue-600" />
            <span>THÔNG TIN THANH TOÁN CHUYỂN KHOẢN</span>
          </div>

          <div className="flex items-center gap-3.5">
            {(qrBase64 || qrUrl) && (
              <div className="w-24 h-24 bg-white p-1 rounded-xl border border-slate-300 shadow-2xs shrink-0 flex items-center justify-center">
                <img
                  src={qrBase64 || qrUrl || ''}
                  alt="VietQR"
                  crossOrigin="anonymous"
                  className="w-full h-full object-contain rounded-lg"
                />
              </div>
            )}

            <div className="text-xs space-y-1 min-w-0 flex-1">
              {settings.bankId && (
                <div className="text-slate-600 truncate">
                  Ngân hàng: <strong className="text-slate-900">{settings.bankId.toUpperCase()}</strong>
                </div>
              )}
              <div>
                <span className="text-slate-600">Số tài khoản: </span>
                <strong className="text-slate-900 font-mono text-sm block sm:inline">
                  {settings.accountNumber}
                </strong>
              </div>
              {settings.accountName && (
                <div className="text-slate-600 truncate">
                  Chủ TK: <strong className="text-slate-900">{settings.accountName.toUpperCase()}</strong>
                </div>
              )}
              <div className="text-[11px] text-slate-600 pt-0.5 truncate">
                Nội dung: <strong className="text-emerald-700 font-mono">{vietQrMemo}</strong>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Chân trang xác thực */}
      <div className="border-t border-slate-200 pt-2 text-center text-[10px] text-slate-400 space-y-0.5">
        <div>
          Tra cứu trực tuyến chi tiết mọi lúc tại đường link cá nhân đã được cung cấp
        </div>
        <div className="font-semibold text-slate-600 flex items-center justify-center gap-1">
          <ShieldCheck className="w-3 h-3 text-emerald-600" />
          <span>Bảng kê được xuất tự động từ {settings.appTitle || 'Sổ Ghi Nợ'}</span>
        </div>
      </div>
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/85 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* KHUNG CAPTURE ẨN DÀNH RIÊNG CHO XUẤT ẢNH: luôn giữ kích thước chuẩn 590px, đầy đủ 100% không bị cắt */}
      <div
        style={{
          position: 'fixed',
          left: '-9999px',
          top: 0,
          width: '590px',
          zIndex: -9999,
          pointerEvents: 'none',
        }}
      >
        <div ref={captureCardRef}>
          {renderCardContent()}
        </div>
      </div>

      {/* MODAL GIAO DIỆN CHÍNH */}
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden my-auto flex flex-col max-h-[96vh] h-[92vh] sm:h-auto">
        {/* Header Modal Gọn Gàng */}
        <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between shrink-0 border-b border-slate-800">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-white truncate">
                Xuất Ảnh Bảng Kê - {debtor.name}
              </h2>
              <p className="text-[11px] text-slate-400 truncate">
                Đầy đủ chi tiết các giao dịch &amp; mã QR thanh toán
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Nút phóng to / thu nhỏ vừa màn hình */}
            <button
              type="button"
              onClick={() => setViewMode(viewMode === 'fit' ? 'actual' : 'fit')}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition-colors cursor-pointer"
              title={viewMode === 'fit' ? 'Xem kích thước thật 100%' : 'Thu nhỏ vừa màn hình'}
            >
              {viewMode === 'fit' ? (
                <>
                  <Maximize2 className="w-3.5 h-3.5 text-blue-400" />
                  <span className="hidden sm:inline">Phóng to</span>
                </>
              ) : (
                <>
                  <Minimize2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="hidden sm:inline">Vừa màn hình</span>
                </>
              )}
            </button>

            {/* Nút bật/tắt menu tùy chỉnh */}
            <button
              type="button"
              onClick={() => setShowOptions(!showOptions)}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                showOptions ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
              }`}
              title="Tùy chỉnh nội dung hiển thị"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Tùy chọn</span>
              {showOptions ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>

            {/* Nút đóng modal */}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Thanh Tùy Chọn Nội Dung (Có thể mở rộng / thu gọn) */}
        {showOptions && (
          <div className="p-3 bg-slate-50 border-b border-slate-200 text-xs space-y-2.5 shrink-0 animate-in slide-in-from-top-1 duration-150">
            <div className="flex flex-wrap items-center gap-3 justify-between">
              {/* Phạm vi giao dịch */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-slate-700">Phạm vi:</span>
                <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setTxLimit('all')}
                    className={`px-2 py-1 rounded text-xs font-semibold cursor-pointer transition-colors ${
                      txLimit === 'all' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Tất cả ({statement.length})
                  </button>
                  {statement.length > 10 && (
                    <button
                      type="button"
                      onClick={() => setTxLimit('10')}
                      className={`px-2 py-1 rounded text-xs font-semibold cursor-pointer transition-colors ${
                        txLimit === '10' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      10 gần nhất
                    </button>
                  )}
                  {statement.length > 5 && (
                    <button
                      type="button"
                      onClick={() => setTxLimit('5')}
                      className={`px-2 py-1 rounded text-xs font-semibold cursor-pointer transition-colors ${
                        txLimit === '5' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      5 gần nhất
                    </button>
                  )}
                </div>

                <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setTxSort('asc')}
                    className={`px-2 py-1 rounded text-xs font-semibold cursor-pointer transition-colors flex items-center gap-1 ${
                      txSort === 'asc' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
                    }`}
                    title="Cũ trước mới sau"
                  >
                    <ArrowUpNarrowWide className="w-3 h-3" />
                    <span>Cũ → Mới</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTxSort('desc')}
                    className={`px-2 py-1 rounded text-xs font-semibold cursor-pointer transition-colors flex items-center gap-1 ${
                      txSort === 'desc' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
                    }`}
                    title="Mới nhất lên đầu"
                  >
                    <ArrowDownWideNarrow className="w-3 h-3" />
                    <span>Mới → Cũ</span>
                  </button>
                </div>
              </div>

              {/* Bật tắt các mục */}
              <div className="flex items-center gap-3 flex-wrap font-medium text-slate-600">
                <label className="flex items-center gap-1 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showRunningBalance}
                    onChange={(e) => setShowRunningBalance(e.target.checked)}
                    className="rounded text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5"
                  />
                  <span>Cột dư nợ</span>
                </label>
                <label className="flex items-center gap-1 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showQr}
                    onChange={(e) => setShowQr(e.target.checked)}
                    className="rounded text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5"
                  />
                  <span>Mã VietQR</span>
                </label>
                <label className="flex items-center gap-1 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showPin}
                    onChange={(e) => setShowPin(e.target.checked)}
                    className="rounded text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5"
                  />
                  <span>Mã tra cứu</span>
                </label>
              </div>
            </div>

            {/* Ô chỉnh sửa lời nhắn */}
            <div className="flex items-center gap-2 pt-1 border-t border-slate-200/80">
              <span className="text-slate-500 whitespace-nowrap font-medium text-[11px]">Lời nhắn:</span>
              <input
                type="text"
                value={noteMessage}
                onChange={(e) => setNoteMessage(e.target.value)}
                placeholder="Nhập lời nhắn gửi kèm..."
                className="flex-1 text-xs px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>
        )}

        {/* Thanh chỉ báo chế độ xem */}
        <div className="px-3 py-1 bg-slate-100/90 border-b border-slate-200 text-[11px] text-slate-500 flex items-center justify-between shrink-0">
          <span>
            {viewMode === 'fit'
              ? 'Đang xem chế độ vừa màn hình (Ảnh xuất ra luôn sắc nét 100%)'
              : 'Đang xem kích thước thật 100% (Cuộn để xem hết)'}
          </span>
          <button
            type="button"
            onClick={() => setViewMode(viewMode === 'fit' ? 'actual' : 'fit')}
            className="text-blue-600 hover:text-blue-700 font-semibold cursor-pointer"
          >
            {viewMode === 'fit' ? 'Xem 100%' : 'Thu vừa màn hình'}
          </button>
        </div>

        {/* VÙNG XEM TRƯỚC (PREVIEW CONTAINER) - Tối ưu hiển thị trọn vẹn */}
        <div
          ref={previewContainerRef}
          className="flex-1 overflow-y-auto overflow-x-auto p-3 bg-slate-200/60 flex flex-col items-center justify-start"
        >
          {viewMode === 'fit' && scaleFactor < 0.99 ? (
            // Chế độ Fit: Scale theo tỷ lệ để nhìn thấy trọn vẹn bề ngang không bị cắt
            <div
              style={{
                width: `${590 * scaleFactor}px`,
                height: 'auto',
                overflow: 'visible',
              }}
              className="transition-all duration-200 my-auto"
            >
              <div
                style={{
                  transform: `scale(${scaleFactor})`,
                  transformOrigin: 'top left',
                  width: '590px',
                }}
              >
                {renderCardContent()}
              </div>
            </div>
          ) : (
            // Chế độ Actual: Kích thước 100% cuộn mượt mà
            <div className="w-full flex justify-center py-2">
              {renderCardContent()}
            </div>
          )}
        </div>

        {/* Footer Action Buttons */}
        <div className="p-3 sm:p-4 bg-slate-900 text-white flex flex-col sm:flex-row items-center justify-between gap-2.5 shrink-0 border-t border-slate-800">
          <div className="text-xs text-slate-300 w-full sm:w-auto text-center sm:text-left">
            {copiedStatus === 'copied' ? (
              <span className="text-emerald-400 font-bold flex items-center justify-center sm:justify-start gap-1">
                <Check className="w-4 h-4" />
                Đã sao chép ảnh! Bạn có thể dán (Ctrl+V) ngay vào Zalo / Messenger.
              </span>
            ) : copiedStatus === 'downloaded' ? (
              <span className="text-emerald-400 font-bold flex items-center justify-center sm:justify-start gap-1">
                <Check className="w-4 h-4" />
                Đã tải ảnh về máy thành công!
              </span>
            ) : (
              <span className="text-[11px] sm:text-xs">
                Nhấn <strong className="text-emerald-400">Sao Chép</strong> để Dán (Ctrl+V) ngay vào Zalo hoặc tải ảnh về máy
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            {/* Sao chép ảnh */}
            <button
              type="button"
              onClick={handleCopyImage}
              disabled={isGenerating}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-50 whitespace-nowrap"
              title="Sao chép ảnh để dán (Ctrl+V) vào Zalo / Messenger"
            >
              <Copy className="w-4 h-4" />
              <span>{isGenerating ? 'Đang tạo...' : 'Sao Chép Ảnh'}</span>
            </button>

            {/* Tải về */}
            <button
              type="button"
              onClick={handleDownloadImage}
              disabled={isGenerating}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-semibold border border-slate-700 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
              title="Tải tệp ảnh PNG về điện thoại / máy tính"
            >
              <Download className="w-4 h-4" />
              <span>Tải Về</span>
            </button>

            {/* Nút share di động */}
            {typeof navigator !== 'undefined' && 'canShare' in navigator && (
              <button
                type="button"
                onClick={handleShareMobile}
                disabled={isGenerating}
                className="inline-flex sm:hidden items-center justify-center p-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold border border-slate-700 cursor-pointer"
                title="Gửi trực tiếp qua Zalo/ứng dụng khác"
              >
                <Share2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
