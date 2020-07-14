import * as lambda from "@aws-cdk/aws-lambda"
import * as cdk from "@aws-cdk/core"
import * as cr from "@aws-cdk/custom-resources"
import * as path from "path"

interface GenerateSecretProps {
  /**
   * Nonce to force secret update.
   */
  nonce?: string
}

/**
 * Generate a secret to be used in other parts of the deployment.
 */
export class GenerateSecret extends cdk.Construct {
  public readonly value: string

  constructor(scope: cdk.Construct, id: string, props?: GenerateSecretProps) {
    super(scope, id)

    const resource = new cdk.CustomResource(this, "Resource", {
      serviceToken: GenerateSecretProvider.getOrCreate(this).serviceToken,
      properties: {
        Nonce: props?.nonce ?? "",
      },
    })

    this.value = resource.getAttString("Value")
  }
}

class GenerateSecretProvider extends cdk.Construct {
  /**
   * Returns the singleton provider.
   */
  public static getOrCreate(scope: cdk.Construct) {
    const stack = cdk.Stack.of(scope)
    const id = "henrist.cloudfront-auth.generate-secret.provider"
    return (
      (stack.node.tryFindChild(id) as GenerateSecretProvider) ||
      new GenerateSecretProvider(stack, id)
    )
  }

  private readonly provider: cr.Provider
  public readonly serviceToken: string

  constructor(scope: cdk.Construct, id: string) {
    super(scope, id)

    this.provider = new cr.Provider(this, "Provider", {
      onEventHandler: new lambda.Function(this, "Function", {
        code: lambda.Code.fromAsset(
          path.join(__dirname, "../dist/generate-secret"),
        ),
        handler: "index.handler",
        runtime: lambda.Runtime.NODEJS_12_X,
      }),
    })

    this.serviceToken = this.provider.serviceToken
  }
}
