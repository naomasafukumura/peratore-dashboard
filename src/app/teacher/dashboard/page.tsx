import { hasDatabaseUrl, sql } from '@/lib/db';
import TeacherClient from '../TeacherClient';
import TeacherDbMissing from '../TeacherDbMissing';

export const dynamic = 'force-dynamic';

const PRESET_STUDENTS = [
  '伊吾田恵津子', '犬塚美代子', '井上優子', '氏家敦子',
  '及川祐貴', '小川早喜', '小川美喜子', '甲斐博美',
  '狩野怜菜', '川上潔', '木戸真紀子', '桑野千尋',
  '齋藤りの', '佐藤妙', '佐藤結衣', '高瀬範子',
  '高橋通江', '徳原かずみ', '徳世由美子', '古屋淳',
  '前田結衣', '牧内晴代', '松隈由香', '松本桂子',
  '山下千恵子', '山田智美', 'ロバス由貴',
];

export default async function TeacherDashboardPage() {

  if (!hasDatabaseUrl()) {
    return <TeacherDbMissing />;
  }

  const [categoryRows, assignRows] = await Promise.all([
    sql`SELECT name FROM categories ORDER BY sort_order`,
    sql`SELECT DISTINCT TRIM(student_name) AS name FROM assignments WHERE student_name IS NOT NULL AND TRIM(student_name) <> ''`,
  ]);

  const categoryNames = (categoryRows as { name: string }[]).map(r => r.name);
  const fromDb = (assignRows as { name: string }[]).map(r => r.name);
  const studentNames = Array.from(new Set([...PRESET_STUDENTS, ...fromDb]));

  return (
    <TeacherClient
      categoryNames={categoryNames}
      studentNames={studentNames}
    />
  );
}
