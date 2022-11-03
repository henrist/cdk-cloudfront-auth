import { CloudFrontResponseResult } from "aws-lambda"
import { AxiosResponse } from "axios"
import { httpPostWithRetry } from "./util/axios"
import { decodeSafeBase64 } from "./util/base64"
import { createRequestHandler, redirectTo, staticPage } from "./util/cloudfront"
import { Config } from "./util/config"
import { extractAndParseCookies, generateCookies } from "./util/cookies"
import { validate } from "./util/jwt"
import { validateNonce } from "./util/nonce"

export const handler = createRequestHandler(async (config, event) => {
  const request = event.Records[0].cf.request
  const domainName = request.headers["host"][0].value

  let redirectedFromUri = `https://${domainName}`
  let idToken: string | undefined = undefined

  const cookies = extractAndParseCookies(request.headers, config.clientId)
  idToken = cookies.idToken

  const validateResult = validateQueryStringAndCookies({
    config,
    querystring: request.querystring,
    cookies,
  })

  if ("clientError" in validateResult) {
    return handleFailure({
      error: validateResult.clientError,
      errorType: "client",
      config,
      redirectedFromUri,
      idToken,
    })
  } else if ("technicalError" in validateResult) {
    return handleFailure({
      error: validateResult.technicalError,
      errorType: "server",
      config,
      redirectedFromUri,
      idToken,
    })
  }
  const { code, pkce, requestedUri } = validateResult

  config.logger.debug("Query string and cookies are valid")
  redirectedFromUri += requestedUri

  const tokens = await exchangeCodeForTokens({
    config,
    domainName,
    code,
    pkce,
  })
  if ("error" in tokens) {
    return handleFailure({
      error: tokens.error,
      errorType: "server",
      config,
      redirectedFromUri,
      idToken,
    })
  }

  // User is signed in successfully.
  return redirectTo(redirectedFromUri, {
    cookies: generateCookies({
      event: "newTokens",
      tokens,
      domainName,
      ...config,
    }),
  })
})

async function handleFailure({
  error,
  errorType,
  config,
  idToken,
  redirectedFromUri,
}: {
  error: string
  errorType: "client" | "server"
  config: Config
  idToken?: string
  redirectedFromUri: string
}): Promise<CloudFrontResponseResult> {
  if (errorType === "client") {
    config.logger.warn(error)
  } else {
    config.logger.error(error)
  }

  if (idToken) {
    // There is an ID token - maybe the user signed in already (e.g. in another browser tab).
    config.logger.debug("ID token found, will check if it is valid")

    config.logger.info("Validating JWT ...")
    const validateResult = await validate(
      idToken,
      config.tokenJwksUri,
      config.tokenIssuer,
      config.clientId,
    )
    if (validateResult !== undefined) {
      config.logger.debug("ID token not valid:", validateResult.validationError)
    }

    config.logger.info("JWT is valid")
    // Return user to where he/she came from
    return redirectTo(redirectedFromUri)
  }

  return staticPage({
    title: "Sign-in issue",
    message: "We can't sign you in because of a technical problem",
    details: errorType === "client" ? error : "Contact administrator",
    linkHref: redirectedFromUri,
    linkText: "Retry",
    statusCode: "503",
  })
}

async function exchangeCodeForTokens({
  config,
  domainName,
  code,
  pkce,
}: {
  config: Config
  domainName: string
  code: string
  pkce: string
}): Promise<
  | {
      idToken: string
      accessToken: string
      refreshToken: string
    }
  | { error: string }
> {
  const cognitoTokenEndpoint = `https://${config.cognitoAuthDomain}/oauth2/token`

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: config.clientId,
    redirect_uri: `https://${domainName}${config.callbackPath}`,
    code,
    code_verifier: pkce,
  }).toString()

  const requestConfig: Parameters<typeof httpPostWithRetry>[2] = {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  }
  if (config.clientSecret) {
    const encodedSecret = Buffer.from(
      `${config.clientId}:${config.clientSecret}`,
    ).toString("base64")
    requestConfig.headers!.Authorization = `Basic ${encodedSecret}`
  }
  config.logger.debug("HTTP POST to Cognito token endpoint:", {
    uri: cognitoTokenEndpoint,
    body,
    requestConfig,
  })

  let postResult: AxiosResponse<{
    id_token: string
    access_token: string
    refresh_token: string
  }>
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    postResult = await httpPostWithRetry(
      cognitoTokenEndpoint,
      body,
      requestConfig,
      config.logger,
    )
  } catch (err) {
    return {
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      error: `Failed to exchange authorization code for tokens: ${err}`,
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const { status, headers, data: tokens } = postResult

  config.logger.info("Successfully exchanged authorization code for tokens")
  config.logger.debug("Response from Cognito token endpoint:", {
    status,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    headers,
    tokens,
  })

  return {
    idToken: tokens.id_token,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
  }
}

function validateQueryStringAndCookies(props: {
  config: Config
  querystring: string
  cookies: ReturnType<typeof extractAndParseCookies>
}):
  | { code: string; pkce: string; requestedUri: string }
  | { clientError: string }
  | { technicalError: string } {
  const {
    code,
    state,
    error: cognitoError,
    error_description: errorDescription,
  } = Object.fromEntries(new URLSearchParams(props.querystring).entries())

  // Check if Cognito threw an Error.
  // Cognito puts the error in the query string.
  if (cognitoError) {
    return {
      clientError: `[Cognito] ${cognitoError}: ${errorDescription}`,
    }
  }

  // The querystring needs to have an authorization code and state.
  if (
    !code ||
    !state ||
    typeof code !== "string" ||
    typeof state !== "string"
  ) {
    return {
      clientError: [
        'Invalid query string. Your query string does not include parameters "state" and "code".',
        "This can happen if your authentication attempt did not originate from this site.",
      ].join(" "),
    }
  }

  // The querystring state should be a JSON string.
  let parsedState: { nonce?: string; requestedUri?: string }
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    parsedState = JSON.parse(decodeSafeBase64(state))
  } catch {
    return {
      clientError:
        'Invalid query string. Your query string does not include a valid "state" parameter',
    }
  }

  // The querystring state needs to include the right pieces.
  if (!parsedState.requestedUri || !parsedState.nonce) {
    return {
      clientError:
        'Invalid query string. Your query string does not include a valid "state" parameter',
    }
  }

  // The querystring state needs to correlate to the cookies.
  const { nonce: originalNonce, pkce, nonceHmac } = props.cookies
  if (!originalNonce) {
    return {
      clientError:
        "Your browser didn't send the nonce cookie along, but it is required for security (prevent CSRF).",
    }
  }
  if (!pkce) {
    return {
      clientError:
        "Your browser didn't send the pkce cookie along, but it is required for security (prevent CSRF).",
    }
  }
  if (parsedState.nonce !== originalNonce) {
    return {
      clientError:
        "Nonce mismatch. This can happen if you start multiple authentication attempts in parallel (e.g. in separate tabs)",
    }
  }

  const nonceError = validateNonce(
    parsedState.nonce,
    nonceHmac ?? "UNKNOWN",
    props.config,
  )
  if (nonceError) {
    return nonceError
  }

  return { code, pkce, requestedUri: parsedState.requestedUri || "" }
}
