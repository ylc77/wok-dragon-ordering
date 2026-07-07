export type LegalProjectType = 'restaurant' | 'retail';
export type LegalSettingsStatus = 'draft' | 'published';

export type LegalServiceFlags = {
  supabase: boolean;
  vercel: boolean;
  stripe: boolean;
  viva: boolean;
  cash: boolean;
  pos: boolean;
  posthog: boolean;
  sentry: boolean;
  openai: boolean;
  deepseek: boolean;
};

export type LegalConfirmations = {
  identity_confirmed: boolean;
  payment_wording_confirmed: boolean;
  policy_wording_confirmed: boolean;
  third_party_services_confirmed: boolean;
  template_notice_confirmed: boolean;
};

export type LegalSettings = {
  id: string;
  project_type: LegalProjectType;
  status: LegalSettingsStatus;
  current_version: string | null;
  last_published_at: string | null;
  business_name: string;
  legal_name: string;
  business_address: string;
  vat_number: string;
  gemi_number: string;
  country: string;
  phone: string;
  contact_email: string;
  data_controller_name: string;
  data_controller_address: string;
  privacy_request_email: string;
  privacy_request_instructions: string;
  service_flags: LegalServiceFlags;
  other_service_notes: string;
  essential_cookie_note: string;
  analytics_cookies_enabled: boolean;
  error_monitoring_enabled: boolean;
  advertising_cookies_enabled: boolean;
  cookie_last_updated: string;
  order_terms: string;
  cancellation_policy: string;
  payment_terms: string;
  allergen_disclaimer: string;
  kitchen_receipt_disclaimer: string;
  official_receipt_disclaimer: string;
  shipping_policy: string;
  return_policy: string;
  refund_policy: string;
  withdrawal_right: string;
  return_address: string;
  return_shipping_responsibility: string;
  excluded_return_items: string;
  data_retention: string;
  last_updated: string;
  confirmations: LegalConfirmations;
  created_at?: string;
  updated_at?: string;
};

export type LegalSettingsVersion = {
  id: string;
  version_no: string;
  settings_id: string | null;
  snapshot: LegalSettings;
  is_current: boolean;
  published_at: string;
  published_by: string | null;
  last_updated: string;
};

export const defaultLegalServiceFlags: LegalServiceFlags = {
  supabase: true,
  vercel: true,
  stripe: false,
  viva: false,
  cash: true,
  pos: true,
  posthog: false,
  sentry: false,
  openai: false,
  deepseek: false,
};

export const defaultLegalConfirmations: LegalConfirmations = {
  identity_confirmed: false,
  payment_wording_confirmed: false,
  policy_wording_confirmed: false,
  third_party_services_confirmed: false,
  template_notice_confirmed: false,
};

export const serviceLabels: Record<keyof LegalServiceFlags, string> = {
  supabase: 'Supabase',
  vercel: 'Vercel',
  stripe: 'Stripe',
  viva: 'Viva',
  cash: 'Cash',
  pos: 'Card terminal / POS',
  posthog: 'PostHog',
  sentry: 'Sentry',
  openai: 'OpenAI',
  deepseek: 'DeepSeek',
};

