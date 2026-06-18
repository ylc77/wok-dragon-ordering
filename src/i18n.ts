import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  el: {
    translation: {
      nav: {
        primary: 'Κύρια πλοήγηση',
        home: 'Αρχική',
        menu: 'Μενού',
        contact: 'Επικοινωνία',
      },
      common: {
        address: 'Διεύθυνση',
        openingHours: 'Ωράριο',
        viewMap: 'Χάρτης',
        delivery: 'Delivery',
        unavailable: 'Προσωρινά μη διαθέσιμο',
        loading: 'Φόρτωση...',
        empty: 'Δεν υπάρχουν διαθέσιμα πιάτα ακόμα.',
        priceNote: 'Οι τιμές μπορούν να ενημερωθούν από το προσωπικό.',
        total: 'Σύνολο',
      },
      home: {
        title: 'Wok Dragon Express',
        subtitle: 'Κινέζικη κουζίνα στο κέντρο της Αθήνας.',
        menuCta: 'Δείτε το μενού',
        orderHint: 'Σαρώστε το QR στο τραπέζι για παραγγελία.',
      },
      order: {
        table: 'Τραπέζι',
        sharedCart: 'Κοινό καλάθι',
        add: 'Προσθήκη',
        note: 'Σημείωση',
        submit: 'Υποβολή παραγγελίας',
        cartEmpty: 'Το καλάθι είναι άδειο.',
        liveCart: 'Το καλάθι συγχρονίζεται με όλες τις συσκευές στο ίδιο τραπέζι.',
        joining: 'Σύνδεση στο τραπέζι...',
        submitSuccess: 'Η παραγγελία στάλθηκε.',
        orderNumber: 'Αριθμός παραγγελίας',
        selectedCount_one: '{{count}} είδος',
        selectedCount_other: '{{count}} είδη',
        cartBarSummary_one: 'Καλάθι · {{count}} είδος · {{total}}',
        cartBarSummary_other: 'Καλάθι · {{count}} είδη · {{total}}',
      },
      platforms: {
        wolt: 'Wolt',
        efood: 'efood',
        box: 'Box',
      },
    },
  },
  en: {
    translation: {
      nav: {
        primary: 'Primary navigation',
        home: 'Home',
        menu: 'Menu',
        contact: 'Contact',
      },
      common: {
        address: 'Address',
        openingHours: 'Opening hours',
        viewMap: 'Map',
        delivery: 'Delivery',
        unavailable: 'Temporarily unavailable',
        loading: 'Loading...',
        empty: 'No dishes are available yet.',
        priceNote: 'Prices can be updated by staff.',
        total: 'Total',
      },
      home: {
        title: 'Wok Dragon Express',
        subtitle: 'Chinese food in the heart of Athens.',
        menuCta: 'View menu',
        orderHint: 'Scan the table QR code to order.',
      },
      order: {
        table: 'Table',
        sharedCart: 'Shared cart',
        add: 'Add',
        note: 'Note',
        submit: 'Submit order',
        cartEmpty: 'Your cart is empty.',
        liveCart: 'The cart syncs with every device at this table.',
        joining: 'Joining table...',
        submitSuccess: 'Order sent.',
        orderNumber: 'Order number',
        selectedCount_one: '{{count}} item',
        selectedCount_other: '{{count}} items',
        cartBarSummary_one: 'Cart · {{count}} item · {{total}}',
        cartBarSummary_other: 'Cart · {{count}} items · {{total}}',
      },
      platforms: {
        wolt: 'Wolt',
        efood: 'efood',
        box: 'Box',
      },
    },
  },
};

i18n.use(initReactI18next).init({
  resources,
  lng: 'el',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
