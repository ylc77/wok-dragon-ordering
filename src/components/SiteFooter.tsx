import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getFeatureFlags } from '../lib/featureFlags';
import type { RestaurantSettings } from '../lib/types';

interface SiteFooterProps { name: string; address?: string; settings?: RestaurantSettings | null; }
const legalLinks = [{ to: '/privacy-policy', label: 'Privacy Policy' }, { to: '/terms-of-service', label: 'Terms of Service' }, { to: '/cookie-policy', label: 'Cookie Policy' }, { to: '/contact', label: 'Contact' }, { to: '/cancellation-policy', label: 'Cancellation Policy' }];

export function SiteFooter({ name, address, settings }: SiteFooterProps) {
  const { i18n } = useTranslation();
  const lang = i18n.language?.startsWith('zh') ? 'zh' : i18n.language?.startsWith('en') ? 'en' : 'el';
  const reservationLabel = lang === 'zh' ? '预订餐桌' : lang === 'en' ? 'Reserve a table' : 'Κράτηση τραπεζιού';
  const reservationsEnabled = settings ? getFeatureFlags(settings).reservations : false;
  return <footer className="site-footer"><div className="site-footer-inner"><div><strong>{name}</strong>{address ? <p>{address}</p> : null}{settings?.phone ? <p>{settings.phone}</p> : null}<small>© {new Date().getFullYear()} {name}</small></div><nav className="site-footer-links" aria-label="Legal links">{reservationsEnabled ? <Link className="footer-reservation-link" to="/reservations">{reservationLabel}</Link> : null}{legalLinks.map((link) => <Link to={link.to} key={link.to}>{link.label}</Link>)}<button type="button" className="footer-link-button" onClick={() => window.dispatchEvent(new Event('restaurant:open-cookie-preferences'))}>Cookie preferences</button></nav></div></footer>;
}
