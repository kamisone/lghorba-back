import { COPY, type Lang } from './copy';
import { baseLayout, ctaButton, divider, mutedText, esc, fmtCents } from './layout';

export interface OrderConfirmedData {
  customerName: string;
  orderNumber: string;
  totalCents: number;
  items: Array<{ title: string; quantity: number; unitPriceCents: number }>;
  orderUrl?: string;
}

export function renderOrderConfirmed(data: OrderConfirmedData, lang: Lang): { subject: string; html: string } {
  const c = COPY[lang].orderConfirmed;

  const itemRows = data.items.map(i => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:14px;color:#1e293b;">${esc(i.title)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;text-align:center;font-size:14px;color:#475569;">${i.quantity}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-size:14px;color:#475569;">${fmtCents(i.unitPriceCents, lang)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-size:14px;font-weight:600;color:#0f172a;">${fmtCents(i.unitPriceCents * i.quantity, lang)}</td>
    </tr>`).join('');

  const body = `
    <p style="margin:0 0 6px;font-size:15px;">${c.greeting(esc(data.customerName))}</p>
    <p style="margin:0 0 20px;font-size:15px;">${c.intro}</p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 8px;">
      <thead>
        <tr style="background:#f8fafc;">
          <th style="text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;padding:10px 12px;border-bottom:2px solid #e2e8f0;">${c.colProduct}</th>
          <th style="text-align:center;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;padding:10px 12px;border-bottom:2px solid #e2e8f0;">${c.colQty}</th>
          <th style="text-align:right;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;padding:10px 12px;border-bottom:2px solid #e2e8f0;">${c.colPrice}</th>
          <th style="text-align:right;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;padding:10px 12px;border-bottom:2px solid #e2e8f0;">${c.colTotal}</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
      <tfoot>
        <tr>
          <td colspan="3" style="padding:14px 12px 0;font-weight:800;font-size:15px;color:#0f172a;">${c.colTotal}</td>
          <td style="padding:14px 12px 0;font-weight:800;font-size:15px;text-align:right;color:#0f172a;">${fmtCents(data.totalCents, lang)}</td>
        </tr>
      </tfoot>
    </table>

    ${divider()}

    <p style="font-size:13px;color:#64748b;margin:0;">${c.orderRef} : <strong style="color:#0f172a;">${esc(data.orderNumber)}</strong></p>

    ${data.orderUrl ? ctaButton(c.trackOrder, data.orderUrl) : ''}
    ${mutedText(c.helpText)}
  `;

  return {
    subject: c.subject(data.orderNumber),
    html: baseLayout(c.subject(data.orderNumber), body, lang),
  };
}
