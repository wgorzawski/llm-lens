module.exports = {
  apps: [
    {
      name: "llm-lens-api-prod",
      cwd: "/home/llm-lens/apps/api",
      script: "node",
      args: "dist/index.js",
      env_file: "/home/llm-lens/apps/api/.env",
      autorestart: true,
      max_memory_restart: "300M",
    },
    {
      name: "llm-lens-prod",
      cwd: "/home/llm-lens/apps/web",
      script: "node",
      args: ".output/server/index.mjs",
      env_file: "/home/llm-lens/apps/web/.env",
      autorestart: true,
      max_memory_restart: "400M",
    },
  ],
};
