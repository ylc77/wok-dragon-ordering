import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

type CookieConsent = 'accepted' | 'rejected' | 'custom';

const STORAGE_KEY = 'wok-dragon-cookie-consent';

interface CookiePreferences {
  consent: CookieConsent;
  analytics: boolean;
  marketing: boolean;
}

const defaultPreferences: CookiePreferences = {
  consent: 'rejected',
  analytics: false,
  marketing: false,
};

function readPreferences(): CookiePreferences | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? { ...defaultPreferences, ...JSON.parse(raw) } : null;
  } catch {
    return null;
  }
}

function writePreferences(next: CookiePreferences) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function CookieBanner() {
  const [visible, setVisible] = useState(false);
  const [managing, setManaging] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    const saved = readPreferences();
    if (!saved) {
      setVisible(true);
      return;
    }
    setAnalytics(saved.analytics);
    setMarketing(saved.marketing);
  }, []);

  if (!visible) return null;

  function save(next: CookiePreferences) {
    writePreferences(next);
    setVisible(false);
    setManaging(false);
  }

  return (
    <section className="cookie-banner" aria-label="Cookie preferences">
      <div>
        <strong>Cookie preferences</strong>
        <p>
          We use essential cookies to keep the website working. Analytics or marketing cookies are only enabled
          after you choose them. Read our <Link to="/cookie-policy">Cookie Policy</Link>.
        </p>
        {managing ? (
          <div className="cookie-preferences">
            <label>
              <input type="checkbox" checked disabled />
              <span>Essential cookies</span>
              <small>Required for language choice, security and basic site functions.</small>
            </label>
            <label>
              <input type="checkbox" checked={analytics} onChange={(event) => setAnalytics(event.target.checked)} />
              <span>Analytics cookies</span>
              <small>Optional. Not loaded until you allow them.</small>
            </label>
            <label>
              <input type="checkbox" checked={marketing} onChange={(event) => setMarketing(event.target.checked)} />
              <span>Marketing cookies</span>
              <small>Optional. Not loaded until you allow them.</small>
            </label>
          </div>
        ) : null}
      </div>
      <div className="cookie-actions">
        <button className="secondary-button" type="button" onClick={() => save(defaultPreferences)}>
          Reject non-essential
        </button>
        <button className="secondary-button" type="button" onClick={() => setManaging((open) => !open)}>
          Manage preferences
        </button>
        {managing ? (
          <button className="primary-button" type="button" onClick={() => save({ consent: 'custom', analytics, marketing })}>
            Save preferences
          </button>
        ) : (
          <button className="primary-button" type="button" onClick={() => save({ consent: 'accepted', analytics: true, marketing: true })}>
            Accept all
          </button>
        )}
      </div>
    </section>
  );
}
