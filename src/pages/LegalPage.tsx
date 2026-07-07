import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  enabledDataProcessorNames,
  enabledPaymentMethodNames,
  normalizeLegalSettings,
} from '../lib/legalTypes';
import { getPublishedLegalVersion } from '../lib/publicLegalApi';
import type { Language } from '../lib/types';
import type { LegalSettings, LegalSettingsVersion } from '../lib/legalTypes';

type LegalPageKind = 'privacy' | 'terms' | 'cookies' | 'contact' | 'cancellation';

const pageMeta: Record<LegalPageKind, { en: string; el: string; eyebrow: string }> = {
  privacy: { en: 'Privacy Policy', el: 'Πολιτική Απορρήτου', eyebrow: 'Privacy' },
  terms: { en: 'Terms of Service', el: 'Όροι Χρήσης', eyebrow: 'Terms' },
  cookies: { en: 'Cookie Policy', el: 'Πολιτική Cookies', eyebrow: 'Cookies' },
  contact: { en: 'Contact', el: 'Επικοινωνία', eyebrow: 'Contact' },
  cancellation: { en: 'Cancellation Policy', el: 'Πολιτική Ακύρωσης', eyebrow: 'Orders' },
};

function getPageKind(pathname: string): LegalPageKind {
  if (pathname.includes('terms')) return 'terms';
  if (pathname.includes('cookie')) return 'cookies';
  if (pathname.includes('contact')) return 'contact';
  if (pathname.includes('cancellation')) return 'cancellation';
  return 'privacy';
}

function getLang(value?: string): Language {
  return value?.startsWith('en') ? 'en' : 'el';
}

function text(lang: Language, en: string, el: string) {
  return lang === 'en' ? en : el;
}

function displayName(config: LegalSettings) {
  return config.business_name || config.legal_name || 'the restaurant';
}

function businessAddress(config: LegalSettings) {
  return config.business_address || config.data_controller_address || '';
}

export function LegalPage() {
  const location = useLocation();
  const { i18n } = useTranslation();
  const lang = getLang(i18n.language);
  const kind = getPageKind(location.pathname);
  const meta = pageMeta[kind];
  const [version, setVersion] = useState<LegalSettingsVersion | null>(null);
  const [loaded, setLoaded] = useState(false);
  const config = useMemo(() => normalizeLegalSettings(version?.snapshot), [version]);

  useEffect(() => {
    let active = true;
    setLoaded(false);
    void getPublishedLegalVersion()
      .then((next) => { if (active) setVersion(next); })
      .finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    document.title = `${lang === 'en' ? meta.en : meta.el} · ${displayName(config)}`;
  }, [config, lang, meta]);

  return (
    <main className="legal-page-shell">
      <section className="legal-hero">
        <span>{meta.eyebrow}</span>
        <h1>{lang === 'en' ? meta.en : meta.el}</h1>
        <p>{text(lang, 'Restaurant information, ordering terms and privacy details.', 'Πληροφορίες εστιατορίου, όροι παραγγελίας και προστασία προσωπικών δεδομένων.')}</p>
      </section>

      <section className="legal-card">
        {!loaded ? <p>{text(lang, 'Loading legal information...', 'Φόρτωση νομικών πληροφοριών...')}</p> : null}
        {loaded && !version ? <LegalIncomplete lang={lang} /> : null}
        {loaded && version && kind === 'privacy' ? <PrivacyContent config={config} lang={lang} /> : null}
        {loaded && version && kind === 'terms' ? <TermsContent config={config} lang={lang} /> : null}
        {loaded && version && kind === 'cookies' ? <CookieContent config={config} lang={lang} /> : null}
        {loaded && version && kind === 'contact' ? <ContactContent config={config} lang={lang} /> : null}
        {loaded && version && kind === 'cancellation' ? <CancellationContent config={config} lang={lang} /> : null}
        {loaded && version ? <LegalFooter config={config} lang={lang} /> : null}
      </section>
    </main>
  );
}

function LegalIncomplete({ lang }: { lang: Language }) {
  return (
    <>
      <h2>{text(lang, 'Legal information is not yet published', 'Οι νομικές πληροφορίες δεν έχουν δημοσιευτεί ακόμη')}</h2>
      <p>{text(lang, 'Please contact the restaurant directly before placing an order.', 'Παρακαλούμε επικοινωνήστε απευθείας με το εστιατόριο πριν υποβάλετε παραγγελία.')}</p>
      <p><Link to="/contact">{text(lang, 'Contact the restaurant', 'Επικοινωνία με το εστιατόριο')}</Link></p>
    </>
  );
}

