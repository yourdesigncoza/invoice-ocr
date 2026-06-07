import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root — a stray lockfile in $HOME otherwise misleads
  // Turbopack's root inference.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
