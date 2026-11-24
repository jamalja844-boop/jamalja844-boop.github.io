import path from "node:path";
import { fileURLToPath } from "node:url";

export * from "./workspace";
export * from "./sandbox";
export * as gitOps from "./git";
export { GitError } from "./git";

/** Map met projectsjablonen die met dit pakket worden meegeleverd. */
export function templateDir(name: "node-starter" | "empty"): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..", "templates", name);
}
