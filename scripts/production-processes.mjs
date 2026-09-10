export function productionProcesses(environment = process.env) {
  const webPort = environment.PORT || "3000";
  if (!/^\d+$/.test(webPort) || Number(webPort) < 1 || Number(webPort) > 65535)
    throw new Error("PORT must be an integer between 1 and 65535.");
  if (Number(webPort) === 4000)
    throw new Error(
      "PORT 4000 is reserved for the internal API. Use another public web port.",
    );
  return [
    {
      args: ["apps/api/dist/server.js"],
      options: {
        stdio: "inherit",
        env: { ...environment, NODE_ENV: "production", PORT: "4000" },
      },
    },
    {
      args: [
        "../../node_modules/next/dist/bin/next",
        "start",
        "--hostname",
        "0.0.0.0",
        "--port",
        webPort,
      ],
      options: {
        cwd: "apps/web",
        stdio: "inherit",
        env: { ...environment, NODE_ENV: "production", PORT: webPort },
      },
    },
  ];
}
