import { normalizeLegalSettings } from './legalTypes';
import type { LegalSettings, LegalSettingsVersion } from './legalTypes';
import type { LegalSettingsDataSource } from '../components/admin/LegalSettingsEditor';

type VendorLegalResponse = {
  settings?: LegalSettings;
  versions?: LegalSettingsVersion[];
  version?: LegalSettingsVersion;
  error?: string;
};

async function requestVendorLegal(
  password: string,
  action: 'read' | 'save' | 'publish' | 'versions',
  settings?: LegalSettings,
): Promise<VendorLegalResponse> {
  const response = await fetch('/api/vendor/legal-settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password, action, settings }),
  });
  const payload = await response.json().catch(() => ({})) as VendorLegalResponse;
  if (!response.ok) throw new Error(payload.error || '法律设置请求失败。');
  return payload;
}

export function createVendorLegalDataSource(password: string): LegalSettingsDataSource {
  return {
    async fetchDraft() {
      const payload = await requestVendorLegal(password, 'read');
      return normalizeLegalSettings(payload.settings);
    },
    async fetchVersions() {
      const payload = await requestVendorLegal(password, 'versions');
      return (payload.versions ?? []).map((version) => ({
        ...version,
        snapshot: normalizeLegalSettings(version.snapshot),
      }));
    },
    async saveDraft(settings) {
      const payload = await requestVendorLegal(password, 'save', settings);
      return normalizeLegalSettings(payload.settings);
    },
    async publish(settings) {
      const payload = await requestVendorLegal(password, 'publish', settings);
      if (!payload.version) throw new Error('发布后未返回法律版本。');
      return {
        ...payload.version,
        snapshot: normalizeLegalSettings(payload.version.snapshot),
      };
    },
  };
}
