#!/usr/bin/env node
/** Serves docs/ for local development. Rebuilds the site data first so you never
 *  debug against a stale copy. Not used in production — Pages serves docs/ directly. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { p, log } from './lib/util.js';

const PORT = Number(process.env.PORT) || 8080;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
};

execFileSync(process.execPath, [p('scripts', 'build-site.js')], { stdio: 'inherit' });

http
  .createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const rel = url === '/' ? '/index.html' : url;
    const file = path.join(p('docs'), path.normalize(rel));

    // Never serve outside docs/, whatever the request path claims.
    if (!file.startsWith(p('docs'))) {
      res.statusCode = 403;
      return res.end('forbidden');
    }

    fs.readFile(file, (err, body) => {
      if (err) {
        res.statusCode = 404;
        return res.end('not found');
      }
      res.setHeader('content-type', TYPES[path.extname(file)] || 'application/octet-stream');
      res.setHeader('cache-control', 'no-store');
      res.end(body);
    });
  })
  .listen(PORT, () => log.info(`serving docs/ at http://localhost:${PORT}`));
