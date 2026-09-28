import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // node-sqlite3-wasm loads a .wasm file relative to its own package path.
  // Bundling rewrites that path and the file goes missing at runtime.
  serverExternalPackages: ['node-sqlite3-wasm'],
};

export default nextConfig;
