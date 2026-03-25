import { Suspense } from 'react';
import TeacherLoginForm from './TeacherLoginForm';

export default function TeacherLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-bg-page flex items-center justify-center text-text-muted text-sm">
          読み込み中…
        </div>
      }
    >
      <TeacherLoginForm />
    </Suspense>
  );
}
