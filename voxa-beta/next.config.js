/** @type {import("next").NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["172.20.10.3"],
  devIndicators: false,
  turbopack: {
    root: __dirname,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "1mb",
    },
  },
  serverExternalPackages: ["@livekit/rtc-node", "@livekit/rtc-ffi-bindings"],
};

module.exports = nextConfig;
