import { mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
mkdirSync(".data/mongo", { recursive: true });
const child = spawn(
  "mongod",
  ["--dbpath", ".data/mongo", "--port", "27019", "--bind_ip", "127.0.0.1"],
  { stdio: "inherit" },
);
child.on("error", (e) => {
  console.error(
    "Install MongoDB Community Server or set MONGODB_URI to Atlas.",
    e.message,
  );
  process.exit(1);
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 0));
