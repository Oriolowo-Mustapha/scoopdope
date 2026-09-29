/**
 * Utility to sanitize sensitive secrets (seed phrases, private keys, secret keys)
 * from wallet-related error messages and stack traces (#970).
 */

// Matches Stellar secret seeds starting with 'S' followed by 55 base32 chars
const STELLAR_SECRET_KEY_REGEX = /\bS[A-Z2-7]{55}\b/g;

// Matches 64-char hex private keys
const HEX_PRIVATE_KEY_REGEX = /\b[0-9a-fA-F]{64}\b/g;

// Matches typical 12-24 word mnemonic seed phrase sequences
const MNEMONIC_PHRASE_REGEX = /\b(?:[a-z]{3,8}\s+){11,23}[a-z]{3,8}\b/gi;

export function sanitizeWalletString(input: string): string {
  if (!input || typeof input !== 'string') return input;
  return input
    .replace(STELLAR_SECRET_KEY_REGEX, '[REDACTED_STELLAR_SECRET_KEY]')
    .replace(HEX_PRIVATE_KEY_REGEX, '[REDACTED_PRIVATE_KEY]')
    .replace(MNEMONIC_PHRASE_REGEX, '[REDACTED_SEED_PHRASE]');
}

export function sanitizeWalletError(error: unknown): string {
  if (!error) return 'Unknown wallet error';
  if (typeof error === 'string') {
    return sanitizeWalletString(error);
  }
  if (error instanceof Error) {
    const msg = sanitizeWalletString(error.message);
    const stack = error.stack ? sanitizeWalletString(error.stack) : '';
    return stack ? `${msg}\n${stack}` : msg;
  }
  try {
    return sanitizeWalletString(JSON.stringify(error));
  } catch {
    return String(error);
  }
}
