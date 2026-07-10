import { FormEvent, useEffect, useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, Clock3, MapPin, Phone, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LegalSubmissionNotice } from '../components/LegalSubmissionNotice';
import { getPublicRestaurantSettings } from '../lib/publicRestaurantApi';
import { createReservation, getPublicReservationSettings, getReservationSlots } from '../lib/reservationApi';
import type { ReservationSettings, ReservationSlot, RestaurantSettings } from '../lib/types';

type Locale = 'zh' | 'en' | 'el';
type Copy = Record<'eyebrow' | 'title' | 'intro' | 'date' | 'time' | 'party' | 'name' | 'phone' | 'note' | 'noteHint' | 'submit' | 'checking' | 'noSlots' | 'unavailable' | 'success' | 'successText' | 'reference' | 'contact' | 'required' | 'retry' | 'details' | 'hours' | 'address' | 'modify', string>;

const COPY: Record<Locale, Copy> = {
  zh: {
    eyebrow: '在线预订', title: '为这一餐留好座位', intro: '选择到店日期、时间和人数。确认后，我们会在后台为您保留这张餐桌。',
    date: '到店日期', time: '选择时段', party: '用餐人数', name: '您的姓名', phone: '联系电话', note: '备注（可选）', noteHint: '例如儿童座椅、过敏原提醒或特殊需求',
    submit: '确认预订', checking: '正在查询可预订时段…', noSlots: '这一天暂时没有可订时段，请选择其他日期或直接联系我们。', unavailable: '当前暂未开放在线预订，请直接联系餐馆。',
    success: '预订已确认', successText: '您的预订已进入餐馆后台。需要修改或取消时，请直接致电或通过 WhatsApp 联系餐馆。', reference: '预订编号', contact: '致电餐馆', required: '请填写姓名、电话、日期、时段和人数。', retry: '暂时无法完成操作，请稍后重试。',
    details: '餐馆信息', hours: '营业时间', address: '地址', modify: '修改或取消预订',
  },
  en: {
    eyebrow: 'ONLINE RESERVATION', title: 'Save your table for the meal ahead', intro: 'Choose your date, arrival time, and party size. Your booking will be confirmed straight away.',
    date: 'Date', time: 'Choose a time', party: 'Guests', name: 'Your name', phone: 'Phone number', note: 'Note (optional)', noteHint: 'High chair, allergy note, or a special request',
    submit: 'Confirm reservation', checking: 'Checking available times…', noSlots: 'There are no available times on this date. Please choose another day or contact us directly.', unavailable: 'Online reservations are not available at the moment. Please contact the restaurant directly.',
    success: 'Reservation confirmed', successText: 'Your reservation is now in the restaurant dashboard. To change or cancel it, please call or message us on WhatsApp.', reference: 'Reservation reference', contact: 'Call the restaurant', required: 'Please complete your name, phone number, date, time, and party size.', retry: 'We could not complete that just now. Please try again shortly.',
    details: 'Restaurant details', hours: 'Opening hours', address: 'Address', modify: 'Change or cancel your reservation',
  },
  el: {
    eyebrow: 'ONLINE ΚΡΑΤΗΣΗ', title: 'Κρατήστε το τραπέζι σας', intro: 'Επιλέξτε ημερομηνία, ώρα άφιξης και αριθμό ατόμων. Η κράτησή σας επιβεβαιώνεται αμέσως.',
    date: 'Ημερομηνία', time: 'Επιλέξτε ώρα', party: 'Άτομα', name: 'Ονοματεπώνυμο', phone: 'Τηλέφωνο', note: 'Σημείωση (προαιρετικό)', noteHint: 'Παιδικό κάθισμα, αλλεργίες ή ειδικό αίτημα',
    submit: 'Επιβεβαίωση κράτησης', checking: 'Έλεγχος διαθέσιμων ωρών…', noSlots: 'Δεν υπάρχουν διαθέσιμες ώρες για αυτή την ημερομηνία. Επιλέξτε άλλη ημέρα ή επικοινωνήστε μαζί μας.', unavailable: 'Οι online κρατήσεις δεν είναι διαθέσιμες αυτή τη στιγμή. Επικοινωνήστε απευθείας με το εστιατόριο.',
    success: 'Η κράτηση επιβεβαιώθηκε', successText: 'Η κράτησή σας εμφανίζεται πλέον στο σύστημα του εστιατορίου. Για αλλαγή ή ακύρωση, καλέστε μας ή στείλτε μήνυμα στο WhatsApp.', reference: 'Κωδικός κράτησης', contact: 'Καλέστε το εστιατόριο', required: 'Συμπληρώστε όνομα, τηλέφωνο, ημερομηνία, ώρα και αριθμό ατόμων.', retry: 'Δεν ήταν δυνατή η ολοκλήρωση. Δοκιμάστε ξανά σε λίγο.',
    details: 'Στοιχεία εστιατορίου', hours: 'Ωράριο λειτουργίας', address: 'Διεύθυνση', modify: 'Αλλαγή ή ακύρωση κράτησης',
  },
};

function todayAthens() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Athens', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function localeFrom(language?: string): Locale {
  return language?.startsWith('zh') ? 'zh' : language?.startsWith('en') ? 'en' : 'el';
}

