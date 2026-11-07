'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useRef, useState } from 'react';

type Item = { label: string; href?: string };

// Only the items with an href have a real screen in this stage; the rest are reminders.
const MAIN: Item[] = [
  { label: 'Início', href: '/admin' },
  { label: 'Pedidos', href: '/admin/pedidos' },
  { label: 'Produtos' },
  { label: 'Estoque' },
  { label: 'Clientes' },
  { label: 'Carrinhos abandonados' },
  { label: 'Cupons' },
  { label: 'Estatísticas' },
  { label: 'Configurações' },
];
const LATER: Item[] = [
  { label: 'Frete grátis' },
  { label: 'Promoções' },
  { label: 'Mensagens automáticas' },
  { label: 'Controle da loja' },
];

const ROW = 'flex min-h-11 items-center justify-between px-3 py-2';
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cocoa';

function Menu({
  email,
  onNavigate,
}: {
  email: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState('');

  async function logout() {
    setLeaving(true);
    setError('');
    try {
      const response = await fetch('/api/admin/auth/logout', { method: 'POST' });
      // 401: the session is already gone, which is what leaving means.
      if (!response.ok && response.status !== 401) throw new Error(String(response.status));
    } catch {
      setError('Não foi possível sair. Verifique a conexão e tente de novo.');
      setLeaving(false);
      return;
    }
    router.replace('/admin/login');
  }

  function renderItem({ label, href }: Item) {
    if (!href) {
      return (
        <li key={label} className="flex min-h-9 items-center justify-between gap-2 px-3 py-1.5 text-clay">
          <span>{label}</span>
          <span className="shrink-0 rounded-sm border border-sand px-2 text-xs whitespace-nowrap">Em breve</span>
        </li>
      );
    }
    const active = href === '/admin' ? pathname === '/admin' : pathname.startsWith(href);
    return (
      <li key={label}>
        <Link
          href={href}
          onClick={onNavigate}
          aria-current={active ? 'page' : undefined}
          className={`${ROW} ${FOCUS} ${active ? 'bg-cocoa text-paper' : 'hover:bg-sand/50'}`}
        >
          {label}
        </Link>
      </li>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <nav aria-label="Painel" className="flex-1 overflow-y-auto">
        <ul>{MAIN.map(renderItem)}</ul>
        <ul className="mt-4 border-t border-sand pt-4">{LATER.map(renderItem)}</ul>
      </nav>
      <div className="mt-4 border-t border-sand pt-4">
        <p className="truncate px-3 text-sm" title={email}>
          {email}
        </p>
        <Link
          href="/admin/conta/senha"
          onClick={onNavigate}
          className={`${ROW} ${FOCUS} text-sm underline`}
        >
          Alterar senha
        </Link>
        <button
          type="button"
          onClick={logout}
          disabled={leaving}
          className={`${ROW} ${FOCUS} w-full text-left disabled:opacity-60`}
        >
          {leaving ? 'Saindo…' : 'Sair'}
        </button>
        <p role="status" aria-live="polite" className="px-3 text-sm">
          {error}
        </p>
      </div>
    </div>
  );
}

export function AdminShell({ email, children }: { email: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const openButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const opener = openButton.current;
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      opener?.focus();
    };
  }, [open]);

  return (
    <div className="flex flex-1 flex-col lg:flex-row">
      <aside className="hidden w-64 shrink-0 border-r border-sand p-4 lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
        <p className="mb-4 px-3 text-sm tracking-[0.2em] text-clay uppercase">Aurevi</p>
        <div className="min-h-0 flex-1">
          <Menu email={email} />
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-sand bg-paper px-gutter lg:hidden">
        <p className="text-sm tracking-[0.2em] text-clay uppercase">Aurevi</p>
        <button
          ref={openButton}
          type="button"
          aria-expanded={open}
          aria-controls="admin-drawer"
          onClick={() => setOpen(true)}
          className={`${ROW} ${FOCUS} -mr-3`}
        >
          Menu
        </button>
      </header>

      {open && (
        <div className="fixed inset-0 z-30 lg:hidden">
          <div className="absolute inset-0 bg-cocoa/40" onClick={() => setOpen(false)} aria-hidden />
          <div
            id="admin-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Menu do painel"
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-paper p-4"
          >
            <div className="mb-2 flex items-center justify-between">
              <p className="px-3 text-sm tracking-[0.2em] text-clay uppercase">Aurevi</p>
              <button ref={closeButton} type="button" onClick={() => setOpen(false)} className={`${ROW} ${FOCUS}`}>
                Fechar
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <Menu email={email} onNavigate={() => setOpen(false)} />
            </div>
          </div>
        </div>
      )}

      <main className="min-w-0 flex-1 px-gutter py-8 lg:py-12">{children}</main>
    </div>
  );
}
