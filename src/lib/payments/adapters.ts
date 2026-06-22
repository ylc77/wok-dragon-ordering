import type { PaymentAdapter, PaymentProvider, PaymentRequest, PaymentResult } from './types';

/* ── 手动模式适配器 ── */

/** 未付款：不处理支付，订单保持 unpaid */
function createManualAdapter(): PaymentAdapter {
  return {
    provider: 'manual',
    async createPayment(request: PaymentRequest): Promise<PaymentResult> {
      return {
        status: 'unpaid',
        provider: 'manual',
        paymentMethod: request.paymentMethod,
        message: '未付款，需后续处理',
      };
    },
  };
}

/** 现金：直接标记为已付款 */
function createCashAdapter(): PaymentAdapter {
  return {
    provider: 'cash',
    async createPayment(request: PaymentRequest): Promise<PaymentResult> {
      return {
        status: 'paid',
        provider: 'cash',
        paymentMethod: 'cash',
        paidAt: new Date().toISOString(),
        message: '现金已收款',
      };
    },
  };
}

/** POS 刷卡（手动确认）：员工确认实体 POS 机已收款 */
function createPosManualAdapter(): PaymentAdapter {
  return {
    provider: 'pos',
    async createPayment(request: PaymentRequest): Promise<PaymentResult> {
      return {
        status: 'paid',
        provider: 'pos',
        paymentMethod: 'pos',
        paidAt: new Date().toISOString(),
        message: 'POS 刷卡已确认收款',
      };
    },
  };
}

/* ── 未来扩展适配器（占位） ── */

/*
 * Viva Wallet adapter:
 * - 对接 Viva Wallet API
 * - 创建 Smart Checkout session
 * - 返回 redirect URL 供顾客扫码/点击
 * - Webhook 接收支付回调
 * - 参考：https://developer.viva.com/
 *
 * TODO: createVivaAdapter(config: { merchantId, apiKey, webhookSecret }): PaymentAdapter
 */

/*
 * Nexi adapter:
 * - 对接 Nexi XPay / EasyPay
 * - 创建支付请求 → 返回 redirect URL
 * - Webhook / server-to-server 确认
 * - 参考：https://developer.nexi.it/
 *
 * TODO: createNexiAdapter(config: { apiKey, terminalId }): PaymentAdapter
 */

/*
 * Cardlink adapter:
 * - 对接 Cardlink e-Commerce API
 * - 创建支付订单 → 返回 redirect URL
 * - 支持 Alpha Bank / Eurobank / Piraeus Bank 等希腊银行
 *
 * TODO: createCardlinkAdapter(config: { merchantId, secret }): PaymentAdapter
 */

/* ── 适配器工厂 ── */

/** 根据 provider 获取对应的适配器实例 */
export function getPaymentAdapter(provider: PaymentProvider): PaymentAdapter {
  switch (provider) {
    case 'manual':
      return createManualAdapter();
    case 'cash':
      return createCashAdapter();
    case 'pos':
      return createPosManualAdapter();
    // 未来扩展：
    // case 'viva':   return createVivaAdapter(config);
    // case 'nexi':   return createNexiAdapter(config);
    // case 'cardlink': return createCardlinkAdapter(config);
    default:
      return createManualAdapter();
  }
}

export { createCashAdapter, createManualAdapter, createPosManualAdapter };
