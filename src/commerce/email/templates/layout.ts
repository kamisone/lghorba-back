import { COPY, type Lang } from './copy';

function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function fmtCents(cents: number, lang: Lang): string {
  const locale = lang === 'fr' ? 'fr-FR' : 'en-GB';
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

export { esc };

const BRAND_PRIMARY = '#00466E';
const BRAND_DARK    = '#001829';
const BRAND_ACCENT  = '#8DC220';

export function baseLayout(title: string, body: string, lang: Lang = 'fr'): string {
  const year   = new Date().getFullYear();
  const seller = esc(process.env.SELLER_NAME ?? 'vitecamion');
  const footer = COPY[lang].footer(year, seller);
  const appUrl = (process.env.APP_URL ?? '').replace(/\/$/, '');

  return `<!DOCTYPE html>
<html lang="${lang}" dir="ltr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${esc(title)}</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;">
    <tr><td align="center" style="padding:32px 16px;">

      <!-- Main card -->
      <table role="presentation" width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.06);">

        <!-- Header bar -->
        <tr>
          <td style="background:${BRAND_DARK};padding:24px 32px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  ${appUrl ? `<a href="${appUrl}" style="text-decoration:none;"><span style="color:#ffffff;font-size:20px;font-weight:800;letter-spacing:-0.02em;">${seller}</span></a>` : `<span style="color:#ffffff;font-size:20px;font-weight:800;letter-spacing:-0.02em;">${seller}</span>`}
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Body content -->
        <tr>
          <td style="padding:32px 32px 28px;font-size:15px;line-height:1.65;color:#1e293b;">
            ${body}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 32px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;line-height:1.5;">
            ${footer}
          </td>
        </tr>

      </table>

    </td></tr>
  </table>
</body>
</html>`;
}

export function ctaButton(label: string, href: string, color = BRAND_PRIMARY): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
      <tr>
        <td style="background:${color};border-radius:8px;">
          <a href="${esc(href)}" target="_blank" style="display:inline-block;padding:13px 28px;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;letter-spacing:0.01em;">${esc(label)}</a>
        </td>
      </tr>
    </table>`;
}

export function dangerButton(label: string, href: string): string {
  return ctaButton(label, href, '#dc2626');
}

export function accentButton(label: string, href: string): string {
  return ctaButton(label, href, BRAND_ACCENT);
}

export function divider(): string {
  return '<hr style="border:none;border-top:1px solid #f1f5f9;margin:20px 0;">';
}

export function mutedText(text: string): string {
  return `<p style="font-size:13px;color:#64748b;line-height:1.55;">${text}</p>`;
}
