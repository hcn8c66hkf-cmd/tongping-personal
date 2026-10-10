export type DeploymentMode = "private-single-user" | "hosted";

export function resolveDeploymentMode(
  environment: NodeJS.ProcessEnv,
): DeploymentMode {
  const raw = environment.TONGPING_DEPLOYMENT_MODE;
  if (raw === undefined) return "private-single-user";

  const value = raw.trim();
  if (value === "private-single-user" || value === "hosted") {
    return value;
  }

  throw new Error("Invalid TONGPING_DEPLOYMENT_MODE");
}
