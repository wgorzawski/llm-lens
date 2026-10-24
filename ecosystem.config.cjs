const path = require("path");
const fs = require("fs");
const os = require("os");

// PM2 caches a process's env (PATH included) from when it was first created, and `script: "node"`
// was resolved through it - so bumping .nvmrc never moved these apps off Node 22.19.0 (still
// running on it in Oct 2026, unpatched against CVE-2026-111497). Run the node binary of the
// version from .nvmrc by absolute path and pin PATH to it too; deploy.sh re-creates the processes
// on every deploy, so this is always re-read. Same approach as fudini.
const NVMRC_VERSION = fs.readFileSync(path.resolve(__dirname, ".nvmrc"), "utf8").trim();
const NODE_BIN_DIR = path.join(os.homedir(), ".nvm", "versions", "node", `v${NVMRC_VERSION}`, "bin");
const NODE_BIN = path.join(NODE_BIN_DIR, "node");
const PINNED_NODE_ENV = { PATH: `${NODE_BIN_DIR}:${process.env.PATH}` };

module.exports = {
  apps: [
    {
      name: "llm-lens-api-prod",
      // Relative to wherever `pm2 start`/`pm2 restart ecosystem.config.cjs` is invoked
      // from (deploy.sh always `cd`s into the deploy dir first) - not hardcoded to a
      // specific absolute path, so moving the deploy directory doesn't require editing
      // this file too (papu-prod's move under /home/mikrus needed exactly this fix).
      cwd: "apps/api",
      script: NODE_BIN,
      interpreter: "none",
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
      env: PINNED_NODE_ENV,
    },
    {
      name: "llm-lens-prod",
      cwd: "apps/web",
      script: NODE_BIN,
      interpreter: "none",
      args: ["--env-file=.env", ".output/server/index.mjs"],
      autorestart: true,
      max_memory_restart: "400M",
      env: PINNED_NODE_ENV,
    },
  ],
};
