/** 支付提供商标识 */
export type PaymentProvider = 'manual' | 'cash' | 'pos' | 'viva' | 'nexi' | 'cardlink' | 'custom';

/** 支付状态 */
export type PaymentStatus = 'unpaid' | 'pending' | 'paid' | 'failed' | 'cancelled';

/** 支付请求 */
export interface PaymentRequest {
  /** 订单金额 (EUR) */
  amount: number;
  /** 币种，默认 EUR */
  currency?: string;
  /** 订单 ID（如已创建） */
  orderId?: string;
  /** 桌号 */
  tableNumber?: number;
  /** 菜品明细 */
  items?: { name: string; quantity: number; unitPrice: number }[];
  /** 付款方式 */
  paymentMethod: PaymentProvider;
  /** 适配器自定义数据 */
  metadata?: Record<string, unknown>;
}

/** 支付结果 */
export interface PaymentResult {
  status: PaymentStatus;
  provider: PaymentProvider;
  paymentMethod: PaymentProvider;
  /** 外部支付系统返回的 transaction ID */
  externalPaymentId?: string;
  /** 报税小票编号（希腊 AADE fiscal receipt） */
  fiscalReceiptNumber?: string;
  /** 支付时间 */
  paidAt?: string;
  /** 提示信息 */
  message?: string;
}

/** 支付适配器接口 */
export interface PaymentAdapter {
  readonly provider: PaymentProvider;
  /** 发起支付 */
  createPayment(request: PaymentRequest): Promise<PaymentResult>;
  /** 确认支付（外部回调后调用） */
  confirmPayment?(externalPaymentId: string): Promise<PaymentResult>;
  /** 取消支付 */
  cancelPayment?(externalPaymentId: string): Promise<PaymentResult>;
}
