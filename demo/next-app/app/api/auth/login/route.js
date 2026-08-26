import { sensor } from '../../../../lib/sensor.js';

export const runtime = 'nodejs';

export const POST = sensor.wrap(async (request) => {
  const body = await request.json();
  const { email, password } = body || {};
  if (!email || !password) {
    return Response.json(
      { error: 'email and password required' },
      { status: 400 },
    );
  }
  return Response.json({
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.demo.signature',
    user: { email },
  });
});
