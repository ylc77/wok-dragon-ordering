import type { Language, RestaurantSettings } from './types';
import { pickLocalized } from './localized';

export interface LegalBusinessConfig {
  businessName: string;
  legalName: string;
  businessAddress: string;
  vatNumber: string;
  gemiNumber: string;
  contactEmail: string;
  phone: string;
  country: string;
  dataControllerName: string;
  dataControllerAddress: string;
  dataProcessors: string[];
  paymentProviders: string[];
  analyticsProviders: string[];
  aiProviders: string[];
  dataRetention: string;
  lastUpdated: string;
}

export const legalBusinessConfig: LegalBusinessConfig = {
  businessName: '',
  legalName: '',
  businessAddress: '',
  vatNumber: '',
  gemiNumber: '',
  contactEmail: '',
  phone: '',
  country: 'Greece',
  dataControllerName: '',
  dataControllerAddress: '',
  dataProcessors: ['Supabase', 'Vercel'],
  paymentProviders: [],
  analyticsProviders: [],
  aiProviders: [],
  dataRetention: 'Operational records are kept only for as long as reasonably needed for service, accounting, support and security.',
  lastUpdated: '2026-07-05',
};

export function buildLegalConfig(settings: RestaurantSettings | null, lang: Language): LegalBusinessConfig {
  const businessName = settings
    ? pickLocalized(lang, { zh: settings.name_zh, en: settings.name_en, el: settings.name_el })
    : '';
  const businessAddress = settings
    ? pickLocalized(lang, { zh: settings.address_zh, en: settings.address_en, el: settings.address_el })
    : '';
  const paymentProviders = [
    ...(settings?.accept_cash_payment ? ['Cash'] : []),
    ...(settings?.accept_pos_payment ? ['Card payment through the restaurant POS terminal'] : []),
  ];

  return {
    ...legalBusinessConfig,
    businessName: businessName || legalBusinessConfig.businessName,
    businessAddress: businessAddress || legalBusinessConfig.businessAddress,
    phone: settings?.phone || legalBusinessConfig.phone,
    dataControllerName: legalBusinessConfig.dataControllerName || businessName || '',
    dataControllerAddress: legalBusinessConfig.dataControllerAddress || businessAddress || '',
    paymentProviders: paymentProviders.length > 0 ? paymentProviders : legalBusinessConfig.paymentProviders,
  };
}

export function getBusinessDisplayName(config: LegalBusinessConfig): string {
  return config.businessName || config.legalName || 'this business';
}

export function getBusinessAddress(config: LegalBusinessConfig): string {
  return config.businessAddress || config.dataControllerAddress || 'Address to be confirmed';
}
