module.exports = {
  apps: [
    {
      name: 'alaska-waitlist',
      script: '.next/standalone/server.js',
      instances: 'max',
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        PORT: 3000,
        NODE_ENV: 'production',
        HOSTNAME: '0.0.0.0'
      }
       
    }
  ]
}; 