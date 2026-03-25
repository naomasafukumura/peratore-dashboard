import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: DefaultSession['user'] & {
      id: string;
      assignmentName?: string | null;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    assignmentName?: string | null;
  }
}
