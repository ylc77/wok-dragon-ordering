import { supabase } from './supabase';
import type { BillPaymentMethod, BillRequest, CartItem, Order, OrderStatus, RestaurantTable, TableJoinResult, TableSession } from './types';

function requireClient() {
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase;
}

export async function joinTableSession(qrToken: string): Promise<TableJoinResult> {
  const client = requireClient();
  const { data, error } = await client.rpc('join_table_session', { p_qr_token: qrToken });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('Table session was not returned.');
  return row as TableJoinResult;
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
  return (Array.isArray(data) ? data[0] : data) as { request_id: string; request_status: 'pending' };
}

export function subscribeToTableCart(sessionId: string, onChange: () => void) {
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

export async function updateOrderStatus(orderId: string, status: OrderStatus) {
  const client = requireClient();
  const { error } = await client.rpc('update_order_status', {
    p_order_id: orderId,
    p_status: status,
  });
  if (error) throw error;
}

export function subscribeToAdminOrders(onChange: () => void) {
  const client = requireClient();
  const channel = client
    .channel('admin-orders')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'bill_requests' }, onChange)
    .subscribe();

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
    .select('*')
    .eq('status', 'active')
    .order('opened_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as TableSession[];
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
