import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // ポータブル版（npm run build:portable）のため、動作に必要なファイルだけを .next/standalone にまとめる
  output: 'standalone',
  // ビルドしたフォルダを基準にする（上の階層に別の package-lock.json があっても出力先がずれないように）
  outputFileTracingRoot: __dirname,
  // らく通の CSV をアップロードできるよう、Server Actions の上限を 10MB にする
  experimental: { serverActions: { bodySizeLimit: '10mb' } },
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
