import { NextRequest, NextResponse } from 'next/server';
import { isStaff, readStore, unauthorized, writeStore, type LegacyLesson, type LegacyStudentsDoc } from '@/lib/legacy';
import { logError } from '@/lib/error-log';

export const dynamic = 'force-dynamic';

/** 旧 myportal/save_lesson.php の置き換え（保存・削除・番号の振り直し） */
const fail = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });

function dateValue(d: string) {
  const [y, m, day] = d.split('.').map(Number);
  return y ? new Date(y, (m || 1) - 1, day || 1).getTime() : Number.MAX_SAFE_INTEGER;
}

export async function POST(req: NextRequest) {
  if (!(await isStaff(req))) return unauthorized();
  let action = '';
  try {
    const f = await req.formData();
    action = String(f.get('action') ?? 'save');
    const str = (k: string) => String(f.get(k) ?? '').trim();
    const doc = await readStore<LegacyStudentsDoc>('students');
    const student = (doc.students ?? []).find(s => String(s.id) === str('studentId'));
    if (!student) return fail('受講生が見つかりません', 404);
    student.lessons ??= [];

    if (action === 'delete') {
      const n = Number(str('lessonNumber'));
      student.lessons = student.lessons.filter(l => l.lessonNumber !== n);
    } else if (action === 'renumber') {
      student.lessons.sort((a, b) => dateValue(a.date) - dateValue(b.date));
      student.lessons.forEach((l, i) => { l.lessonNumber = i + 1; });
    } else {
      const n = Number(str('lessonNumber'));
      if (!Number.isInteger(n) || n < 1) return fail('レッスン番号が不正です');
      const lesson: LegacyLesson = {
        lessonNumber: n, date: str('date'), instructor: str('instructor'),
        videoUrl: str('videoUrl'), memoUrl: str('memoUrl'),
        cancelled: str('cancelled') === '1', note: str('note'),
      };
      const i = student.lessons.findIndex(l => l.lessonNumber === n);
      if (i >= 0) student.lessons[i] = { ...student.lessons[i], ...lesson };
      else student.lessons.push(lesson);
      student.lessons.sort((a, b) => a.lessonNumber - b.lessonNumber);
    }
    await writeStore('students', doc);
    return NextResponse.json({ success: true });
  } catch (e) {
    await logError('legacy-save-lesson', e, { status: 500, context: { action } });
    return fail((e as Error).message, 500);
  }
}
