import { redirectTeacherLoginIfNeeded } from '@/lib/redirect-teacher-login-if-needed';
import LessonFormClient from './teacher/lesson-form/LessonFormClient';

export const dynamic = 'force-dynamic';

export default async function Home() {
  await redirectTeacherLoginIfNeeded('/');
  return <LessonFormClient />;
}
