import type { IncomingMessage, ServerResponse } from 'http';
import appImport, { app as namedApp } from '../server';

const resolvedApp: any =
  typeof appImport === 'function'
    ? appImport
    : typeof (appImport as any)?.default === 'function'
    ? (appImport as any).default
    : typeof namedApp === 'function'
    ? namedApp
    : null;

export default function handler(req: IncomingMessage, res: ServerResponse) {
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
