export type Language = 'el' | 'en';

export type RestaurantSettings = {
  id: string;
  name_zh: string | null;
  name_en: string | null;
  name_el: string | null;
  phone: string | null;
  address_zh: string | null;
  address_en: string | null;
  address_el: string | null;
  map_url: string | null;
  opening_hours_zh: string | null;
  opening_hours_en: string | null;
  opening_hours_el: string | null;
  wolt_url: string | null;
  efood_url: string | null;
  box_url: string | null;
};

export type MenuCategory = {
  id: string;
  name_zh: string;
  name_en: string | null;
  name_el: string | null;
  sort_order: number;
  is_active: boolean;
  deleted_at?: string | null;
};

export type MenuItem = {
  id: string;
  category_id: string | null;
  name_zh: string;
  name_en: string | null;
  name_el: string | null;
  description_zh: string | null;
  description_en: string | null;
  description_el: string | null;
  price: number;
  image_url: string | null;
  is_available: boolean;
  sort_order: number;
  deleted_at?: string | null;
};

export type MenuGroup = MenuCategory & {
  items: MenuItem[];
};

export type TableJoinResult = {
  session_id: string;
  table_id: string;
  table_number: number;
};

export type TableSessionState = TableJoinResult & {
  session_status: 'active' | 'closed';
  bill_request_status: 'none' | 'requested' | 'handled';
  bill_payment_method: BillPaymentMethod | null;
};

export type RestaurantTable = {
  id: string;
  table_number: number;
  label: string | null;
  qr_token: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type TableSession = {
  id: string;
  table_id: string;
  status: 'active' | 'closed';
  opened_at: string;
  closed_at: string | null;
  bill_requested_at: string | null;
  bill_request_status: 'none' | 'requested' | 'handled';
  bill_payment_method: BillPaymentMethod | null;
  bill_handled_at: string | null;
  cart_version: number;
  cart_updated_at: string;
  participant_count?: number;
};

export type TableReentryRequestStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export type TableReentryRequest = {
  id: string;
  table_id: string;
  closed_session_id: string;
  target_session_id: string;
  requested_by: string;
  status: TableReentryRequestStatus;
  requested_at: string;
  handled_at: string | null;
  handled_by: string | null;
  restaurant_tables?: Pick<RestaurantTable, 'table_number' | 'label'> | null;
};

export type CartItem = {
  id: string;
  session_id: string;
  menu_item_id: string;
  added_by: string | null;
  quantity: number;
  note: string | null;
  unit_price: number;
  created_at: string;
  updated_at: string;
  menu_items?: MenuItem | null;
};

export type OrderStatus = 'pending' | 'preparing' | 'served' | 'paid' | 'cancelled';

export type OrderItem = {
  id: string;
  order_id: string;
  menu_item_id: string | null;
  item_name_zh: string;
  item_name_en: string | null;
  item_name_el: string | null;
  quantity: number;
  note: string | null;
  unit_price: number;
  line_total: number;
};

export type Order = {
  id: string;
  order_number: number;
  session_id: string;
  table_id: string;
  submitted_by: string | null;
  client_request_id: string;
  status: OrderStatus;
  payment_status?: 'unpaid' | 'paid';
  payment_method?: BillPaymentMethod | null;
  paid_at?: string | null;
  total_price: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  kitchen_printed_at?: string | null;
  restaurant_tables?: Pick<RestaurantTable, 'table_number' | 'label'> | null;
  order_items?: OrderItem[];
};

export type BillPaymentMethod = 'pos' | 'cash';

export type BillRequest = {
  id: string;
  session_id: string;
  table_id: string;
  table_number: number;
  requested_by: string | null;
  payment_method: BillPaymentMethod;
  status: 'pending' | 'handled';
  requested_at: string;
  handled_at: string | null;
  restaurant_tables?: Pick<RestaurantTable, 'table_number' | 'label'> | null;
};
