import {
  brandProfileAlias,
  type ProfileAlias,
} from "./route-identity.js";

export const PROFILE_ALIAS_PATTERN = /^[a-zA-Z0-9._-]{1,64}$/;

export class ProfileAliasFormatError extends Error {
  constructor() {
    super("Invalid local profile alias");
    this.name = "ProfileAliasFormatError";
  }
}

export function isCanonicalProfileAlias(
  value: string,
): boolean {
  return PROFILE_ALIAS_PATTERN.test(value);
}

export function parseProfileAlias(
  value: string,
): ProfileAlias {
  if (!isCanonicalProfileAlias(value)) {
    throw new ProfileAliasFormatError();
  }
  return brandProfileAlias(value);
}
