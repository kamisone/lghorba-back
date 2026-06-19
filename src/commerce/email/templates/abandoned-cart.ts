import { COPY, type Lang } from './copy';
import { baseLayout, ctaButton, mutedText, esc, fmtCents } from './layout';

export interface AbandonedCartData {
  customerName: string;
  resumeUrl: string;
  items: Array<{ title: string; quantity: number; unitPriceCents: number }>;
}

export function renderAbandonedCart(data: AbandonedCartData, lang: Lang): { subject: string; html: string } {
  const c = COPY[lang].abandonedCart;

  const itemList = data.items.map(i =>
    `<li style="padding:6px 0;font-size:14px;color:#334155;">${esc(i.title)} × ${i.quantity} — <strong>${fmtCents(i.unitPriceCents * i.quantity, lang)}</strong></li>`,
  ).join('');

  const body = `
    <p style="margin:0 0 6px;font-size:15px;">${c.greeting(esc(data.customerName))}</p>
    <p style="margin:0 0 16px;font-size:15px;">${c.intro}</p>
    <ul style="margin:0 0 8px;padding-left:20px;">${itemList}</ul>
    ${ctaButton(c.cta, data.resumeUrl)}
    ${mutedText(c.note)}
  `;

  return {
    subject: c.subject,
    html: baseLayout(c.subject, body, lang),
  };
}
