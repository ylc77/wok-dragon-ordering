import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, Phone, RefreshCw, UserRound, Users } from 'lucide-react';
import { getAdminReservations, getPublicReservationSettings, updateReservationSettings, updateReservationStatus } from '../../lib/reservationApi';
import type { Reservation, ReservationSettings, ReservationStatus } from '../../lib/types';

const STATUS_LABEL: Record<ReservationStatus, string> = { confirmed: '已确认', arrived: '已到店', completed: '已完成', cancelled: '已取消', no_show: '未到店' };

export function ReservationManager({ toast }: { toast: (message: string, type?: 'success' | 'error' | 'warning') => void }) {
  const [rows, setRows] = useState<Reservation[]>([]);
  const [settings, setSettings] = useState<ReservationSettings | null>(null);
  const [filter, setFilter] = useState<'today' | 'upcoming' | ReservationStatus | 'all'>('upcoming');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [nextRows, nextSettings] = await Promise.all([getAdminReservations(), getPublicReservationSettings()]);
      setRows(nextRows); setSettings(nextSettings);
    } catch (error) { toast(error instanceof Error ? error.message : '加载预订失败', 'error'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  const visibleRows = useMemo(() => {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Athens' });
    if (filter === 'all') return rows;
    if (filter === 'today') return rows.filter((row) => row.reservation_date === today);
    if (filter === 'upcoming') return rows.filter((row) => row.status === 'confirmed' && row.reservation_date >= today);
    return rows.filter((row) => row.status === filter);
  }, [filter, rows]);

  async function updateStatus(row: Reservation, status: ReservationStatus) {
    try { await updateReservationStatus(row.id, status); toast(`预订 ${row.reference_code} 已更新为“${STATUS_LABEL[status]}”`); void load(); }
    catch (error) { toast(error instanceof Error ? error.message : '更新状态失败', 'error'); }
  }
  async function saveSettings() {
    if (!settings) return;
    if (settings.close_time <= settings.open_time || settings.capacity_per_slot < 1 || settings.max_party_size < 1) { toast('请检查预订时间与容量设置', 'warning'); return; }
    setSaving(true);
    try { await updateReservationSettings(settings); toast('预订设置已保存'); }
    catch (error) { toast(error instanceof Error ? error.message : '保存失败', 'error'); }
    finally { setSaving(false); }
  }

  return <section className="admin-section reservation-admin-section">
    <header className="admin-section-head"><div><p className="admin-eyebrow">RESERVATIONS</p><h1>预订管理</h1><p>线上预订会自动确认；员工可在这里跟进到店、完成、取消和未到店状态。</p></div><button className="secondary-button" type="button" onClick={() => void load()}><RefreshCw size={16} />刷新</button></header>
    {settings ? <section className="admin-panel-card reservation-settings-card"><div className="reservation-settings-head"><div><h2>在线预订设置</h2><p>{settings.is_enabled ? '顾客可以在前台预订餐桌，预订会进入本页列表。' : '在线预订已关闭，前台将提示顾客直接联系餐馆。'}</p></div><label className="settings-payment-label"><input type="checkbox" checked={settings.is_enabled} onChange={(event) => setSettings({ ...settings, is_enabled: event.target.checked })} />开放预订</label></div><div className="settings-grid-3"><label>开始时间<input type="time" value={settings.open_time} onChange={(event) => setSettings({ ...settings, open_time: event.target.value })} /></label><label>结束时间<input type="time" value={settings.close_time} onChange={(event) => setSettings({ ...settings, close_time: event.target.value })} /></label><label>时段间隔（分钟）<input type="number" min="15" max="120" value={settings.slot_interval_minutes} onChange={(event) => setSettings({ ...settings, slot_interval_minutes: Number(event.target.value) })} /></label><label>每时段总人数上限<input type="number" min="1" value={settings.capacity_per_slot} onChange={(event) => setSettings({ ...settings, capacity_per_slot: Number(event.target.value) })} /></label><label>单次最多人数<input type="number" min="1" value={settings.max_party_size} onChange={(event) => setSettings({ ...settings, max_party_size: Number(event.target.value) })} /></label><label>最多提前预订（天）<input type="number" min="1" max="365" value={settings.max_advance_days} onChange={(event) => setSettings({ ...settings, max_advance_days: Number(event.target.value) })} /></label><label>当天至少提前（分钟）<input type="number" min="0" max="10080" value={settings.minimum_notice_minutes} onChange={(event) => setSettings({ ...settings, minimum_notice_minutes: Number(event.target.value) })} /></label></div><button className="primary-button" type="button" disabled={saving} onClick={() => void saveSettings()}><Check size={16} />{saving ? '正在保存…' : '保存预订设置'}</button></section> : null}
    <div className="admin-filter-row"><button className={filter === 'today' ? 'active' : ''} onClick={() => setFilter('today')}>今日</button><button className={filter === 'upcoming' ? 'active' : ''} onClick={() => setFilter('upcoming')}>即将到店</button><button className={filter === 'confirmed' ? 'active' : ''} onClick={() => setFilter('confirmed')}>已确认</button><button className={filter === 'arrived' ? 'active' : ''} onClick={() => setFilter('arrived')}>已到店</button><button className={filter === 'completed' ? 'active' : ''} onClick={() => setFilter('completed')}>已完成</button><button className={filter === 'cancelled' ? 'active' : ''} onClick={() => setFilter('cancelled')}>已取消</button><button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>全部</button></div>
    <div className="reservation-admin-list">{loading ? <p className="admin-message-muted">正在加载预订…</p> : visibleRows.length ? visibleRows.map((row) => <article className="reservation-admin-row" key={row.id}><div className="reservation-admin-time"><CalendarDays size={18} /><strong>{row.reservation_date}</strong><span>{row.reservation_time.slice(0, 5)}</span></div><div><strong><UserRound size={15} /> {row.guest_name}</strong><span><Users size={15} /> {row.party_size} 人</span><a href={`tel:${row.phone}`}><Phone size={15} /> {row.phone}</a>{row.note ? <small>{row.note}</small> : null}</div><div className={`reservation-status status-${row.status}`}>{STATUS_LABEL[row.status]}<small>{row.reference_code}</small></div><div className="reservation-admin-actions">{row.status === 'confirmed' ? <><button onClick={() => void updateStatus(row, 'arrived')}>已到店</button><button className="danger" onClick={() => void updateStatus(row, 'cancelled')}>取消</button><button onClick={() => void updateStatus(row, 'no_show')}>未到店</button></> : row.status === 'arrived' ? <><button onClick={() => void updateStatus(row, 'completed')}>已完成</button><button className="danger" onClick={() => void updateStatus(row, 'cancelled')}>取消</button></> : <button onClick={() => void updateStatus(row, 'confirmed')}>恢复确认</button>}</div></article>) : <p className="admin-message-muted">没有符合条件的预订。</p>}</div>
  </section>;
}
