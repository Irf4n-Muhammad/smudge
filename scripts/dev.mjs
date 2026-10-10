import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  setTimeout(() => process.exit(code), 500).unref();
}
function start(args) {
  const child = spawn(process.execPath, args, {
    cwd: root,
    stdio: "inherit",
    windowsHide: true,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  });
  children.push(child);
  child.on("exit", (code) => {
    if (!stopping) stop(code ?? 1);
  });
  child.on("error", (e) => {
    console.error(e.message);
    stop(1);
  });
}
start(["--import", "tsx", "apps/server/index.ts"]);
start([
  "node_modules/next/dist/bin/next",
  "dev",
  "apps/web",
  "--webpack",
  "--hostname",
  "127.0.0.1",
  "--port",
  "3000",
]);
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => stop());
