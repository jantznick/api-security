import { sensor } from '../../../lib/sensor.js';

export const runtime = 'nodejs';

export const GET = sensor.wrap(async () => {
  return Response.json({ status: 'ok', service: 'demo-next-app' });
});
