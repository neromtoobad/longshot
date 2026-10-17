// Production entry: runs the Next app and the worker side by side in one service, so they share
// the data dir (a Railway volume at $LONGSHOT_DATA_DIR). If either process dies, exit so the
// platform restarts the whole service.

import { spawn } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const port = process.env.PORT ?? "3000";
const children = [];

function run(name, cmd, args, cwd, env = {}) {
  const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: "inherit" });
  child.on("exit", (code, signal) => {
    console.error(`[start] ${name} exited (${signal ?? code}); shutting down`);
    for (const c of children) if (c !== child) c.kill("SIGTERM");
    process.exit(code ?? 1);
  });
  children.push(child);
}

run("app", process.execPath, [resolve(root, "app/node_modules/next/dist/bin/next"), "start", "-p", port, "-H", "0.0.0.0"], resolve(root, "app"));
run("worker", process.execPath, [resolve(root, "agent/node_modules/tsx/dist/cli.mjs"), "src/worker.ts"], resolve(root, "agent"), {
  APP_BASE_URL: `http://127.0.0.1:${port}`,
});

for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => {
    for (const c of children) c.kill(sig);
  });
}
