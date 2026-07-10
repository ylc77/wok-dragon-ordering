import { describe, expect, it } from 'vitest';
import { DEFAULT_FEATURE_FLAGS, PLAN_PRESETS, getFeatureFlags } from './featureFlags';

describe('reservation feature delivery controls', () => {
  it('keeps reservations hidden by default for template databases', () => {
    expect(DEFAULT_FEATURE_FLAGS.reservations).toBe(false);
    expect(getFeatureFlags(null).reservations).toBe(false);
    expect(getFeatureFlags({ feature_flags: {} }).reservations).toBe(false);
  });

  it('keeps reservations off in basic and standard plans, and on in professional', () => {
    expect(PLAN_PRESETS.basic.features.reservations).toBe(false);
    expect(PLAN_PRESETS.standard.features.reservations).toBe(false);
    expect(PLAN_PRESETS.professional.features.reservations).toBe(true);
  });

  it('respects an explicit vendor choice', () => {
    expect(getFeatureFlags({ feature_flags: { reservations: true } }).reservations).toBe(true);
    expect(getFeatureFlags({ feature_flags: { reservations: false } }).reservations).toBe(false);
  });
});
