export type Language = 'el' | 'en' | 'zh';

export type PlanTier = 'basic' | 'standard' | 'professional';

export type FeatureFlags = {
  csv_import: boolean;
  ai_menu: boolean;
  ai_image: boolean;
  data_backup: boolean;
  print_agent: boolean;
  reservations: boolean;
};

export type RestaurantSettings = {
  id: string;
  name_zh: string | null;
  name_en: string | null;
  name_el: string | null;
  logo_url: string | null;
  hero_image_url: string | null;
  intro_zh: string | null;
  intro_en: string | null;
  intro_el: string | null;
  phone: string | null;
  whatsapp_url: string | null;
  instagram_url: string | null;
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
  accept_pos_payment: boolean;
  accept_cash_payment: boolean;
  ordering_enabled: boolean;
  ordering_paused_at: string | null;
  brand_color?: string | null;
  favicon_url?: string | null;
  meta_title?: string | null;
  footer_text_zh?: string | null;
  footer_text_en?: string | null;
  footer_text_el?: string | null;
  enable_pos?: boolean;
  enable_qr_ordering?: boolean;
  plan_tier?: PlanTier;
  feature_flags?: Partial<FeatureFlags> | null;
};

export type MenuCategory = {
  id: string;
  name_zh: string;
  name_en: string | null;
  name_el: string | null;
  image_url?: string | null;
  sort_order: number;
  is_active: boolean;
  deleted_at?: string | null;
};

export type MenuItemOption = {
  id: string;
  name_zh: string;
  name_en: string;
  name_el: string;
};

export type MenuItemOptionGroup = {
  id: string;
  name_zh: string;
  name_en: string;
  name_el: string;
  type: 'single' | 'multiple';
  required: boolean;
  choices: MenuItemOption[];
};

export type SelectedOption = {
  group_id: string;
  group_name_zh: string;
  group_name_en: string;
  group_name_el: string;
  choice_id: string;
  choice_name_zh: string;
  choice_name_en: string;
  choice_name_el: string;
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
  is_sold_out?: boolean;
  sort_order: number;
  options?: MenuItemOptionGroup[] | null;
  deleted_at?: string | null;
};

export type MenuGroup = MenuCategory & {
  items: MenuItem[];
  item_count?: number;
};

export type TableJoinResult = {
  session_id: string;
  table_id: string;
  table_number: number;
};

export type TableSessionState = TableJoinResult & {
  session_status: 'active' | 'closed';
  closed_at: string | null;
  bill_request_status: 'none' | 'requested' | 'handled';
  bill_payment_method: BillPaymentMethod | null;
};

export type TableEntryState = {
  active_session_id: string;
  table_id: string;
  table_number: number;
  participant_count: number;
  unfinished_order_count: number;
  is_occupied: boolean;
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
  selected_options?: SelectedOption[] | null;
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
  selected_options?: SelectedOption[] | null;
  unit_price: number;
  line_total: number;
};

export type Order = {
  id: string;
  order_number: number;
  session_id: string | null;
  table_id: string | null;
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
  legal_terms_version?: string | null;
  privacy_policy_version?: string | null;
  legal_accepted_at?: string | null;
  order_type?: string | null;
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

export type RealtimeConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export type AdminRole = 'admin' | 'staff' | 'kitchen';

export type PrintAgentStatus = {
  id: string;
  agent_name: string;
  status: 'online' | 'offline' | 'error';
  last_seen_at: string;
  last_printed_at: string | null;
  last_error: string | null;
  printer_name: string | null;
  version: string | null;
  updated_at: string;
};

export type ReservationStatus = 'confirmed' | 'arrived' | 'completed' | 'cancelled' | 'no_show';

export type ReservationSettings = {
  id: string;
  is_enabled: boolean;
  timezone: string;
  open_time: string;
  close_time: string;
  slot_interval_minutes: number;
  capacity_per_slot: number;
  max_party_size: number;
  max_advance_days: number;
  minimum_notice_minutes: number;
};

export type ReservationSlot = {
  slot_time: string;
  remaining_capacity: number;
};

export type Reservation = {
  id: string;
  reference_code: string;
  reservation_date: string;
  reservation_time: string;
  party_size: number;
  guest_name: string;
  phone: string;
  note: string | null;
  status: ReservationStatus;
  created_at: string;
  updated_at: string;
};

export type AdminOrderPage = {
  orders: Order[];
  page: number;
  page_size: number;
  total_sessions: number;
  total_pages: number;
};

export type AdminOrderStats = Record<OrderStatus, number> & {
  total_orders: number;
  paid_total: number;
};

export type AdminDashboardSummary = {
  today_order_count: number;
  today_revenue: number;
  pending_count: number;
  preparing_count: number;
  hot_items: Array<{ name: string; quantity: number; total: number }>;
};
