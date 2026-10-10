import "./env-file.js";
import { PACKAGE_VERSION } from "./package-version.js";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { BrowserService } from "./browser-service.js";
import { loadConfig } from "./config.js";
import {
  DaemonGateway,
  LocalGateway,
  readLocalDaemonToken,
  type BrowserGateway,
} from "./gateway.js";
import { createTongpingMcpServer } from "./mcp-server.js";

const config = loadConfig();
const clientName =
  process.env.TONGPING_CLIENT_NAME?.trim() ||
  `stdio-${process.pid}`;

let localService: BrowserService | undefined;
let gateway: BrowserGateway;

const daemonUrl = process.env.TONGPING_DAEMON_URL?.trim();
if (daemonUrl) {
  const token = await readLocalDaemonToken(config.homeDir);
  gateway = new DaemonGateway(daemonUrl, token, clientName);
} else {
  localService = new BrowserService(config);
  gateway = new LocalGateway(localService, clientName);
}

const server = createTongpingMcpServer(gateway, PACKAGE_VERSION);
const transport = new StdioServerTransport();
await server.connect(transport);

console.error(
  daemonUrl
    ? `tongping MCP v${PACKAGE_VERSION} -> ${daemonUrl}; client=${clientName}`
    : `tongping MCP v${PACKAGE_VERSION} local mode; state=${config.homeDir}; client=${clientName}`,
);

async function shutdown() {
  await localService?.close();
  process.exit(0);
}

process.once("SIGINT", () => {
  void shutdown();
});

process.once("SIGTERM", () => {
  void shutdown();
});
