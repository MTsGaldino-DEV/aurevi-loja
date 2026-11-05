import { revalidateTag } from 'next/cache';
import { timingSafeEqual } from 'node:crypto';

// Called by the API when catalog data changes. The secret keeps it closed to the public.
export async function POST(request: Request) {
  const secret = process.env['REVALIDATE_SECRET'];
  const given = request.headers.get('x-revalidate-secret') ?? '';
  const valid =
    secret !== undefined &&
    secret.length > 0 &&
    given.length === secret.length &&
    timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  if (!valid) return new Response(null, { status: 401 });
  revalidateTag('catalog', { expire: 0 });
  return Response.json({ revalidated: true });
}
