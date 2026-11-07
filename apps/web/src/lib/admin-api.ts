import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

const apiUrl = process.env['API_INTERNAL_URL'] ?? 'http://localhost:4000';

// Server-side reads only. Writes are fetches from the browser, which sets the Origin the API checks.
export async function adminGet<T>(path: string): Promise<T> {
  const token = (await cookies()).get('aurevi_admin')?.value;
  const response = await fetch(`${apiUrl}/api/admin/${path}`, {
    cache: 'no-store',
    headers: token ? { cookie: `aurevi_admin=${token}` } : {},
  });
  if (response.status === 401) redirect('/admin/login');
  if (response.status === 404) notFound();
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: unknown } | null;
    throw new Error(
      typeof body?.message === 'string' ? body.message : `API admin/${path} returned ${response.status}`,
    );
  }
  return response.json() as Promise<T>;
}
