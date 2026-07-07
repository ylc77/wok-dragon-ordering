import { Link } from 'react-router-dom';
import type { RestaurantSettings } from '../lib/types';

interface SiteFooterProps {
  name: string;
  address?: string;
  settings?: RestaurantSettings | null;
}

const legalLinks = [
  { to: '/privacy-policy', label: 'Privacy Policy' },
  { to: '/terms-of-service', label: 'Terms of Service' },
  { to: '/cookie-policy', label: 'Cookie Policy' },
  { to: '/contact', label: 'Contact' },
  { to: '/cancellation-policy', label: 'Cancellation Policy' },
  { to: '/refund-policy', label: 'Refund Policy' },
  { to: '/return-policy', label: 'Return Policy' },
  { to: '/shipping-policy', label: 'Shipping Policy' },
];

export function SiteFooter({ name, address, settings }: SiteFooterProps) {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div>
          <strong>{name}</strong>
          {address ? <p>{address}</p> : null}
          {settings?.phone ? <p>{settings.phone}</p> : null}
          <small>© {new Date().getFullYear()} {name}</small>
        </div>
        <nav className="site-footer-links" aria-label="Legal links">
          {legalLinks.map((link) => <Link to={link.to} key={link.to}>{link.label}</Link>)}
          <button
            type="button"
            className="footer-link-button"
            onClick={() => window.dispatchEvent(new Event('wok-dragon:open-cookie-preferences'))}
          >
            Cookie preferences
          </button>
        </nav>
      </div>
    </footer>
  );
}
