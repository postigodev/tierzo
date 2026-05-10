import type { NextConfig } from "next";

const apiBase =
  process.env.NEXT_PUBLIC_API_URL ??
  process.env.NEXT_PUBLIC_TIERZO_API_URL ??
  "http://localhost:8000";
const apiUrl = new URL(apiBase);

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: apiUrl.protocol.replace(":", ""),
        hostname: apiUrl.hostname,
        port: apiUrl.port || undefined,
        pathname: "/packs/**",
      },
    ],
  },
};

export default nextConfig;
