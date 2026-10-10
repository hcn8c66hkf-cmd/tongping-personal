import os from "node:os";
import path from "node:path";

export interface BrowserConfig {
  homeDir: string;
  profilesDir: string;
  headless: boolean;
  executablePath?: string;
  channel?: string;
  locale?: string;
  timezoneId?: string;
}

export function loadConfig(): BrowserConfig {
  const homeDir = path.resolve(
    process.env.TONGPING_HOME ?? path.join(os.homedir(), ".tongping"),
  );

  return {
    homeDir,
    profilesDir: path.join(homeDir, "profiles"),
    headless: process.env.TONGPING_HEADLESS === "1",
    executablePath: emptyToUndefined(process.env.TONGPING_EXECUTABLE_PATH),
    channel: emptyToUndefined(process.env.TONGPING_CHANNEL),
    locale: emptyToUndefined(process.env.TONGPING_LOCALE),
    timezoneId: emptyToUndefined(process.env.TONGPING_TIMEZONE),
  };
}

function emptyToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
