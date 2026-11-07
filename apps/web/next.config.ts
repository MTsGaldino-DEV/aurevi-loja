import type { NextConfig } from 'next';
import path from 'node:path';

const apiUrl = process.env['API_INTERNAL_URL'] ?? 'http://localhost:4000';

const config: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
  // Order links carry an access token, which must not leak through the Referer header.
  async headers() {
    return [
      ...(process.env['PREVIEW_MODE'] === 'true'
        ? [{ source: '/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] }]
        : []),
      {
        source: '/pedido/:path*',
        headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }],
      },
    ];
  },
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }];
  },
};

export default config;
