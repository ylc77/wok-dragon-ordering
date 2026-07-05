import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getPublicRestaurantSettings } from '../lib/publicRestaurantApi';
import { pickLocalized } from '../lib/localized';
import type { Language, RestaurantSettings } from '../lib/types';

type LegalPageKind = 'privacy' | 'terms' | 'cookies' | 'contact' | 'cancellation';

interface LegalConfig {
  businessName: string;
  businessAddress: string;
  contactEmail: string;
  phone: string;
  country: string;
  dataProcessors: string[];
  dataRetention: string;
  lastUpdated: string;
}

const fallbackConfig: LegalConfig = {
  businessName: 'Wok Dragon Express',
  businessAddress: 'Athens, Greece',
  contactEmail: 'Please contact the restaurant directly',
  phone: '',
  country: 'Greece',
  dataProcessors: ['Supabase', 'Vercel'],
  dataRetention: 'Operational records are kept only for as long as reasonably needed for service, accounting and security.',
  lastUpdated: '2026-07-05',
};

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
  if (pathname.includes('refund') || pathname.includes('cancellation')) return 'cancellation';
  return 'privacy';
}

function getLang(value?: string): Language {
  if (value?.startsWith('en')) return 'en';
  if (value?.startsWith('zh')) return 'zh';
  return 'el';
}

function toConfig(settings: RestaurantSettings | null, lang: Language): LegalConfig {
  if (!settings) return fallbackConfig;
  return {
    ...fallbackConfig,
    businessName: pickLocalized(lang, {
      zh: settings.name_zh,
      en: settings.name_en,
      el: settings.name_el,
    }) || fallbackConfig.businessName,
    businessAddress: pickLocalized(lang, {
      zh: settings.address_zh,
      en: settings.address_en,
      el: settings.address_el,
    }) || fallbackConfig.businessAddress,
    phone: settings.phone || fallbackConfig.phone,
  };
}

