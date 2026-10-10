import { PRIVATE_COMPAT_HUMAN_USER_ID } from "./private-persistent-owner.js";
import { WorkerEnrollmentStore } from "./worker-enrollment-store.js";

/** Hosted owner resolution does not exist in R0-C. Explicit private mode is the only authority. */
export function privatePairingAuthorityEnabled(environment: NodeJS.ProcessEnv): boolean {
  return environment.TONGPING_DEPLOYMENT_MODE === "private-single-user" &&
    environment.TONGPING_PAIRING_AUTHORITY === "private-single-user";
}

export class PrivateWorkerPairingAuthority {
  constructor(private readonly store: WorkerEnrollmentStore) {}

  issueChallenge() {
    return this.store.issueChallenge(PRIVATE_COMPAT_HUMAN_USER_ID);
  }

  redeem(challenge: string, deviceId: string) {
    return this.store.redeem(challenge, deviceId);
  }
}
