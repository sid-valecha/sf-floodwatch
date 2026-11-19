import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // CHP incidents are matched to neighborhoods server-side (src/lib/conditions/chp.ts reads this via fs).
  outputFileTracingIncludes: {
    "/api/conditions": ["./public/data/neighborhoods.geojson"],
  },
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
