import { decode, verify } from "jsonwebtoken"
import jwksClient, { RsaSigningKey, SigningKey } from "jwks-rsa"

export interface IdTokenPayload {
  sub: string
  "cognito:groups"?: string[]
  "cognito:username"?: string
  given_name?: string
  aud: string
  token_use: "id"
  auth_time: number
  name?: string
  exp: number
  iat: number
  email?: string
}

// jwks client is cached at this scope so it can be reused
// across Lambda invocations.
let jwksRsa: jwksClient.JwksClient

function isRsaSigningKey(key: SigningKey): key is RsaSigningKey {
  return "rsaPublicKey" in key
}

/**
 * Retrieves the public key that corresponds to the private key with
 * which the token was signed.
 */
async function getSigningKey(
  jwksUri: string,
  kid: string,
): Promise<string | Error> {
  if (!jwksRsa) {
    jwksRsa = jwksClient({ cache: true, rateLimit: true, jwksUri })
  }
  const jwk = await jwksRsa.getSigningKey(kid)
  return isRsaSigningKey(jwk) ? jwk.rsaPublicKey : jwk.publicKey
}

export async function validate(
  jwtToken: string,
  jwksUri: string,
  issuer: string,
  audience: string,
): Promise<{ validationError: Error } | undefined> {
  const decodedToken = decode(jwtToken, { complete: true })
  if (!decodedToken || typeof decodedToken === "string") {
    return {
      validationError: new Error("Cannot parse JWT token"),
    }
  }

  // The JWT contains a "kid" claim, key id, that tells which key
  // was used to sign the token.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  const kid = decodedToken["header"]["kid"] as string
  const jwk = await getSigningKey(jwksUri, kid)
  if (jwk instanceof Error) {
    return { validationError: jwk }
  }

  // Verify the JWT.
  // This either rejects (JWT not valid), or resolves (JWT valid).
  const verificationOptions = {
    audience,
    issuer,
    ignoreExpiration: false,
  }

  return new Promise((resolve) =>
    verify(jwtToken, jwk, verificationOptions, (err) =>
      err ? resolve({ validationError: err }) : resolve(undefined),
    ),
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function decodeIdToken(jwt: string): IdTokenPayload {
  const tokenBody = jwt.split(".")[1]
  const decodableTokenBody = tokenBody.replace(/-/g, "+").replace(/_/g, "/")
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return JSON.parse(Buffer.from(decodableTokenBody, "base64").toString())
}
