import { supabase } from './supabase';
import type { AdminDashboardSummary, AdminOrderPage, AdminOrderStats, BillPaymentMethod, BillRequest, CartItem, Order, OrderStatus, RealtimeConnectionStatus, RestaurantTable, TableEntryState, TableJoinResult, TableReentryRequest, TableSession, TableSessionState } from './types';

function requireClient() {
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase;
}

export async function fetchTableEntryState(qrToken: string): Promise<TableEntryState> {
  const client = requireClient();
  const { data, error } = await client.rpc('get_table_entry_state', { p_qr_token: qrToken });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('Table entry state was not returned.');
  return row as TableEntryState;
}

export async function enterTableSession(
  qrToken: string,
  expectedSessionId: string,
  requireEmpty: boolean,
): Promise<TableJoinResult> {
  const client = requireClient();
  const { data, error } = await client.rpc('enter_table_session', {
    p_qr_token: qrToken,
    p_expected_session_id: expectedSessionId,
    p_require_empty: requireEmpty,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('Table session was not returned.');
  return row as TableJoinResult;
}

export async function resumeTableSession(sessionId: string, qrToken: string): Promise<TableSessionState> {
  const client = requireClient();
  const { data, error } = await client.rpc('resume_table_session', {
    p_session_id: sessionId,
    p_qr_token: qrToken,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('Saved table session was not returned.');
  return row as TableSessionState;
}

export async function hasSubmittedOrders(sessionId: string) {
  const client = requireClient();
  const { count, error } = await client
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sessionId)
    .neq('status', 'cancelled')
    .is('deleted_at', null);
  if (error) throw error;
  return (count ?? 0) > 0;
}

export async function fetchSessionOrders(sessionId: string): Promise<Order[]> {
  const client = requireClient();
  const { data, error } = await client
    .from('orders')
    .select('*, order_items(*)')
    .eq('session_id', sessionId)
    .neq('status', 'cancelled')
    .is('deleted_at', null)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Order[];
}

export async function fetchCart(sessionId: string): Promise<CartItem[]> {
  const client = requireClient();
  const { data, error } = await client
    .from('cart_items')
    .select('*, menu_items(*)')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as CartItem[];
}

export async function addCartItem(sessionId: string, menuItemId: string, quantity = 1, note = '') {
  const client = requireClient();
  const { error } = await client.rpc('add_cart_item', {
    p_session_id: sessionId,
    p_menu_item_id: menuItemId,
    p_quantity: quantity,
    p_note: note,
  });
  if (error) throw error;
}

export async function updateCartItemQuantity(cartItemId: string, quantity: number) {
  const client = requireClient();
  const { error } = await client.rpc('update_cart_item_quantity', {
    p_cart_item_id: cartItemId,
    p_quantity: quantity,
  });
  if (error) throw error;
}

export async function removeCartItem(cartItemId: string) {
  const client = requireClient();
  const { error } = await client.rpc('remove_cart_item', {
    p_cart_item_id: cartItemId,
  });
  if (error) throw error;
}

export async function updateCartItemNote(cartItemId: string, note: string) {
  const client = requireClient();
  const { error } = await client.rpc('update_cart_item_note', {
    p_cart_item_id: cartItemId,
    p_note: note,
  });
  if (error) throw error;
}

export async function submitOrder(sessionId: string, clientRequestId: string) {
  const client = requireClient();
  const { data, error } = await client.rpc('submit_order', {
    p_session_id: sessionId,
    p_client_request_id: clientRequestId,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('Order was not returned.');
  return row as { order_id: string; order_number: number };
}

export async function requestBill(sessionId: string, paymentMethod: BillPaymentMethod) {
  const client = requireClient();
  const { data, error } = await client.rpc('request_bill', {
    p_session_id: sessionId,
    p_payment_method: paymentMethod,
  });
  if (error) throw error;
  return (Array.isArray(data) ? data[0] : data) as { request_id: string; request_status: 'requested' };
}

function mapRealtimeStatus(status: string): RealtimeConnectionStatus {
  if (status === 'SUBSCRIBED') return 'connected';
  if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') return 'disconnected';
  return 'connecting';
}

export function subscribeToTableCart(
  sessionId: string,
  onChange: () => void,
  onStatus?: (status: RealtimeConnectionStatus) => void,
) {
  const client = requireClient();
  const channel = client
    .channel(`table-cart-${sessionId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'table_sessions', filter: `id=eq.${sessionId}` },
      onChange,
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'cart_items', filter: `session_id=eq.${sessionId}` },
      onChange,
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'orders', filter: `session_id=eq.${sessionId}` },
      onChange,
    )
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'restaurant_settings' }, onChange)
    .subscribe((status) => onStatus?.(mapRealtimeStatus(status)));

  return () => {
    client.removeChannel(channel);
  };
}

export async function requestTableReentry(closedSessionId: string, qrToken: string) {
  const client = requireClient();
  const { data, error } = await client.rpc('request_table_reentry', {
    p_closed_session_id: closedSessionId,
    p_qr_token: qrToken,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('Table reentry request was not returned.');
  return {
    id: row.request_id,
    status: row.request_status,
    target_session_id: row.target_session_id,
    closed_session_id: closedSessionId,
  } as Pick<TableReentryRequest, 'id' | 'status' | 'target_session_id' | 'closed_session_id'>;
}

export async function fetchLatestTableReentryRequest(closedSessionId: string): Promise<TableReentryRequest | null> {
  const client = requireClient();
  const { data, error } = await client
    .from('table_reentry_requests')
    .select('*')
    .eq('closed_session_id', closedSessionId)
    .order('requested_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as TableReentryRequest | null;
}

export function subscribeToTableReentryRequest(requestId: string, onChange: () => void) {
  const client = requireClient();
  const channel = client
    .channel(`table-reentry-${requestId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'table_reentry_requests', filter: `id=eq.${requestId}` },
      onChange,
    )
    .subscribe();

  return () => {
    client.removeChannel(channel);
  };
}

export async function fetchAdminOrders(): Promise<Order[]> {
  const client = requireClient();
  const { data, error } = await client
    .from('orders')
    .select('*, restaurant_tables(table_number,label), order_items(*)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as Order[];
}

export async function fetchAdminPendingOrders(): Promise<Order[]> {
  const client = requireClient();
  const { data, error } = await client
    .from('orders')
    .select('*, restaurant_tables(table_number,label), order_items(*)')
    .eq('status', 'pending')
    .is('deleted_at', null)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Order[];
}

export async function fetchAdminOrderPage(filters: {
  dateFrom: string | null;
  dateTo: string | null;
  tableNumber: number | null;
  status: OrderStatus | null;
  page: number;
  pageSize?: number;
}): Promise<AdminOrderPage> {
  const client = requireClient();
  const { data, error } = await client.rpc('admin_order_page', {
    p_date_from: filters.dateFrom,
    p_date_to: filters.dateTo,
    p_table_number: filters.tableNumber,
    p_status: filters.status,
    p_page: filters.page,
    p_page_size: filters.pageSize ?? 50,
  });
  if (error) throw error;
  return data as AdminOrderPage;
}

export async function fetchAdminOrderStats(filters: {
  dateFrom: string | null;
  dateTo: string | null;
  tableNumber: number | null;
}): Promise<AdminOrderStats> {
  const client = requireClient();
  const { data, error } = await client.rpc('admin_order_stats', {
    p_date_from: filters.dateFrom,
    p_date_to: filters.dateTo,
    p_table_number: filters.tableNumber,
  });
  if (error) throw error;
  return data as AdminOrderStats;
}

export async function fetchAdminDashboardSummary(dateFrom: string, dateTo: string): Promise<AdminDashboardSummary> {
  const client = requireClient();
  const { data, error } = await client.rpc('admin_dashboard_summary', {
    p_today_from: dateFrom,
    p_today_to: dateTo,
  });
  if (error) throw error;
  return data as AdminDashboardSummary;
}

export async function updateOrderStatus(orderId: string, status: OrderStatus) {
  const client = requireClient();
  const { error } = await client.rpc('update_order_status', {
    p_order_id: orderId,
    p_status: status,
  });
  if (error) throw error;
}

export function subscribeToAdminOrders(
  onChange: () => void,
  onStatus?: (status: RealtimeConnectionStatus) => void,
) {
  const client = requireClient();
  const channel = client
    .channel('admin-orders')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'bill_requests' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'table_sessions' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'table_session_participants' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'table_reentry_requests' }, onChange)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'restaurant_settings' }, onChange)
    .subscribe((status) => onStatus?.(mapRealtimeStatus(status)));

  return () => {
    client.removeChannel(channel);
  };
}

export async function fetchPendingBillRequests(): Promise<BillRequest[]> {
  const client = requireClient();
  const { data, error } = await client
    .from('bill_requests')
    .select('*')
    .eq('status', 'pending')
    .order('requested_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as BillRequest[];
}

export async function handleBillRequest(requestId: string) {
  const client = requireClient();
  const { error } = await client.rpc('handle_bill_request', { p_request_id: requestId });
  if (error) throw error;
}

export async function confirmBillAndCloseSession(sessionId: string) {
  const client = requireClient();
  const { data, error } = await client.rpc('confirm_bill_and_close_session', { p_session_id: sessionId });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return (row ?? { paid_order_count: 0, deleted_cart_count: 0 }) as {
    paid_order_count: number;
    deleted_cart_count: number;
  };
}

export async function markOrderKitchenPrinted(orderId: string) {
  const client = requireClient();
  const { data, error } = await client.rpc('mark_order_kitchen_printed', { p_order_id: orderId });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('打印状态未返回。');
  return row as { is_reprint: boolean; printed_at: string };
}

export async function fetchRestaurantTables(): Promise<RestaurantTable[]> {
  const client = requireClient();
  const { data, error } = await client
    .from('restaurant_tables')
    .select('*')
    .order('table_number', { ascending: true });
  if (error) throw error;
  return (data ?? []) as RestaurantTable[];
}

export async function fetchActiveSessions(): Promise<TableSession[]> {
  const client = requireClient();
  const { data, error } = await client
    .from('table_sessions')
    .select('*, table_session_participants(count)')
    .eq('status', 'active')
    .order('opened_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...row,
    participant_count: row.table_session_participants?.[0]?.count ?? 0,
    table_session_participants: undefined,
  })) as TableSession[];
}

export async function setRestaurantOrdering(enabled: boolean) {
  const client = requireClient();
  const { data, error } = await client.rpc('set_restaurant_ordering', { p_enabled: enabled });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row as { ordering_enabled: boolean; ordering_paused_at: string | null };
}

export async function fetchPendingTableReentryRequests(): Promise<TableReentryRequest[]> {
  const client = requireClient();
  const { data, error } = await client
    .from('table_reentry_requests')
    .select('*, restaurant_tables(table_number,label)')
    .eq('status', 'pending')
    .order('requested_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as TableReentryRequest[];
}

export async function approveTableReentry(requestId: string) {
  const client = requireClient();
  const { data, error } = await client.rpc('approve_table_reentry', { p_request_id: requestId });
  if (error) throw error;
  return (Array.isArray(data) ? data[0] : data) as {
    request_status: 'approved' | 'expired';
    target_session_id: string;
  };
}

export async function rejectTableReentry(requestId: string) {
  const client = requireClient();
  const { error } = await client.rpc('reject_table_reentry', { p_request_id: requestId });
  if (error) throw error;
}

export async function createRestaurantTable(tableNumber: number, label: string) {
  const client = requireClient();
  const { error } = await client.rpc('create_restaurant_table', {
    p_table_number: tableNumber,
    p_label: label || null,
  });
  if (error) throw error;
}

export async function saveRestaurantTable(table: RestaurantTable) {
  const client = requireClient();
  const { error } = await client
    .from('restaurant_tables')
    .update({
      label: table.label,
      is_active: table.is_active,
      table_number: table.table_number,
    })
    .eq('id', table.id);
  if (error) throw error;
}

export async function regenerateTableQrToken(tableId: string) {
  const client = requireClient();
  const { error } = await client.rpc('regenerate_table_qr_token', { p_table_id: tableId });
  if (error) throw error;
}

export async function closeTableSession(sessionId: string) {
  const client = requireClient();
  const { data, error } = await client.rpc('close_table_session', { p_session_id: sessionId });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return (row ?? { open_order_count: 0, deleted_cart_count: 0 }) as {
    open_order_count: number;
    deleted_cart_count: number;
  };
}
