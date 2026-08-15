import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "photographer-flow.c33326344888118eb4a7a0a8b279e0bd.r2.cloudflarestorage.com",
        pathname: "/**",
      },
    ],
  },
  // The album PDF/JPG/PSD export routes all read Hebrew/Latin font files off disk at runtime
  // (pdf-lib and the sharp/SVG text renderer both need real font bytes). Output file tracing's
  // static analysis usually catches fs.readFile calls with literal paths, but this makes it
  // explicit so the font files are never silently dropped from the deployed function bundle.
  outputFileTracingIncludes: {
    "/api/galleries/\\[id\\]/album/export-pdf": ["src/assets/fonts/**/*"],
    "/api/galleries/\\[id\\]/album/export-jpg": ["src/assets/fonts/**/*"],
    "/api/galleries/\\[id\\]/album/export-psd": ["src/assets/fonts/**/*"],
  },
};

export default nextConfig;
