import * as cognito from "@aws-cdk/aws-cognito"
import * as iam from "@aws-cdk/aws-iam"
import * as cdk from "@aws-cdk/core"
import * as cr from "@aws-cdk/custom-resources"

interface ClientUpdateProps {
  oauthScopes: string[]
  client: cognito.IUserPoolClient
  userPool: cognito.IUserPool
  callbackUrl: string
  signOutUrl: string
  identityProviders: string[]
}

export class ClientUpdate extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props: ClientUpdateProps) {
    super(scope, id)

    new cr.AwsCustomResource(this, "Resource", {
      onUpdate: {
        service: "CognitoIdentityServiceProvider",
        action: "updateUserPoolClient",
        parameters: {
          AllowedOAuthFlows: ["code"],
          AllowedOAuthFlowsUserPoolClient: true,
          SupportedIdentityProviders: props.identityProviders,
          AllowedOAuthScopes: props.oauthScopes,
          ClientId: props.client.userPoolClientId,
          CallbackURLs: [props.callbackUrl],
          LogoutURLs: [props.signOutUrl],
          UserPoolId: props.userPool.userPoolId,
        },
        physicalResourceId: cr.PhysicalResourceId.of(
          `${props.userPool.userPoolId}-${props.client.userPoolClientId}`,
        ),
      },
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ["cognito-idp:UpdateUserPoolClient"],
          resources: [props.userPool.userPoolArn],
        }),
      ]),
    })
  }
}
