import type { IncomingMessage, ServerResponse } from 'http';
import appImport, { app as namedApp } from '../server.js';

const resolvedApp: any =
  typeof appImport === 'function'
    ? appImport
    : typeof (appImport as any)?.default === 'function'
    ? (appImport as any).default
    : typeof namedApp === 'function'
    ? namedApp
    : null;

function restoreApiUrl(req: IncomingMessage) {
  const rawUrl = req.url || '/';
  try {
    const parsed = new URL(rawUrl, 'http://localhost');
    const rewrittenPath = parsed.searchParams.get('__path');
    if (rewrittenPath !== null) {
      parsed.searchParams.delete('__path');
      const cleanPath = rewrittenPath.replace(/^\/+/, '');
      const qs = parsed.searchParams.toString();
      req.url = `/api/${cleanPath}${qs ? `?${qs}` : ''}`;
      return;
    }

    const originalUrlHeader =
      (req.headers['x-vercel-original-url'] as string | undefined) ||
      (req.headers['x-invoke-path'] as string | undefined);
    if (
      originalUrlHeader &&
      originalUrlHeader.startsWith('/api/') &&
      (parsed.pathname === '/api' || parsed.pathname === '/api/index')
    ) {
      const origParsed = new URL(originalUrlHeader, 'http://localhost');
      const qs = parsed.searchParams.toString() || origParsed.searchParams.toString();
      req.url = `${origParsed.pathname}${qs ? `?${qs}` : ''}`;
    }
  } catch {
    // ignore malformed URL
  }
}

export default function handler(req: IncomingMessage, res: ServerResponse) {
  restoreApiUrl(req);

  if (typeof resolvedApp !== 'function') {
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(
        JSON.stringify({
          success: false,
          code: 'SHEETS_UNAVAILABLE',
          message: 'Lỗi khởi tạo máy chủ API trên Vercel.',
        })
      );
    }
    return;
  }

  try {
    return resolvedApp(req, res);
  } catch (err: any) {
    console.error('Vercel handler dispatch error:', err?.message || err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(
        JSON.stringify({
          success: false,
          code: 'SHEETS_UNAVAILABLE',
          message: err?.message || 'Lỗi xử lý yêu cầu máy chủ.',
        })
      );
    }
  }
}
