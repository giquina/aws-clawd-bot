/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  images: {
    unoptimized: true
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://16.171.150.151:3000/api/:path*',
      },
    ];
  },
}

module.exports = nextConfig
