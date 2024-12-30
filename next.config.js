/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    // Add a rule to handle private class fields in undici
    config.module.rules.push({
      test: /node_modules\/undici\/.*\.js$/,
      loader: 'babel-loader',
      options: {
        presets: ['@babel/preset-env'],
        plugins: ['@babel/plugin-transform-private-methods']
      }
    });

    return config;
  },
  experimental: {
    esmExternals: true
  },
  poweredByHeader: false,
  compress: true,
  hostname: '0.0.0.0',
  port: 3000
};

export default nextConfig; 