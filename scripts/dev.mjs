import { spawn } from "node:child_process";
// Polling avoids exhausting native file watchers on constrained macOS hosts.
const env = {
  ...process.env,
  WATCHPACK_POLLING: "1000",
  CHOKIDAR_USEPOLLING: "true",
};
const api = spawn(
  process.execPath,
  ["../../node_modules/tsx/dist/cli.mjs", "watch", "src/server.ts"],
  { cwd: "apps/api", stdio: "inherit", env },
);
const web = spawn(
  process.execPath,
  [
    "../../node_modules/next/dist/bin/next",
    "dev",
    "--webpack",
    "--hostname",
    "127.0.0.1",
  ],
  { cwd: "apps/web", stdio: "inherit", env },
);
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  api.kill("SIGTERM");
  web.kill("SIGTERM");
  setTimeout(() => process.exit(code), 1000).unref();
}
for (const child of [api, web]) {
  child.on("error", (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on("exit", (code) => stop(code || 0));
}
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => stop());
