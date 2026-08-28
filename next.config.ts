import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // content/ is read from disk at request time (preferences.md, rankings-template.csv),
  // so keep it in the serverless bundle — tracing doesn't follow the runtime path join.
  outputFileTracingIncludes: {
    "/api/**": ["./content/**"],
  },
};

export default nextConfig;
