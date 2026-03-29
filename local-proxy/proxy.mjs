/**
 * ProofForge SAP Local Proxy
 *
 * Runs on Windows machine with VPN access to SAP.
 * Proxies OData requests from browser to SAP, bypassing CORS.
 *
 * Usage:
 *   node proxy.mjs
 *
 * Or with custom port:
 *   set PROXY_PORT=9090 && node proxy.mjs
 */

import http from 'http';
import https from 'https';

const PORT = process.env.PROXY_PORT || 8585;

const server = http.createServer(async (req, res) => {
  // CORS headers — allow everything from any origin
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept, X-SAP-Target');

  // Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', proxy: 'ProofForge SAP Local Proxy' }));
    return;
  }

  // Expect: /sap/... with X-SAP-Target header containing base URL
  const targetBase = req.headers['x-sap-target'];
  if (!targetBase) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing X-SAP-Target header (SAP base URL)' }));
    return;
  }

  const targetUrl = `${targetBase}${req.url}`;
  console.log(`[PROXY] ${req.method} ${targetUrl}`);

  try {
    const mod = targetUrl.startsWith('https') ? https : http;
    const proxyReq = mod.request(targetUrl, {
      method: req.method,
      headers: {
        ...req.headers,
        host: new URL(targetBase).host,
        'x-sap-target': undefined,
      },
      rejectUnauthorized: false, // SAP self-signed certs
    }, (proxyRes) => {
      console.log(`[PROXY] <- ${proxyRes.statusCode}`);

      // Copy response headers
      const headers = { ...proxyRes.headers };
      // Override CORS
      headers['access-control-allow-origin'] = '*';
      delete headers['x-frame-options'];

      res.writeHead(proxyRes.statusCode, headers);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      console.error(`[PROXY] Error: ${err.message}`);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Proxy error: ${err.message}` }));
    });

    proxyReq.setTimeout(30000, () => {
      proxyReq.destroy();
      res.writeHead(504, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'SAP request timeout' }));
    });

    req.pipe(proxyReq);
  } catch (err) {
    console.error(`[PROXY] Exception: ${err.message}`);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
});

server.listen(PORT, () => {
  console.log(`\n  ProofForge SAP Local Proxy`);
  console.log(`  Listening on http://localhost:${PORT}`);
  console.log(`  Health check: http://localhost:${PORT}/health\n`);
});
