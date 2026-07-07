import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, FileText, Save, ShieldCheck } from 'lucide-react';
import { fetchLegalSettingsDraft, fetchLegalVersions, publishLegalSettings, saveLegalSettingsDraft } from '../../lib/adminLegalApi';
import {
  enabledServiceNames,
  normalizeLegalSettings,
  serviceLabels,
  validateLegalSettingsForPublish,
} from '../../lib/legalTypes';
import type { LegalSettings, LegalSettingsVersion, LegalServiceFlags } from '../../lib/legalTypes';

type Props = {
  onMessage: (value: string | null) => void;
  toast: (msg: string, type?: 'success' | 'error' | 'warning') => void;
  dataSource?: LegalSettingsDataSource;
};

export type LegalSettingsDataSource = {
  fetchDraft: () => Promise<LegalSettings>;
  fetchVersions: () => Promise<LegalSettingsVersion[]>;
  saveDraft: (settings: LegalSettings) => Promise<LegalSettings>;
  publish: (settings: LegalSettings) => Promise<LegalSettingsVersion>;
};

const adminDataSource: LegalSettingsDataSource = {
  fetchDraft: fetchLegalSettingsDraft,
  fetchVersions: fetchLegalVersions,
  saveDraft: saveLegalSettingsDraft,
  publish: publishLegalSettings,
};

