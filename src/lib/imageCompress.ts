export interface CompressOptions {
  maxWidth: number;
  maxHeight: number;
  quality: number; // 0-1
}

const DEFAULTS: Record<string, CompressOptions> = {
  menuItem: { maxWidth: 1200, maxHeight: 1200, quality: 0.8 },
  logo: { maxWidth: 800, maxHeight: 800, quality: 0.9 },
  hero: { maxWidth: 1920, maxHeight: 1200, quality: 0.8 },
};

/**
 * 将图片文件压缩并转换为 WebP
 * @param file 原始文件
 * @param type 图片类型: menuItem | category | logo | hero
 * @returns 压缩后的 Blob（WebP 格式）
 */
export async function compressImageToWebp(
  file: File,
  type: keyof typeof DEFAULTS = 'menuItem',
): Promise<Blob> {
  const opts = DEFAULTS[type];
  const img = await loadImage(file);
  const { width, height } = calcSize(img.naturalWidth, img.naturalHeight, opts.maxWidth, opts.maxHeight);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context not available');
  ctx.drawImage(img, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('WebP conversion failed'));
      },
      'image/webp',
      opts.quality,
    );
  });
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function calcSize(
  naturalW: number,
  naturalH: number,
  maxW: number,
  maxH: number,
): { width: number; height: number } {
  if (naturalW <= maxW && naturalH <= maxH) return { width: naturalW, height: naturalH };
  const ratio = Math.min(maxW / naturalW, maxH / naturalH);
  return {
    width: Math.round(naturalW * ratio),
    height: Math.round(naturalH * ratio),
  };
}
