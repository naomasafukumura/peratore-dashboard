import { NextRequest, NextResponse } from 'next/server';
import { isStaff } from '@/lib/legacy';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return NextResponse.json({ ok: await isStaff(req) });
}
