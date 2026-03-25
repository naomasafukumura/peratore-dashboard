import { auth } from '@/auth';
import { NextRequest, NextResponse } from 'next/server';
import { fetchRecentLessonForStudent } from '@/lib/student-recent-lesson';

/**
 * GET /api/student/recent-lesson
 * - practice-data と同様: ?student=… または Google セッションの assignment_name
 * - レッスンフォーム由来（chunks.origin = lesson_form）のパターンを新しい順
 */
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const queryStudent = req.nextUrl.searchParams.get('student')?.trim() || null;
  const session = await auth();
  const sessionStudent =
    !queryStudent && session?.user?.assignmentName?.trim()
      ? session.user.assignmentName.trim()
      : null;
  const studentName = queryStudent || sessionStudent;

  if (!studentName) {
    return NextResponse.json({ summary: [], practiceCategory: null });
  }

  try {
    const payload = await fetchRecentLessonForStudent(studentName);
    return NextResponse.json(payload);
  } catch (e) {
    console.error('recent-lesson:', e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
