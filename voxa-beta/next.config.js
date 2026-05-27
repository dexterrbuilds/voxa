/** @type {import("next").NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["172.20.10.3"],
  devIndicators: false,
  experimental: {
    serverActions: {
      bodySizeLimit: "1mb",
    },
  },
};

module.exports = nextConfig;
