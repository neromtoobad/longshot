import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pin the workspace root to this repo so Next doesn't infer it from a stray
  // lockfile elsewhere on the machine.
  turbopack: {
    root: path.resolve(import.meta.dirname, ".."),
  },
};

export default nextConfig;