export function ReservationPage() {
  const { i18n } = useTranslation();
  const lang = localeFrom(i18n.language);
  const copy = COPY[lang];
  const [settings, setSettings] = useState<ReservationSettings | null>(null);
  const [restaurant, setRestaurant] = useState<RestaurantSettings | null>(null);
  const [date, setDate] = useState(todayAthens());
  const [slots, setSlots] = useState<ReservationSlot[]>([]);
  const [time, setTime] = useState('');
  const [partySize, setPartySize] = useState(2);
  const [guestName, setGuestName] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);

  const dateMax = useMemo(() => {
    if (!settings) return '';
    const target = new Date(`${todayAthens()}T12:00:00`);
    target.setDate(target.getDate() + settings.max_advance_days);
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Athens', year: 'numeric', month: '2-digit', day: '2-digit' }).format(target);
  }, [settings]);

  useEffect(() => {
    let active = true;
    void Promise.all([getPublicReservationSettings(), getPublicRestaurantSettings()])
      .then(([reservationSettings, restaurantSettings]) => {
        if (!active) return;
        setSettings(reservationSettings);
        setRestaurant(restaurantSettings);
      })
      .catch(() => active && setError(COPY[localeFrom(i18n.language)].retry))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [i18n.language]);

  useEffect(() => {
    if (!settings?.is_enabled || !date) return;
    let active = true;
    setTime('');
    setSlots([]);
    void getReservationSlots(date)
      .then((next) => active && setSlots(next))
      .catch(() => active && setError(copy.retry));
    return () => { active = false; };
  }, [copy.retry, date, settings?.id, settings?.is_enabled]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!date || !time || !guestName.trim() || !phone.trim() || partySize < 1) {
      setError(copy.required);
      return;
    }
    setSubmitting(true);
    try {
      const result = await createReservation({ date, time, partySize, guestName, phone, note });
      setReference(result.reference_code);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : copy.retry);
      void getReservationSlots(date).then(setSlots).catch(() => undefined);
    } finally {
      setSubmitting(false);
    }
  }

  const restaurantName = restaurant?.name_en || restaurant?.name_el || restaurant?.name_zh;
  const activeSlots = slots.filter((slot) => slot.remaining_capacity >= partySize);

  if (reference) {
    return <main className="reservation-page"><section className="reservation-success-card">
      <CheckCircle2 size={44} aria-hidden="true" />
      <p className="reservation-eyebrow">{copy.eyebrow}</p><h1>{copy.success}</h1><p>{copy.successText}</p>
      <strong>{copy.reference}: {reference}</strong>
      <div className="reservation-contact-actions">
        {restaurant?.phone ? <a className="primary-button" href={`tel:${restaurant.phone}`}><Phone size={17} />{copy.contact}</a> : null}
        {restaurant?.whatsapp_url ? <a className="secondary-button" href={restaurant.whatsapp_url} target="_blank" rel="noreferrer">WhatsApp</a> : null}
      </div>
      <p className="reservation-success-note">{copy.modify}</p>
    </section></main>;
  }

  return <main className="reservation-page">
    <section className="reservation-hero">
      <p className="reservation-eyebrow">{copy.eyebrow}</p><h1>{copy.title}</h1><p>{copy.intro}</p>
      <div className="reservation-hero-points"><span><CalendarDays size={16} />{copy.date}</span><span><Clock3 size={16} />{copy.time}</span><span><Users size={16} />{copy.party}</span></div>
    </section>
    <section className="reservation-layout">
      <form className="reservation-form" onSubmit={submit}>
        <div className="reservation-field-grid">
          <label><span><CalendarDays size={16} />{copy.date}</span><input type="date" value={date} min={todayAthens()} max={dateMax} onChange={(event) => setDate(event.target.value)} required /></label>
          <label><span><Users size={16} />{copy.party}</span><select value={partySize} onChange={(event) => setPartySize(Number(event.target.value))}>{Array.from({ length: settings?.max_party_size ?? 12 }, (_, index) => index + 1).map((size) => <option key={size} value={size}>{size}</option>)}</select></label>
        </div>
        <fieldset className="reservation-slots"><legend><Clock3 size={16} />{copy.time}</legend>
          {loading ? <p>{copy.checking}</p> : !settings?.is_enabled ? <p>{copy.unavailable}</p> : activeSlots.length ? <div>{activeSlots.map((slot) => <button type="button" key={slot.slot_time} className={time === slot.slot_time ? 'selected' : ''} onClick={() => setTime(slot.slot_time)}>{slot.slot_time.slice(0, 5)}</button>)}</div> : <p>{copy.noSlots}</p>}
        </fieldset>
        <div className="reservation-field-grid">
          <label><span>{copy.name}</span><input autoComplete="name" value={guestName} onChange={(event) => setGuestName(event.target.value)} required /></label>
          <label><span>{copy.phone}</span><input type="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} required /></label>
        </div>
        <label><span>{copy.note}</span><textarea value={note} placeholder={copy.noteHint} rows={3} onChange={(event) => setNote(event.target.value)} /></label>
        {error ? <p className="error-text">{error}</p> : null}
        <LegalSubmissionNotice />
        <button className="primary-button reservation-submit" disabled={submitting || !settings?.is_enabled} type="submit">{submitting ? copy.checking : copy.submit}</button>
      </form>
      <aside className="reservation-aside"><p className="reservation-aside-label">{copy.details}</p><strong>{restaurantName}</strong>
        {restaurant?.opening_hours_en || restaurant?.opening_hours_el || restaurant?.opening_hours_zh ? <p><Clock3 size={16} /><span><b>{copy.hours}</b>{restaurant.opening_hours_en || restaurant.opening_hours_el || restaurant.opening_hours_zh}</span></p> : null}
        {restaurant?.address_en || restaurant?.address_el || restaurant?.address_zh ? <p><MapPin size={16} /><span><b>{copy.address}</b>{restaurant.address_en || restaurant.address_el || restaurant.address_zh}</span></p> : null}
      </aside>
    </section>
  </main>;
}
