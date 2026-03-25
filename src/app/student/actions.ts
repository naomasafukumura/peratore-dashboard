'use server';

import { signOut } from '@/auth';

export async function signOutStudent() {
  await signOut({ redirectTo: '/student' });
}
