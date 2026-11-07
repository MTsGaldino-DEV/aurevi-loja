import Link from 'next/link';

export const metadata = { title: 'Página não encontrada' };

export default function PainelNotFound() {
  return (
    <>
      <h1 className="font-serif text-4xl">Página não encontrada</h1>
      <p className="mt-4">Esta página do painel não existe.</p>
      <Link
        href="/admin"
        className="mt-6 inline-flex min-h-11 items-center underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cocoa"
      >
        Voltar ao início
      </Link>
    </>
  );
}
