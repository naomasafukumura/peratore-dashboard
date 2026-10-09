import { NextRequest, NextResponse } from 'next/server';
import { destroySession } from '@/lib/legacy';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const res = NextResponse.json({ success: true });
  await destroySession(req, res);
  return res;
}
