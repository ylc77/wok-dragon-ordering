import { FormEvent, useState } from 'react';
import { CheckCircle2, FileText, KeyRound, LockKeyhole, Save, Settings2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { DEFAULT_FEATURE_FLAGS, PLAN_PRESETS } from '../lib/featureFlags';
import type { FeatureFlags, PlanTier } from '../lib/types';
import '../styles/vendor-settings.css';

type VendorSettings = {
  id: string;
  name_zh: string | null;
  name_en: string | null;
  name_el: string | null;
  plan_tier: PlanTier;
  enable_pos: boolean;
  enable_qr_ordering: boolean;
  feature_flags: FeatureFlags;
  reservation_schema_ready: boolean;
};

const VENDOR_SESSION_KEY = 'yanlc:vendor-settings-password';

const FEATURE_LABELS: Record<keyof FeatureFlags, { title: string; description: string }> = {
  csv_import: { title: 'CSV 批量导入导出', description: '批量维护菜单和翻译内容' },
  ai_menu: { title: 'AI 菜单补全', description: '自动补全描述、英文和希腊语' },
  ai_image: { title: 'AI 菜品图片', description: '根据菜品内容生成图片' },
  data_backup: { title: '数据备份', description: '后台导出业务数据备份' },
  print_agent: { title: '本地打印助手', description: '厨房订单自动打印和状态监控' },
  reservations: { title: '在线预订', description: '顾客预订餐桌，员工在后台统一管理' },
};

async function requestSettings(password: string, action: 'read' | 'update', settings?: VendorSettings) {
  const response = await fetch('/api/vendor/features', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password, action, settings }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || '请求失败。');
  return payload.settings as VendorSettings;
}

