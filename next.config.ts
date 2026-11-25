import type { NextConfig } from "next";
const config: NextConfig = {
  // The browser-test copy has its own build/cache and never shares dev locks.
  ...(process.env.NEXT_TEST_DIST_DIR === "1"
    ? { distDir: ".next-playwright" }
    : {}),
  poweredByHeader: false,
  devIndicators: false,
  serverExternalPackages: ["unpdf"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};
export default config;
