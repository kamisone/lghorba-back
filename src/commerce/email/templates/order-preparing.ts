import { COPY, type Lang } from './copy';
import { baseLayout, ctaButton, mutedText, esc } from './layout';

export interface OrderPreparingData {
  customerName: string;
  orderNumber: string;
  trackingUrl?: string;
}

export function renderOrderPreparing(data: OrderPreparingData, lang: Lang): { subject: string; html: string } {
  const c = COPY[lang].orderPreparing;

  const body = `
    <p style="margin:0 0 6px;font-size:15px;">${c.greeting(esc(data.customerName))}</p>
    <p style="margin:0 0 16px;font-size:15px;">${c.intro(esc(data.orderNumber))}</p>
    <p style="margin:0 0 8px;font-size:15px;">${c.body}</p>
    ${data.trackingUrl ? ctaButton(c.trackOrder, data.trackingUrl) : ''}
    ${mutedText(esc(data.orderNumber))}
  `;

  return {
    subject: c.subject(data.orderNumber),
    html: baseLayout(c.subject(data.orderNumber), body, lang),
  };
}
