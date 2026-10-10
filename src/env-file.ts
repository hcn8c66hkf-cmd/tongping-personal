import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Personal edition: read <repo>/.env once, before any module looks at
// process.env. Variables already set in the shell always win, so a one-off
// `TONGPING_PORT=46000 npm run daemon` still overrides the file.
const envPath =
  process.env.TONGPING_ENV_FILE?.trim() ||
  fileURLToPath(new URL("../.env", import.meta.url));

if (existsSync(envPath)) {
  const text = readFileSync(envPath, "utf8").replace(/^﻿/, "");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim().replace(/^export\s+/, "");
    let value = line.slice(eq + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
