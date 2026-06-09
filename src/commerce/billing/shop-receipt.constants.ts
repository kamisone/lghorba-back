export const SHOP_RECEIPT_QUEUE = 'shop-order-receipt';

export interface ShopReceiptGenerateJob { orderId: string; paymentIntentId: string | null; }
export interface ShopReceiptPdfJob      { receiptId: string; }
export interface ShopReceiptEmailJob    { receiptId: string; }
