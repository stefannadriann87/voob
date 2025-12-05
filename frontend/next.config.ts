import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pentru static export (necesar pentru S3/CloudFront)
  output: process.env.NODE_ENV === 'production' ? 'export' : undefined,
  
  // Images unoptimized pentru static export
  images: {
    unoptimized: true,
  },
  
  // Trailing slash pentru compatibilitate
  trailingSlash: true,
  
  // Rewrite API calls către backend
  async rewrites() {
    // Doar în development, în production folosim direct URL-ul backend
    if (process.env.NODE_ENV === 'development') {
      return [
        {
          source: '/api/:path*',
          destination: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/:path*`,
        },
      ];
    }
    return [];
  },
};

export default nextConfig;
