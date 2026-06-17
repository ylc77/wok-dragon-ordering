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
        introTitle: 'Γρήγορο wok, ζεστή φιλοξενία',
        introText: 'Στο Μοναστηράκι σερβίρουμε αγαπημένες ασιατικές γεύσεις για φαγητό στο κατάστημα, take away και delivery.',
        featuredTitle: 'Προτεινόμενα πιάτα',
        categoriesTitle: 'Κατηγορίες μενού',
        deliveryUnavailable: 'Δεν έχει ρυθμιστεί ακόμα',
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
        introTitle: 'Fast wok cooking, warm hospitality',
        introText: 'In Monastiraki, we serve familiar Asian flavors for dine-in, take away, and delivery.',
        featuredTitle: 'Recommended dishes',
        categoriesTitle: 'Menu categories',
        deliveryUnavailable: 'Not configured yet',
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
