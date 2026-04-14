import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config) => {
    // pdfjs-dist optionally requires 'canvas' for server-side rendering
    // which is not available in Next.js — alias it to false to prevent errors
    config.resolve.alias = {
      ...config.resolve.alias,
      canvas: false,
    };
    return config;
  },
};

export default nextConfig;
