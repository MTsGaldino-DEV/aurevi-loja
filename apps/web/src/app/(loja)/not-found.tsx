import Link from 'next/link';

export const metadata = { title: 'Página não encontrada' };

export default function LojaNotFound() {
  return (
    <div className="px-gutter py-24 text-center">
      <h1 className="font-serif text-4xl">Página não encontrada</h1>
      <p className="mt-4">O endereço que você tentou abrir não existe ou mudou de lugar.</p>
      <Link
        href="/"
        className="mt-8 inline-flex min-h-11 items-center bg-cocoa px-6 py-2 text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cocoa"
      >
        Voltar para a loja
      </Link>
    </div>
  );
}