export function normalizeLegalSettings(row: Partial<LegalSettings> | null | undefined): LegalSettings {
  const now = new Date().toISOString().slice(0, 10);
  return {
    id: row?.id ?? '',
    project_type: row?.project_type ?? 'restaurant',
    status: row?.status ?? 'draft',
    current_version: row?.current_version ?? null,
    last_published_at: row?.last_published_at ?? null,
    business_name: row?.business_name ?? '',
    legal_name: row?.legal_name ?? '',
    business_address: row?.business_address ?? '',
    vat_number: row?.vat_number ?? '',
    gemi_number: row?.gemi_number ?? '',
    country: row?.country ?? 'Greece',
    phone: row?.phone ?? '',
    contact_email: row?.contact_email ?? '',
    data_controller_name: row?.data_controller_name ?? '',
    data_controller_address: row?.data_controller_address ?? '',
    privacy_request_email: row?.privacy_request_email ?? '',
    privacy_request_instructions: row?.privacy_request_instructions ?? '',
    service_flags: { ...defaultLegalServiceFlags, ...(row?.service_flags ?? {}) },
    other_service_notes: row?.other_service_notes ?? '',
    essential_cookie_note: row?.essential_cookie_note ?? 'Essential storage is used for language choice, cookie preferences, login, cart and ordering security.',
    analytics_cookies_enabled: row?.analytics_cookies_enabled ?? false,
    error_monitoring_enabled: row?.error_monitoring_enabled ?? false,
    advertising_cookies_enabled: row?.advertising_cookies_enabled ?? false,
    cookie_last_updated: row?.cookie_last_updated ?? now,
    order_terms: row?.order_terms ?? '',
    cancellation_policy: row?.cancellation_policy ?? '',
    payment_terms: row?.payment_terms ?? '',
    allergen_disclaimer: row?.allergen_disclaimer ?? '',
    kitchen_receipt_disclaimer: row?.kitchen_receipt_disclaimer ?? 'Kitchen tickets are operational order slips and are not official tax receipts.',
    official_receipt_disclaimer: row?.official_receipt_disclaimer ?? 'Official fiscal receipts are issued by the restaurant cash register, fiscal POS or accounting process.',
    shipping_policy: row?.shipping_policy ?? '',
    return_policy: row?.return_policy ?? '',
    refund_policy: row?.refund_policy ?? '',
    withdrawal_right: row?.withdrawal_right ?? '',
    return_address: row?.return_address ?? '',
    return_shipping_responsibility: row?.return_shipping_responsibility ?? '',
    excluded_return_items: row?.excluded_return_items ?? '',
    data_retention: row?.data_retention ?? 'Operational records are kept only for as long as reasonably needed for service, accounting, support and security.',
    last_updated: row?.last_updated ?? now,
    confirmations: { ...defaultLegalConfirmations, ...(row?.confirmations ?? {}) },
    created_at: row?.created_at,
    updated_at: row?.updated_at,
  };
}

export function enabledServiceNames(settings: LegalSettings): string[] {
  const names = Object.entries(settings.service_flags)
    .filter(([, enabled]) => enabled)
    .map(([key]) => serviceLabels[key as keyof LegalServiceFlags]);
  if (settings.other_service_notes.trim()) names.push(settings.other_service_notes.trim());
  return names;
}

export function enabledDataProcessorNames(settings: LegalSettings): string[] {
  const processorKeys: Array<keyof LegalServiceFlags> = [
    'supabase',
    'vercel',
    'posthog',
    'sentry',
    'openai',
    'deepseek',
    'stripe',
    'viva',
  ];
  const names = processorKeys
    .filter((key) => settings.service_flags[key])
    .map((key) => serviceLabels[key]);
  if (settings.other_service_notes.trim()) names.push(settings.other_service_notes.trim());
  return names;
}

export function enabledPaymentMethodNames(settings: LegalSettings): string[] {
  const paymentKeys: Array<keyof LegalServiceFlags> = ['cash', 'pos', 'stripe', 'viva'];
  return paymentKeys
    .filter((key) => settings.service_flags[key])
    .map((key) => serviceLabels[key]);
}

export function validateLegalSettingsForPublish(settings: LegalSettings): string[] {
  const missing: string[] = [];
  if (!settings.business_name.trim()) missing.push('商家展示名称');
  if (!settings.legal_name.trim()) missing.push('法律主体名称');
  if (!settings.business_address.trim()) missing.push('营业地址');
  if (!settings.vat_number.trim()) missing.push('VAT / AFM 税号');
  if (!settings.phone.trim()) missing.push('联系电话');
  if (!settings.contact_email.trim()) missing.push('联系邮箱');
  if (!settings.last_updated.trim()) missing.push('最后更新时间');
  const confirmationsDone = Object.values(settings.confirmations).every(Boolean);
  if (!confirmationsDone) missing.push('客户最终确认');
  return missing;
}