function PrivacyContent({ config, lang }: { config: LegalSettings; lang: Language }) {
  return (
    <>
      <h2>{text(lang, 'How we handle personal data', 'Πώς διαχειριζόμαστε τα προσωπικά δεδομένα')}</h2>
      <p>{text(
        lang,
        `${displayName(config)} processes only the information reasonably needed to operate the website, receive restaurant orders, provide support and protect the service.`,
        `Το ${displayName(config)} επεξεργάζεται μόνο τις πληροφορίες που είναι εύλογα απαραίτητες για τη λειτουργία του ιστοτόπου, τη λήψη παραγγελιών, την εξυπηρέτηση πελατών και την ασφάλεια της υπηρεσίας.`,
      )}</p>

      <h3>{text(lang, 'Data controller', 'Υπεύθυνος επεξεργασίας')}</h3>
      <p>{config.data_controller_name || displayName(config)}</p>
      <p>{config.data_controller_address || businessAddress(config)}</p>
      <BusinessDetails config={config} />

      <h3>{text(lang, 'Information we process', 'Πληροφορίες που επεξεργαζόμαστε')}</h3>
      <ul>
        <li>{text(lang, 'Order details, selected dishes, notes, table and session identifiers.', 'Στοιχεία παραγγελίας, επιλεγμένα πιάτα, σημειώσεις και αναγνωριστικά τραπεζιού ή συνεδρίας.')}</li>
        <li>{text(lang, 'Contact information that you choose to provide.', 'Στοιχεία επικοινωνίας που επιλέγετε να παρέχετε.')}</li>
        <li>{text(lang, 'Technical and security information needed to operate and protect the service.', 'Τεχνικές πληροφορίες και δεδομένα ασφαλείας που απαιτούνται για τη λειτουργία και προστασία της υπηρεσίας.')}</li>
      </ul>

      <h3>{text(lang, 'Why we use it', 'Γιατί χρησιμοποιούμε τα δεδομένα')}</h3>
      <p>{text(lang, 'We use this information to handle orders, communicate with customers, keep the service secure, meet legal or accounting obligations and resolve support issues.', 'Χρησιμοποιούμε αυτές τις πληροφορίες για τη διαχείριση παραγγελιών, την επικοινωνία με πελάτες, την ασφάλεια της υπηρεσίας, την τήρηση νομικών ή λογιστικών υποχρεώσεων και την επίλυση αιτημάτων υποστήριξης.')}</p>

      <ServiceList title={text(lang, 'Service providers used by this restaurant', 'Πάροχοι υπηρεσιών που χρησιμοποιεί το εστιατόριο')} items={enabledDataProcessorNames(config)} />

      <h3>{text(lang, 'Retention', 'Χρόνος διατήρησης')}</h3>
      <p>{config.data_retention || text(lang, 'Records are retained only for as long as needed for service, legal, accounting, security and support purposes.', 'Τα αρχεία διατηρούνται μόνο για όσο απαιτείται για την παροχή υπηρεσιών, νομικούς, λογιστικούς, ασφαλιστικούς και υποστηρικτικούς σκοπούς.')}</p>

      <h3>{text(lang, 'Your privacy requests', 'Τα αιτήματά σας για προσωπικά δεδομένα')}</h3>
      <p>{config.privacy_request_instructions || text(lang, 'You may contact the restaurant to request access, correction or deletion where applicable, or to object to certain processing.', 'Μπορείτε να επικοινωνήσετε με το εστιατόριο για πρόσβαση, διόρθωση ή διαγραφή όπου εφαρμόζεται, ή για να αντιταχθείτε σε συγκεκριμένη επεξεργασία.')}</p>
      {config.privacy_request_email ? <p><a href={`mailto:${config.privacy_request_email}`}>{config.privacy_request_email}</a></p> : null}
    </>
  );
}

