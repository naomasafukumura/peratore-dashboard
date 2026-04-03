import { redirectTeacherLoginIfNeeded } from '@/lib/redirect-teacher-login-if-needed';
import TeacherHome from './TeacherHome';

export const dynamic = 'force-dynamic';

export default async function TeacherPage() {
  await redirectTeacherLoginIfNeeded('/teacher');
  return <TeacherHome />;
}
