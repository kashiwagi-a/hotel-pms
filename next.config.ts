import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // らく通の CSV をアップロードできるよう、Server Actions の上限を 10MB にする
  experimental: { serverActions: { bodySizeLimit: '10mb' } },
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
