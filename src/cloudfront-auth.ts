import * as cloudfront from "aws-cdk-lib/aws-cloudfront"
import {
  AddBehaviorOptions,
  BehaviorOptions,
  IOrigin,
  ViewerProtocolPolicy,
} from "aws-cdk-lib/aws-cloudfront"
import * as cognito from "aws-cdk-lib/aws-cognito"
import * as lambda from "aws-cdk-lib/aws-lambda"
import { IVersion } from "aws-cdk-lib/aws-lambda"
import { LambdaConfig } from "@henrist/cdk-lambda-config"
import { RetrieveClientSecret } from "./client-secret"
import { ClientUpdate } from "./client-update"
import { GenerateSecret } from "./generate-secret"
import { StoredConfig } from "./handlers/util/config"
import { AuthLambdas } from "./lambdas"
import { Construct } from "constructs"

export interface CloudFrontAuthProps {
  /**
   * Cognito Client that will be used to authenticate the user.
   *
   * If a custom client is provided, the updateClient method cannot
   * be used since we cannot know which parameters was set.
   *
   * @default - a new client will be generated
   */
  client?: cognito.UserPoolClient
  userPool: cognito.IUserPool
  /**
   * The domain that is used for Cognito Auth.
   *
   * If not using custom domains this will be a name under amazoncognito.com.
   *
   * @example `${domain.domainName}.auth.${region}.amazoncognito.com`
   */
  cognitoAuthDomain: string
  authLambdas: AuthLambdas
  /**
   * @default /auth/callback
   */
  callbackPath?: string
  /**
   * @default /
   */
  signOutRedirectTo?: string
  /**
   * @default /auth/sign-out
   */
  signOutPath?: string
  /**
   * @default /auth/refresh
   */
  refreshAuthPath?: string
  /**
   * Log level.
   *
   * A log level of debug will log secrets and should only be used in
   * a development environment.
   *
   * @default warn
   */
  logLevel?: "none" | "error" | "warn" | "info" | "debug"
  /**
   * Require the user to be part of a specific Cognito group to
   * access any resource.
   */
  requireGroupAnyOf?: string[]
  /**
   * HTTP headers to be added to all CloudFront responses.
   *
   * @example { "Referrer-Policy": "same-origin" }
   */
  httpHeaders?: Record<string, string>
}

export interface UpdateClientProps {
  signOutUrl: string
  callbackUrl: string
  /**
   * List of identity providers used for the client.
   *
   * @default - COGNITO and identity providers registered in the UserPool construct
   */
  identityProviders?: string[]
}

/**
 * Configure previously deployed lambda functions, Cognito client
 * and CloudFront distribution.
 */
export class CloudFrontAuth extends Construct {
  public readonly callbackPath: string
  public readonly signOutRedirectTo: string
  public readonly signOutPath: string
  public readonly refreshAuthPath: string

  private readonly userPool: cognito.IUserPool
  private readonly clientCreated: boolean
  public readonly client: cognito.UserPoolClient

  private readonly checkAuthFn: lambda.IVersion
  private readonly httpHeadersFn: lambda.IVersion
  private readonly parseAuthFn: lambda.IVersion
  private readonly refreshAuthFn: lambda.IVersion
  private readonly signOutFn: lambda.IVersion

  private readonly oauthScopes: string[]

  constructor(scope: Construct, id: string, props: CloudFrontAuthProps) {
    super(scope, id)

    this.callbackPath = props.callbackPath ?? "/auth/callback"
    this.signOutRedirectTo = props.signOutRedirectTo ?? "/"
    this.signOutPath = props.signOutPath ?? "/auth/sign-out"
    this.refreshAuthPath = props.refreshAuthPath ?? "/auth/refresh"

    this.oauthScopes = [
      "phone",
      "email",
      "profile",
      "openid",
      "aws.cognito.signin.user.admin",
    ]

    this.userPool = props.userPool

    this.clientCreated = !props.client
    this.client =
      props.client ??
      props.userPool.addClient("UserPoolClient", {
        // Note: The following must be kept in sync with the API
        // call performed in ClientUpdate.
        authFlows: {
          userPassword: true,
          userSrp: true,
        },
        oAuth: {
          flows: {
            authorizationCodeGrant: true,
          },
        },
        preventUserExistenceErrors: true,
        generateSecret: true,
      })

    const nonceSigningSecret = new GenerateSecret(this, "NonceSigningSecret")
      .value

    const { clientSecretValue } = new RetrieveClientSecret(
      this,
      "ClientSecret",
      {
        client: this.client,
        userPool: this.userPool,
      },
    )

    const config: StoredConfig = {
      httpHeaders: {
        "Content-Security-Policy":
          "default-src 'none'; img-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; connect-src 'self'",
        "Strict-Transport-Security":
          "max-age=31536000; includeSubdomains; preload",
        "Referrer-Policy": "same-origin",
        "X-XSS-Protection": "1; mode=block",
        "X-Frame-Options": "DENY",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-cache",
        ...(props.httpHeaders ?? {}),
      },
      logLevel: props.logLevel ?? "warn",
      userPoolId: this.userPool.userPoolId,
      clientId: this.client.userPoolClientId,
      clientSecret: clientSecretValue,
      oauthScopes: this.oauthScopes,
      cognitoAuthDomain: props.cognitoAuthDomain,
      callbackPath: this.callbackPath,
      signOutRedirectTo: this.signOutRedirectTo,
      signOutPath: this.signOutPath,
      refreshAuthPath: this.refreshAuthPath,
      requireGroupAnyOf: props.requireGroupAnyOf,
      cookieSettings: {
        /*
        spaMode - consider if this should be supported
        idToken: "Path=/; Secure; SameSite=Lax",
        accessToken: "Path=/; Secure; SameSite=Lax",
        refreshToken: "Path=/; Secure; SameSite=Lax",
        nonce: "Path=/; Secure; HttpOnly; SameSite=Lax",
        */
        idToken: "Path=/; Secure; HttpOnly; SameSite=Lax",
        accessToken: "Path=/; Secure; HttpOnly; SameSite=Lax",
        refreshToken: "Path=/; Secure; HttpOnly; SameSite=Lax",
        nonce: "Path=/; Secure; HttpOnly; SameSite=Lax",
      },
      nonceSigningSecret,
    }

    this.checkAuthFn = new LambdaConfig(this, "CheckAuthFn", {
      function: props.authLambdas.checkAuthFn.get(this, "CheckAuthFnImport"),
      config,
    }).version

    this.httpHeadersFn = new LambdaConfig(this, "HttpHeadersFn", {
      function: props.authLambdas.httpHeadersFn.get(
        this,
        "HttpHeadersFnImport",
      ),
      config,
    }).version

    this.parseAuthFn = new LambdaConfig(this, "ParseAuthFn", {
      function: props.authLambdas.parseAuthFn.get(this, "ParseAuthFnImport"),
      config,
    }).version

    this.refreshAuthFn = new LambdaConfig(this, "RefreshAuthFn", {
      function: props.authLambdas.refreshAuthFn.get(
        this,
        "RefreshAuthFnImport",
      ),
      config,
    }).version

    this.signOutFn = new LambdaConfig(this, "SignOutFn", {
      function: props.authLambdas.signOutFn.get(this, "SignOutFnImport"),
      config,
    }).version
  }

