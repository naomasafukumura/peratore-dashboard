import { redirect } from 'next/navigation';
import { redirectTeacherLoginIfNeeded } from '@/lib/redirect-teacher-login-if-needed';

export const dynamic = 'force-dynamic';

export default async function TeacherPage() {
  await redirectTeacherLoginIfNeeded('/teacher');
  redirect('/teacher/students');
}
