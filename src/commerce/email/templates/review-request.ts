import { COPY, type Lang } from './copy';
import { baseLayout, ctaButton, mutedText, esc } from './layout';

export interface ReviewRequestData {
  customerName: string;
  orderNumber: string;
  productTitle: string;
  reviewUrl: string;
}

export function renderReviewRequest(data: ReviewRequestData, lang: Lang): { subject: string; html: string } {
  const c = COPY[lang].reviewRequest;

  const body = `
    <p style="margin:0 0 6px;font-size:15px;">${c.greeting(esc(data.customerName))}</p>
    <p style="margin:0 0 16px;font-size:15px;">${c.intro(esc(data.productTitle), esc(data.orderNumber))}</p>
    <p style="margin:0 0 8px;font-size:15px;">${c.body}</p>
    ${ctaButton(c.cta, data.reviewUrl)}
    ${mutedText(`${c.fallback} ${esc(data.reviewUrl)}`)}
  `;

  return {
    subject: c.subject(data.productTitle),
    html: baseLayout(c.subject(data.productTitle), body, lang),
  };
}
