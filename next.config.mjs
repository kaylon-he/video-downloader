const nextConfig = {
  output: "standalone",
  experimental: {
    serverComponentsExternalPackages: ["playwright", "playwright-core"],
    outputFileTracingExcludes: {
      "**/*": ["./storage/**"],
    },
  },
};

export default nextConfig;
