import http from 'node:http';

const PORT = Number(process.env.PORT ?? 4000);

const sections: Record<string, string> = {
  sales: '## Sales\n\n- 42 new customers\n- Revenue up 8% week over week',
  support: '## Support\n\n- 310 tickets closed\n- Median first response: 12 minutes',
  engineering: '## Engineering\n\n- Release 3.4 shipped\n- 2 incidents, both resolved',
};

// Endpoints that start broken. Default: support. BROKEN= (empty) starts everything healthy.
const broken = new Set(
  (process.env.BROKEN ?? 'support')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

const server = http.createServer((req, res) => {
  const url = req.url ?? '/';

  const chaos = url.match(/^\/chaos\/(\w+)\/(on|off)$/);
  if (req.method === 'POST' && chaos) {
    const [, name, mode] = chaos;
    if (mode === 'on') broken.add(name);
    else broken.delete(name);
    console.log(`chaos: ${name} is now ${mode === 'on' ? 'BROKEN' : 'healthy'}`);
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end(`${name} ${mode === 'on' ? 'broken' : 'healthy'}\n`);
    return;
  }

  const name = url.slice(1);
  if (req.method === 'GET' && sections[name]) {
    if (broken.has(name)) {
      console.log(`GET /${name} -> 503`);
      res.writeHead(503, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: `${name} is unavailable` }));
      return;
    }
    console.log(`GET /${name} -> 200`);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ section: sections[name] }));
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, () => {
  console.log(`Mock API on http://localhost:${PORT}`);
  console.log(`Broken endpoints: ${[...broken].join(', ') || 'none'}`);
});
