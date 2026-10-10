import type { BrowserGateway } from "./gateway.js";
import type { HumanUserId } from "./route-identity.js";
import { WorkerConnectionRegistry } from "./worker-connection-registry.js";

/** Only the explicit private-single-user product may resolve by owner. */
export function createPrivateTrustedWorkerGateway(
  registry: WorkerConnectionRegistry,
  owner: HumanUserId,
): BrowserGateway {
  return {
    call: async (action, args, client) => {
      const target = await registry.resolveUniqueActiveConnection(owner);
      return target ? target.call(action, args, client) : { ok: false, error: "no_target" };
    },
    human: async (action, args, client) => {
      const target = await registry.resolveUniqueActiveConnection(owner);
      return target ? target.human(action, args, client) : { ok: false, error: "no_target" };
    },
  };
}
