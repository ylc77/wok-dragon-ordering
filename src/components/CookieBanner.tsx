import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getPublishedLegalSettings } from '../lib/publicLegalApi';

type CookieConsent = 'accepted' | 'rejected' | 'custom';

const STORAGE_KEY = 'wok-dragon-cookie-consent';

interface CookiePreferences {
  consent: CookieConsent;
  analytics: boolean;
  monitoring: boolean;
  marketing: boolean;
}

const defaultPreferences: CookiePreferences = {
  consent: 'rejected',
  analytics: false,
  monitoring: false,
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
  const [monitoring, setMonitoring] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [enabledCategories, setEnabledCategories] = useState({
    analytics: false,
    monitoring: false,
    marketing: false,
  });

  useEffect(() => {
    const saved = readPreferences();
    if (!saved) {
      setVisible(true);
    } else {
      setAnalytics(saved.analytics);
      setMonitoring(saved.monitoring);
      setMarketing(saved.marketing);
    }

    void getPublishedLegalSettings()
      .then((legal) => {
        if (!legal) return;
        setEnabledCategories({
          analytics: legal.analytics_cookies_enabled,
          monitoring: legal.error_monitoring_enabled,
          marketing: legal.advertising_cookies_enabled,
        });
      })
      .catch(() => {});

    const openPreferences = () => {
      setVisible(true);
      setManaging(true);
    };
    window.addEventListener('wok-dragon:open-cookie-preferences', openPreferences);
    return () => window.removeEventListener('wok-dragon:open-cookie-preferences', openPreferences);
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
          We use essential cookies for the website to work. Optional cookies are only enabled with your choice. Read our <Link to="/cookie-policy">Cookie Policy</Link>.
        </p>
        {managing ? (
          <div className="cookie-preferences">
            <label>
              <input type="checkbox" checked disabled />
              <span>Essential cookies</span>
              <small>Required for language choice, security and basic site functions.</small>
            </label>
            <label>
              <input type="checkbox" checked={analytics} disabled={!enabledCategories.analytics} onChange={(event) => setAnalytics(event.target.checked)} />
              <span>Analytics cookies</span>
              <small>{enabledCategories.analytics ? 'Optional. Not loaded until you allow them.' : 'Not configured for this business.'}</small>
            </label>
            <label>
              <input type="checkbox" checked={monitoring} disabled={!enabledCategories.monitoring} onChange={(event) => setMonitoring(event.target.checked)} />
              <span>Error monitoring</span>
              <small>{enabledCategories.monitoring ? 'Optional. Not loaded until you allow it.' : 'Not configured for this business.'}</small>
            </label>
            <label>
              <input type="checkbox" checked={marketing} disabled={!enabledCategories.marketing} onChange={(event) => setMarketing(event.target.checked)} />
              <span>Marketing cookies</span>
              <small>{enabledCategories.marketing ? 'Optional. Not loaded until you allow them.' : 'Not configured for this business.'}</small>
            </label>
          </div>
        ) : null}
      </div>
      <div className="cookie-actions">
        <button className="secondary-button" type="button" onClick={() => save(defaultPreferences)}>
          Reject non-essential
        </button>
        <button className="cookie-manage-button" type="button" onClick={() => setManaging((open) => !open)}>
          Manage preferences
        </button>
        {managing ? (
          <button className="primary-button" type="button" onClick={() => save({ consent: 'custom', analytics, monitoring, marketing })}>
            Save preferences
          </button>
        ) : (
          <button className="primary-button" type="button" onClick={() => save({
            consent: 'accepted',
            analytics: enabledCategories.analytics,
            monitoring: enabledCategories.monitoring,
            marketing: enabledCategories.marketing,
          })}>
            Accept all
          </button>
        )}
      </div>
    </section>
  );
}
