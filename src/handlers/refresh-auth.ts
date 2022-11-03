import { AxiosResponse } from "axios"
import { httpPostWithRetry } from "./util/axios"
import { createRequestHandler, redirectTo, staticPage } from "./util/cloudfront"
import { extractAndParseCookies, generateCookies } from "./util/cookies"

export const handler = createRequestHandler(async (config, event) => {
  const request = event.Records[0].cf.request
  const domainName = request.headers["host"][0].value
  let redirectedFromUri = `https://${domainName}`

  function errorResponse(error: string) {
    return staticPage({
      title: "Refresh issue",
      message: "We can't refresh your sign-in because of a technical problem.",
      details: error,
      linkHref: redirectedFromUri,
      linkText: "Try again",
      statusCode: "400",
    })
  }

  const { requestedUri, nonce: currentNonce } = Object.fromEntries(
    new URLSearchParams(request.querystring).entries(),
  )
  redirectedFromUri += requestedUri ?? ""

  const {
    idToken,
    accessToken,
    refreshToken,
    nonce: originalNonce,
  } = extractAndParseCookies(request.headers, config.clientId)

  if (!idToken || !accessToken || !refreshToken) {
    return errorResponse(
      "Some of idToken, accessToken and/or refreshToken was not found",
    )
  }

  try {
    validateRefreshRequest(
      currentNonce,
      originalNonce,
      idToken,
      accessToken,
      refreshToken,
    )
  } catch (err) {
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    return errorResponse(`Failed to refresh tokens: ${err}`)
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  }

  if (config.clientSecret !== "") {
    const encodedSecret = Buffer.from(
      `${config.clientId}:${config.clientSecret}`,
    ).toString("base64")
    headers["Authorization"] = `Basic ${encodedSecret}`
  }

  let postResult: AxiosResponse<{
    id_token: string
    access_token: string
  }>
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    postResult = await httpPostWithRetry(
      `https://${config.cognitoAuthDomain}/oauth2/token`,
      new URLSearchParams({
        grant_type: "refresh_token",
        client_id: config.clientId,
        refresh_token: refreshToken,
      }).toString(),
      { headers },
      config.logger,
    )
  } catch (err) {
    return redirectTo(redirectedFromUri, {
      cookies: generateCookies({
        event: "refreshFailed",
        tokens: {
          idToken: idToken,
          accessToken: accessToken,
          refreshToken: refreshToken,
        },
        domainName,
        ...config,
      }),
    })
  }

  const updatedTokens = {
    idToken: postResult.data.id_token,
    accessToken: postResult.data.access_token,
    refreshToken: refreshToken,
  }

  return redirectTo(redirectedFromUri, {
    cookies: generateCookies({
      event: "newTokens",
      tokens: updatedTokens,
      domainName,
      ...config,
    }),
  })
})

function validateRefreshRequest(
  currentNonce?: string | string[],
  originalNonce?: string,
  idToken?: string,
  accessToken?: string,
  refreshToken?: string,
) {
  if (!originalNonce) {
    throw new Error(
      "Your browser didn't send the nonce cookie along, but it is required for security (prevent CSRF).",
    )
  } else if (currentNonce !== originalNonce) {
    throw new Error("Nonce mismatch")
  }
  Object.entries({ idToken, accessToken, refreshToken }).forEach(
    ([tokenType, token]) => {
      if (!token) {
        throw new Error(`Missing ${tokenType}`)
      }
    },
  )
}
