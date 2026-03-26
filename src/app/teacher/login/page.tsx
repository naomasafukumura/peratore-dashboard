import { Suspense } from 'react';
import { isTeacherGateEnabledResolved } from '@/lib/teacher-password-resolve';
import TeacherLoginForm from './TeacherLoginForm';

export const dynamic = 'force-dynamic';

export default function TeacherLoginPage() {
  const gateEnabled = isTeacherGateEnabledResolved();
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-bg-page flex items-center justify-center text-text-muted text-sm">
          読み込み中…
        </div>
      }
    >
      <TeacherLoginForm initialGateEnabled={gateEnabled} />
    </Suspense>
  );
}
