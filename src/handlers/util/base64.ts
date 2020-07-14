/*
Functions to translate base64-encoded strings, so they can be used:

  - in URL's without needing additional encoding
  - in OAuth2 PKCE verifier
  - in cookies (to be on the safe side, as = + / are in fact valid characters in cookies)
*/

/**
 * Use this on a base64-encoded string to translate = + / into replacement characters.
 */
export function safeBase64Stringify(value: string): string {
  return value.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")
}

/**
 * Decode a Base64 value that is run through safeBase64Stringify to the actual string.
 */
export function decodeSafeBase64(value: string): string {
  const desafed = value.replace(/-/g, "+").replace(/_/g, "/")
  return Buffer.from(desafed, "base64").toString()
}
