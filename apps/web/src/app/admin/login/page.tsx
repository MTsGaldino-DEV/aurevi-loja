import type { Metadata } from 'next';
import { LoginForm } from '@/components/admin/login-form';

export const metadata: Metadata = { title: 'Entrar' };

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-gutter py-12">
      <div className="w-full max-w-sm">
        <p className="text-sm tracking-[0.2em] text-clay uppercase">Aurevi</p>
        <h1 className="mt-2 font-serif text-4xl">Painel da loja</h1>
        <LoginForm />
      </div>
    </main>
  );
}
