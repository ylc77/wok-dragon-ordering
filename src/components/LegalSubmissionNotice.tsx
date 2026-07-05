import { Link } from 'react-router-dom';

interface LegalSubmissionNoticeProps {
  className?: string;
}

export function LegalSubmissionNotice({ className = '' }: LegalSubmissionNoticeProps) {
  return (
    <p className={`legal-submit-notice ${className}`.trim()}>
      By submitting, you agree to our <Link to="/terms-of-service">Terms of Service</Link> and{' '}
      <Link to="/privacy-policy">Privacy Policy</Link>.
    </p>
  );
}
