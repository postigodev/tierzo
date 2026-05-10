import type { NextConfig } from "next";

const apiBase =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_TIERZO_API_URL ||
  "http://localhost:8000";

const apiUrl = new URL(apiBase);

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: apiUrl.protocol.replace(":", "") as "http" | "https",
        hostname: apiUrl.hostname,
        port: apiUrl.port,
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;