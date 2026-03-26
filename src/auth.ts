import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { hasDatabaseUrl, sql } from '@/lib/db';
import { resolveAuthSecret } from '@/lib/resolve-auth-secret';

/**
 * リクエスト時に毎回 env を読む（モジュール初回評価が next.config の dotenv より早いと secret が空になるのを防ぐ）。
 */
export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  const googleConfigured =
    Boolean(process.env.GOOGLE_CLIENT_ID?.trim()) &&
    Boolean(process.env.GOOGLE_CLIENT_SECRET?.trim());

  return {
    trustHost: true,
    secret: resolveAuthSecret(),
    providers: googleConfigured
      ? [
          Google({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          }),
        ]
      : [],
    callbacks: {
      async signIn({ account, profile }) {
        if (!hasDatabaseUrl() || !account?.providerAccountId) return true;
        const sub = account.providerAccountId;
        const email = (profile as { email?: string } | undefined)?.email ?? null;
        const name =
          (profile as { name?: string } | undefined)?.name ??
          (profile as { email?: string } | undefined)?.email ??
          '受講生';
        try {
          await sql`
            INSERT INTO students (google_sub, email, name)
            VALUES (${sub}, ${email}, ${name})
            ON CONFLICT (google_sub) DO UPDATE SET
              email = COALESCE(EXCLUDED.email, students.email),
              name = COALESCE(EXCLUDED.name, students.name),
              updated_at = NOW()
          `;
        } catch (e) {
          console.error('students upsert on signIn:', e);
        }
        return true;
      },
      async jwt({ token, account }) {
        if (account?.provider === 'google' && account.providerAccountId) {
          token.sub = account.providerAccountId;
        }
        const sub = token.sub;
        if (sub && hasDatabaseUrl()) {
          try {
            const rows = await sql`
              SELECT assignment_name FROM students WHERE google_sub = ${sub} LIMIT 1
            `;
            const row = rows[0] as { assignment_name: string | null } | undefined;
            token.assignmentName = row?.assignment_name ?? null;
          } catch (e) {
            console.error('jwt assignment_name:', e);
            token.assignmentName = null;
          }
        } else {
          token.assignmentName = null;
        }
        return token;
      },
      async session({ session, token }) {
        if (session.user) {
          session.user.id = token.sub ?? '';
          session.user.assignmentName =
            typeof token.assignmentName === 'string'
              ? token.assignmentName
              : token.assignmentName === null
                ? null
                : undefined;
        }
        return session;
      },
    },
  };
});
