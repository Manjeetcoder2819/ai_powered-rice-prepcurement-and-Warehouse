import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  async rewrites() {
    const backendUrl =
      process.env.BACKEND_INTERNAL_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      "http://127.0.0.1:8000";

    return [
      {
        source: "/api/v1/:path*",
        destination: `${backendUrl.replace(/\/api\/v1\/?$/, "").replace(/\/$/, "")}/api/v1/:path*`,
      },
      {
        source: "/uploads/:path*",
        destination: `${backendUrl.replace(/\/api\/v1\/?$/, "").replace(/\/$/, "")}/uploads/:path*`,
      },
    ];
  },
};

export default nextConfig;
