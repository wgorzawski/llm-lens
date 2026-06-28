module.exports = {
  apps: [
    {
      name: "demo-api",
      cwd: "/home/llm-lens/apps/api",
      script: "node",
      args: "dist/index.js",
      env_file: "/home/llm-lens/apps/api/.env",
      autorestart: true,
      max_memory_restart: "300M",
    },
    {
      name: "demo-web",
      cwd: "/home/llm-lens/apps/web",
      script: "node",
      args: ".output/server/index.mjs",
      env_file: "/home/llm-lens/apps/web/.env",
      autorestart: true,
      max_memory_restart: "400M",
    },
  ],
};
