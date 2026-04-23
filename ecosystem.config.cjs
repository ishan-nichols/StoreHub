// PM2 process manager config — works locally (Windows) and in cloud (Linux).
//
// Local start:      pm2 start ecosystem.config.cjs
// Production start: NODE_ENV=production pm2 start ecosystem.config.cjs --env production
//
// Install PM2: npm install -g pm2
// Save process list: pm2 save

const isProd = process.env.NODE_ENV === "production";
const isWindows = process.platform === "win32";

module.exports = {
  apps: [
    // ── API Server ───────────────────────────────────────────────────────────
    {
      name: "storehub-api",
      cwd: "./artifacts/api-server",
      script: "node",
      args: "--enable-source-maps --env-file=.env ./dist/index.mjs",
      exec_mode: "fork",
      interpreter: "none",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: { NODE_ENV: "development" },
      env_production: { NODE_ENV: "production" },
    },

    // ── Frontend ─────────────────────────────────────────────────────────────
    // Windows: run via cmd.exe so .cmd scripts resolve properly.
    // Linux:   run pnpm directly.
    {
      name: "storehub-web",
      cwd: "./artifacts/storehub",
      ...(isWindows
        ? {
            script: "cmd.exe",
            args: isProd
              ? "/c pnpm run preview -- --port 5173 --host 0.0.0.0"
              : "/c pnpm run dev",
            interpreter: "none",
          }
        : {
            script: "pnpm",
            args: isProd ? "run preview -- --port 5173 --host 0.0.0.0" : "run dev",
          }),
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false,
      env: { NODE_ENV: "development", PORT: "5173" },
      env_production: { NODE_ENV: "production", PORT: "5173" },
    },
  ],
};
