import { spawn } from "node:child_process";
import { productionProcesses } from "./production-processes.mjs";
const [api, web] = productionProcesses().map(({ args, options }) =>
  spawn(process.execPath, args, options),
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
