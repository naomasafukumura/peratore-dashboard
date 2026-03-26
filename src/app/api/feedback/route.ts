import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log('[feedback]', JSON.stringify(body));
  } catch {
    // ignore parse errors
  }
  return NextResponse.json({ ok: true });
}
