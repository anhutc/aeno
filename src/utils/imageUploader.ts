/**
 * Image Uploader Service
 * Provides 100% free, zero-cost, uncompressed image uploading.
 * Uploads original full-resolution receipt/bill images to the server & Cloud Firestore vault
 * without needing image downscaling or quality reduction.
 */

export async function uploadBillImage(file: File): Promise<string> {
  if (!file) {
    throw new Error('Chưa chọn tệp hình ảnh');
  }

  // 25MB safety boundary for phone photos
  if (file.size > 25 * 1024 * 1024) {
    throw new Error('Kích thước ảnh gốc vượt quá 25MB. Vui lòng chọn ảnh nhỏ hơn 25MB.');
  }

  // Read the original file as DataURL (preserves 100% lossless resolution)
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Không thể đọc tệp hình ảnh'));
    reader.readAsDataURL(file);
  });

  try {
    const res = await fetch('/api/upload-image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image: dataUrl,
        filename: file.name,
        mimeType: file.type || 'image/jpeg',
      }),
    });

    if (res.ok) {
      const result = await res.json();
      if (result.success && result.url) {
        return result.url;
      }
    }
  } catch (err) {
    console.warn('Server upload-image notice, falling back to local dataUrl:', err);
  }

  // Safe offline fallback: return raw dataUrl so user never loses their receipt
  return dataUrl;
}

export function isRemoteImageUrl(url?: string): boolean {
  if (!url) return false;
  return url.startsWith('/api/images/') || url.startsWith('/uploads/') || url.startsWith('http://') || url.startsWith('https://');
}
