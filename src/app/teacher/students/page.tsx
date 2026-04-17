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

export type StudentEntry = { name: string; yomi: string; displayName: string; selected: boolean };

export default async function StudentsPage() {

  let entries: StudentEntry[] = PRESET_STUDENTS.map(name => ({ name, yomi: '', displayName: '', selected: false }));

  if (hasDatabaseUrl()) {
    let assignNames: string[] = [];
    let yomiMap = new Map<string, string>();
    let displayNameMap = new Map<string, string>();
    let selectedSet = new Set<string>();

    try {
      await sql`
        CREATE TABLE IF NOT EXISTS student_selected (
          name TEXT PRIMARY KEY,
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `;
      const rows = await sql`SELECT name FROM student_selected`;
      selectedSet = new Set((rows as { name: string }[]).map(r => r.name));
    } catch {}

    try {
      const rows = await sql`SELECT DISTINCT TRIM(student_name) AS name FROM assignments WHERE student_name IS NOT NULL AND TRIM(student_name) <> ''`;
      assignNames = (rows as { name: string }[]).map(r => r.name);
    } catch {}

    try {
      const rows = await sql`SELECT name, yomi, display_name FROM student_meta`;
      yomiMap = new Map((rows as { name: string; yomi: string; display_name: string }[]).map(r => [r.name, r.yomi]))
      displayNameMap = new Map((rows as { name: string; yomi: string; display_name: string }[]).map(r => [r.name, r.display_name ?? '']));
    } catch {}

    let registeredNames: string[] = [];
    try {
      const rows = await sql`SELECT name FROM registered_students WHERE name IS NOT NULL AND TRIM(name) <> ''`;
      registeredNames = (rows as { name: string }[]).map(r => r.name);
    } catch {}

    const allNames = Array.from(new Set([...PRESET_STUDENTS, ...assignNames, ...registeredNames]));
    entries = allNames.map(name => ({
      name,
      yomi: yomiMap.get(name) ?? '',
      displayName: displayNameMap.get(name) ?? '',
      selected: selectedSet.has(name),
    }));
    entries.sort((a, b) => {
      const ya = a.yomi || a.name;
      const yb = b.yomi || b.name;
      return ya.localeCompare(yb, 'ja');
    });
  }

  let pendingDeletions: string[] = [];
  if (hasDatabaseUrl()) {
    try {
      const rows = await sql`
        SELECT student_name FROM student_deletion_requests WHERE status = 'pending'
      `;
      pendingDeletions = (rows as { student_name: string }[]).map(r => r.student_name);
    } catch {}
  }

  return <StudentsClient students={entries} pendingDeletions={pendingDeletions} />;
}
