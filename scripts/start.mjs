// Production launcher: API + runtime, the built Next.js app, and the edge proxy on $PORT.
// Build first with `npm run build`. Configuration is read from the environment (.env.example).
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createEdge } from "./edge.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = { ...process.env, FORMA_MODE: process.env.FORMA_MODE ?? "production" };
env.NEXT_TELEMETRY_DISABLED = "1";
const appUrl = new URL(env.FORMA_PUBLIC_URL ?? "");
const runtimeUrl = new URL(env.FORMA_RUNTIME_URL ?? "");
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  setTimeout(() => process.exit(code), 3000).unref();
}
function start(args) {
  const child = spawn(process.execPath, args, { cwd: root, stdio: "inherit", env });
  children.push(child);
  child.on("exit", (code) => {
    if (!stopping) stop(code ?? 1);
  });
}
start(["--import", "tsx", "apps/server/index.ts"]);
start([
  "node_modules/next/dist/bin/next",
  "start",
  "apps/web",
  "--hostname",
  "127.0.0.1",
  "--port",
  "3000",
]);
const port = Number(env.PORT ?? 8080);
createEdge({
  appHost: appUrl.host,
  runtimeHost: runtimeUrl.host,
  appPort: 3000,
  runtimePort: Number(env.FORMA_RUNTIME_PORT ?? 3002),
  clientIpHeader: env.FORMA_CLIENT_IP_HEADER?.toLowerCase(),
  hsts: appUrl.protocol === "https:",
}).listen(port, env.FORMA_BIND ?? "0.0.0.0", () =>
  console.log(`Forma edge on :${port} → ${appUrl.host} and ${runtimeUrl.host}`),
);
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => stop());
