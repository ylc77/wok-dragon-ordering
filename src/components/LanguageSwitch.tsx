import { useTranslation } from 'react-i18next';

export function LanguageSwitch({ className = 'icon-text-button' }: { className?: string }) {
  const { i18n } = useTranslation();
  const current = i18n.language?.startsWith('el') ? 'el' : 'en';
  const next = current === 'el' ? 'en' : 'el';

  return (
    <button className={className} type="button" title={next === 'en' ? 'English' : 'Ελληνικά'} onClick={() => i18n.changeLanguage(next)}>
      {current === 'el' ? <GreekFlag /> : <BritishFlag />}
      <span>{current.toUpperCase()}</span>
    </button>
  );
}

function BritishFlag() {
  return (
    <svg className="language-flag" viewBox="0 0 28 18" aria-hidden="true">
      <rect width="28" height="18" fill="#21468b" />
      <path d="M0 0 28 18M28 0 0 18" stroke="#fff" strokeWidth="5" />
      <path d="M0 0 28 18M28 0 0 18" stroke="#cf142b" strokeWidth="2" />
      <path d="M14 0V18M0 9H28" stroke="#fff" strokeWidth="6" />
      <path d="M14 0V18M0 9H28" stroke="#cf142b" strokeWidth="3" />
    </svg>
  );
}

function GreekFlag() {
  return (
    <svg className="language-flag" viewBox="0 0 27 18" aria-hidden="true">
      <rect width="27" height="18" fill="#0d5eaf" />
      <path d="M0 2H27M0 6H27M0 10H27M0 14H27M0 18H27" stroke="#fff" strokeWidth="2" />
      <rect width="10" height="10" fill="#0d5eaf" />
      <path d="M5 0V10M0 5H10" stroke="#fff" strokeWidth="2" />
    </svg>
  );
}
