import { redirectTeacherLoginIfNeeded } from '@/lib/redirect-teacher-login-if-needed';
import { hasDatabaseUrl, sql } from '@/lib/db';
import StudentsClient from './StudentsClient';

export const dynamic = 'force-dynamic';

const PRESET_STUDENTS = [
  '伊吾田恵津子', '犬塚美代子', '井上優子',
  '氏家敦子',
  '及川祐貴', '小川早喜', '小川美喜子',
  '甲斐博美', '狩野怜菜', '川上潔', '木戸真紀子', '桑野千尋',
  '齋藤りの', '佐藤妙', '佐藤結衣',
  '高瀬範子', '高橋通江', '徳原かずみ', '徳世由美子',
  '古屋淳',
  '前田結衣', '牧内晴代', '松隈由香', '松本桂子',
  '山下千恵子', '山田智美',
  'ロバス由貴',
];

export type StudentEntry = { name: string; yomi: string };

export default async function StudentsPage() {
  await redirectTeacherLoginIfNeeded('/teacher/students');

  let entries: StudentEntry[] = PRESET_STUDENTS.map(name => ({ name, yomi: '' }));

  if (hasDatabaseUrl()) {
    let assignNames: string[] = [];
    let yomiMap = new Map<string, string>();

    try {
      const rows = await sql`SELECT DISTINCT TRIM(student_name) AS name FROM assignments WHERE student_name IS NOT NULL AND TRIM(student_name) <> ''`;
      assignNames = (rows as { name: string }[]).map(r => r.name);
    } catch {}

    try {
      const rows = await sql`SELECT name, yomi FROM student_meta`;
      yomiMap = new Map((rows as { name: string; yomi: string }[]).map(r => [r.name, r.yomi]));
    } catch {}

    const allNames = Array.from(new Set([...PRESET_STUDENTS, ...assignNames]));
    entries = allNames.map(name => ({ name, yomi: yomiMap.get(name) ?? '' }));
    entries.sort((a, b) => {
      const ya = a.yomi || a.name;
      const yb = b.yomi || b.name;
      return ya.localeCompare(yb, 'ja');
    });
  }

  return <StudentsClient students={entries} />;
}
