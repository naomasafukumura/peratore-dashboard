import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/assignments?student=xxx
 * 受講生の割り当てチャンク一覧を返す
 * studentなしの場合、全受講生の一覧を返す
 */
export async function GET(req: NextRequest) {
  const studentName = req.nextUrl.searchParams.get('student');

  try {
    if (studentName) {
      const assignments = await sql`
        SELECT a.id, a.student_name, a.chunk_id,
          ch.title_en, ch.title_jp, c.name as category_name, c.type as category_type
        FROM assignments a
        JOIN chunks ch ON ch.id = a.chunk_id
        JOIN categories c ON c.id = ch.category_id
        WHERE a.student_name = ${studentName}
        ORDER BY c.sort_order, ch.sort_order
      `;
      return NextResponse.json({ student: studentName, assignments });
    } else {
      // 全受講生リスト
      const students = await sql`
        SELECT DISTINCT student_name,
          COUNT(*)::int as chunk_count
        FROM assignments
        GROUP BY student_name
        ORDER BY student_name
      `;
      return NextResponse.json({ students });
    }
  } catch (e) {
    console.error('Assignments GET error:', e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/**
 * POST /api/assignments
 * { studentName, chunkIds: [1, 2, 3] }
 */
export async function POST(req: NextRequest) {
  try {
    const { studentName, chunkIds } = await req.json();
    if (!studentName || !chunkIds?.length) {
      return NextResponse.json({ error: 'Missing studentName or chunkIds' }, { status: 400 });
    }

    for (const chunkId of chunkIds) {
      await sql`
        INSERT INTO assignments (student_name, chunk_id)
        VALUES (${studentName}, ${chunkId})
        ON CONFLICT (student_name, chunk_id) DO NOTHING
      `;
    }

    return NextResponse.json({ ok: true, added: chunkIds.length });
  } catch (e) {
    console.error('Assignments POST error:', e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/**
 * DELETE /api/assignments
 * { studentName, chunkIds: [1, 2, 3] }  or  { studentName } で全削除
 */
export async function DELETE(req: NextRequest) {
  try {
    const { studentName, chunkIds } = await req.json();
    if (!studentName) {
      return NextResponse.json({ error: 'Missing studentName' }, { status: 400 });
    }

    if (chunkIds?.length) {
      for (const chunkId of chunkIds) {
        await sql`
          DELETE FROM assignments
          WHERE student_name = ${studentName} AND chunk_id = ${chunkId}
        `;
      }
    } else {
      await sql`DELETE FROM assignments WHERE student_name = ${studentName}`;
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Assignments DELETE error:', e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
