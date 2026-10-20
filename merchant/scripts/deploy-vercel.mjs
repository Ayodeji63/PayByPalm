import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readMerchantLink } from "./check-vercel-project.mjs";

/** Vercel expects a repository containing merchant/. Stage that layout for CLI uploads
 * without changing the wallet's local project link or copying private files. */
export function prepareDeployment(
  appRoot = fileURLToPath(new URL("../", import.meta.url)),
  environment = process.env,
) {
  const linked = readMerchantLink(appRoot, environment);
  if (
    JSON.parse(readFileSync(path.join(appRoot, "package.json"), "utf8"))
      .name !== "paybypalm-merchant"
  )
    throw new Error("The deployment source is not PayByPalm Merchant.");
  const directory = mkdtempSync(
    path.join(tmpdir(), "paybypalm-merchant-deploy-"),
  );
  const cleanup = () => rmSync(directory, { recursive: true, force: true });
  try {
    cpSync(appRoot, path.join(directory, "merchant"), {
      recursive: true,
      filter: (source) => {
        const relative = path.relative(appRoot, source);
        if (!relative) return true;
        return !relative
          .split(path.sep)
          .some(
            (part) =>
              [
                ".git",
                ".vercel",
                "node_modules",
                "dist",
                "test-results",
                ".impeccable",
              ].includes(part) ||
              part === ".env" ||
              (part.startsWith(".env.") && part !== ".env.example") ||
              part.endsWith(".log") ||
              part.endsWith(".tsbuildinfo"),
          );
      },
    });
    mkdirSync(path.join(directory, ".vercel"));
    writeFileSync(
      path.join(directory, ".vercel/project.json"),
      JSON.stringify({
        projectId: linked.projectId,
        orgId: linked.orgId,
        projectName: linked.projectName,
      }),
    );
    if (!existsSync(path.join(directory, "merchant/vercel.json")))
      throw new Error(
        "The staged merchant deployment has no Vercel configuration.",
      );
    return { directory, cleanup, projectName: linked.projectName };
  } catch (error) {
    cleanup();
    throw error;
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  let staged;
  try {
    const args = process.argv.slice(2).filter((arg) => arg !== "--");
    if (args.some((arg) => arg !== "--dry-run"))
      throw new Error(
        "Use deploy:vercel with no options, or --dry-run to check the upload layout.",
      );
    staged = prepareDeployment();
    if (args.includes("--dry-run"))
      console.log(
        "PASS: paybypalm-merchant project link, merchant/ upload layout, and private-file exclusions. No deployment requested.",
      );
    else {
      const command = process.platform === "win32" ? "npx.cmd" : "npx";
      const result = spawnSync(command, ["--yes", "vercel@64.5.0", "--prod"], {
        cwd: staged.directory,
        env: process.env,
        stdio: "inherit",
        shell: false,
      });
      if (result.error) throw result.error;
      process.exitCode = result.status ?? 1;
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    staged?.cleanup();
  }
}
