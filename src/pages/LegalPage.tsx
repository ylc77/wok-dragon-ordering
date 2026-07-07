import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { enabledServiceNames, normalizeLegalSettings } from '../lib/legalTypes';
import { getPublishedLegalVersion } from '../lib/publicLegalApi';
import type { Language } from '../lib/types';
import type { LegalSettings, LegalSettingsVersion } from '../lib/legalTypes';

type LegalPageKind = 'privacy' | 'terms' | 'cookies' | 'contact' | 'cancellation' | 'refund' | 'shipping' | 'return';

const pageMeta: Record<LegalPageKind, { en: string; el: string; eyebrow: string }> = {
  privacy: { en: 'Privacy Policy', el: 'Πολιτική Απορρήτου', eyebrow: 'Privacy' },
  terms: { en: 'Terms of Service', el: 'Όροι Χρήσης', eyebrow: 'Terms' },
  cookies: { en: 'Cookie Policy', el: 'Πολιτική Cookies', eyebrow: 'Cookies' },
  contact: { en: 'Contact', el: 'Επικοινωνία', eyebrow: 'Contact' },
  cancellation: { en: 'Cancellation Policy', el: 'Πολιτική Ακύρωσης', eyebrow: 'Orders' },
  refund: { en: 'Refund Policy', el: 'Πολιτική Επιστροφής Χρημάτων', eyebrow: 'Refunds' },
  shipping: { en: 'Shipping Policy', el: 'Πολιτική Αποστολών', eyebrow: 'Shipping' },
  return: { en: 'Return Policy', el: 'Πολιτική Επιστροφών', eyebrow: 'Returns' },
};

function getPageKind(pathname: string): LegalPageKind {
  if (pathname.includes('terms')) return 'terms';
  if (pathname.includes('cookie')) return 'cookies';
  if (pathname.includes('contact')) return 'contact';
  if (pathname.includes('shipping')) return 'shipping';
  if (pathname.includes('return')) return 'return';
  if (pathname.includes('refund')) return 'refund';
  if (pathname.includes('cancellation')) return 'cancellation';
  return 'privacy';
}

function getLang(value?: string): Language {
  if (value?.startsWith('en')) return 'en';
  if (value?.startsWith('zh')) return 'zh';
  return 'el';
}

function text(lang: Language, en: string, el: string): string {
  return lang === 'el' ? el : en;
}

function displayName(config: LegalSettings): string {
  return config.business_name || config.legal_name || 'this business';
}

function businessAddress(config: LegalSettings): string {
  return config.business_address || config.data_controller_address || 'Address to be confirmed';
}

function line(value?: string | null, fallback = 'To be confirmed'): string {
  return value?.trim() || fallback;
}

export function LegalPage() {
  const location = useLocation();
  const { i18n } = useTranslation();
  const [version, setVersion] = useState<LegalSettingsVersion | null>(null);
  const [loaded, setLoaded] = useState(false);
  const kind = getPageKind(location.pathname);
  const lang = getLang(i18n.language);
  const meta = pageMeta[kind];
  const config = useMemo(() => version?.snapshot ?? normalizeLegalSettings(null), [version]);
  const title = lang === 'el' ? meta.el : meta.en;
  const name = displayName(config);
  const hasPublishedLegalInfo = Boolean(version?.is_current);

  useEffect(() => {
    let cancelled = false;
    getPublishedLegalVersion()
      .then((next) => { if (!cancelled) setVersion(next); })
      .catch(() => { if (!cancelled) setVersion(null); })
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    document.title = `${title} · ${name}`;
  }, [title, name]);

  return (
    <main className="legal-page">
      <section className="legal-hero">
        <span>{meta.eyebrow}</span>
        <h1>{title}</h1>
        <p>{name} · {config.country}</p>
        <small>
          {hasPublishedLegalInfo ? `Version ${version?.version_no} · Last updated: ${config.last_updated}` : 'Legal information is not published yet.'}
        </small>
      </section>
      <section className="legal-card">
        {!loaded ? <p>Loading legal information...</p> : null}
        {loaded && !hasPublishedLegalInfo ? <LegalIncomplete /> : null}
        {loaded && hasPublishedLegalInfo && kind === 'privacy' ? <PrivacyContent config={config} lang={lang} /> : null}
        {loaded && hasPublishedLegalInfo && kind === 'terms' ? <TermsContent config={config} lang={lang} /> : null}
        {loaded && hasPublishedLegalInfo && kind === 'cookies' ? <CookieContent config={config} lang={lang} /> : null}
        {loaded && hasPublishedLegalInfo && kind === 'contact' ? <ContactContent config={config} lang={lang} /> : null}
        {loaded && hasPublishedLegalInfo && kind === 'cancellation' ? <CancellationContent config={config} lang={lang} /> : null}
        {loaded && hasPublishedLegalInfo && kind === 'refund' ? <RefundContent config={config} lang={lang} /> : null}
        {loaded && hasPublishedLegalInfo && kind === 'shipping' ? <ShippingContent config={config} lang={lang} /> : null}
        {loaded && hasPublishedLegalInfo && kind === 'return' ? <ReturnContent config={config} lang={lang} /> : null}
        {loaded && hasPublishedLegalInfo ? <LegalFooter config={config} /> : null}
      </section>
    </main>
  );
}

