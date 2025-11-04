import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

function unauthorized() {
  return new NextResponse('Unauthorized', { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="FantasyZone"' } });
}

export function middleware(req: NextRequest) {
  if (!req.nextUrl.pathname.startsWith('/admin')) return NextResponse.next();
  const auth = req.headers.get('authorization') || '';
  if (!auth.startsWith('Basic ')) return unauthorized();
  const decoded = atob(auth.slice(6));
  const sep = decoded.indexOf(':');
  const user = decoded.slice(0, sep);
  const pass = decoded.slice(sep + 1);
  if (user === (process.env.ADMIN_USER || '') && pass === (process.env.ADMIN_PASS || '')) return NextResponse.next();
  return unauthorized();
}

export const config = { matcher: ['/admin/:path*'] };

