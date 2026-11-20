import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Allow local IP during Cursor browser automation (localhost vs 127.0.0.1). */
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // Required for the Dokploy Docker image (deploy/docker/Dockerfile).
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  // Branding banners go up to 2 MB; the 1 MB default would reject them.
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
