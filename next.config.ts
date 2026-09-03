import type { NextConfig } from "next";
import { MAX_REQUEST_BYTES } from "./src/lib/ingest/columns";

const nextConfig: NextConfig = {
  output: "standalone",
  reactCompiler: true,
  experimental: {
    // Next drops the entire chunk crossing its buffer cap. Leave transport-chunk
    // headroom so the route observes overflow and returns 413 before parsing.
    proxyClientMaxBodySize: MAX_REQUEST_BYTES + 1024 * 1024,
  },
};

export default nextConfig;
