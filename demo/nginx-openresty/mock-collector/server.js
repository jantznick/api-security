import http from 'node:http';

/** In-memory mock of POST /v1/samples for gateway integration tests. */
const received = [];

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/_received') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ count: received.length, envelopes: received }));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/_reset') {
    received.length = 0;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ reset: true }));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/v1/samples') {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString('utf8');
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid json' }));
      return;
    }

    const key = req.headers['x-api-key'] || '';
    if (!key) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'missing api key' }));
      return;
    }

    if (body.version !== 1 || !Array.isArray(body.samples)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid envelope' }));
      return;
    }

    received.push({
      at: new Date().toISOString(),
      apiKeyHeader: key,
      envelope: body,
    });

    res.writeHead(202, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ accepted: body.samples.length }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0', () => {
  console.log(`[mock-collector] listening on :${port}`);
});
