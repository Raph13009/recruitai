import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Allow local IP during Cursor browser automation (localhost vs 127.0.0.1). */
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  cacheComponents: true,
  partialPrefetching: true,
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