export function VendorSettingsPage() {
  const [password, setPassword] = useState('');
  const [settings, setSettings] = useState<VendorSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function unlock(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const next = await requestSettings(password, 'read');
      sessionStorage.setItem(VENDOR_SESSION_KEY, password);
      setSettings({ ...next, feature_flags: { ...DEFAULT_FEATURE_FLAGS, ...next.feature_flags } });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '无法打开维护设置。');
    } finally {
      setLoading(false);
    }
  }

  function applyPlan(plan: PlanTier) {
    if (!settings) return;
    const preset = PLAN_PRESETS[plan];
    setSettings({
      ...settings,
      plan_tier: plan,
      enable_pos: preset.enable_pos,
      enable_qr_ordering: preset.enable_qr_ordering,
      feature_flags: { ...preset.features },
    });
    setMessage('已应用套餐预设，点击保存后生效。');
  }

  async function save() {
    if (!settings) return;
    setLoading(true);
    setMessage(null);
    try {
      const next = await requestSettings(password, 'update', settings);
      setSettings({ ...next, feature_flags: { ...DEFAULT_FEATURE_FLAGS, ...next.feature_flags } });
      setMessage('版本功能已保存。客户后台刷新后即可看到变化。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存失败。');
    } finally {
      setLoading(false);
    }
  }

  if (!settings) {
    return (
      <main className="vendor-settings-shell">
        <form className="vendor-login-card" onSubmit={unlock}>
          <span className="vendor-icon"><LockKeyhole size={26} /></span>
          <p className="vendor-eyebrow">YANLC DELIVERY CONTROL</p>
          <h1>项目版本控制</h1>
          <p>仅供交付方维护客户套餐与功能模块。</p>
          <label>维护密码<input autoComplete="current-password" autoFocus type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          {message ? <p className="vendor-message is-error">{message}</p> : null}
          <button type="submit" disabled={loading || !password}><KeyRound size={17} />{loading ? '验证中…' : '进入设置'}</button>
        </form>
      </main>
    );
  }

  const restaurantName = settings.name_zh || settings.name_en || settings.name_el || '未命名餐馆';
  return (
    <main className="vendor-settings-shell">
      <section className="vendor-settings-panel">
        <header>
          <div><p className="vendor-eyebrow">YANLC DELIVERY CONTROL</p><h1>{restaurantName}</h1><span>套餐和模块开关仅在保存后生效</span></div>
          <span className="vendor-secure-badge"><LockKeyhole size={15} />服务端验证</span>
        </header>

        <div className="vendor-section">
          <div className="vendor-section-title"><Settings2 size={19} /><div><h2>套餐版本</h2><p>选择预设后仍可单独调整功能。</p></div></div>
          <div className="vendor-plan-grid">
            {(['basic', 'standard', 'professional'] as PlanTier[]).map((plan) => (
              <button className={settings.plan_tier === plan ? 'is-selected' : ''} type="button" key={plan} onClick={() => applyPlan(plan)}>
                <strong>{{ basic: '基础版', standard: '标准版', professional: '高级版' }[plan]}</strong>
                <span>{{ basic: '官网与公开菜单', standard: '增加扫码点餐', professional: '开放全部商用模块' }[plan]}</span>
                {settings.plan_tier === plan ? <CheckCircle2 size={18} /> : null}
              </button>
            ))}
          </div>
        </div>

        {settings.feature_flags.reservations ? <div className="vendor-section">
          <div className="vendor-section-title"><Settings2 size={19} /><div><h2>预约模块交付检查</h2><p>只显示配置状态，不会显示客户 Token、Chat ID 或预约数据。</p></div></div>
          <div className="vendor-readiness-grid">
            <div className={settings.reservation_schema_ready ? 'is-ready' : 'is-pending'}><strong>预约数据库</strong><span>{settings.reservation_schema_ready ? '已初始化' : '待执行 reservations-module.sql'}</span></div>
          </div>
          {!settings.reservation_schema_ready ? <p className="vendor-readiness-note">预约功能开启前，请先在客户自己的 Supabase SQL Editor 执行 `supabase/reservations-module.sql`。</p> : null}
        </div> : null}

        <div className="vendor-section">
          <div className="vendor-section-title">
            <FileText size={19} />
            <div>
              <h2>法律与商家信息</h2>
              <p>独立维护法律主体、税号、隐私、Cookie 和订单条款，不在客户日常后台显示。</p>
            </div>
          </div>
          <Link className="vendor-legal-entry" to="/settings/legal">
            <span><strong>进入法律设置</strong><small>使用当前供应商维护密码继续</small></span>
            <FileText size={20} />
          </Link>
        </div>

        <div className="vendor-section">
          <div className="vendor-section-title"><Settings2 size={19} /><div><h2>核心点餐模块</h2><p>关闭后，客户后台对应入口和顾客入口会隐藏或停用。</p></div></div>
          <div className="vendor-toggle-grid">
            <FeatureToggle title="前台 POS 点单" description="员工人工点单、付款方式和浏览器小票" checked={settings.enable_pos} onChange={(checked) => setSettings({ ...settings, enable_pos: checked })} />
            <FeatureToggle title="扫码点餐" description="桌台二维码、顾客购物车和桌台会话" checked={settings.enable_qr_ordering} onChange={(checked) => setSettings({ ...settings, enable_qr_ordering: checked })} />
          </div>
        </div>

        <div className="vendor-section">
          <div className="vendor-section-title"><Settings2 size={19} /><div><h2>增值模块</h2><p>用于区分标准版与高级版交付内容。</p></div></div>
          <div className="vendor-toggle-grid">
            {(Object.keys(FEATURE_LABELS) as (keyof FeatureFlags)[]).map((key) => (
              <FeatureToggle key={key} {...FEATURE_LABELS[key]} checked={settings.feature_flags[key]} onChange={(checked) => setSettings({ ...settings, feature_flags: { ...settings.feature_flags, [key]: checked } })} />
            ))}
          </div>
        </div>

        {message ? <p className="vendor-message">{message}</p> : null}
        <footer><button className="vendor-save-button" type="button" disabled={loading} onClick={() => void save()}><Save size={17} />{loading ? '保存中…' : '保存版本设置'}</button></footer>
      </section>
    </main>
  );
}

function FeatureToggle({ title, description, checked, onChange }: { title: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className={`vendor-toggle-card${checked ? ' is-enabled' : ''}`}>
      <span><strong>{title}</strong><small>{description}</small></span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}
