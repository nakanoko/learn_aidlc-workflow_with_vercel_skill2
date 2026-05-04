/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ['@prisma/client', 'prisma'],
  logging: {
    fetches: {
      fullUrl: false,
    },
  },
};

module.exports = nextConfig;
