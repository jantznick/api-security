const http = require('http');

const received = [];

const server = http.createServer(async (req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }
  if (req.url === '/_received') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ count: received.length, batches: received }));
    return;
  }
  if (req.method === 'POST' && req.url === '/v1/samples') {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString('utf8');
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      res.writeHead(400);
      res.end('bad json');
      return;
    }
    received.push({
      at: new Date().toISOString(),
      key: req.headers['x-api-key'] || null,
      sampleCount: Array.isArray(body.samples) ? body.samples.length : 0,
      body,
    });
    res.writeHead(202, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ accepted: body.samples?.length || 0 }));
    return;
  }
  res.writeHead(404);
  res.end('not found');
});

server.listen(8080, '0.0.0.0', () => {
  console.log('mock collector on :8080');
});
