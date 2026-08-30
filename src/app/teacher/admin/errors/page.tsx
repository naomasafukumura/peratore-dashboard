import { redirectAdminLoginIfNeeded } from '@/lib/admin-session';
import ErrorsClient from './ErrorsClient';

export const dynamic = 'force-dynamic';

export default async function AdminErrorsPage() {
  await redirectAdminLoginIfNeeded('/teacher/admin/errors');
  return <ErrorsClient />;
}
