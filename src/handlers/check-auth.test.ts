import { isAuthorized } from "./check-auth"
import { Config } from "./util/config"
import { IdTokenPayload } from "./util/jwt"
import { Logger, LogLevel } from "./util/logger"

const baseConfig: Config = {
  userPoolId: "dummy",
  clientId: "dummy",
  oauthScopes: ["dummy"],
  cognitoAuthDomain: "dummy",
  callbackPath: "/callback",
  signOutRedirectTo: "/",
  signOutPath: "/sign-out",
  refreshAuthPath: "/refresh",
  cookieSettings: {
    idToken: "Path=/; Secure; HttpOnly; SameSite=Lax",
    accessToken: "Path=/; Secure; HttpOnly; SameSite=Lax",
    refreshToken: "Path=/; Secure; HttpOnly; SameSite=Lax",
    nonce: "Path=/; Secure; HttpOnly; SameSite=Lax",
  },
  httpHeaders: {},
  clientSecret: "dummy",
  nonceSigningSecret: "dummy",
  logLevel: "info",
  requireGroupAnyOf: null,
  tokenIssuer: "dummy",
  tokenJwksUri: "dummy",
  logger: new Logger(LogLevel.info),
  nonceMaxAge: 3600,
}

const baseIdToken: IdTokenPayload = {
  aud: "2uogllel57lco86t9e64k4tvce",
  auth_time: 1594606384,
  exp: 1594761087,
  iat: 1594757487,
  sub: "a2b8b4ae-fc9e-4f51-9d86-124774d5c04a",
  token_use: "id",
  "cognito:groups": [],
  "cognito:username": "Google_1234",
  email: "example@example.com",
  given_name: "John",
  name: "John Doe",
}

describe("isAuthorized", () => {
  describe("having specified list of groups", () => {
    const config: Config = {
      ...baseConfig,
      requireGroupAnyOf: ["group1", "group2"],
    }

    it("should not be authorized if missing groups", () => {
      const idToken: IdTokenPayload = {
        ...baseIdToken,
        "cognito:groups": [],
      }

      expect(isAuthorized(config, idToken)).toBe(false)
    })

    it("should be authorized if in one of the groups", () => {
      const idToken: IdTokenPayload = {
        ...baseIdToken,
        "cognito:groups": ["group1"],
      }

      expect(isAuthorized(config, idToken)).toBe(true)
    })
  })

  describe("not having specified list of groups", () => {
    const config: Config = {
      ...baseConfig,
      requireGroupAnyOf: null,
    }

    it("should always be authorized", () => {
      const idToken: IdTokenPayload = {
        ...baseIdToken,
        "cognito:groups": [],
      }

      expect(isAuthorized(config, idToken)).toBe(true)
    })
  })
})
