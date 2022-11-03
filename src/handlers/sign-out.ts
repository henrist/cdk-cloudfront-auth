import { createRequestHandler, redirectTo } from "./util/cloudfront"
import { extractAndParseCookies, generateCookies } from "./util/cookies"

// eslint-disable-next-line @typescript-eslint/require-await
export const handler = createRequestHandler(async (config, event) => {
  const request = event.Records[0].cf.request
  const domainName = request.headers["host"][0].value
  const { idToken, accessToken, refreshToken } = extractAndParseCookies(
    request.headers,
    config.clientId,
  )

  if (!idToken) {
    return redirectTo(`https://${domainName}${config.signOutRedirectTo}`)
  }

  const qs = new URLSearchParams({
    logout_uri: `https://${domainName}${config.signOutRedirectTo}`,
    client_id: config.clientId,
  }).toString()

  return redirectTo(`https://${config.cognitoAuthDomain}/logout?${qs}`, {
    cookies: generateCookies({
      event: "signOut",
      tokens: {
        idToken: idToken,
        accessToken: accessToken ?? "",
        refreshToken: refreshToken ?? "",
      },
      domainName,
      ...config,
    }),
  })
})