export function LegalPage() {
  const location = useLocation();
  const { i18n } = useTranslation();
  const [settings, setSettings] = useState<RestaurantSettings | null>(null);
  const kind = getPageKind(location.pathname);
  const lang = getLang(i18n.language);
  const meta = pageMeta[kind];
  const config = useMemo(() => toConfig(settings, lang), [settings, lang]);
  const title = lang === 'el' ? meta.el : meta.en;

  useEffect(() => {
    let cancelled = false;
    getPublicRestaurantSettings()
      .then((next) => { if (!cancelled) setSettings(next); })
      .catch(() => { if (!cancelled) setSettings(null); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    document.title = `${title} · ${config.businessName}`;
  }, [title, config.businessName]);

  return (
    <main className="legal-page">
      <section className="legal-hero">
        <span>{meta.eyebrow}</span>
        <h1>{title}</h1>
        <p>{config.businessName} · {config.country}</p>
        <small>Last updated: {config.lastUpdated}</small>
      </section>
      <section className="legal-card">
        {kind === 'privacy' ? <PrivacyContent config={config} lang={lang} /> : null}
        {kind === 'terms' ? <TermsContent config={config} lang={lang} /> : null}
        {kind === 'cookies' ? <CookieContent config={config} lang={lang} /> : null}
        {kind === 'contact' ? <ContactContent config={config} lang={lang} /> : null}
        {kind === 'cancellation' ? <CancellationContent config={config} lang={lang} /> : null}
      </section>
    </main>
  );
}

function PrivacyContent({ config, lang }: { config: LegalConfig; lang: Language }) {
  if (lang === 'el') {
    return (
      <>
        <h2>Πολιτική Απορρήτου</h2>
        <p>Αυτό το πρότυπο εξηγεί πώς το {config.businessName} χειρίζεται βασικές πληροφορίες ιστοσελίδας και παραγγελιών.</p>
        <h3>Πληροφορίες που συλλέγουμε</h3>
        <p>Μπορεί να επεξεργαζόμαστε στοιχεία παραγγελίας, πληροφορίες τραπεζιού, στοιχεία επικοινωνίας που παρέχετε και τεχνικά αρχεία υπηρεσίας.</p>
        <h3>Πώς χρησιμοποιούνται</h3>
        <p>Οι πληροφορίες χρησιμοποιούνται για εμφάνιση μενού, παραλαβή παραγγελιών, υποστήριξη προσωπικού, αξιοπιστία και απαντήσεις σε ερωτήσεις πελατών.</p>
        <h3>Πάροχοι υπηρεσιών</h3>
        <p>Τρέχοντες επεξεργαστές δεδομένων: {config.dataProcessors.join(', ')}.</p>
        <h3>Διατήρηση</h3>
        <p>{config.dataRetention}</p>
        <h3>Επικοινωνία</h3>
        <p>Μπορείτε να επικοινωνήσετε μαζί μας για ερωτήσεις σχετικά με πρόσβαση, διόρθωση ή διαγραφή, όπου αυτό προβλέπεται.</p>
        <ContactBlock config={config} />
      </>
    );
  }
  return (
    <>
      <h2>Privacy Policy</h2>
      <p>This template explains how {config.businessName} handles basic website and ordering information.</p>
      <h3>Information we collect</h3>
      <p>We may process order details, table/session information, contact details you choose to provide, device information and service logs needed to run the ordering service.</p>
      <h3>How we use information</h3>
      <p>We use information to show menus, receive orders, support staff operations, improve reliability, prevent abuse and answer customer questions.</p>
      <h3>Service providers</h3>
      <p>Current configurable data processors: {config.dataProcessors.join(', ')}.</p>
      <h3>Retention</h3>
      <p>{config.dataRetention}</p>
      <h3>Your choices</h3>
      <p>You can contact us to ask about access, correction or deletion where legally available.</p>
      <ContactBlock config={config} />
    </>
  );
}

function TermsContent({ config, lang }: { config: LegalConfig; lang: Language }) {
  if (lang === 'el') {
    return (
      <>
        <h2>Όροι Χρήσης</h2>
        <p>Χρησιμοποιώντας την ιστοσελίδα ή το σύστημα παραγγελιών, συμφωνείτε να τα χρησιμοποιείτε μόνο για κανονική προβολή μενού και παραγγελίες.</p>
        <h3>Μενού και διαθεσιμότητα</h3>
        <p>Φωτογραφίες, τιμές και διαθεσιμότητα μπορεί να αλλάξουν. Η επιβεβαίωση από το προσωπικό παραμένει η τελική πηγή αλήθειας.</p>
        <h3>Παραγγελίες</h3>
        <p>Οι παραγγελίες αποστέλλονται στο εστιατόριο για προετοιμασία. Αν δείτε λάθος, ενημερώστε άμεσα το προσωπικό.</p>
        <h3>Πληρωμές</h3>
        <p>Τα στοιχεία πληρωμής στο σύστημα βοηθούν τη λειτουργία του εστιατορίου. Οι επίσημες φορολογικές αποδείξεις εκδίδονται από το απαιτούμενο POS ή λογιστική διαδικασία.</p>
        <h3>Περιορισμοί</h3>
        <p>Η ιστοσελίδα είναι πρακτική υπηρεσία παραγγελιών και πληροφοριών. Δεν είναι φορολογική, νομική ή λογιστική πλατφόρμα.</p>
        <ContactBlock config={config} />
      </>
    );
  }
  return (
    <>
      <h2>Terms of Service</h2>
      <p>By using this website or ordering system, you agree to use it only for normal restaurant browsing and ordering.</p>
      <h3>Menu and availability</h3>
      <p>Menu photos, prices and availability may change. Staff confirmation and restaurant operations remain the final source of truth.</p>
      <h3>Orders</h3>
      <p>Submitted orders are sent to the restaurant for preparation. If you notice a mistake, please contact staff as soon as possible.</p>
      <h3>Payments</h3>
      <p>Payment records in this system support restaurant operations. Official tax receipts or invoices are issued through the restaurant's required POS or accounting process.</p>
      <h3>Limitations</h3>
      <p>This website is provided as a practical ordering and information service. It is not a tax, legal or accounting platform.</p>
      <ContactBlock config={config} />
    </>
  );
}

function CookieContent({ config, lang }: { config: LegalConfig; lang: Language }) {
  if (lang === 'el') {
    return (
      <>
        <h2>Πολιτική Cookies</h2>
        <p>Χρησιμοποιούμε απαραίτητα cookies ή τοπική αποθήκευση για βασικές προτιμήσεις, όπως γλώσσα και επιλογές cookies.</p>
        <h3>Απαραίτητα cookies</h3>
        <p>Απαιτούνται για τη λειτουργία της ιστοσελίδας και δεν απενεργοποιούνται από το banner.</p>
        <h3>Προαιρετικά cookies</h3>
        <p>Analytics ή marketing cookies φορτώνονται μόνο μετά από συγκατάθεση. Η πρώτη έκδοση δεν φορτώνει μη απαραίτητα cookies από προεπιλογή.</p>
        <h3>Διαχείριση επιλογών</h3>
        <p>Μπορείτε να αλλάξετε επιλογή καθαρίζοντας τα δεδομένα της ιστοσελίδας από τον browser και ανοίγοντας ξανά τη σελίδα.</p>
        <ContactBlock config={config} />
      </>
    );
  }
  return (
    <>
      <h2>Cookie Policy</h2>
      <p>We use essential cookies or local storage to keep basic website preferences working, such as language and cookie choices.</p>
      <h3>Essential cookies</h3>
      <p>These are needed for the website to work and cannot be disabled through the banner.</p>
      <h3>Optional cookies</h3>
      <p>Analytics or marketing cookies are only loaded after consent. The current first version does not load non-essential cookies by default.</p>
      <h3>Managing preferences</h3>
      <p>You can change your choice by clearing this site's browser data and reopening the website.</p>
      <ContactBlock config={config} />
    </>
  );
}

function ContactContent({ config, lang }: { config: LegalConfig; lang: Language }) {
  if (lang === 'el') {
    return (
      <>
        <h2>Επικοινωνία</h2>
        <p>Για ερωτήσεις σχετικά με παραγγελίες, μενού, απόρρητο ή χρήση της ιστοσελίδας, επικοινωνήστε απευθείας με το εστιατόριο.</p>
        <ContactBlock config={config} />
        <p><Link to="/menu">Δείτε το μενού</Link></p>
      </>
    );
  }
  return (
    <>
      <h2>Contact</h2>
      <p>For questions about orders, menu information, privacy or website use, please contact the restaurant directly.</p>
      <ContactBlock config={config} />
      <p><Link to="/menu">View menu</Link></p>
    </>
  );
}

function CancellationContent({ config, lang }: { config: LegalConfig; lang: Language }) {
  if (lang === 'el') {
    return (
      <>
        <h2>Πολιτική Ακύρωσης</h2>
        <p>Οι παραγγελίες συνήθως ξεκινούν γρήγορα μετά την υποβολή. Αν χρειάζεστε αλλαγή ή ακύρωση, ενημερώστε άμεσα το προσωπικό.</p>
        <h3>Πριν την προετοιμασία</h3>
        <p>Το προσωπικό μπορεί να προσαρμόσει ή να ακυρώσει την παραγγελία αν δεν έχει ξεκινήσει η προετοιμασία.</p>
        <h3>Μετά την προετοιμασία</h3>
        <p>Παραγγελίες που έχουν ήδη ετοιμαστεί ή σερβιριστεί μπορεί να μην ακυρώνονται. Τυχόν επιστροφές χειρίζονται από το εστιατόριο ανά περίπτωση.</p>
        <h3>Σημείωση online παραγγελίας</h3>
        <p>Το σύστημα υποστηρίζει τη ροή παραγγελιών. Η τελική πληρωμή, ακύρωση και απόδειξη παραμένουν στην ευθύνη του {config.businessName}.</p>
        <ContactBlock config={config} />
      </>
    );
  }
  return (
    <>
      <h2>Cancellation Policy</h2>
      <p>Restaurant orders are usually prepared quickly after submission. If you need to change or cancel an order, please contact staff immediately.</p>
      <h3>Before preparation</h3>
      <p>Staff may be able to adjust or cancel the order if preparation has not started.</p>
      <h3>After preparation</h3>
      <p>Orders that are already prepared or served may not be cancellable. Refunds, if any, are handled by the restaurant according to the actual situation.</p>
      <h3>Online ordering note</h3>
      <p>This system supports ordering and restaurant workflow. Final payment, cancellation and receipt handling remain with {config.businessName}.</p>
      <ContactBlock config={config} />
    </>
  );
}

function ContactBlock({ config }: { config: LegalConfig }) {
  return (
    <div className="legal-contact-block">
      <strong>{config.businessName}</strong>
      <span>{config.businessAddress}</span>
      {config.phone ? <a href={`tel:${config.phone}`}>{config.phone}</a> : null}
      <span>{config.contactEmail}</span>
    </div>
  );
}
