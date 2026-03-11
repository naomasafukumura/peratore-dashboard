import { cookies } from 'next/headers';

const SESSION_COOKIE = 'teacher_session';
const SESSION_VALUE = 'authenticated';

export async function isTeacherAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE)?.value === SESSION_VALUE;
}

export function verifyPassword(password: string): boolean {
  return password === process.env.TEACHER_PASSWORD;
}

export { SESSION_COOKIE, SESSION_VALUE };
