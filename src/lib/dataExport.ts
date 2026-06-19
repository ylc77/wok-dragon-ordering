import type { SupabaseClient } from '@supabase/supabase-js';

/** 转义 CSV 字段：处理逗号、双引号、换行 */
function escapeCSV(value: string): string {
  if (!value) return '';
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/** 将对象数组转为 CSV 字符串 */
export function exportRowsToCSV(
  rows: Record<string, unknown>[],
  columns: string[],
): string {
  if (rows.length === 0) return columns.map(escapeCSV).join(',') + '\n';
  const header = columns.map(escapeCSV).join(',');
  const body = rows.map((row) =>
    columns.map((col) => escapeCSV(String(row[col] ?? ''))).join(','),
  );
  return [header, ...body].join('\n');
}

/** 将对象数组转为美化的 JSON 字符串 */
export function exportRowsToJSON(rows: Record<string, unknown>[]): string {
  return JSON.stringify(rows, null, 2);
}

/** 触发浏览器下载文件 */
export function downloadFile(
  content: string,
  filename: string,
  mimeType: string,
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** 生成备份文件名 */
export function generateBackupFilename(format: 'csv' | 'json'): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const ts = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    'T',
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join('-');
  return `restaurant-backup-${ts}.${format}`;
}

interface DateRange {
  column: string;
  from?: string;
  to?: string;
}

/** 分页获取全表数据，支持可选的日期范围筛选 */
async function fetchAllRows(
  client: SupabaseClient,
  table: string,
  select = '*',
  orderColumn?: string,
  orderAscending?: boolean,
  isDeletedNull = false,
  limit = 1000,
  dateRange?: DateRange,
): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  let cursor = 0;

  while (true) {
    let query = client.from(table).select(select, { count: 'exact' });
    if (isDeletedNull) query = query.is('deleted_at', null);
    if (dateRange?.from) query = query.gte(dateRange.column, dateRange.from);
    if (dateRange?.to) query = query.lte(dateRange.column, dateRange.to);
    if (orderColumn) {
      query = query.order(orderColumn, {
        ascending: orderAscending ?? true,
      });
    }
    query = query.range(cursor, cursor + limit - 1);
    const { data, error } = await query;
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as unknown as Record<string, unknown>[]));
    if (data.length < limit) break;
    cursor += limit;
  }

  return all;
}

export type TableDataMap = Record<string, Record<string, unknown>[]>;

export interface DataExportOptions {
  dateFrom?: string; // ISO date string, inclusive
  dateTo?: string;   // ISO date string, inclusive (end of day)
}

/** 查询所有需要备份的表数据，支持时间范围筛选 */
export async function fetchAllTableData(
  client: SupabaseClient,
  options?: DataExportOptions,
): Promise<{ data: TableDataMap; errors: Record<string, string> }> {
  const dateFrom = options?.dateFrom;
  const dateTo = options?.dateTo;

  const tables: Record<
    string,
    () => Promise<Record<string, unknown>[]>
  > = {
    restaurant_settings: async () => {
      const { data, error } = await client
        .from('restaurant_settings')
        .select('*')
        .limit(1);
      if (error) throw error;
      return (data ?? []) as Record<string, unknown>[];
    },
    menu_categories: () =>
      fetchAllRows(client, 'menu_categories', '*', 'sort_order', true, true),
    menu_items: () =>
      fetchAllRows(client, 'menu_items', '*', 'sort_order', true, true),
    restaurant_tables: () =>
      fetchAllRows(client, 'restaurant_tables', '*', 'table_number', true),
    orders: () =>
      fetchAllRows(
        client,
        'orders',
        '*',
        'created_at',
        false,
        true,
        500,
        dateFrom ? { column: 'created_at', from: dateFrom, to: dateTo } : undefined,
      ),
    order_items: () =>
      fetchOrderItemsByDate(client, dateFrom, dateTo),
    bill_requests: () =>
      fetchAllRows(
        client,
        'bill_requests',
        '*',
        'requested_at',
        false,
        false,
        500,
        dateFrom ? { column: 'requested_at', from: dateFrom, to: dateTo } : undefined,
      ),
  };

  const data: TableDataMap = {};
  const errors: Record<string, string> = {};

  const entries = Object.entries(tables);
  const results = await Promise.allSettled(
    entries.map(([name, fn]) =>
      fn().then((rows) => ({ name, rows })),
    ),
  );

  for (const result of results) {
    if (result.status === 'fulfilled') {
      const { name, rows } = result.value;
      data[name] = rows;
    } else {
      const name = entries[results.indexOf(result)][0];
      errors[name] = result.reason instanceof Error
        ? result.reason.message
        : String(result.reason);
    }
  }

  return { data, errors };
}

/** 按订单时间范围获取 order_items */
async function fetchOrderItemsByDate(
  client: SupabaseClient,
  dateFrom?: string,
  dateTo?: string,
): Promise<Record<string, unknown>[]> {
  if (!dateFrom && !dateTo) {
    return fetchAllRows(client, 'order_items', '*', undefined, undefined, false, 500);
  }

  // 先获取时间范围内的订单 ID
  const orderIds: string[] = [];
  let cursor = 0;
  const limit = 500;
  while (true) {
    let query = client
      .from('orders')
      .select('id')
      .is('deleted_at', null)
      .gte('created_at', dateFrom ?? '1970-01-01')
      .range(cursor, cursor + limit - 1);
    if (dateTo) query = query.lte('created_at', dateTo);
    query = query.order('created_at', { ascending: false });
    const { data, error } = await query;
    if (error) throw error;
    if (!data || data.length === 0) break;
    orderIds.push(...data.map((o) => (o as Record<string, string>).id));
    if (data.length < limit) break;
    cursor += limit;
  }

  if (orderIds.length === 0) return [];

  // 批量获取 order_items（Supabase IN 限制 300 个值，分批处理）
  const all: Record<string, unknown>[] = [];
  const batchSize = 300;
  for (let i = 0; i < orderIds.length; i += batchSize) {
    const batch = orderIds.slice(i, i + batchSize);
    let itemCursor = 0;
    while (true) {
      const { data, error } = await client
        .from('order_items')
        .select('*')
        .in('order_id', batch)
        .range(itemCursor, itemCursor + limit - 1)
        .order('order_id');
      if (error) throw error;
      if (!data || data.length === 0) break;
      all.push(...(data as unknown as Record<string, unknown>[]));
      if (data.length < limit) break;
      itemCursor += limit;
    }
  }

  return all;
}
