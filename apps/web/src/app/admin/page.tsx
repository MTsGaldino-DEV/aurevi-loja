import { adminGet } from '@/lib/admin-api';

// Placeholder landing page: the dashboard replaces it. It already proves the cookie reaches the API.
export default async function AdminHome() {
  const { admin } = await adminGet<{ admin: { email: string } }>('auth/me');
  return (
    <main className="px-gutter py-12">
      <h1 className="font-serif text-4xl">Painel da loja</h1>
      <p className="mt-2">Conectado como {admin.email}.</p>
    </main>
  );
}
