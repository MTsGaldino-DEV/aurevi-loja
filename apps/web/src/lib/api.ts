const apiUrl = process.env['API_INTERNAL_URL'] ?? 'http://localhost:4000';

export class NotFoundError extends Error {}

// Cached on the server. Admin changes will purge the "catalog" tag; the time limit keeps stock honest.
export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${apiUrl}/api/${path}`, {
    next: { revalidate: 60, tags: ['catalog'] },
  });
  if (response.status === 404) throw new NotFoundError(path);
  if (!response.ok) throw new Error(`API ${path} returned ${response.status}`);
  return response.json() as Promise<T>;
}