const serviceGroups: Array<{ title: string; keys: Array<keyof LegalServiceFlags> }> = [
  { title: '基础服务', keys: ['supabase', 'vercel'] },
  { title: '支付方式 / 支付服务', keys: ['cash', 'pos', 'stripe', 'viva'] },
  { title: '分析 / 监控', keys: ['posthog', 'sentry'] },
  { title: 'AI 服务', keys: ['deepseek', 'openai'] },
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function Field({ label, value, onChange, type = 'text', required = false }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="field-label">
      {label}{required ? <span className="required-mark"> *</span> : null}
      <input className="field-input" value={value} type={type} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function TextArea({ label, value, onChange, rows = 4 }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}) {
  return (
    <label className="field-label">
      {label}
      <textarea className="field-input legal-textarea" rows={rows} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

export function LegalSettingsEditor({ onMessage, toast, dataSource = adminDataSource }: Props) {
  const [settings, setSettings] = useState<LegalSettings>(() => normalizeLegalSettings(null));
  const [versions, setVersions] = useState<LegalSettingsVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const missingFields = useMemo(() => validateLegalSettingsForPublish(settings), [settings]);
  const readyToPublish = missingFields.length === 0;

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const [draft, versionRows] = await Promise.all([
        dataSource.fetchDraft(),
        dataSource.fetchVersions(),
      ]);
      setSettings(draft);
      setVersions(versionRows);
      onMessage(null);
    } catch (err) {
      onMessage(err instanceof Error ? err.message : '法律页面配置加载失败');
    } finally {
      setLoading(false);
    }
  }

  function update<K extends keyof LegalSettings>(key: K, value: LegalSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function updateService(key: keyof LegalServiceFlags, value: boolean) {
    setSettings((current) => ({
      ...current,
      service_flags: { ...current.service_flags, [key]: value },
    }));
  }

  async function saveDraft() {
    setSaving(true);
    try {
      const saved = await dataSource.saveDraft(settings);
      setSettings(saved);
      toast('法律信息草稿已保存');
      onMessage(null);
    } catch (err) {
      onMessage(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    const missing = validateLegalSettingsForPublish(settings);
    if (missing.length > 0) {
      onMessage(`法律信息未完成，不能发布：${missing.join('、')}`);
      toast('法律信息未完成，不建议正式商用上线', 'warning');
      return;
    }
    setPublishing(true);
    try {
      const version = await dataSource.publish(settings);
      setSettings(version.snapshot);
      setVersions(await dataSource.fetchVersions());
      toast(`法律配置已发布：${version.version_no}`);
      onMessage(null);
    } catch (err) {
      onMessage(err instanceof Error ? err.message : '发布失败');
    } finally {
      setPublishing(false);
    }
  }

  if (loading) {
    return (
      <section>
        <div className="admin-section-header">
          <div>
            <h1>法律与商家信息设置</h1>
            <p className="admin-section-subtitle">正在加载配置...</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="admin-section-header legal-settings-header">
        <div>
          <h1>法律与商家信息设置</h1>
          <p className="admin-section-subtitle">用于 Privacy Policy、Terms、Cookie Policy、Contact、Cancellation / Refund 页面。</p>
        </div>
        <div className="legal-header-actions">
          <Link className="secondary-button" to="/privacy-policy" target="_blank">
            <FileText size={16} /> 预览法律页面
          </Link>
          <button className="secondary-button" type="button" onClick={saveDraft} disabled={saving}>
            <Save size={16} /> {saving ? '保存中...' : '保存草稿'}
          </button>
          <button className="primary-button" type="button" onClick={publish} disabled={publishing}>
            <ShieldCheck size={16} /> {publishing ? '发布中...' : '发布法律配置'}
          </button>
        </div>
      </div>

      {!readyToPublish ? (
        <div className="admin-message legal-warning">
          <strong>法律信息未完成，不建议正式商用上线。</strong>
          <span>缺少：{missingFields.join('、')}</span>
        </div>
      ) : (
        <div className="admin-message legal-ready">
          <CheckCircle2 size={18} />
          <span>必填信息和客户确认已完成，可以发布新的法律版本。</span>
        </div>
      )}

      <div className="settings-card">
        <div className="settings-card-head">
          <h3>发布状态</h3>
          <p className="settings-card-desc">普通保存不会生成版本；只有点击“发布法律配置”才会生成 v1、v2、v3。</p>
        </div>
        <div className="legal-status-grid">
          <div><span>当前状态</span><strong>{settings.status === 'published' ? '已发布' : '草稿'}</strong></div>
          <div><span>当前版本</span><strong>{settings.current_version || '未发布'}</strong></div>
          <div><span>最近发布时间</span><strong>{settings.last_published_at ? new Date(settings.last_published_at).toLocaleString('zh-CN') : '暂无'}</strong></div>
        </div>
        {versions.length > 0 ? (
          <div className="legal-version-list">
            {versions.map((version) => (
              <span key={version.id} className={version.is_current ? 'current' : ''}>
                {version.version_no} · {new Date(version.published_at).toLocaleString('zh-CN')}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="settings-card">
        <div className="settings-card-head"><h3>商家身份信息</h3></div>
        <div className="settings-grid-2">
          <Field label="商家展示名称" value={settings.business_name} required onChange={(v) => update('business_name', v)} />
          <Field label="法律主体名称" value={settings.legal_name} required onChange={(v) => update('legal_name', v)} />
          <Field label="营业地址" value={settings.business_address} required onChange={(v) => update('business_address', v)} />
          <Field label="VAT / AFM 税号" value={settings.vat_number} required onChange={(v) => update('vat_number', v)} />
          <Field label="GEMI 注册号" value={settings.gemi_number} onChange={(v) => update('gemi_number', v)} />
          <Field label="所在国家" value={settings.country} onChange={(v) => update('country', v)} />
          <Field label="联系电话" value={settings.phone} required onChange={(v) => update('phone', v)} />
          <Field label="联系邮箱" value={settings.contact_email} type="email" required onChange={(v) => update('contact_email', v)} />
        </div>
      </div>

      <div className="settings-card">
        <div className="settings-card-head"><h3>数据控制者信息</h3></div>
        <div className="settings-grid-2">
          <Field label="数据控制者名称" value={settings.data_controller_name} onChange={(v) => update('data_controller_name', v)} />
          <Field label="数据控制者地址" value={settings.data_controller_address} onChange={(v) => update('data_controller_address', v)} />
          <Field label="隐私请求联系邮箱" value={settings.privacy_request_email} type="email" onChange={(v) => update('privacy_request_email', v)} />
          <Field label="最后更新时间" value={settings.last_updated} type="date" required onChange={(v) => update('last_updated', v || today())} />
        </div>
        <TextArea label="客户如何申请更正或删除个人信息" value={settings.privacy_request_instructions} onChange={(v) => update('privacy_request_instructions', v)} />
      </div>

      <div className="settings-card">
        <div className="settings-card-head"><h3>第三方服务</h3><p className="settings-card-desc">只勾选实际启用的服务。未勾选的服务不会显示在前台法律页面。</p></div>
        <div className="legal-service-grid">
          {serviceGroups.map((group) => (
            <div key={group.title} className="legal-check-card">
              <strong>{group.title}</strong>
              {group.keys.map((key) => (
                <label key={key}>
                  <input type="checkbox" checked={settings.service_flags[key]} onChange={(event) => updateService(key, event.target.checked)} />
                  <span>{serviceLabels[key]}</span>
                </label>
              ))}
            </div>
          ))}
        </div>
        <TextArea label="其他服务商说明" value={settings.other_service_notes} rows={2} onChange={(v) => update('other_service_notes', v)} />
        <p className="settings-card-desc">当前前台会显示：{enabledServiceNames(settings).join('、') || '暂无第三方服务'}</p>
      </div>

      <div className="settings-card">
        <div className="settings-card-head"><h3>Cookie 设置</h3></div>
        <TextArea label="技术必需 Cookie / 本地存储说明" value={settings.essential_cookie_note} onChange={(v) => update('essential_cookie_note', v)} />
        <div className="legal-service-grid">
          <label className="settings-checkbox-row"><input type="checkbox" checked={settings.analytics_cookies_enabled} onChange={(e) => update('analytics_cookies_enabled', e.target.checked)} />分析 Cookie 已启用</label>
          <label className="settings-checkbox-row"><input type="checkbox" checked={settings.error_monitoring_enabled} onChange={(e) => update('error_monitoring_enabled', e.target.checked)} />错误监控已启用</label>
          <label className="settings-checkbox-row"><input type="checkbox" checked={settings.advertising_cookies_enabled} onChange={(e) => update('advertising_cookies_enabled', e.target.checked)} />广告或追踪 Cookie 已启用</label>
        </div>
        <Field label="Cookie 最后更新时间" value={settings.cookie_last_updated} type="date" onChange={(v) => update('cookie_last_updated', v || today())} />
      </div>

      <div className="settings-card">
        <div className="settings-card-head"><h3>餐馆项目专用条款</h3></div>
        <TextArea label="订单条款" value={settings.order_terms} onChange={(v) => update('order_terms', v)} />
        <TextArea label="取消订单规则" value={settings.cancellation_policy} onChange={(v) => update('cancellation_policy', v)} />
        <TextArea label="付款规则" value={settings.payment_terms} onChange={(v) => update('payment_terms', v)} />
        <TextArea label="过敏原 / 菜品供应变动免责声明" value={settings.allergen_disclaimer} onChange={(v) => update('allergen_disclaimer', v)} />
        <TextArea label="厨房小票不是正式税务发票说明" value={settings.kitchen_receipt_disclaimer} onChange={(v) => update('kitchen_receipt_disclaimer', v)} />
        <TextArea label="正式收据开具说明" value={settings.official_receipt_disclaimer} onChange={(v) => update('official_receipt_disclaimer', v)} />
      </div>

      <div className="settings-card">
        <div className="settings-card-head"><h3>服装 / 零售项目预留条款</h3></div>
        <TextArea label="配送政策" value={settings.shipping_policy} onChange={(v) => update('shipping_policy', v)} />
        <TextArea label="退货政策" value={settings.return_policy} onChange={(v) => update('return_policy', v)} />
        <TextArea label="退款政策" value={settings.refund_policy} onChange={(v) => update('refund_policy', v)} />
        <TextArea label="14 天撤回权说明" value={settings.withdrawal_right} onChange={(v) => update('withdrawal_right', v)} />
        <Field label="退货地址" value={settings.return_address} onChange={(v) => update('return_address', v)} />
        <TextArea label="退货运费责任" value={settings.return_shipping_responsibility} rows={2} onChange={(v) => update('return_shipping_responsibility', v)} />
        <TextArea label="不支持退换的商品说明" value={settings.excluded_return_items} rows={2} onChange={(v) => update('excluded_return_items', v)} />
      </div>

      <div className="settings-card">
        <div className="settings-card-head"><h3>页脚链接检查</h3></div>
        <div className="legal-link-checks">
          {[
            ['/privacy-policy', 'Privacy Policy'],
            ['/terms-of-service', 'Terms of Service'],
            ['/cookie-policy', 'Cookie Policy'],
            ['/contact', 'Contact'],
            ['/cancellation-policy', 'Cancellation Policy'],
            ['/refund-policy', 'Refund Policy'],
          ].map(([href, label]) => (
            <Link key={href} to={href} target="_blank"><CheckCircle2 size={15} />{label}</Link>
          ))}
        </div>
        <p className="settings-card-desc">表单提交提示已在登录、扫码购物车和 POS 提交区域显示。</p>
      </div>

      <div className="settings-card">
        <div className="settings-card-head"><h3>客户最终确认</h3><p className="settings-card-desc">未全部勾选时不能发布为正式法律版本。</p></div>
        <div className="legal-confirm-grid">
          {[
            ['identity_confirmed', '已确认商家身份信息'],
            ['payment_wording_confirmed', '已确认付款相关文案'],
            ['policy_wording_confirmed', '已确认配送 / 取消 / 退款相关文案'],
            ['third_party_services_confirmed', '已确认实际启用的第三方服务'],
            ['template_notice_confirmed', '已知晓这些页面是基础法律页面模板，不能替代律师、会计师或当地合规专业人士的正式意见'],
          ].map(([key, label]) => (
            <label key={key} className="settings-checkbox-row">
              <input
                type="checkbox"
                checked={Boolean(settings.confirmations[key as keyof typeof settings.confirmations])}
                onChange={(event) => update('confirmations', { ...settings.confirmations, [key]: event.target.checked })}
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      <div className="settings-save-bar">
        <span className="settings-save-hint">普通保存为草稿；发布后前台法律页面才会读取新版本。</span>
        <div className="legal-header-actions">
          <button className="secondary-button" type="button" onClick={saveDraft} disabled={saving}>
            <Save size={16} /> 保存草稿
          </button>
          <button className="primary-button" type="button" onClick={publish} disabled={publishing}>
            <ShieldCheck size={16} /> 发布法律配置
          </button>
        </div>
      </div>
    </section>
  );
}
