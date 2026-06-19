import { COPY, type Lang } from './copy';
import { baseLayout, ctaButton, mutedText, esc } from './layout';

export interface StockAlertData {
  productTitle: string;
  productUrl: string;
}

export function renderStockAlert(data: StockAlertData, lang: Lang): { subject: string; html: string } {
  const c = COPY[lang].stockAlert;

  const body = `
    <p style="margin:0 0 16px;font-size:15px;">${c.intro}</p>
    <h2 style="font-size:18px;font-weight:700;color:#0f172a;margin:0 0 8px;">${esc(data.productTitle)}</h2>
    ${ctaButton(c.cta, data.productUrl)}
    ${mutedText(c.urgency)}
  `;

  return {
    subject: c.subject(data.productTitle),
    html: baseLayout(c.subject(data.productTitle), body, lang),
  };
}
