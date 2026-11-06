import type { MetadataRoute } from 'next';

const site = process.env['NEXT_PUBLIC_SITE_URL'] ?? 'http://localhost:3000';

export default function robots(): MetadataRoute.Robots {
  if (process.env['PREVIEW_MODE'] === 'true') {
    return { rules: { userAgent: '*', disallow: '/' } };
  }
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/admin', '/checkout', '/pedido', '/api/'] },
    sitemap: `${site}/sitemap.xml`,
  };
}
