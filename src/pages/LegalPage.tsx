import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getPublicRestaurantSettings } from '../lib/publicRestaurantApi';
import { buildLegalConfig, getBusinessAddress, getBusinessDisplayName } from '../lib/legalConfig';
import type { LegalBusinessConfig } from '../lib/legalConfig';
import type { Language, RestaurantSettings } from '../lib/types';

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

export function LegalPage() {
  const location = useLocation();
  const { i18n } = useTranslation();
  const [settings, setSettings] = useState<RestaurantSettings | null>(null);
  const kind = getPageKind(location.pathname);
  const lang = getLang(i18n.language);
  const meta = pageMeta[kind];
  const config = useMemo(() => buildLegalConfig(settings, lang), [settings, lang]);
  const title = lang === 'el' ? meta.el : meta.en;
  const businessName = getBusinessDisplayName(config);

  useEffect(() => {
    let cancelled = false;
    getPublicRestaurantSettings()
      .then((next) => { if (!cancelled) setSettings(next); })
      .catch(() => { if (!cancelled) setSettings(null); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    document.title = `${title} · ${businessName}`;
  }, [title, businessName]);

  return (
    <main className="legal-page">
      <section className="legal-hero">
        <span>{meta.eyebrow}</span>
        <h1>{title}</h1>
        <p>{businessName} · {config.country}</p>
        <small>Last updated: {config.lastUpdated}</small>
      </section>
      <section className="legal-card">
        {kind === 'privacy' ? <PrivacyContent config={config} lang={lang} /> : null}
        {kind === 'terms' ? <TermsContent config={config} lang={lang} /> : null}
        {kind === 'cookies' ? <CookieContent config={config} lang={lang} /> : null}
        {kind === 'contact' ? <ContactContent config={config} lang={lang} /> : null}
        {kind === 'cancellation' ? <CancellationContent config={config} lang={lang} /> : null}
        {kind === 'refund' ? <RefundContent config={config} lang={lang} /> : null}
        {kind === 'shipping' ? <ShippingContent config={config} lang={lang} /> : null}
        {kind === 'return' ? <ReturnContent config={config} lang={lang} /> : null}
      </section>
    </main>
  );
}

function PrivacyContent({ config, lang }: { config: LegalBusinessConfig; lang: Language }) {
  const name = getBusinessDisplayName(config);
  return (
    <>
      <h2>{text(lang, 'Privacy Policy', 'Πολιτική Απορρήτου')}</h2>
      <p>{text(
        lang,
        `This basic legal pages template explains how ${name} handles website, ordering and customer service information.`,
        `Αυτό το βασικό πρότυπο νομικών σελίδων εξηγεί πώς το ${name} χειρίζεται πληροφορίες ιστοσελίδας, παραγγελιών και εξυπηρέτησης πελατών.`,
      )}</p>
      <h3>{text(lang, 'Data controller', 'Υπεύθυνος επεξεργασίας')}</h3>
      <p>{config.dataControllerName || name}</p>
      <p>{config.dataControllerAddress || getBusinessAddress(config)}</p>
      <OptionalBusinessFields config={config} />
      <h3>{text(lang, 'Information we may process', 'Πληροφορίες που μπορεί να επεξεργαζόμαστε')}</h3>
      <p>{text(
        lang,
        'Order details, table/session information, contact details you provide, device information, service logs and customer support messages may be processed when needed for the service.',
        'Στοιχεία παραγγελίας, πληροφορίες τραπεζιού/συνεδρίας, στοιχεία επικοινωνίας, τεχνικές πληροφορίες, αρχεία υπηρεσίας και μηνύματα υποστήριξης μπορεί να υποβληθούν σε επεξεργασία όταν χρειάζεται για την υπηρεσία.',
      )}</p>
      <h3>{text(lang, 'How information is used', 'Πώς χρησιμοποιούνται οι πληροφορίες')}</h3>
      <p>{text(
        lang,
        'Information is used to display menus, receive orders, support staff operations, answer questions, prevent abuse and keep the website reliable.',
        'Οι πληροφορίες χρησιμοποιούνται για εμφάνιση μενού, λήψη παραγγελιών, υποστήριξη προσωπικού, απαντήσεις σε ερωτήσεις, αποτροπή κατάχρησης και αξιοπιστία της ιστοσελίδας.',
      )}</p>
      <ServiceList title={text(lang, 'Data processors', 'Επεξεργαστές δεδομένων')} items={config.dataProcessors} />
      <ServiceList title={text(lang, 'Payment providers', 'Πάροχοι πληρωμών')} items={config.paymentProviders} />
      <ServiceList title={text(lang, 'Analytics providers', 'Πάροχοι analytics')} items={config.analyticsProviders} />
      <ServiceList title={text(lang, 'AI providers', 'Πάροχοι AI')} items={config.aiProviders} />
      <h3>{text(lang, 'Retention', 'Διατήρηση')}</h3>
      <p>{config.dataRetention}</p>
      <ContactBlock config={config} />
    </>
  );
}

function TermsContent({ config, lang }: { config: LegalBusinessConfig; lang: Language }) {
  const name = getBusinessDisplayName(config);
  return (
    <>
      <h2>{text(lang, 'Terms of Service', 'Όροι Χρήσης')}</h2>
      <p>{text(
        lang,
        `By using this website or ordering system, you agree to use it only for normal browsing, ordering and customer communication with ${name}.`,
        `Χρησιμοποιώντας την ιστοσελίδα ή το σύστημα παραγγελιών, συμφωνείτε να το χρησιμοποιείτε μόνο για κανονική περιήγηση, παραγγελίες και επικοινωνία με το ${name}.`,
      )}</p>
      <h3>{text(lang, 'Order Terms', 'Όροι παραγγελίας')}</h3>
      <p>{text(
        lang,
        'Submitted orders are sent to the business for handling. If you notice a mistake, contact staff as soon as possible.',
        'Οι παραγγελίες αποστέλλονται στην επιχείρηση για διαχείριση. Αν δείτε λάθος, ενημερώστε άμεσα το προσωπικό.',
      )}</p>
      <h3>{text(lang, 'Payment Terms', 'Όροι πληρωμής')}</h3>
      <p>{text(
        lang,
        'Payment options depend on the business setup. Official tax receipts or invoices are issued through the business required POS, cash register or accounting process.',
        'Οι επιλογές πληρωμής εξαρτώνται από τη ρύθμιση της επιχείρησης. Οι επίσημες φορολογικές αποδείξεις ή τιμολόγια εκδίδονται από το απαιτούμενο POS, ταμειακή ή λογιστική διαδικασία.',
      )}</p>
      <ServiceList title={text(lang, 'Enabled payment methods', 'Ενεργοί τρόποι πληρωμής')} items={config.paymentProviders} />
      <h3>{text(lang, 'Allergy and availability disclaimer', 'Αλλεργίες και διαθεσιμότητα')}</h3>
      <p>{text(
        lang,
        'Menu photos, descriptions, prices, ingredients and availability may change. Customers with allergies or dietary requirements should confirm details with staff before ordering.',
        'Φωτογραφίες, περιγραφές, τιμές, συστατικά και διαθεσιμότητα μπορεί να αλλάξουν. Πελάτες με αλλεργίες ή διατροφικές ανάγκες πρέπει να επιβεβαιώνουν τις λεπτομέρειες με το προσωπικό πριν την παραγγελία.',
      )}</p>
      <h3>{text(lang, 'Limitations', 'Περιορισμοί')}</h3>
      <p>{text(
        lang,
        'This website is a practical information and ordering tool. It is not a tax, legal, medical or accounting platform.',
        'Η ιστοσελίδα είναι πρακτικό εργαλείο πληροφοριών και παραγγελιών. Δεν είναι φορολογική, νομική, ιατρική ή λογιστική πλατφόρμα.',
      )}</p>
      <ContactBlock config={config} />
    </>
  );
}

function CookieContent({ config, lang }: { config: LegalBusinessConfig; lang: Language }) {
  return (
    <>
      <h2>{text(lang, 'Cookie Policy', 'Πολιτική Cookies')}</h2>
      <p>{text(
        lang,
        'Essential cookies or local storage may be used to keep the website working, such as language choice, cookie preferences and basic security.',
        'Απαραίτητα cookies ή τοπική αποθήκευση μπορεί να χρησιμοποιούνται για τη λειτουργία της ιστοσελίδας, όπως επιλογή γλώσσας, προτιμήσεις cookies και βασική ασφάλεια.',
      )}</p>
      <h3>{text(lang, 'Essential cookies', 'Απαραίτητα cookies')}</h3>
      <p>{text(lang, 'These are required for basic website functions.', 'Απαιτούνται για τις βασικές λειτουργίες της ιστοσελίδας.')}</p>
      <h3>{text(lang, 'Optional cookies', 'Προαιρετικά cookies')}</h3>
      <p>{text(
        lang,
        'Analytics or marketing cookies are only loaded after consent. If no analytics or marketing providers are configured, no such optional cookies are loaded.',
        'Analytics ή marketing cookies φορτώνονται μόνο μετά από συγκατάθεση. Αν δεν έχουν ρυθμιστεί αντίστοιχοι πάροχοι, δεν φορτώνονται τέτοια προαιρετικά cookies.',
      )}</p>
      <ServiceList title={text(lang, 'Analytics providers', 'Πάροχοι analytics')} items={config.analyticsProviders} />
      <ContactBlock config={config} />
    </>
  );
}

function ContactContent({ config, lang }: { config: LegalBusinessConfig; lang: Language }) {
  return (
    <>
      <h2>{text(lang, 'Contact', 'Επικοινωνία')}</h2>
      <p>{text(
        lang,
        'For questions about orders, website use, privacy or legal pages, contact the business directly.',
        'Για ερωτήσεις σχετικά με παραγγελίες, χρήση ιστοσελίδας, απόρρητο ή νομικές σελίδες, επικοινωνήστε απευθείας με την επιχείρηση.',
      )}</p>
      <ContactBlock config={config} />
      <p><Link to="/menu">{text(lang, 'View menu', 'Δείτε το μενού')}</Link></p>
    </>
  );
}

function CancellationContent({ config, lang }: { config: LegalBusinessConfig; lang: Language }) {
  const name = getBusinessDisplayName(config);
  return (
    <>
      <h2>{text(lang, 'Cancellation Policy', 'Πολιτική Ακύρωσης')}</h2>
      <p>{text(
        lang,
        'Restaurant and takeaway orders are often prepared quickly. If you need to change or cancel an order, contact staff immediately.',
        'Οι παραγγελίες εστιατορίου και take-away συχνά προετοιμάζονται γρήγορα. Αν χρειάζεστε αλλαγή ή ακύρωση, ενημερώστε άμεσα το προσωπικό.',
      )}</p>
      <h3>{text(lang, 'Before preparation', 'Πριν την προετοιμασία')}</h3>
      <p>{text(lang, 'Staff may be able to adjust or cancel an order before preparation starts.', 'Το προσωπικό μπορεί να προσαρμόσει ή να ακυρώσει την παραγγελία πριν ξεκινήσει η προετοιμασία.')}</p>
      <h3>{text(lang, 'After preparation', 'Μετά την προετοιμασία')}</h3>
      <p>{text(lang, 'Prepared or served orders may not be cancellable. Refunds, if any, are handled by the business according to the actual situation.', 'Παραγγελίες που έχουν ετοιμαστεί ή σερβιριστεί μπορεί να μην ακυρώνονται. Τυχόν επιστροφές χειρίζονται από την επιχείρηση ανά περίπτωση.')}</p>
      <h3>{text(lang, 'Business responsibility', 'Ευθύνη επιχείρησης')}</h3>
      <p>{text(lang, `Final payment, cancellation and receipt handling remain with ${name}.`, `Η τελική πληρωμή, ακύρωση και απόδειξη παραμένουν στην ευθύνη του ${name}.`)}</p>
      <ContactBlock config={config} />
    </>
  );
}

function RefundContent({ config, lang }: { config: LegalBusinessConfig; lang: Language }) {
  return (
    <>
      <h2>{text(lang, 'Refund Policy', 'Πολιτική Επιστροφής Χρημάτων')}</h2>
      <p>{text(
        lang,
        'This section is reserved for retail, clothing, shoes, accessories and other online shop projects. Configure it according to the client business before launch.',
        'Αυτή η ενότητα προορίζεται για καταστήματα λιανικής, ρούχων, παπουτσιών, αξεσουάρ και άλλα online shop projects. Πρέπει να ρυθμιστεί σύμφωνα με την επιχείρηση πριν την έναρξη λειτουργίας.',
      )}</p>
      <h3>{text(lang, '14-day withdrawal right', 'Δικαίωμα υπαναχώρησης 14 ημερών')}</h3>
      <p>{text(
        lang,
        'For eligible consumer purchases, the client should confirm whether the 14-day withdrawal right applies and describe the process, exceptions and return shipping responsibility.',
        'Για επιλέξιμες αγορές καταναλωτών, ο πελάτης πρέπει να επιβεβαιώσει αν εφαρμόζεται το δικαίωμα υπαναχώρησης 14 ημερών και να περιγράψει τη διαδικασία, εξαιρέσεις και ευθύνη εξόδων επιστροφής.',
      )}</p>
      <ContactBlock config={config} />
    </>
  );
}

function ShippingContent({ config, lang }: { config: LegalBusinessConfig; lang: Language }) {
  return (
    <>
      <h2>{text(lang, 'Shipping Policy', 'Πολιτική Αποστολών')}</h2>
      <p>{text(
        lang,
        'Reserved for online shop projects. Add shipping areas, courier partners, delivery times, shipping fees and pickup options before launch.',
        'Προορίζεται για online shop projects. Συμπληρώστε περιοχές αποστολής, συνεργάτες courier, χρόνους παράδοσης, έξοδα αποστολής και επιλογές παραλαβής πριν την έναρξη λειτουργίας.',
      )}</p>
      <ContactBlock config={config} />
    </>
  );
}

function ReturnContent({ config, lang }: { config: LegalBusinessConfig; lang: Language }) {
  return (
    <>
      <h2>{text(lang, 'Return Policy', 'Πολιτική Επιστροφών')}</h2>
      <p>{text(
        lang,
        'Reserved for retail projects. Add return windows, item condition rules, excluded products, return address and approval process before launch.',
        'Προορίζεται για retail projects. Συμπληρώστε προθεσμία επιστροφών, κανόνες κατάστασης προϊόντων, εξαιρούμενα προϊόντα, διεύθυνση επιστροφής και διαδικασία έγκρισης πριν την έναρξη λειτουργίας.',
      )}</p>
      <ContactBlock config={config} />
    </>
  );
}

function OptionalBusinessFields({ config }: { config: LegalBusinessConfig }) {
  const fields = [
    config.legalName ? ['Legal name', config.legalName] : null,
    config.vatNumber ? ['VAT number', config.vatNumber] : null,
    config.gemiNumber ? ['GEMI number', config.gemiNumber] : null,
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

function ContactBlock({ config }: { config: LegalBusinessConfig }) {
  const name = getBusinessDisplayName(config);
  return (
    <div className="legal-contact-block">
      <strong>{name}</strong>
      <span>{getBusinessAddress(config)}</span>
      {config.contactEmail ? <a href={`mailto:${config.contactEmail}`}>{config.contactEmail}</a> : null}
      {config.phone ? <a href={`tel:${config.phone}`}>{config.phone}</a> : null}
    </div>
  );
}
