import { redirectTeacherLoginIfNeeded } from '@/lib/redirect-teacher-login-if-needed';
import LessonFormClient from './LessonFormClient';

export const dynamic = 'force-dynamic';

export default async function LessonFormPage() {
  await redirectTeacherLoginIfNeeded('/teacher/lesson-form');
  return <LessonFormClient />;
}
