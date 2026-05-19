import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/**
 * next-intl v4 plugin: points to the request-scoped config at
 * src/i18n/request.ts. Operates in "without i18n routing" mode — locale is
 * resolved from cookie/header per request, URLs are not prefixed.
 */
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@neigo/shared'],
  images: {
    remotePatterns: [
      // Cloudflare R2 dedicated asset domain (production)
      {
        protocol: 'https',
        hostname: 'assets.neigo.my.id',
        pathname: '/**',
      },
      // Cloudflare R2 private/signed bucket URLs (dev fallback)
      {
        protocol: 'https',
        hostname: '*.r2.cloudflarestorage.com',
        pathname: '/**',
      },
    ],
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${API_URL}/api/:path*`,
      },
    ];
  },
  webpack: (config, { isServer }) => {
    // @neigo/shared uses .js extensions in imports for ESM/Bun compatibility.
    // Teach webpack to resolve .js → .ts/.tsx so Next.js can compile the shared source.
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
};

export default withNextIntl(config);
