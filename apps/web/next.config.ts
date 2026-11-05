import type { NextConfig } from 'next';
import path from 'node:path';

const apiUrl = process.env['API_INTERNAL_URL'] ?? 'http://localhost:4000';

const config: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }];
  },
};

export default config;
