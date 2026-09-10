import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
if (existsSync(".env")) {
  console.log("Existing .env preserved.");
} else {
  const example = readFileSync(".env.example", "utf8");
  writeFileSync(
    ".env",
    example.replace(
      "replace-with-a-random-secret-at-least-32-characters",
      randomBytes(48).toString("base64url"),
    ),
    { mode: 0o600 },
  );
  console.log(
    "Created .env with a random JWT secret. Demo mode is ready; add GEMINI_API_KEY for live AI.",
  );
}
