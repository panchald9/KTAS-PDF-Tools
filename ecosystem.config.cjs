module.exports = {
  apps: [
    {
      name: "ktas-tools",
      script: "npm",
      args: "start",
      cwd: "./",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PORT: 5000,
      },
    },
  ],
};
