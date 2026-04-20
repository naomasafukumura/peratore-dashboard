import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const k = (v?: string) => ({
    set: Boolean(v && v.trim().length > 0),
    len: v?.trim().length ?? 0,
  });
  return NextResponse.json({
    AUTH_SECRET: k(process.env.AUTH_SECRET),
    NEXTAUTH_SECRET: k(process.env.NEXTAUTH_SECRET),
    AUTH_URL: k(process.env.AUTH_URL),
    NEXTAUTH_URL: k(process.env.NEXTAUTH_URL),
    GOOGLE_CLIENT_ID: k(process.env.GOOGLE_CLIENT_ID),
    GOOGLE_CLIENT_SECRET: k(process.env.GOOGLE_CLIENT_SECRET),
    DATABASE_URL: k(process.env.DATABASE_URL),
    VERCEL: process.env.VERCEL ?? null,
    VERCEL_ENV: process.env.VERCEL_ENV ?? null,
    NODE_ENV: process.env.NODE_ENV ?? null,
  });
}