function TermsContent({ config, lang }: { config: LegalSettings; lang: Language }) {
  return (
    <>
      <h2>{text(lang, 'Restaurant ordering terms', 'Όροι παραγγελίας εστιατορίου')}</h2>
      <p>{text(lang, `These terms apply when you browse the menu or submit an order to ${displayName(config)} through this website.`, `Οι παρόντες όροι ισχύουν όταν περιηγείστε στο μενού ή υποβάλλετε παραγγελία στο ${displayName(config)} μέσω αυτού του ιστοτόπου.`)}</p>

      <h3>{text(lang, 'Orders', 'Παραγγελίες')}</h3>
      <p>{config.order_terms || text(lang, 'Submitting an order sends it to the restaurant for review and preparation. Contact staff immediately if any order information is incorrect.', 'Η υποβολή παραγγελίας τη διαβιβάζει στο εστιατόριο για έλεγχο και προετοιμασία. Επικοινωνήστε άμεσα με το προσωπικό εάν κάποιο στοιχείο είναι λανθασμένο.')}</p>

      <h3>{text(lang, 'Prices and payment', 'Τιμές και πληρωμή')}</h3>
      <p>{config.payment_terms || text(lang, 'Prices shown are the current menu prices. Available payment methods are confirmed by the restaurant.', 'Οι εμφανιζόμενες τιμές είναι οι τρέχουσες τιμές του μενού. Οι διαθέσιμοι τρόποι πληρωμής επιβεβαιώνονται από το εστιατόριο.')}</p>
      <ServiceList title={text(lang, 'Available payment methods', 'Διαθέσιμοι τρόποι πληρωμής')} items={enabledPaymentMethodNames(config)} />

      <h3>{text(lang, 'Menu availability', 'Διαθεσιμότητα μενού')}</h3>
      <p>{text(lang, 'Dish availability, ingredients, portions, presentation and preparation time may change. The restaurant may contact you if an ordered item is unavailable.', 'Η διαθεσιμότητα πιάτων, τα συστατικά, οι μερίδες, η παρουσίαση και ο χρόνος προετοιμασίας ενδέχεται να αλλάξουν. Το εστιατόριο μπορεί να επικοινωνήσει μαζί σας εάν κάποιο προϊόν δεν είναι διαθέσιμο.')}</p>

      <h3>{text(lang, 'Allergens and dietary requirements', 'Αλλεργιογόνα και διατροφικές απαιτήσεις')}</h3>
      <p>{config.allergen_disclaimer || text(lang, 'If you have an allergy or intolerance, speak with restaurant staff before ordering. Online descriptions may not contain every ingredient, and cross-contact may occur in a shared kitchen.', 'Εάν έχετε αλλεργία ή δυσανεξία, ενημερώστε το προσωπικό πριν παραγγείλετε. Οι διαδικτυακές περιγραφές ενδέχεται να μην περιλαμβάνουν κάθε συστατικό και μπορεί να υπάρξει διασταυρούμενη επαφή σε κοινόχρηστη κουζίνα.')}</p>

      <h3>{text(lang, 'Kitchen tickets and fiscal receipts', 'Δελτία κουζίνας και φορολογικές αποδείξεις')}</h3>
      <p>{config.kitchen_receipt_disclaimer}</p>
      <p>{config.official_receipt_disclaimer}</p>
    </>
  );
}

function CookieContent({ config, lang }: { config: LegalSettings; lang: Language }) {
  const optional: string[] = [];
  if (config.analytics_cookies_enabled) optional.push(text(lang, 'Analytics', 'Ανάλυση χρήσης'));
  if (config.error_monitoring_enabled) optional.push(text(lang, 'Error monitoring', 'Παρακολούθηση σφαλμάτων'));
  if (config.advertising_cookies_enabled) optional.push(text(lang, 'Advertising or tracking', 'Διαφήμιση ή παρακολούθηση'));
  return (
    <>
      <h2>{text(lang, 'Cookies and local storage', 'Cookies και τοπική αποθήκευση')}</h2>
      <h3>{text(lang, 'Essential storage', 'Απαραίτητη αποθήκευση')}</h3>
      <p>{config.essential_cookie_note || text(lang, 'Essential storage supports language choice, cookie preferences, login, cart and ordering security.', 'Η απαραίτητη αποθήκευση υποστηρίζει την επιλογή γλώσσας, τις προτιμήσεις cookies, τη σύνδεση, το καλάθι και την ασφάλεια παραγγελιών.')}</p>

      <h3>{text(lang, 'Optional categories', 'Προαιρετικές κατηγορίες')}</h3>
      {optional.length > 0
        ? <ServiceList title={text(lang, 'Enabled after consent', 'Ενεργοποιούνται μετά από συγκατάθεση')} items={optional} />
        : <p>{text(lang, 'No non-essential cookie categories are currently enabled.', 'Δεν είναι ενεργοποιημένες μη απαραίτητες κατηγορίες cookies.')}</p>}
      <p>{text(lang, 'Non-essential analytics, monitoring or advertising tools load only after consent. You can change your choice from the Cookie preferences link in the footer.', 'Τα μη απαραίτητα εργαλεία ανάλυσης, παρακολούθησης ή διαφήμισης φορτώνονται μόνο μετά από συγκατάθεση. Μπορείτε να αλλάξετε την επιλογή σας από τον σύνδεσμο προτιμήσεων cookies στο υποσέλιδο.')}</p>
      <p>{text(lang, 'Cookie information last updated:', 'Τελευταία ενημέρωση πληροφοριών cookies:')} {config.cookie_last_updated}</p>
    </>
  );
}