function LegalIncomplete() {
  return (
    <>
      <h2>Legal information not completed</h2>
      <p>This business has not published its legal settings yet. Please contact the business directly before relying on these legal pages for commercial use.</p>
      <p><Link to="/contact">Contact page</Link></p>
    </>
  );
}

function PrivacyContent({ config, lang }: { config: LegalSettings; lang: Language }) {
  return (
    <>
      <h2>{text(lang, 'Privacy Policy', 'Πολιτική Απορρήτου')}</h2>
      <p>{text(lang, `${displayName(config)} uses this website and ordering system to display information, receive orders and support customer service.`, `${displayName(config)} χρησιμοποιεί αυτόν τον ιστότοπο και το σύστημα παραγγελιών για πληροφορίες, παραγγελίες και εξυπηρέτηση πελατών.`)}</p>
      <h3>{text(lang, 'Data controller', 'Υπεύθυνος επεξεργασίας')}</h3>
      <p>{line(config.data_controller_name, displayName(config))}</p>
      <p>{line(config.data_controller_address, businessAddress(config))}</p>
      <BusinessDetails config={config} />
      <h3>{text(lang, 'Information we may process', 'Πληροφορίες που μπορεί να επεξεργαζόμαστε')}</h3>
      <p>{text(lang, 'Order details, table/session information, contact details you provide, device information, service logs and support messages may be processed when needed for the service.', 'Στοιχεία παραγγελίας, πληροφορίες τραπεζιού/συνεδρίας, στοιχεία επικοινωνίας, τεχνικές πληροφορίες, αρχεία υπηρεσίας και μηνύματα υποστήριξης μπορεί να επεξεργάζονται όταν χρειάζεται για την υπηρεσία.')}</p>
      <ServiceList title={text(lang, 'Enabled service providers', 'Ενεργοί πάροχοι υπηρεσιών')} items={enabledServiceNames(config)} />
      <h3>{text(lang, 'Privacy requests', 'Αιτήματα απορρήτου')}</h3>
      <p>{config.privacy_request_instructions || 'Customers can contact the business to request privacy information, correction or deletion where legally available.'}</p>
      {config.privacy_request_email ? <p><a href={`mailto:${config.privacy_request_email}`}>{config.privacy_request_email}</a></p> : null}
      <h3>{text(lang, 'Retention', 'Διατήρηση')}</h3>
      <p>{config.data_retention}</p>
    </>
  );
}

function TermsContent({ config, lang }: { config: LegalSettings; lang: Language }) {
  return (
    <>
      <h2>{text(lang, 'Terms of Service', 'Όροι Χρήσης')}</h2>
      <p>{text(lang, `By using this website or ordering system, you agree to use it for normal browsing, ordering and customer communication with ${displayName(config)}.`, `Χρησιμοποιώντας αυτόν τον ιστότοπο ή το σύστημα παραγγελιών, συμφωνείτε να το χρησιμοποιείτε για κανονική περιήγηση, παραγγελίες και επικοινωνία με το ${displayName(config)}.`)}</p>
      <h3>{text(lang, 'Order Terms', 'Όροι παραγγελίας')}</h3>
      <p>{config.order_terms || 'Submitted orders are sent to the business for handling. If you notice a mistake, contact staff as soon as possible.'}</p>
      <h3>{text(lang, 'Payment Terms', 'Όροι πληρωμής')}</h3>
      <p>{config.payment_terms || 'Payment options depend on the business setup.'}</p>
      <ServiceList title={text(lang, 'Enabled payment / service methods', 'Ενεργές μέθοδοι πληρωμής / υπηρεσίες')} items={enabledServiceNames(config).filter((item) => ['Cash', 'Card terminal / POS', 'Stripe', 'Viva'].includes(item))} />
      <h3>{text(lang, 'Allergy and availability disclaimer', 'Αλλεργίες και διαθεσιμότητα')}</h3>
      <p>{config.allergen_disclaimer || 'Menu photos, descriptions, prices, ingredients and availability may change. Customers with allergies or dietary requirements should confirm details with staff before ordering.'}</p>
      <h3>{text(lang, 'Receipts', 'Αποδείξεις')}</h3>
      <p>{config.kitchen_receipt_disclaimer}</p>
      <p>{config.official_receipt_disclaimer}</p>
    </>
  );
}

