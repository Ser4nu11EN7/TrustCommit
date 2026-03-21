import { spawn } from "node:child_process";
import process from "node:process";

const runtimePort = process.env.TRUSTCOMMIT_RUNTIME_PORT ?? "3100";
const frontendPort = process.env.TRUSTCOMMIT_FRONTEND_PORT ?? "5173";
const host = process.env.TRUSTCOMMIT_HOST ?? "127.0.0.1";
const autoExitMs = Number(process.env.TRUSTCOMMIT_AUTO_EXIT_MS ?? "0");
const runtimeTarget = process.env.VITE_RUNTIME_PROXY_TARGET ?? `http://${host}:${runtimePort}`;

const children = [];
let shuttingDown = false;

function spawnService(label, command, extraEnv = {}) {
  const child =
    process.platform === "win32"
      ? spawn("cmd.exe", ["/d", "/s", "/c", command], {
          cwd: process.cwd(),
          stdio: "inherit",
          env: {
            ...process.env,
            ...extraEnv
          }
        })
      : spawn("sh", ["-lc", command], {
          cwd: process.cwd(),
          stdio: "inherit",
          env: {
            ...process.env,
            ...extraEnv
          }
        });

  child.on("exit", (code, signal) => {
    if (shuttingDown) {
      return;
    }
    const reason = signal ? `${label} exited with signal ${signal}` : `${label} exited with code ${code ?? 0}`;
    console.error(reason);
    shutdown(code ?? 1);
  });

  children.push(child);
  return child;
}

function killChildTree(child) {
  if (!child || child.killed || child.exitCode !== null) {
    return;
  }

  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true
    });
    return;
  }

  child.kill("SIGTERM");
}

function shutdown(code = 0) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  for (const child of children) {
    killChildTree(child);
  }
  setTimeout(() => process.exit(code), 250);
}

spawnService("runtime", "npm run server", {
  PORT: runtimePort
});

spawnService(
  "frontend",
  `npm --prefix frontend run dev -- --host ${host} --port ${frontendPort}`,
  {
    VITE_RUNTIME_PROXY_TARGET: runtimeTarget
  }
);

console.log(`TrustCommit console dev stack`);
console.log(`frontend: http://${host}:${frontendPort}`);
console.log(`runtime:  ${runtimeTarget}/api`);

if (autoExitMs > 0) {
  setTimeout(() => shutdown(0), autoExitMs);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
