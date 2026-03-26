import { NextResponse } from 'next/server';
import { isTeacherGateEnabledResolved } from '@/lib/teacher-password-resolve';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** クライアント向け: 先生用パスワードゲートが有効か（秘密は返さない） */
export async function GET() {
  return NextResponse.json(
    { gateEnabled: isTeacherGateEnabledResolved() },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    },
  );
}
