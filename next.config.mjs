/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  basePath: '/Tesori-italia-900',
  devIndicators: false,
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
