export type ImagePreset = 'thumb' | 'card' | 'hero' | 'logo';

const IMAGE_PRESETS: Record<ImagePreset, { width: number; quality: number }> = {
  thumb: { width: 160, quality: 70 },
  card: { width: 320, quality: 75 },
  hero: { width: 1200, quality: 80 },
  logo: { width: 256, quality: 80 },
};

const STORAGE_OBJECT_PUBLIC_PREFIX = '/storage/v1/object/public/';
const STORAGE_RENDER_PUBLIC_PREFIX = '/storage/v1/render/image/public/';

function readEnvValue(read: () => string | undefined): string {
  try {
    return read() ?? '';
  } catch {
    return '';
  }
}

const SUPABASE_URL = readEnvValue(() => import.meta.env.VITE_SUPABASE_URL);
const ENABLE_SUPABASE_IMAGE_TRANSFORM = readEnvValue(() => import.meta.env.VITE_ENABLE_SUPABASE_IMAGE_TRANSFORM) === 'true';

export function getOptimizedImageUrl(src: string | null | undefined, preset: ImagePreset = 'card'): string {
  const value = src?.trim() ?? '';
  if (!value || !isSupabaseImageTransformEnabled()) return value;
  if (!isOwnSupabaseStorageUrl(value)) return value;

  const url = new URL(value);
  if (url.pathname.includes(STORAGE_RENDER_PUBLIC_PREFIX)) return value;

  const objectPath = url.pathname.slice(STORAGE_OBJECT_PUBLIC_PREFIX.length);
  if (!objectPath) return value;

  const { width, quality } = IMAGE_PRESETS[preset];
  const transformed = new URL(url.toString());
  transformed.pathname = `${STORAGE_RENDER_PUBLIC_PREFIX}${objectPath}`;
  transformed.search = '';
  transformed.searchParams.set('width', String(width));
  transformed.searchParams.set('quality', String(quality));
  transformed.searchParams.set('resize', 'contain');
  return transformed.toString();
}

export function isOwnSupabaseStorageUrl(src: string): boolean {
  if (!isHttpUrl(src)) return false;
  if (!SUPABASE_URL) return false;

  try {
    const url = new URL(src);
    const own = new URL(SUPABASE_URL);
    return url.host === own.host && url.pathname.startsWith(STORAGE_OBJECT_PUBLIC_PREFIX);
  } catch {
    return false;
  }
}

export function isExternalImageUrl(src: string): boolean {
  if (!isHttpUrl(src)) return false;
  return !isOwnSupabaseStorageUrl(src);
}

export function isSupabaseImageTransformEnabled(): boolean {
  return ENABLE_SUPABASE_IMAGE_TRANSFORM;
}

function isHttpUrl(src: string): boolean {
  return /^https?:\/\//i.test(src.trim());
}
