import { COPY, type Lang } from './copy';
import { baseLayout, ctaButton, esc } from './layout';

export interface OrderShippedData {
  customerName: string;
  orderNumber: string;
  trackingNumber: string | null;
  carrier: string | null;
  trackingUrl?: string;
}

export function renderOrderShipped(data: OrderShippedData, lang: Lang): { subject: string; html: string } {
  const c = COPY[lang].orderShipped;

  const trackingBlock = data.trackingNumber
    ? `<p style="margin:16px 0;font-size:15px;">${c.tracking(esc(data.trackingNumber), data.carrier ? esc(data.carrier) : null)}</p>`
    : '';

  const body = `
    <p style="margin:0 0 6px;font-size:15px;">${c.greeting(esc(data.customerName))}</p>
    <p style="margin:0 0 16px;font-size:15px;">${c.intro(esc(data.orderNumber))}</p>
    ${trackingBlock}
    <p style="margin:0 0 8px;font-size:15px;">${c.eta}</p>
    ${data.trackingUrl ? ctaButton(c.trackOrder, data.trackingUrl) : ''}
  `;

  return {
    subject: c.subject(data.orderNumber),
    html: baseLayout(c.subject(data.orderNumber), body, lang),
  };
}
