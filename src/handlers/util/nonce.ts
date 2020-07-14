import { createHmac, randomBytes } from "crypto"
import { Config } from "./config"

export function checkNonceAge(
  nonce: string,
  maxAge: number,
): { clientError: string } | undefined {
  // Nonce should not be too old.
  const timestamp = parseInt(nonce.slice(0, nonce.indexOf("T")))
  if (isNaN(timestamp)) {
    return {
      clientError: "Invalid nonce",
    }
  }

  if (timestampInSeconds() - timestamp > maxAge) {
    return {
      clientError: `Nonce is too old (nonce is from ${new Date(
        timestamp * 1000,
      ).toISOString()})`,
    }
  }
}

export function validateNonce(
  nonce: string,
  providedHmac: string,
  config: Config,
): { clientError: string } | undefined {
  const res1 = checkNonceAge(nonce, config.nonceMaxAge)
  if (res1) {
    return res1
  }

  const calculatedHmac = createNonceHmac(nonce, config)
  if (calculatedHmac !== providedHmac) {
    return {
      clientError: `Nonce signature mismatch! Expected ${calculatedHmac} but got ${providedHmac}`,
    }
  }
}

export function generateNonce(): string {
  const randomString = randomBytes(16).toString("hex")
  return `${timestampInSeconds()}T${randomString}`
}

export function createNonceHmac(nonce: string, config: Config): string {
  return createHmac("sha256", config.nonceSigningSecret)
    .update(nonce)
    .digest("hex")
}

function timestampInSeconds() {
  return (Date.now() / 1000) | 0
}
