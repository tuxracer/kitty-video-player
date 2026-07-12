import { createServer } from 'node:http';
import type { Server } from 'node:http';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { detectRangeSupport } from './index.ts';

const HTTP_OK = 200;
const HTTP_PARTIAL_CONTENT = 206;
const BODY = '0123456789';

const listeningUrl = async (server: Server): Promise<string> => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('server reported no port');
  }
  return `http://127.0.0.1:${address.port}/`;
};

const closeServer = async (server: Server): Promise<void> => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error === undefined ? resolve() : reject(error)));
  });
};

describe('detectRangeSupport', () => {
  let rangeServer: Server;
  let rangeUrl: string;
  let plainServer: Server;
  let plainUrl: string;
  let stallServer: Server;
  let stallUrl: string;

  beforeAll(async () => {
    rangeServer = createServer((request, response) => {
      const range = /^bytes=(\d+)-(\d+)$/.exec(request.headers.range ?? '');
      if (range === null) {
        response.writeHead(HTTP_OK, { 'Content-Length': BODY.length });
        response.end(BODY);
        return;
      }
      const start = Number(range[1]);
      const end = Math.min(Number(range[2]), BODY.length - 1);
      response.writeHead(HTTP_PARTIAL_CONTENT, {
        'Content-Range': `bytes ${start}-${end}/${BODY.length}`,
        'Content-Length': end - start + 1,
      });
      response.end(BODY.slice(start, end + 1));
    });
    rangeUrl = await listeningUrl(rangeServer);

    // Ignores Range and streams the full body chunked, like a server that
    // generates the response on the fly
    plainServer = createServer((_request, response) => {
      response.writeHead(HTTP_OK);
      response.end(BODY);
    });
    plainUrl = await listeningUrl(plainServer);

    // Accepts the connection and never answers
    stallServer = createServer(() => undefined);
    stallUrl = await listeningUrl(stallServer);
  });

  afterAll(async () => {
    await Promise.all([closeServer(rangeServer), closeServer(plainServer), closeServer(stallServer)]);
  });

  it('reports true for a server honoring range requests', async () => {
    await expect(detectRangeSupport(rangeUrl)).resolves.toBe(true);
  });

  it('reports false for a server that ignores ranges', async () => {
    await expect(detectRangeSupport(plainUrl)).resolves.toBe(false);
  });

  it('reports false when the connection is refused', async () => {
    // Port 1 is privileged and unbound, so the connection is refused fast
    await expect(detectRangeSupport('http://127.0.0.1:1/')).resolves.toBe(false);
  });

  it('reports false when the server never answers within the timeout', async () => {
    await expect(detectRangeSupport(stallUrl, { timeoutMs: 100 })).resolves.toBe(false);
  });
});
