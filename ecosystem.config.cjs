module.exports = {
  apps: [
    {
      name: "llm-lens-api-prod",
      cwd: "/home/llm-lens/apps/api",
      script: "node",
      // PM2's `env_file` option doesn't reliably apply on a fresh `pm2 start` of a
      // brand-new process name (only ever verified working for the pre-existing
      // demo-api/demo-web processes, which had been running - and re-saved via
      // `pm2 save` - for a long time). Renaming to llm-lens-api-prod/llm-lens-prod
      // exposed it: both crashed in a restart loop ("JWT_SECRET environment variable
      // is required" / EADDRINUSE on Nitro's default port 3000) until switched to
      // Node's own --env-file flag here, which is reliable regardless of PM2's
      // process-registration state.
      args: ["--env-file=.env", "dist/index.js"],
      autorestart: true,
      max_memory_restart: "300M",
    },
    {
      name: "llm-lens-prod",
      cwd: "/home/llm-lens/apps/web",
      script: "node",
      args: ["--env-file=.env", ".output/server/index.mjs"],
      autorestart: true,
      max_memory_restart: "400M",
    },
  ],
};
