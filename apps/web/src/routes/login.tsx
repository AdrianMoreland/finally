import { zodResolver } from '@hookform/resolvers/zod';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { MailCheck } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ThemeButton } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/auth';

export const Route = createFileRoute('/login')({
  beforeLoad: ({ context }) => {
    if (context.auth.session) throw redirect({ to: '/' });
  },
  component: LoginPage,
});

const schema = z.object({ email: z.email('Enter a valid email address') });
type Values = z.infer<typeof schema>;

const testLogin = import.meta.env.VITE_TEST_LOGIN === 'true';

function LoginPage() {
  const auth = useAuth();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: '' } });

  const onPasswordSignIn = form.handleSubmit(async ({ email }) => {
    setServerError(null);
    const { error } = await auth.signInWithPassword(email.trim().toLowerCase(), password);
    if (error) setServerError(error);
  });

  const onSubmit = form.handleSubmit(async ({ email }) => {
    setServerError(null);
    const { error } = await auth.sendMagicLink(email.trim().toLowerCase());
    if (error) setServerError(error);
    else setSentTo(email);
  });

  return (
    <main className="grid min-h-svh place-items-center p-6">
      <div className="absolute right-4 top-4">
        <ThemeButton />
      </div>
      <div className="w-full max-w-[380px]">
        <div className="mb-6 flex items-center gap-3">
          <svg width="40" height="40" viewBox="0 0 32 32" aria-hidden="true">
            <rect x="1" y="1" width="30" height="30" rx="6" fill="var(--fill)" />
            <path d="M10 10.5h12" stroke="var(--on-fill)" strokeWidth="2.4" strokeLinecap="round" />
            <circle cx="16" cy="19.5" r="5.6" fill="none" stroke="var(--on-fill)" strokeWidth="2.4" />
            <path d="M16 17v5" stroke="var(--on-fill)" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <div>
            <h1 className="font-display text-[26px] font-medium leading-none tracking-[-0.01em]">Finally</h1>
            <p className="mt-1 text-[13px] text-ink-2">Your money, in one calm place.</p>
          </div>
        </div>

        {sentTo ? (
          <div className="rounded-card bg-surface p-5" role="status">
            <MailCheck className="mb-2 size-6 text-brand" aria-hidden="true" />
            <h2 className="font-display text-[20px] font-medium">Check your email</h2>
            <p className="mt-1.5 text-[13.5px] text-ink-2">
              We sent a sign-in link to <b className="text-ink">{sentTo}</b>. Open it on this device to continue.
            </p>
            <button type="button" className="mt-3 text-[13px] font-semibold text-brand" onClick={() => setSentTo(null)}>
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="grid gap-3 rounded-card bg-surface p-5" noValidate>
            <div className="grid gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" autoFocus placeholder="you@example.com" aria-invalid={!!form.formState.errors.email} {...form.register('email')} />
              {form.formState.errors.email ? <p className="text-[12.5px] text-bad">{form.formState.errors.email.message}</p> : null}
            </div>
            {serverError ? <p className="text-[12.5px] text-bad" role="alert">{serverError}</p> : null}
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? 'Sending…' : 'Email me a sign-in link'}
            </Button>
            {testLogin ? (
              <div className="grid gap-1.5 border-t border-hair pt-3">
                <Label htmlFor="test-password">Test password</Label>
                <Input id="test-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                <Button type="button" variant="outline" disabled={!password || form.formState.isSubmitting} onClick={() => void onPasswordSignIn()}>
                  Sign in without email
                </Button>
              </div>
            ) : null}
            <p className="text-[12px] text-ink-3">Only approved email addresses can use this app.</p>
          </form>
        )}
      </div>
    </main>
  );
}
