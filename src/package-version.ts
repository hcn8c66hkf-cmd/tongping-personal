import { readFileSync } from "node:fs";

// Release version shown in /health and MCP serverInfo, read from package.json
// so bug reports always name the exact personal-edition build.
export const PACKAGE_VERSION: string = (() => {
  try {
    const raw = readFileSync(new URL("../package.json", import.meta.url), "utf8");
    return String(JSON.parse(raw).version || "unknown");
  } catch {
    return "unknown";
  }
})();
