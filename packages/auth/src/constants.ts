/** Bump when session shape or auth callbacks change incompatibly. */
export const AUTH_MODULE_VERSION = "1.0.0";

/**
 * Extension points for future 2FA (TOTP/WebAuthn).
 * AUTH-A3 baseline ships TOTP enrollment + challenge. Keep constants for future auth evolution.
 */
export const AUTH_EXTENSION_POINTS = {
  totp: "callbacks.jwt/session + middleware challenge gate",
  webauthn: "additional Credentials provider",
} as const;
