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

/** 分页获取全表数据 */
async function fetchAllRows(
  client: SupabaseClient,
  table: string,
  select = '*',
  orderColumn?: string,
  orderAscending?: boolean,
  isDeletedNull = false,
  limit = 1000,
): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  let cursor = 0;

  while (true) {
    let query = client.from(table).select(select, { count: 'exact' });
    if (isDeletedNull) query = query.is('deleted_at', null);
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

/** 查询所有需要备份的表数据 */
export async function fetchAllTableData(
  client: SupabaseClient,
): Promise<{ data: TableDataMap; errors: Record<string, string> }> {
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
      ),
    order_items: () =>
      fetchAllRows(client, 'order_items', '*', undefined, undefined, false, 500),
    bill_requests: () =>
      fetchAllRows(
        client,
        'bill_requests',
        '*',
        'requested_at',
        false,
        false,
        500,
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
