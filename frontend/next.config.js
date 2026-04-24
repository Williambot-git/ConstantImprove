/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  reactStrictMode: true,
  compress: true,
  poweredByHeader: false,
  images: { unoptimized: true },
};

module.exports = nextConfig;
