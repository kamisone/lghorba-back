import { COPY, type Lang } from './copy';
import { baseLayout, dangerButton, mutedText, esc } from './layout';

export interface PaymentFailedData {
  customerName: string;
  orderNumber: string;
  retryUrl: string;
}

export function renderPaymentFailed(data: PaymentFailedData, lang: Lang): { subject: string; html: string } {
  const c = COPY[lang].paymentFailed;

  const body = `
    <p style="margin:0 0 6px;font-size:15px;">${c.greeting(esc(data.customerName))}</p>
    <p style="margin:0 0 16px;font-size:15px;">${c.intro(esc(data.orderNumber))}</p>
    <p style="margin:0 0 8px;font-size:15px;">${c.body}</p>
    ${dangerButton(c.cta, data.retryUrl)}
    ${mutedText(c.note)}
  `;

  return {
    subject: c.subject(data.orderNumber),
    html: baseLayout(c.subject(data.orderNumber), body, lang),
  };
}