function CookieContent({ config, lang }: { config: LegalSettings; lang: Language }) {
  const optional: string[] = [];
  if (config.analytics_cookies_enabled) optional.push('Analytics cookies');
  if (config.error_monitoring_enabled) optional.push('Error monitoring storage');
  if (config.advertising_cookies_enabled) optional.push('Advertising or tracking cookies');
  return (
    <>
      <h2>{text(lang, 'Cookie Policy', 'Πολιτική Cookies')}</h2>
      <h3>{text(lang, 'Essential cookies / storage', 'Απαραίτητα cookies / αποθήκευση')}</h3>
      <p>{config.essential_cookie_note}</p>
      <h3>{text(lang, 'Optional cookies', 'Προαιρετικά cookies')}</h3>
      {optional.length > 0 ? <ServiceList title={text(lang, 'Optional categories', 'Προαιρετικές κατηγορίες')} items={optional} /> : <p>No non-essential cookies are configured.</p>}
      <p>{text(lang, 'Non-essential analytics, monitoring or tracking tools must only load after consent.', 'Μη απαραίτητα εργαλεία analytics, παρακολούθησης ή διαφήμισης φορτώνονται μόνο μετά από συγκατάθεση.')}</p>
      <p>Cookie last updated: {config.cookie_last_updated}</p>
    </>
  );
}

function ContactContent({ config, lang }: { config: LegalSettings; lang: Language }) {
  return (
    <>
      <h2>{text(lang, 'Contact', 'Επικοινωνία')}</h2>
      <p>{text(lang, 'For questions about orders, website use, privacy or legal pages, contact the business directly.', 'Για ερωτήσεις σχετικά με παραγγελίες, χρήση ιστότοπου, απόρρητο ή νομικές σελίδες, επικοινωνήστε απευθείας με την επιχείρηση.')}</p>
      <ContactBlock config={config} />
      <p><Link to="/menu">{text(lang, 'View menu', 'Δείτε το μενού')}</Link></p>
    </>
  );
}

function CancellationContent({ config, lang }: { config: LegalSettings; lang: Language }) {
  return (
    <>
      <h2>{text(lang, 'Cancellation Policy', 'Πολιτική Ακύρωσης')}</h2>
      <p>{config.cancellation_policy || 'Restaurant and takeaway orders are often prepared quickly. If you need to change or cancel an order, contact staff immediately.'}</p>
      <h3>{text(lang, 'Payment and receipt handling', 'Πληρωμή και αποδείξεις')}</h3>
      <p>{config.payment_terms || 'Final payment and cancellation handling remain with the business.'}</p>
      <p>{config.kitchen_receipt_disclaimer}</p>
      <p>{config.official_receipt_disclaimer}</p>
      <ContactBlock config={config} />
    </>
  );
}

function RefundContent({ config, lang }: { config: LegalSettings; lang: Language }) {
  return (
    <>
      <h2>{text(lang, 'Refund Policy', 'Πολιτική Επιστροφής Χρημάτων')}</h2>
      <p>{config.refund_policy || 'Refund rules must be confirmed by the business before launch.'}</p>
      <h3>{text(lang, '14-day withdrawal right', 'Δικαίωμα υπαναχώρησης 14 ημερών')}</h3>
      <p>{config.withdrawal_right || 'For eligible consumer purchases, the business should confirm whether the 14-day withdrawal right applies and describe the process, exceptions and return shipping responsibility.'}</p>
      <ContactBlock config={config} />
    </>
  );
}

function ShippingContent({ config, lang }: { config: LegalSettings; lang: Language }) {
  return (
    <>
      <h2>{text(lang, 'Shipping Policy', 'Πολιτική Αποστολών')}</h2>
      <p>{config.shipping_policy || 'Shipping areas, delivery times, fees and pickup options must be confirmed by the business before launch.'}</p>
      <ContactBlock config={config} />
    </>
  );
}

function ReturnContent({ config, lang }: { config: LegalSettings; lang: Language }) {
  return (
    <>
      <h2>{text(lang, 'Return Policy', 'Πολιτική Επιστροφών')}</h2>
      <p>{config.return_policy || 'Return windows, item condition rules and approval process must be confirmed by the business before launch.'}</p>
      {config.return_address ? <p>Return address: {config.return_address}</p> : null}
      {config.return_shipping_responsibility ? <p>{config.return_shipping_responsibility}</p> : null}
      {config.excluded_return_items ? <p>{config.excluded_return_items}</p> : null}
      <ContactBlock config={config} />
    </>
  );
}

function BusinessDetails({ config }: { config: LegalSettings }) {
  const fields = [
    config.legal_name ? ['Legal name', config.legal_name] : null,
    config.vat_number ? ['VAT / AFM', config.vat_number] : null,
    config.gemi_number ? ['GEMI', config.gemi_number] : null,
  ].filter(Boolean) as [string, string][];
  if (fields.length === 0) return null;
  return (
    <dl className="legal-details-list">
      {fields.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ServiceList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <>
      <h3>{title}</h3>
      <ul className="legal-service-list">
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </>
  );
}

function ContactBlock({ config }: { config: LegalSettings }) {
  return (
    <div className="legal-contact-block">
      <strong>{displayName(config)}</strong>
      <span>{businessAddress(config)}</span>
      {config.contact_email ? <a href={`mailto:${config.contact_email}`}>{config.contact_email}</a> : null}
      {config.phone ? <a href={`tel:${config.phone}`}>{config.phone}</a> : null}
    </div>
  );
}

function LegalFooter({ config }: { config: LegalSettings }) {
  return (
    <p className="legal-version-footer">
      Legal version: {config.current_version || 'published snapshot'} · Last updated: {config.last_updated}
    </p>
  );
}

