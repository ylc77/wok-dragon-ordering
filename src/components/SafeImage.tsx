import { useState, type ImgHTMLAttributes, type ReactNode } from 'react';

export type SafeImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src?: string | null;
  fallback: ReactNode;
};

/**
 * 图片组件，自动处理空 src 和加载失败，显示统一 fallback。
 *
 * - src 为空 / null / undefined / '' → 直接渲染 fallback
 * - src 有值但加载失败 (onError) → 切换到 fallback
 * - 加载成功 → 正常渲染 img
 */
export function SafeImage({ src, fallback, alt = '', className, ...imgProps }: SafeImageProps) {
  const [failed, setFailed] = useState(false);
  const resolved = src?.trim();

  if (!resolved || failed) {
    return <>{fallback}</>;
  }

  return (
    <img
      src={resolved}
      alt={alt}
      className={className}
      onError={() => setFailed(true)}
      {...imgProps}
    />
  );
}
