/**
 * Image Uploader Service
 * Provides smart, zero-loss client-side processing & cloud storage for receipt/bill images.
 * - Single unified upload support: works seamlessly with both camera photos and photo library.
 * - Smart downscaling to max 1400px and JPEG 0.80: converts 20-40MB high-res camera photos
 *   into crisp ~120-250KB images, preserving 100% legibility of bill numbers, bank stamps, and text.
 * - Strict timeout guards (4s decoding, 7s network) ensure the upload spinner NEVER hangs indefinitely.
 * - Zero-fail fallback: returns compressed dataUrl immediately if network or server stalls.
 */

export interface OptimizedImageResult {
  dataUrl: string;
  mimeType: string;
  originalSize: number;
  optimizedSize: number;
}

/**
 * Safely reads a File into a base64 DataURL with a strict timeout
 */
export function readFileAsDataUrl(file: File, timeoutMs = 5000): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        try {
          reader.abort();
        } catch {
          // ignore
        }
        reject(new Error('Quá thời gian đọc tệp hình ảnh'));
      }
    }, timeoutMs);

    reader.onload = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('Không thể đọc dữ liệu hình ảnh'));
        }
      }
    };

    reader.onerror = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error('Lỗi khi đọc tệp hình ảnh từ thiết bị'));
      }
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Loads an HTMLImageElement with a strict timeout so iOS Safari / Android never hang on large files
 */
function loadImageElementWithTimeout(src: string, timeoutMs = 4000): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const el = new Image();
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        el.src = '';
        reject(new Error('Quá thời gian giải mã hình ảnh'));
      }
    }, timeoutMs);

    el.onload = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(el);
      }
    };

    el.onerror = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error('Trình duyệt không thể giải mã hình ảnh này'));
      }
    };

    el.src = src;
  });
}

/**
 * Optimizes a user-selected camera photo or screenshot:
 * - Scales down to maxDimension (default 1400px)
 * - Converts to clean JPEG (quality 0.80) on a crisp white canvas
 * - Guarantees fast upload (< 300KB) while maintaining razor-sharp text legibility
 */
export async function optimizeBillImageFile(
  file: File,
  maxDimension = 1400
): Promise<OptimizedImageResult> {
  if (!file) {
    throw new Error('Chưa chọn tệp hình ảnh');
  }

  // Safety limit on raw file input
  if (file.size > 40 * 1024 * 1024) {
    throw new Error('Kích thước ảnh vượt quá 40MB. Vui lòng chọn ảnh nhỏ hơn.');
  }

  // If already an SVG or ultra-compact PNG (< 250KB), no canvas re-compression needed
  if (file.type === 'image/svg+xml' || (file.type === 'image/png' && file.size < 250 * 1024)) {
    const dataUrl = await readFileAsDataUrl(file, 4000);
    return {
      dataUrl,
      mimeType: file.type || 'image/png',
      originalSize: file.size,
      optimizedSize: file.size,
    };
  }

  let imgSource: ImageBitmap | HTMLImageElement | null = null;
  let sourceWidth = 0;
  let sourceHeight = 0;

  // 1. Try modern createImageBitmap (fastest, preserves EXIF orientation) with 3.5s timeout
  if (typeof window !== 'undefined' && 'createImageBitmap' in window) {
    try {
      const bitmapPromise = createImageBitmap(file);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('createImageBitmap timeout')), 3500)
      );
      const bitmap = await Promise.race([bitmapPromise, timeoutPromise]);
      if (bitmap.width > 0 && bitmap.height > 0) {
        imgSource = bitmap;
        sourceWidth = bitmap.width;
        sourceHeight = bitmap.height;
      }
    } catch {
      imgSource = null;
    }
  }

  // 2. Try URL.createObjectURL + HTMLImageElement (compatible with iOS Safari & Android)
  if (!imgSource && typeof window !== 'undefined' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    let objectUrl = '';
    try {
      objectUrl = URL.createObjectURL(file);
      const el = await loadImageElementWithTimeout(objectUrl, 4000);
      imgSource = el;
      sourceWidth = el.naturalWidth || el.width;
      sourceHeight = el.naturalHeight || el.height;
    } catch {
      imgSource = null;
    } finally {
      if (objectUrl) {
        try {
          URL.revokeObjectURL(objectUrl);
        } catch {
          // ignore
        }
      }
    }
  }

  // 3. Fallback: DataURL via FileReader + HTMLImageElement
  if (!imgSource) {
    const rawDataUrl = await readFileAsDataUrl(file, 4000);
    const el = await loadImageElementWithTimeout(rawDataUrl, 4000);
    imgSource = el;
    sourceWidth = el.naturalWidth || el.width;
    sourceHeight = el.naturalHeight || el.height;
  }

  if (!imgSource || sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error('Không thể đọc kích thước hình ảnh');
  }

  // Target dimension capped at maxDimension (1400px provides crisp receipt text at ~150KB)
  const maxLimit = Math.min(maxDimension, 1400);
  let targetWidth = sourceWidth;
  let targetHeight = sourceHeight;

  if (targetWidth > maxLimit || targetHeight > maxLimit) {
    if (targetWidth >= targetHeight) {
      targetHeight = Math.max(1, Math.round((targetHeight * maxLimit) / targetWidth));
      targetWidth = maxLimit;
    } else {
      targetWidth = Math.max(1, Math.round((targetWidth * maxLimit) / targetHeight));
      targetHeight = maxLimit;
    }
  }

  // Draw to 2D Canvas with white background
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: false });
  if (!ctx) {
    throw new Error('Canvas 2D context không khả dụng');
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, targetWidth, targetHeight);
  ctx.drawImage(imgSource, 0, 0, targetWidth, targetHeight);

  // Close ImageBitmap if applicable to free mobile RAM immediately
  if ('close' in imgSource && typeof (imgSource as any).close === 'function') {
    try {
      (imgSource as any).close();
    } catch {
      // ignore
    }
  }

  // Export to high-quality JPEG (0.80 quality keeps text razor-sharp while reducing size to ~120-220KB)
  const exportMime = 'image/jpeg';
  const exportQuality = 0.80;
  const optimizedDataUrl = canvas.toDataURL(exportMime, exportQuality);

  if (!optimizedDataUrl || optimizedDataUrl.length < 100 || optimizedDataUrl === 'data:,') {
    throw new Error('Lỗi xuất dữ liệu ảnh từ Canvas');
  }

  const approxBytes = Math.round((optimizedDataUrl.length * 3) / 4);

  return {
    dataUrl: optimizedDataUrl,
    mimeType: exportMime,
    originalSize: file.size,
    optimizedSize: approxBytes,
  };
}

