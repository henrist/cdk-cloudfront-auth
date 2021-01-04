import * as iam from "@aws-cdk/aws-iam"
import * as lambda from "@aws-cdk/aws-lambda"
import * as cdk from "@aws-cdk/core"
import { ParameterResource } from "@henrist/cdk-cross-region-params"
import * as path from "path"

const isSnapshot = process.env.IS_SNAPSHOT === "true"

interface AuthLambdasProps {
  /**
   * List of regions this can be used in. This should contain the region
   * where the CloudFront distribution is deployed (the CloudFormation stack).
   */
  regions: string[]
  /**
   * A nonce value that can be used to force new lambda functions
   * to allow new versions to be created.
   */
  nonce?: string
}

/**
 * Lambdas used for CloudFront. Must be deployed in us-east-1.
 *
 * This will provision SSM Parameters the region where the CloudFront
 * distribution is deployed from, so that it can be used cross-region.
 */
export class AuthLambdas extends cdk.Construct {
  public readonly checkAuthFn: ParameterResource<lambda.IVersion>
  public readonly httpHeadersFn: ParameterResource<lambda.IVersion>
  public readonly parseAuthFn: ParameterResource<lambda.IVersion>
  public readonly refreshAuthFn: ParameterResource<lambda.IVersion>
  public readonly signOutFn: ParameterResource<lambda.IVersion>

  private readonly regions: string[]
  private readonly nonce: string | undefined

  constructor(scope: cdk.Construct, id: string, props: AuthLambdasProps) {
    super(scope, id)

    const region = cdk.Stack.of(this).region
    this.regions = props.regions

    this.nonce = props.nonce

    if (region !== "us-east-1") {
      throw new Error("Region must be us-east-1 due to Lambda@edge")
    }

    const role = new iam.Role(this, "ServiceRole", {
      assumedBy: new iam.CompositePrincipal(
        new iam.ServicePrincipal("lambda.amazonaws.com"),
        new iam.ServicePrincipal("edgelambda.amazonaws.com"),
      ),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaBasicExecutionRole",
        ),
      ],
    })

    this.checkAuthFn = this.addFunction("CheckAuthFunction", "check-auth", role)
    this.httpHeadersFn = this.addFunction(
      "HttpHeadersFunction",
      "http-headers",
      role,
    )
    this.parseAuthFn = this.addFunction("ParseAuthFunction", "parse-auth", role)
    this.refreshAuthFn = this.addFunction(
      "RefreshAuthFunction",
      "refresh-auth",
      role,
    )
    this.signOutFn = this.addFunction("SignOutFunction", "sign-out", role)
  }

  private addFunction(id: string, assetName: string, role: iam.IRole) {
    const region = cdk.Stack.of(this).region
    const stackName = cdk.Stack.of(this).stackName

    const fn = new lambda.Function(this, id, {
      code:
        process.env.NODE_ENV === "test"
          ? lambda.Code.fromInline("snapshot-value")
          : lambda.Code.fromAsset(path.join(__dirname, `../dist/${assetName}`)),
      handler: "index.handler",
      runtime: lambda.Runtime.NODEJS_12_X,
      timeout: cdk.Duration.seconds(5),
      role,
      description:
        this.nonce == null ? undefined : `Nonce value: ${this.nonce}`,
    })

    if (this.node.addr === undefined) {
      throw new Error("node.addr not found - ensure aws-cdk is up-to-update")
    }

    return new ParameterResource<lambda.IVersion>(this, `${id}VersionParam`, {
      nonce: isSnapshot ? "snapshot" : undefined,
      parameterName: `/cf/region/${region}/stack/${stackName}/${this.node.addr}-${id}-function-arn`,
      referenceToResource: (scope, id, reference) =>
        lambda.Version.fromVersionArn(scope, id, reference),
      regions: this.regions,
      resource: fn.currentVersion,
      resourceToReference: (resource) => resource.functionArn,
    })
  }
}
