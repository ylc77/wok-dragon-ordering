import type { FeatureFlags, PlanTier, RestaurantSettings } from './types';

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  csv_import: true,
  ai_menu: true,
  ai_image: true,
  data_backup: true,
  print_agent: true,
};

export const PLAN_PRESETS: Record<PlanTier, { enable_pos: boolean; enable_qr_ordering: boolean; features: FeatureFlags }> = {
  basic: {
    enable_pos: false,
    enable_qr_ordering: false,
    features: { csv_import: false, ai_menu: false, ai_image: false, data_backup: false, print_agent: false },
  },
  standard: {
    enable_pos: false,
    enable_qr_ordering: true,
    features: { csv_import: true, ai_menu: false, ai_image: false, data_backup: true, print_agent: false },
  },
  professional: {
    enable_pos: true,
    enable_qr_ordering: true,
    features: { ...DEFAULT_FEATURE_FLAGS },
  },
};

export function getFeatureFlags(settings: Pick<RestaurantSettings, 'feature_flags'> | null | undefined): FeatureFlags {
  return { ...DEFAULT_FEATURE_FLAGS, ...(settings?.feature_flags ?? {}) };
}