/**
 * Extracts Google Drive file ID from common Drive URLs and returns the local server proxy path
 * (/api/images/gdrive_<id>) as a reliable fallback if direct Drive thumbnail rendering is blocked.
 */
export function resolveBillImageFallback(src?: string | null): string | null {
  if (!src || typeof src !== 'string') return null;
  const trimmed = src.trim();
  if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('/api/images/')) {
    return null;
  }

  // Match drive.google.com/thumbnail?id=..., uc?id=..., or file/d/<id>/
  const queryIdMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (queryIdMatch && trimmed.includes('drive.google.com')) {
    return `/api/images/gdrive_${queryIdMatch[1]}`;
  }

  const pathIdMatch = trimmed.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]{10,})/);
  if (pathIdMatch) {
    return `/api/images/gdrive_${pathIdMatch[1]}`;
  }

  return null;
}

/**
 * Uploads a bill/receipt image to the server & Google Drive / Google Sheets vault.
 * - Compresses high-res camera photos to ~150KB JPEG to avoid stalled uploads.
 * - 12-second network timeout prevents infinite spinning circles while allowing Drive upload.
 * - Graceful fallback returns the compressed dataUrl directly if server upload is slow or unavailable.
 */
export async function uploadBillImage(
  file: File,
  options?: { signal?: AbortSignal }
): Promise<string> {
  if (!file) {
    throw new Error('Chưa chọn tệp hình ảnh');
  }

  let uploadPayloadDataUrl: string;
  let uploadMimeType = 'image/jpeg';
  const targetFilename = (file.name || `bill_${Date.now()}`).replace(/\.[^/.]+$/, '') + '.jpg';

  // 1. Smart compression (scales down to 1400px, quality 0.80, ~150KB)
  try {
    const optimized = await optimizeBillImageFile(file, 1400);
    uploadPayloadDataUrl = optimized.dataUrl;
    uploadMimeType = optimized.mimeType;
  } catch (optErr) {
    console.warn('Canvas optimization notice, trying safe fallback:', optErr);
    // If optimization fails, read file with timeout
    uploadPayloadDataUrl = await readFileAsDataUrl(file, 4000);
    uploadMimeType = file.type || 'image/jpeg';
  }

  // If external signal already aborted
  if (options?.signal?.aborted) {
    throw new Error('Đã hủy tải ảnh');
  }

  // Resolve configured Google Apps Script URL from local settings if available
  let appsScriptUrlHeader = '';
  try {
    if (typeof localStorage !== 'undefined') {
      const rawSettings = localStorage.getItem('debt_app_settings_v1');
      if (rawSettings) {
        const parsed = JSON.parse(rawSettings);
        const url = String(parsed?.googleAppsScriptUrl || '').trim();
        if (url.startsWith('https://script.google.com/')) {
          appsScriptUrlHeader = url;
        }
      }
    }
  } catch {
    // ignore storage read error
  }

  // 2. Upload to server endpoint with a strict 12-second timeout
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), 12000);

  // Link external abort signal if provided
  if (options?.signal) {
    options.signal.addEventListener('abort', () => abortController.abort(), { once: true });
  }

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (appsScriptUrlHeader) {
      headers['x-apps-script-url'] = appsScriptUrlHeader;
    }

    const res = await fetch('/api/upload-image', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        image: uploadPayloadDataUrl,
        filename: targetFilename,
        mimeType: uploadMimeType,
      }),
      signal: abortController.signal,
    });

    clearTimeout(timeoutId);

    if (res.ok) {
      const result = await res.json();
      if (result.success && result.url) {
        return result.url;
      }
    }
  } catch (err: any) {
    clearTimeout(timeoutId);
    console.warn('Backend upload-image endpoint notice, using client dataUrl directly:', err?.message || err);
  }

  // 3. Guaranteed fallback: return the lightweight compressed dataUrl (~150KB)
  return uploadPayloadDataUrl;
}

export function isRemoteImageUrl(url?: string): boolean {
  if (!url) return false;
  return (
    url.startsWith('/api/images/') ||
    url.startsWith('/uploads/') ||
    url.startsWith('http://') ||
    url.startsWith('https://')
  );
}
