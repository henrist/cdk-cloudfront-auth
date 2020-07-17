import { CloudFrontHeaders } from "aws-lambda"
import { parse } from "cookie"
import { decodeIdToken } from "./jwt"

type Cookies = Record<string, string | undefined>

export interface CookieSettings {
  idToken: string
  accessToken: string
  refreshToken: string
  nonce: string
}

/**
 * Cookies are present in the HTTP header "Cookie" that may be present
 * multiple times. This utility function parses occurrences  of that
 * header and splits out all the cookies and their values.
 * A simple object is returned that allows easy access by cookie
 * name: e.g. cookies["nonce"].
 */
function extractCookiesFromHeaders(headers: CloudFrontHeaders): Cookies {
  if (!headers["cookie"]) {
    return {}
  }
  const cookies = headers["cookie"].reduce<Cookies>(
    (reduced, header) => ({
      ...reduced,
      ...(parse(header.value) as Cookies),
    }),
    {},
  )

  return cookies
}

function withCookieDomain(
  distributionDomainName: string,
  cookieSettings: string,
) {
  if (cookieSettings.toLowerCase().indexOf("domain") === -1) {
    // Add leading dot for compatibility with Amplify (or js-cookie really).
    return `${cookieSettings}; Domain=.${distributionDomainName}`
  }
  return cookieSettings
}

export function extractAndParseCookies(
  headers: CloudFrontHeaders,
  clientId: string,
): {
  tokenUserName?: string
  idToken?: string
  accessToken?: string
  refreshToken?: string
  scopes?: string
  nonce?: string
  nonceHmac?: string
  pkce?: string
} {
  const cookies = extractCookiesFromHeaders(headers)
  if (!cookies) {
    return {}
  }

  const keyPrefix = `CognitoIdentityServiceProvider.${clientId}`
  const tokenUserName = cookies[`${keyPrefix}.LastAuthUser`]

  return {
    tokenUserName,
    idToken: cookies[`${keyPrefix}.${tokenUserName ?? ""}.idToken`],
    accessToken: cookies[`${keyPrefix}.${tokenUserName ?? ""}.accessToken`],
    refreshToken: cookies[`${keyPrefix}.${tokenUserName ?? ""}.refreshToken`],
    scopes: cookies[`${keyPrefix}.${tokenUserName ?? ""}.tokenScopesString`],
    nonce: cookies["spa-auth-edge-nonce"],
    nonceHmac: cookies["spa-auth-edge-nonce-hmac"],
    pkce: cookies["spa-auth-edge-pkce"],
  }
}

export function generateCookies(param: {
  event: "newTokens" | "signOut" | "refreshFailed"
  clientId: string
  oauthScopes: string[]
  domainName: string
  cookieSettings: CookieSettings
  tokens: {
    idToken: string
    accessToken: string
    refreshToken: string
  }
}): string[] {
  // Set cookies with the exact names and values Amplify uses
  // for seamless interoperability with Amplify.
  const decodedIdToken = decodeIdToken(param.tokens.idToken)
  const tokenUserName = decodedIdToken["cognito:username"] as string
  const keyPrefix = `CognitoIdentityServiceProvider.${param.clientId}`
  const idTokenKey = `${keyPrefix}.${tokenUserName}.idToken`
  const accessTokenKey = `${keyPrefix}.${tokenUserName}.accessToken`
  const refreshTokenKey = `${keyPrefix}.${tokenUserName}.refreshToken`
  const lastUserKey = `${keyPrefix}.LastAuthUser`
  const scopeKey = `${keyPrefix}.${tokenUserName}.tokenScopesString`
  const scopesString = param.oauthScopes.join(" ")
  const userDataKey = `${keyPrefix}.${tokenUserName}.userData`
  const userData = JSON.stringify({
    UserAttributes: [
      {
        Name: "sub",
        Value: decodedIdToken["sub"],
      },
      {
        Name: "email",
        Value: decodedIdToken["email"],
      },
    ],
    Username: tokenUserName,
  })

  // Construct object with the cookies
  const cookies = {
    [idTokenKey]: `${param.tokens.idToken}; ${withCookieDomain(
      param.domainName,
      param.cookieSettings.idToken,
    )}`,
    [accessTokenKey]: `${param.tokens.accessToken}; ${withCookieDomain(
      param.domainName,
      param.cookieSettings.accessToken,
    )}`,
    [refreshTokenKey]: `${param.tokens.refreshToken}; ${withCookieDomain(
      param.domainName,
      param.cookieSettings.refreshToken,
    )}`,
    [lastUserKey]: `${tokenUserName}; ${withCookieDomain(
      param.domainName,
      param.cookieSettings.idToken,
    )}`,
    [scopeKey]: `${scopesString}; ${withCookieDomain(
      param.domainName,
      param.cookieSettings.accessToken,
    )}`,
    [userDataKey]: `${encodeURIComponent(userData)}; ${withCookieDomain(
      param.domainName,
      param.cookieSettings.idToken,
    )}`,
    "amplify-signin-with-hostedUI": `true; ${withCookieDomain(
      param.domainName,
      param.cookieSettings.accessToken,
    )}`,
  }

  if (param.event === "signOut") {
    // Expire all cookies
    Object.keys(cookies).forEach(
      (key) => (cookies[key] = expireCookie(cookies[key])),
    )
  } else if (param.event === "refreshFailed") {
    // Expire refresh token (so the browser will not send it in vain again)
    cookies[refreshTokenKey] = expireCookie(cookies[refreshTokenKey])
  }

  // Nonce, nonceHmac and pkce are only used during login phase.
  ;[
    "spa-auth-edge-nonce",
    "spa-auth-edge-nonce-hmac",
    "spa-auth-edge-pkce",
  ].forEach((key) => {
    cookies[key] = expireCookie(cookies[key])
  })

  return Object.entries(cookies).map(([k, v]) => `${k}=${v}`)
}

function expireCookie(cookie = "") {
  const cookieParts = cookie
    .split(";")
    .map((part) => part.trim())
    .filter((part) => !part.toLowerCase().startsWith("max-age"))
    .filter((part) => !part.toLowerCase().startsWith("expires"))
  const expires = `Expires=${new Date(0).toUTCString()}`
  // First part is the cookie value, which we'll clear.
  return ["", ...cookieParts.slice(1), expires].join("; ")
}