  private createPathLambda(
    path: string,
    fn: lambda.IVersion,
  ): cloudfront.Behavior {
    return {
      pathPattern: path,
      forwardedValues: {
        queryString: true,
      },
      lambdaFunctionAssociations: [
        {
          eventType: cloudfront.LambdaEdgeEventType.VIEWER_REQUEST,
          lambdaFunction: fn,
        },
      ],
    }
  }

  /**
   * Create behaviors for authentication pages:
   *
   * - callback page
   * - refresh page
   * - sign out page
   *
   * This is to be used with CloudFrontWebDistribution. See
   * createAuthPagesBehaviors if using Distribution.
   */
  public get authPages(): cloudfront.Behavior[] {
    return [
      this.createPathLambda(this.callbackPath, this.parseAuthFn),
      this.createPathLambda(this.refreshAuthPath, this.refreshAuthFn),
      this.createPathLambda(this.signOutPath, this.signOutFn),
    ]
  }

  /**
   * Create behaviors for authentication pages.
   *
   * - callback page
   * - refresh page
   * - sign out page
   *
   * This is to be used with Distribution.
   */
  public createAuthPagesBehaviors(
    origin: IOrigin,
    options?: AddBehaviorOptions,
  ): Record<string, BehaviorOptions> {
    function path(path: string, fn: IVersion): Record<string, BehaviorOptions> {
      return {
        [path]: {
          origin,
          compress: true,
          viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          edgeLambdas: [
            {
              eventType: cloudfront.LambdaEdgeEventType.VIEWER_REQUEST,
              functionVersion: fn,
            },
          ],
          ...options,
        },
      }
    }

    return {
      ...path(this.callbackPath, this.parseAuthFn),
      ...path(this.refreshAuthPath, this.refreshAuthFn),
      ...path(this.signOutPath, this.signOutFn),
    }
  }

  /**
   * Create lambda function association for viewer request to check
   * authentication and original response to add headers.
   *
   * This is to be used with CloudFrontWebDistribution. See
   * createProtectedBehavior if using Distribution.
   */
  public get authFilters(): cloudfront.LambdaFunctionAssociation[] {
    return [
      {
        eventType: cloudfront.LambdaEdgeEventType.VIEWER_REQUEST,
        lambdaFunction: this.checkAuthFn,
      },
      {
        eventType: cloudfront.LambdaEdgeEventType.ORIGIN_RESPONSE,
        lambdaFunction: this.httpHeadersFn,
      },
    ]
  }

  /**
   * Create behavior that includes authorization check.
   *
   * This is to be used with Distribution.
   */
  public createProtectedBehavior(
    origin: IOrigin,
    options?: AddBehaviorOptions,
  ): BehaviorOptions {
    if (options?.edgeLambdas != null) {
      throw Error("User-defined edgeLambdas is currently not supported")
    }

    return {
      origin,
      compress: true,
      viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      edgeLambdas: [
        {
          eventType: cloudfront.LambdaEdgeEventType.VIEWER_REQUEST,
          functionVersion: this.checkAuthFn,
        },
        {
          eventType: cloudfront.LambdaEdgeEventType.ORIGIN_RESPONSE,
          functionVersion: this.httpHeadersFn,
        },
      ],
      ...options,
    }
  }

  /**
   * Update Cognito client to use the proper URLs and OAuth scopes.
   *
   * TODO: In case the client configuration changes and is updated
   *  by CloudFormation, this will not be reapplied causing the client
   *  to not be correctly configured.
   *  How can we avoid this scenario?
   */
  public updateClient(id: string, props: UpdateClientProps): ClientUpdate {
    if (!this.clientCreated) {
      throw new Error(
        "You cannot use updateClient with a user-provided Cognito Client " +
          "since it would override the user-provided settings",
      )
    }

    return new ClientUpdate(this, id, {
      client: this.client,
      userPool: this.userPool,
      signOutUrl: props.signOutUrl,
      callbackUrl: props.callbackUrl,
      oauthScopes: this.oauthScopes,
      identityProviders:
        props.identityProviders ??
        ["COGNITO"].concat(
          this.userPool.identityProviders.map((it) => it.providerName),
        ),
    })
  }
}
