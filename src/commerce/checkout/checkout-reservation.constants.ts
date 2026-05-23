export const CHECKOUT_RESERVATION_QUEUE = 'shop-checkout-reservation-expiry';
export const RESERVATION_TTL_MS = 30 * 60 * 1000; // 30 minutes

export interface ReservationExpiryJobData {
  orderId: string;
}
