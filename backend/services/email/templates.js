const APP_NAME = 'API Glimpse';
const APP_DOMAIN = 'apiglimpse.com';

const BRAND = {
  pine900: '#24362d',
  pine700: '#325040',
  pine600: '#3d644e',
  pine50: '#f3f7f4',
  pine100: '#e3ece6',
  white: '#ffffff',
};

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function emailButton(href, label) {
  const safeHref = escapeHtml(href);
  const safeLabel = escapeHtml(label);
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:28px auto 0;">
      <tr>
        <td style="border-radius:8px;background-color:${BRAND.pine700};">
          <a href="${safeHref}" target="_blank" rel="noopener noreferrer"
            style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:600;color:${BRAND.white};text-decoration:none;border-radius:8px;">
            ${safeLabel}
          </a>
        </td>
      </tr>
    </table>
  `;
}

function emailLayout({ title, preheader, bodyHtml }) {
  const safeTitle = escapeHtml(title);
  const safePreheader = escapeHtml(preheader || title);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle}</title>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.pine50};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${safePreheader}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:${BRAND.pine50};padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;">
          <tr>
            <td style="padding-bottom:20px;text-align:center;">
              <span style="display:inline-block;width:36px;height:36px;line-height:36px;border-radius:8px;background-color:${BRAND.pine700};color:${BRAND.white};font-size:13px;font-weight:700;">AS</span>
              <p style="margin:10px 0 0;font-size:18px;font-weight:600;color:${BRAND.pine900};">${escapeHtml(APP_NAME)}</p>
            </td>
          </tr>
          <tr>
            <td style="background-color:${BRAND.white};border:1px solid ${BRAND.pine100};border-radius:12px;padding:32px 28px;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:24px 8px 0;text-align:center;font-size:12px;line-height:1.6;color:#5c7268;">
              <p style="margin:0;">${escapeHtml(APP_NAME)} · ${escapeHtml(APP_DOMAIN)}</p>
              <p style="margin:8px 0 0;">If you didn&apos;t request this email, you can safely ignore it.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function magicLinkEmail({ loginUrl, code, expiresMinutes }) {
  const safeCode = escapeHtml(code);
  const safeUrl = escapeHtml(loginUrl);

  const html = emailLayout({
    title: 'Sign in to your account',
    preheader: `Your sign-in code is ${code}. Expires in ${expiresMinutes} minutes.`,
    bodyHtml: `
      <h1 style="margin:0 0 12px;font-size:22px;font-weight:600;color:${BRAND.pine900};">Sign in to your account</h1>
      <p style="margin:0;font-size:15px;line-height:1.6;color:#3d5248;">
        Click the button below to sign in. This link expires in <strong>${expiresMinutes} minutes</strong>.
      </p>
      ${emailButton(loginUrl, 'Sign in')}
      <p style="margin:28px 0 0;font-size:14px;line-height:1.6;color:#5c7268;text-align:center;">
        Or enter this code on the sign-in page:
      </p>
      <p style="margin:12px 0 0;text-align:center;">
        <span style="display:inline-block;padding:12px 20px;border-radius:8px;background-color:${BRAND.pine50};border:1px solid ${BRAND.pine100};font-size:28px;font-weight:700;letter-spacing:0.2em;color:${BRAND.pine900};">${safeCode}</span>
      </p>
      <p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#7a8f84;word-break:break-all;">
        Button not working? Copy this link:<br>
        <a href="${safeUrl}" style="color:${BRAND.pine600};">${safeUrl}</a>
      </p>
    `,
  });

  const text = `Sign in to ${APP_NAME}

Click to sign in: ${loginUrl}

Or enter this code on the sign-in page: ${code}

This expires in ${expiresMinutes} minutes.`;

  return { html, text };
}

export function orgInviteEmail({
  inviteUrl,
  organizationName,
  inviterName,
  role,
  expiresDays = 7,
}) {
  const safeOrg = escapeHtml(organizationName || 'an organization');
  const safeInviter = escapeHtml(inviterName || 'A teammate');
  const safeRole = escapeHtml(role || 'member');
  const safeUrl = escapeHtml(inviteUrl);

  const html = emailLayout({
    title: `Join ${organizationName || 'your team'} on ${APP_NAME}`,
    preheader: `${inviterName || 'A teammate'} invited you to ${organizationName || 'an organization'}.`,
    bodyHtml: `
      <h1 style="margin:0 0 12px;font-size:22px;font-weight:600;color:${BRAND.pine900};">You're invited</h1>
      <p style="margin:0;font-size:15px;line-height:1.6;color:#3d5248;">
        <strong>${safeInviter}</strong> invited you to join
        <strong>${safeOrg}</strong> on ${escapeHtml(APP_NAME)} as a <strong>${safeRole}</strong>.
      </p>
      <p style="margin:16px 0 0;font-size:15px;line-height:1.6;color:#3d5248;">
        This invite expires in <strong>${escapeHtml(String(expiresDays))} days</strong>.
      </p>
      ${emailButton(inviteUrl, 'Accept invite')}
      <p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#7a8f84;word-break:break-all;">
        Button not working? Copy this link:<br>
        <a href="${safeUrl}" style="color:${BRAND.pine600};">${safeUrl}</a>
      </p>
    `,
  });

  const text = `You're invited to ${organizationName || 'an organization'} on ${APP_NAME}

${inviterName || 'A teammate'} invited you as a ${role || 'member'}.

Accept the invite: ${inviteUrl}

This invite expires in ${expiresDays} days.`;

  return { html, text };
}
