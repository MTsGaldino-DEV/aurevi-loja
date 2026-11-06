'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

const FIELD = 'mt-1 block min-h-11 w-full border border-clay bg-paper px-3 py-2';

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: data.get('email'), password: data.get('password') }),
      });
      if (response.ok) {
        router.replace('/admin');
        return; // keep the button disabled while the page changes
      }
      const body = (await response.json().catch(() => null)) as { message?: unknown } | null;
      setError(typeof body?.message === 'string' ? body.message : 'Não foi possível entrar. Tente de novo.');
    } catch {
      setError('Sem conexão com o servidor. Tente de novo.');
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-5">
      <label className="block">
        E-mail
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          className={FIELD}
        />
      </label>
      <label className="block">
        Senha
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={FIELD}
        />
      </label>
      <p role="alert" aria-live="polite" className="min-h-6 text-sm font-medium text-cocoa">
        {error}
      </p>
      <button
        type="submit"
        disabled={busy}
        className="min-h-11 w-full bg-cocoa px-6 py-2 text-paper disabled:opacity-60"
      >
        {busy ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  );
}
