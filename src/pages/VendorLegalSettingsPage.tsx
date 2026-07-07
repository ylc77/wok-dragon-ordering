import { FormEvent, useMemo, useState } from 'react';
import { ArrowLeft, KeyRound, LockKeyhole } from 'lucide-react';
import { Link } from 'react-router-dom';
import { LegalSettingsEditor } from '../components/admin/LegalSettingsEditor';
import { createVendorLegalDataSource } from '../lib/vendorLegalApi';
import '../styles/admin.css';
import '../styles/vendor-settings.css';

const VENDOR_SESSION_KEY = 'yanlc:vendor-settings-password';

export function VendorLegalSettingsPage() {
  const [password, setPassword] = useState(() => sessionStorage.getItem(VENDOR_SESSION_KEY) ?? '');
  const [unlocked, setUnlocked] = useState(() => Boolean(sessionStorage.getItem(VENDOR_SESSION_KEY)));
  const [message, setMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const dataSource = useMemo(() => createVendorLegalDataSource(password), [password]);

  async function unlock(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    try {
      await dataSource.fetchDraft();
      sessionStorage.setItem(VENDOR_SESSION_KEY, password);
      setUnlocked(true);
    } catch (error) {
      sessionStorage.removeItem(VENDOR_SESSION_KEY);
      setMessage(error instanceof Error ? error.message : '无法打开法律设置。');
    }
  }

  function showToast(text: string, type: 'success' | 'error' | 'warning' = 'success') {
    setToast({ message: text, type });
    window.setTimeout(() => setToast(null), 2800);
  }

  if (!unlocked) {
    return (
      <main className="vendor-settings-shell">
        <form className="vendor-login-card" onSubmit={unlock}>
          <span className="vendor-icon"><LockKeyhole size={26} /></span>
          <p className="vendor-eyebrow">YANLC LEGAL CONTROL</p>
          <h1>法律与商家信息</h1>
          <p>该页面仅供项目交付方维护，餐馆员工后台不会显示入口。</p>
          <label>
            维护密码
            <input autoComplete="current-password" autoFocus type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          {message ? <p className="vendor-message is-error">{message}</p> : null}
          <button type="submit" disabled={!password}><KeyRound size={17} />进入法律设置</button>
          <Link className="vendor-back-link" to="/settings"><ArrowLeft size={16} />返回版本设置</Link>
        </form>
      </main>
    );
  }

  return (
    <main className="vendor-settings-shell vendor-legal-shell">
      <div className="vendor-legal-toolbar">
        <Link className="vendor-back-link" to="/settings"><ArrowLeft size={16} />返回版本设置</Link>
        <span className="vendor-secure-badge"><LockKeyhole size={15} />供应商密码保护</span>
      </div>
      {message ? <p className="vendor-message is-error">{message}</p> : null}
      {toast ? <div className={`admin-toast ${toast.type}`}>{toast.message}</div> : null}
      <LegalSettingsEditor dataSource={dataSource} onMessage={setMessage} toast={showToast} />
    </main>
  );
}
