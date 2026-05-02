import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  basePath: '/Saurabh-s-Audio-Reader',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