function ContactContent({ config, lang }: { config: LegalSettings; lang: Language }) {
  return (
    <>
      <h2>{text(lang, 'Contact the restaurant', 'Επικοινωνία με το εστιατόριο')}</h2>
      <p>{text(lang, 'For questions about an order, allergens, payments, privacy or these legal pages, contact the restaurant directly.', 'Για ερωτήσεις σχετικά με παραγγελία, αλλεργιογόνα, πληρωμές, προσωπικά δεδομένα ή αυτές τις νομικές σελίδες, επικοινωνήστε απευθείας με το εστιατόριο.')}</p>
      <ContactBlock config={config} />
      <p><Link to="/menu">{text(lang, 'View menu', 'Προβολή μενού')}</Link></p>
    </>
  );
}

function CancellationContent({ config, lang }: { config: LegalSettings; lang: Language }) {
  return (
    <>
      <h2>{text(lang, 'Restaurant order cancellation', 'Ακύρωση παραγγελίας εστιατορίου')}</h2>
      <p>{config.cancellation_policy || text(lang, 'Restaurant orders may enter preparation immediately. Contact staff as soon as possible if you need to change or cancel an order. Cancellation may not be possible after preparation has started.', 'Οι παραγγελίες μπορεί να ξεκινήσουν να προετοιμάζονται αμέσως. Επικοινωνήστε το συντομότερο δυνατό εάν χρειάζεται αλλαγή ή ακύρωση. Η ακύρωση ενδέχεται να μην είναι δυνατή μετά την έναρξη της προετοιμασίας.')}</p>

      <h3>{text(lang, 'Perishable and prepared food', 'Ευπαθή και παρασκευασμένα τρόφιμα')}</h3>
      <p>{text(lang, 'Prepared restaurant food is time-sensitive and perishable. Consumer withdrawal rules may include exceptions for rapidly perishable goods or catering services for a specific date or time. Your mandatory legal rights remain unaffected.', 'Το έτοιμο φαγητό είναι ευπαθές και χρονικά ευαίσθητο. Οι κανόνες υπαναχώρησης καταναλωτή μπορεί να περιλαμβάνουν εξαιρέσεις για ταχέως αλλοιώσιμα αγαθά ή υπηρεσίες εστίασης για συγκεκριμένη ημερομηνία ή ώρα. Τα υποχρεωτικά νόμιμα δικαιώματά σας δεν επηρεάζονται.')}</p>

      <h3>{text(lang, 'Payment handling', 'Διαχείριση πληρωμής')}</h3>
      <p>{config.payment_terms || text(lang, 'Any payment adjustment is handled by the restaurant according to the order status, payment method and applicable law.', 'Οποιαδήποτε προσαρμογή πληρωμής διεκπεραιώνεται από το εστιατόριο σύμφωνα με την κατάσταση της παραγγελίας, τον τρόπο πληρωμής και την ισχύουσα νομοθεσία.')}</p>
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
        <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
      ))}
    </dl>
  );
}

function ServiceList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <>
      <h3>{title}</h3>
      <ul className="legal-service-list">{items.map((item) => <li key={item}>{item}</li>)}</ul>
    </>
  );
}

function ContactBlock({ config }: { config: LegalSettings }) {
  return (
    <div className="legal-contact-block">
      <strong>{displayName(config)}</strong>
      {businessAddress(config) ? <span>{businessAddress(config)}</span> : null}
      {config.contact_email ? <a href={`mailto:${config.contact_email}`}>{config.contact_email}</a> : null}
      {config.phone ? <a href={`tel:${config.phone}`}>{config.phone}</a> : null}
    </div>
  );
}

function LegalFooter({ config, lang }: { config: LegalSettings; lang: Language }) {
  return (
    <div className="legal-version-footer">
      <p>{text(lang, 'Legal version', 'Έκδοση νομικών όρων')}: {config.current_version || 'published snapshot'} · {text(lang, 'Last updated', 'Τελευταία ενημέρωση')}: {config.last_updated}</p>
      <p>{text(lang, 'This is a basic legal-page template and does not replace advice from a lawyer, accountant or local compliance professional.', 'Αυτό είναι βασικό πρότυπο νομικών σελίδων και δεν αντικαθιστά συμβουλή δικηγόρου, λογιστή ή τοπικού επαγγελματία συμμόρφωσης.')}</p>
    </div>
  );
}
