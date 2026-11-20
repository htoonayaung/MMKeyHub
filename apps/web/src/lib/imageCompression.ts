export interface CompressedImageResult {
  file: File;
  dataUrl: string;
  originalBytes: number;
  compressedBytes: number;
  wasCompressed: boolean;
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to encode image'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read image'));
    reader.readAsDataURL(blob);
  });
}

function loadImageElement(srcUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Invalid image file'));
    img.src = srcUrl;
  });
}

/**
 * Compresses large receipt screenshots client-side before upload using Canvas.
 * Resizes images exceeding `maxDimension` and re-encodes as JPEG/WEBP.
 */
export async function compressReceiptImage(
  file: File,
  options: { maxDimension?: number; quality?: number; skipUnderBytes?: number } = {}
): Promise<CompressedImageResult> {
  const maxDimension = options.maxDimension ?? 1280;
  const quality = options.quality ?? 0.82;
  const skipUnderBytes = options.skipUnderBytes ?? 160 * 1024;

  const originalDataUrl = await readAsDataUrl(file);

  // Skip compression for already-small files or non-raster formats
  if (file.size <= skipUnderBytes || file.type === 'image/svg+xml') {
    return {
      file,
      dataUrl: originalDataUrl,
      originalBytes: file.size,
      compressedBytes: file.size,
      wasCompressed: false,
    };
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImageElement(objectUrl);
    const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
    const targetWidth = Math.max(1, Math.round(img.width * scale));
    const targetHeight = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return {
        file,
        dataUrl: originalDataUrl,
        originalBytes: file.size,
        compressedBytes: file.size,
        wasCompressed: false,
      };
    }

    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    const outputMime = file.type === 'image/png' ? 'image/webp' : 'image/jpeg';
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, outputMime, quality)
    );

    if (!blob || blob.size >= file.size) {
      return {
        file,
        dataUrl: originalDataUrl,
        originalBytes: file.size,
        compressedBytes: file.size,
        wasCompressed: false,
      };
    }

    const ext = outputMime === 'image/webp' ? 'webp' : 'jpg';
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'receipt';
    const compressedFile = new File([blob], `${baseName}.${ext}`, {
      type: outputMime,
      lastModified: Date.now(),
    });
    const compressedDataUrl = await readAsDataUrl(blob);

    return {
      file: compressedFile,
      dataUrl: compressedDataUrl,
      originalBytes: file.size,
      compressedBytes: compressedFile.size,
      wasCompressed: true,
    };
  } catch {
    return {
      file,
      dataUrl: originalDataUrl,
      originalBytes: file.size,
      compressedBytes: file.size,
      wasCompressed: false,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Resizes and encodes an Admin-uploaded QR image as a compact Data URL.
 */
export async function compressQrImageToDataUrl(file: File): Promise<string> {
  const result = await compressReceiptImage(file, {
    maxDimension: 480,
    quality: 0.85,
    skipUnderBytes: 40 * 1024,
  });
  return result.dataUrl;
}
