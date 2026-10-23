const nextConfig = {
  output: "standalone",
  experimental: {
    outputFileTracingExcludes: {
      "**/*": ["./storage/**"],
    },
  },
};

export default nextConfig;
