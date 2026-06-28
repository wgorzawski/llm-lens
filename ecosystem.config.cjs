module.exports = {
  apps: [
    {
      name: "demo-api",
      cwd: "./apps/api",
      script: "node",
      args: "dist/index.js",
      env_file: "./apps/api/.env",
      autorestart: true,
      max_memory_restart: "300M",
    },
    {
      name: "demo-web",
      cwd: "./apps/web",
      script: "node",
      args: ".output/server/index.mjs",
      env_file: "./apps/web/.env",
      autorestart: true,
      max_memory_restart: "400M",
    },
  ],
};
