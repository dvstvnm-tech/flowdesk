/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' }, // Google avatars
      { protocol: 'https', hostname: 'graph.microsoft.com' },        // Microsoft avatars
      { protocol: 'https', hostname: '*.supabase.co' },
    ],
  },
};

export default nextConfig;
