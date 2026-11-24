import path from "node:path";
import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  // Beperkende CSP zonder inline-scripts te breken: geen framing, plugins of formulier-doorsturing naar derden.
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  devIndicators: { position: "bottom-right" },
  reactStrictMode: true,
  serverExternalPackages: ["postgres", "unpdf", "mammoth"],
  // Monorepo: gedeelde pakketten worden als TypeScript-bron meegebouwd.
  transpilePackages: ["@workstudio/shared", "@workstudio/code-execution"],
  outputFileTracingRoot: path.join(__dirname, "../.."),
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
