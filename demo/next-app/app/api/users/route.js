import { sensor, users } from '../../../lib/sensor.js';

export const runtime = 'nodejs';

export const GET = sensor.wrap(async () => {
  return Response.json({ users });
});

export const POST = sensor.wrap(async (request) => {
  const body = await request.json();
  const { email, name, phone, password, ssn } = body || {};
  const user = {
    id: users.length + 1,
    email,
    name,
    phone,
    // Echo shape only for discovery demo — do not do this in real apps
    hasPassword: Boolean(password),
    hasSsn: Boolean(ssn),
  };
  users.push({ id: user.id, email, name, phone });
  return Response.json({ user }, { status: 201 });
});
