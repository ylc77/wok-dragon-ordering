import { useEffect, useState, type ImgHTMLAttributes, type ReactNode } from 'react';

export type SafeImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src?: string | null;
  optimizedSrc?: string | null;
  fallback: ReactNode;
};

/**
 * 图片组件，自动处理空 src 和加载失败，显示统一 fallback。
 *
 * - src 为空 / null / undefined / '' → 直接渲染 fallback
 * - src 有值但加载失败 (onError) → 切换到 fallback
 * - 加载成功 → 正常渲染 img
 */
export function SafeImage({ src, optimizedSrc, fallback, alt = '', className, loading = 'lazy', decoding = 'async', onError, ...imgProps }: SafeImageProps) {
  const [failed, setFailed] = useState(false);
  const original = src?.trim() ?? '';
  const optimized = optimizedSrc?.trim() ?? '';
  const resolved = optimized || original;
  const [currentSrc, setCurrentSrc] = useState(resolved);

  useEffect(() => {
    setFailed(false);
    setCurrentSrc(resolved);
  }, [resolved]);

  if (!currentSrc || failed) {
    return <>{fallback}</>;
  }

  return (
    <img
      src={currentSrc}
      alt={alt}
      className={className}
      loading={loading}
      decoding={decoding}
      onError={(event) => {
        onError?.(event);
        if (currentSrc !== original && original) {
          setCurrentSrc(original);
          return;
        }
        setFailed(true);
      }}
      {...imgProps}
    />
  );
}
