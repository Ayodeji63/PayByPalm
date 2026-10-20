import { configuredApp } from "./runtime.js";
const { app, config } = configuredApp();
const server = app.listen(config.PORT, "0.0.0.0", () =>
  console.info(
    `PayByPalm Merchant server listening on ${config.PORT}. Open ${config.APP_ORIGIN}`,
  ),
);
server.on("error", (e: NodeJS.ErrnoException) => {
  console.error(
    e.code === "EADDRINUSE"
      ? "Merchant port is already in use."
      : "Merchant server could not start.",
  );
  process.exitCode = 1;
});
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  });
