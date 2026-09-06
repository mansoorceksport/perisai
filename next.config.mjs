/**
 * Plain ESM, deliberately not next.config.ts.
 *
 * A TypeScript config forces `next start` to load TypeScript at RUNTIME. The
 * production image carries no devDependencies, so every cold start npm-installed
 * typescript before serving: slower boot, and enough extra memory to exceed a
 * 1 GiB Cloud Run limit and get the container killed with a 503. Type checking
 * still happens in CI via `bunx tsc --noEmit`; the config itself does not need
 * types to be correct.
 *
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  // Allow access to remote image placeholder.
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
    ],
  },
  transpilePackages: ['motion'],
  webpack: (config, { dev }) => {
    // HMR is disabled in AI Studio via DISABLE_HMR env var.
    // Do not modify—file watching is disabled to prevent flickering during agent edits.
    if (dev && process.env.DISABLE_HMR === 'true') {
      config.watchOptions = {
        ignored: /.*/,
      };
    }
    return config;
  },
};

export default nextConfig;
