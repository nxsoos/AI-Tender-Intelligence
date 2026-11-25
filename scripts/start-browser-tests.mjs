import { cp, mkdir, rm, symlink } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Next writes next-env.d.ts and tsconfig.json even when distDir is separate.
// Copy only application source so tests cannot change the developer's running
// workspace, load .env.local, or share its .next/dev lock.
const root = fileURLToPath(new URL("../", import.meta.url));
const testRoot = path.join(root, ".playwright-app");
const relative = path.relative(root, testRoot);
if (relative !== ".playwright-app") throw new Error("Invalid test workspace");
await mkdir(testRoot, { recursive: true });
for (const entry of ["src", "public"]) {
  const destination = path.join(testRoot, entry);
  await rm(destination, { recursive: true, force: true });
  await cp(path.join(root, entry), destination, { recursive: true });
}
for (const entry of [
  "package.json",
  "next.config.ts",
  "tsconfig.json",
  "postcss.config.mjs",
]) {
  await cp(path.join(root, entry), path.join(testRoot, entry));
}
try {
  await symlink(
    path.join(root, "node_modules"),
    path.join(testRoot, "node_modules"),
    process.platform === "win32" ? "junction" : "dir",
  );
} catch (error) {
  if (error.code !== "EEXIST") throw error;
}
const child = spawn(
  process.execPath,
  [
    path.join(root, "node_modules/next/dist/bin/next"),
    "dev",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3100",
  ],
  {
    cwd: testRoot,
    stdio: "inherit",
    env: { ...process.env, NEXT_TEST_DIST_DIR: "1" },
  },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("error", () => {
  console.error("Browser-test server could not start");
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 0;
});
