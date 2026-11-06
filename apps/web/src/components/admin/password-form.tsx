'use client';

import { type FormEvent, useState } from 'react';

const FIELD = 'mt-1 block min-h-11 w-full border border-clay bg-paper px-3 py-2';

export function PasswordForm() {
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setDone(false);
    if (data.get('newPassword') !== data.get('confirm')) {
      setError('A confirmação não é igual à nova senha.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/admin/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: data.get('currentPassword'),
          newPassword: data.get('newPassword'),
        }),
      });
      if (response.ok) {
        form.reset();
        setDone(true);
      } else {
        const body = (await response.json().catch(() => null)) as { message?: unknown } | null;
        setError(
          typeof body?.message === 'string' ? body.message : 'Não foi possível trocar a senha. Tente de novo.',
        );
      }
    } catch {
      setError('Sem conexão com o servidor. Tente de novo.');
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-5">
      <label className="block">
        Senha atual
        <input name="currentPassword" type="password" autoComplete="current-password" required className={FIELD} />
      </label>
      <label className="block">
        Nova senha
        <input
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={10}
          required
          aria-describedby="password-rule"
          className={FIELD}
        />
        <span id="password-rule" className="mt-1 block text-sm">
          Use ao menos 10 caracteres.
        </span>
      </label>
      <label className="block">
        Confirmar nova senha
        <input name="confirm" type="password" autoComplete="new-password" required className={FIELD} />
      </label>
      <p role="alert" aria-live="polite" className="min-h-6 text-sm font-medium text-cocoa">
        {error}
      </p>
      <p role="status" className="min-h-6 text-sm font-medium text-cocoa">
        {done ? 'Senha alterada com sucesso.' : ''}
      </p>
      <button
        type="submit"
        disabled={busy}
        className="min-h-11 w-full bg-cocoa px-6 py-2 text-paper disabled:opacity-60"
      >
        {busy ? 'Salvando…' : 'Alterar senha'}
      </button>
    </form>
  );
}
