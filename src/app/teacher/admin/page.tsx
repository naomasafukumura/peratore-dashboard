import { redirectAdminLoginIfNeeded } from '@/lib/admin-session';
import AdminClient from './AdminClient';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  await redirectAdminLoginIfNeeded('/teacher/admin');
  return <AdminClient />;
}
