import { sensor, users } from '../../../../lib/sensor.js';

export const runtime = 'nodejs';

export const GET = sensor.wrap(async (_request, context) => {
  const params =
    context?.params && typeof context.params.then === 'function'
      ? await context.params
      : context?.params || {};
  const user = users.find((u) => String(u.id) === String(params.id));
  if (!user) {
    return Response.json({ error: 'User not found' }, { status: 404 });
  }
  return Response.json({ user });
});
