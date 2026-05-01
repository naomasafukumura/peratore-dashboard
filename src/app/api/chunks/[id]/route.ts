import { sql } from '@/lib/db';
import { unauthorizedIfNotTeacher } from '@/lib/require-teacher-session';
import { NextRequest, NextResponse } from 'next/server';

/**
 * PUT /api/chunks/:id
 * カテゴリを単純更新する（origin 制限なし）。受講生編集画面のカテゴリ select 用。
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await unauthorizedIfNotTeacher(req);
  if (denied) return denied;

  const { id: idStr } = await params;
  const chunkId = parseInt(idStr, 10);
  if (Number.isNaN(chunkId)) {
    return NextResponse.json({ error: 'Invalid chunk id' }, { status: 400 });
  }

  let body: { categoryId?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const categoryId = body.categoryId;
  if (categoryId == null || typeof categoryId !== 'number' || categoryId < 1) {
    return NextResponse.json({ error: 'categoryId が必要です' }, { status: 400 });
  }

  const [cat] = await sql`SELECT id FROM categories WHERE id = ${categoryId}`;
  if (!cat) {
    return NextResponse.json({ error: 'カテゴリが見つかりません' }, { status: 404 });
  }

  const [updated] = await sql`
    UPDATE chunks SET category_id = ${categoryId} WHERE id = ${chunkId} RETURNING id
  `;
  if (!updated) {
    return NextResponse.json({ error: 'チャンクが見つかりません' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, chunkId, categoryId });
}

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/chunks/:id
 * レッスンフォーム由来（origin = lesson_form）のチャンクだけ、別カテゴリへ移動する。
 * chunk_number / sort_order は移動先カテゴリ内の末尾に振り直す。
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await unauthorizedIfNotTeacher(req);
  if (denied) return denied;

  const { id: idStr } = await params;
  const chunkId = parseInt(idStr, 10);
  if (Number.isNaN(chunkId)) {
    return NextResponse.json({ error: 'Invalid chunk id' }, { status: 400 });
  }

  let body: { categoryId?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const categoryId = body.categoryId;
  if (categoryId == null || typeof categoryId !== 'number' || categoryId < 1) {
    return NextResponse.json({ error: 'categoryId が必要です' }, { status: 400 });
  }

  const [chunk] = await sql`
    SELECT id, category_id, origin FROM chunks WHERE id = ${chunkId}
  `;
  if (!chunk) {
    return NextResponse.json({ error: 'チャンクが見つかりません' }, { status: 404 });
  }

  if (chunk.origin !== 'lesson_form') {
    return NextResponse.json(
      { error: 'レッスンフォームで追加されたチャンクだけカテゴリ変更できます' },
      { status: 403 }
    );
  }

  if (Number(chunk.category_id) === categoryId) {
    return NextResponse.json({ ok: true, message: 'すでにこのカテゴリです', chunkId });
  }

  const [cat] = await sql`SELECT id FROM categories WHERE id = ${categoryId}`;
  if (!cat) {
    return NextResponse.json({ error: 'カテゴリが見つかりません' }, { status: 404 });
  }

  const [nextNums] = await sql`
    SELECT
      COALESCE(MAX(chunk_number), 0) + 1 AS next_number,
      COALESCE(MAX(sort_order), 0) + 1 AS next_order
    FROM chunks
    WHERE category_id = ${categoryId}
  `;

  await sql`
    UPDATE chunks
    SET
      category_id = ${categoryId},
      chunk_number = ${nextNums.next_number},
      sort_order = ${nextNums.next_order}
    WHERE id = ${chunkId} AND origin = 'lesson_form'
  `;

  return NextResponse.json({
    ok: true,
    chunkId,
    categoryId,
    chunk_number: nextNums.next_number,
  });
}
