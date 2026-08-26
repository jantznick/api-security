import { magicLinkEmail, orgInviteEmail } from './templates.js';

const RESEND_API_URL = 'https://api.resend.com/emails';

export function isResendConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
}

async function sendResendEmail({ to, subject, html, text }) {
  const response = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL,
      to: [to],
      subject,
      html,
      text,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend error: ${body}`);
  }

  return response.json();
}

export async function sendMagicLinkEmail({ to, loginUrl, code, expiresMinutes = 15 }) {
  if (!isResendConfigured()) {
    console.warn('Resend not configured — magic link email skipped for', to);
    return { skipped: true };
  }

  const { html, text } = magicLinkEmail({ loginUrl, code, expiresMinutes });
  return sendResendEmail({
    to,
    subject: 'Your sign-in link for API Glimpse',
    html,
    text,
  });
}

export async function sendOrgInviteEmail({
  to,
  inviteUrl,
  organizationName,
  inviterName,
  role,
  expiresDays = 7,
}) {
  if (!isResendConfigured()) {
    console.warn('Resend not configured — org invite email skipped for', to);
    return { skipped: true };
  }

  const { html, text } = orgInviteEmail({
    inviteUrl,
    organizationName,
    inviterName,
    role,
    expiresDays,
  });

  return sendResendEmail({
    to,
    subject: `Join ${organizationName || 'your team'} on API Glimpse`,
    html,
    text,
  });
}
