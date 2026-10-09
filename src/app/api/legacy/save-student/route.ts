import { randomBytes } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  isStaff, readStore, unauthorized, writeStore, type LegacyStudent, type LegacyStudentsDoc,
} from '@/lib/legacy';
import { logError } from '@/lib/error-log';

export const dynamic = 'force-dynamic';

/** 旧 myportal/save_student.php の置き換え（FormData の action で分岐） */
function newAccessKey(id: number) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = randomBytes(16);
  return `${id}-${Array.from(bytes, b => chars[b % chars.length]).join('')}`;
}

function parseJsonList(v: FormDataEntryValue | null): unknown[] {
  try {
    const x = JSON.parse(String(v ?? '[]'));
    return Array.isArray(x) ? x : [];
  } catch {
    return [];
  }
}

const fail = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });

export async function POST(req: NextRequest) {
  if (!(await isStaff(req))) return unauthorized();
  let action = '';
  try {
    const f = await req.formData();
    action = String(f.get('action') ?? '');
    const str = (k: string) => String(f.get(k) ?? '').trim();
    const doc = await readStore<LegacyStudentsDoc>('students');
    doc.students ??= [];
    doc.instructors ??= [];
    doc.templates ??= {};

    switch (action) {
      case 'migrate':
        // 旧版がデータ形式の移行に使っていた呼び出し。DB 移行済みなので何もしない
        return NextResponse.json({ success: true });

      case 'add': {
        const name = str('name');
        if (!name) return fail('名前が必要です');
        const id = doc.students.reduce((m, s) => Math.max(m, Number(s.id) || 0), 0) + 1;
        const student: LegacyStudent = {
          id, name, lineName: str('lineName'), lineUrl: str('lineUrl'), ppUrl: str('ppUrl'),
          accessKey: newAccessKey(id), startMonth: str('startMonth'), endMonth: str('endMonth'),
          status: 'active', createdAt: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10),
          lessons: [], nonWeekly: false, freq: str('freq') || '月4', freqChanges: parseJsonList(f.get('freqChanges')),
        };
        doc.students.push(student);
        await writeStore('students', doc);
        return NextResponse.json({ success: true, student });
      }

      case 'edit': {
        const s = doc.students.find(x => String(x.id) === str('id'));
        if (!s) return fail('受講生が見つかりません', 404);
        Object.assign(s, {
          name: str('name') || s.name, lineName: str('lineName'), lineUrl: str('lineUrl'), ppUrl: str('ppUrl'),
          status: str('status') || s.status, startMonth: str('startMonth'), endMonth: str('endMonth'),
          freq: str('freq') || s.freq, freqChanges: parseJsonList(f.get('freqChanges')),
        });
        await writeStore('students', doc);
        return NextResponse.json({ success: true });
      }

      case 'delete': {
        const before = doc.students.length;
        doc.students = doc.students.filter(x => String(x.id) !== str('id'));
        if (doc.students.length === before) return fail('受講生が見つかりません', 404);
        await writeStore('students', doc);
        return NextResponse.json({ success: true });
      }

      case 'add_instructor': {
        const name = str('instructor');
        if (!name) return fail('講師名が必要です');
        if (doc.instructors.includes(name)) return fail('同じ名前の講師がすでにいます');
        doc.instructors.push(name);
        await writeStore('students', doc);
        return NextResponse.json({ success: true });
      }

      case 'edit_instructor': {
        const oldName = str('oldInstructor');
        const newName = str('newInstructor');
        const i = doc.instructors.indexOf(oldName);
        if (i < 0 || !newName) return fail('講師が見つかりません', 404);
        doc.instructors[i] = newName;
        await writeStore('students', doc);
        return NextResponse.json({ success: true });
      }

      case 'delete_instructor': {
        const name = str('instructor');
        if (!doc.instructors.includes(name)) return fail('講師が見つかりません', 404);
        doc.instructors = doc.instructors.filter(x => x !== name);
        await writeStore('students', doc);
        return NextResponse.json({ success: true });
      }

      case 'save_template': {
        const type = str('templateType');
        if (!type) return fail('templateType が必要です');
        doc.templates[type] = String(f.get('templateContent') ?? '');
        await writeStore('students', doc);
        return NextResponse.json({ success: true });
      }

      default:
        return fail('無効なアクションです');
    }
  } catch (e) {
    await logError('legacy-save-student', e, { status: 500, context: { action } });
    return fail((e as Error).message, 500);
  }
}
