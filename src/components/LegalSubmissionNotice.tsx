import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

interface LegalSubmissionNoticeProps { className?: string; }

export function LegalSubmissionNotice({ className = '' }: LegalSubmissionNoticeProps) {
  const { i18n } = useTranslation();
  const lang = i18n.language?.startsWith('zh') ? 'zh' : i18n.language?.startsWith('en') ? 'en' : 'el';
  const copy = lang === 'zh' ? ['提交即表示您同意我们的', '服务条款', '和', '隐私政策', '。'] : lang === 'en' ? ['By submitting, you agree to our ', 'Terms of Service', ' and ', 'Privacy Policy', '.'] : ['Με την υποβολή συμφωνείτε με τους ', 'Όρους Χρήσης', ' και την ', 'Πολιτική Απορρήτου', '.'];
  return <p className={`legal-submit-notice ${className}`.trim()}>{copy[0]}<Link to="/terms-of-service">{copy[1]}</Link>{copy[2]}<Link to="/privacy-policy">{copy[3]}</Link>{copy[4]}</p>;
}
