import { describe, expect, it } from 'vitest';
import { getBillSummary, getCartSummary } from './TableOrderPage';
import type { CartItem, Order } from '../lib/types';

describe('table order totals', () => {
  it('calculates shared cart quantity and server-price total', () => {
    const cart = [
      { quantity: 2, unit_price: 4.9 },
      { quantity: 1, unit_price: 6.9 },
    ] as CartItem[];

    const summary = getCartSummary(cart);
    expect(summary.totalPrice).toBeCloseTo(16.7);
    expect(summary.totalQuantity).toBe(3);
    expect(summary.isEmpty).toBe(false);
  });

  it('calculates the bill from submitted order snapshots', () => {
    const orders = [
      { total_price: 15.7 },
      { total_price: 18.7 },
    ] as Order[];

    expect(getBillSummary(orders)).toEqual({ totalPrice: 34.4, orderCount: 2 });
  });
});
