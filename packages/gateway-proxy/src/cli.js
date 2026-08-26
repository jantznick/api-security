#!/usr/bin/env node
import { createGatewayProxy } from './index.js';

async function main() {
  const proxy = createGatewayProxy();
  const info = await proxy.listen();
  console.log(
    `[apiglimpse-gateway-proxy] listening on http://${info.host}:${info.port} → ${info.upstream}`,
  );
  console.log(
    `[apiglimpse-gateway-proxy] sampling → ${info.agentUrl}/v1/samples (fail-open)`,
  );

  const shutdown = async (signal) => {
    console.log(`[apiglimpse-gateway-proxy] ${signal}, shutting down…`);
    try {
      await proxy.close();
    } catch {
      /* ignore */
    }
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[apiglimpse-gateway-proxy]', err.message || err);
  process.exit(1);
});
