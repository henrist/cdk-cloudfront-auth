import * as cognito from "aws-cdk-lib/aws-cognito"
import * as iam from "aws-cdk-lib/aws-iam"
import * as cr from "aws-cdk-lib/custom-resources"
import { Construct } from "constructs"

export interface RetrieveClientSecretProps {
  client: cognito.IUserPoolClient
  userPool: cognito.IUserPool
}

export class RetrieveClientSecret extends Construct {
  public clientSecretValue: string

  constructor(scope: Construct, id: string, props: RetrieveClientSecretProps) {
    super(scope, id)

    const clientSecret = new cr.AwsCustomResource(this, "Resource", {
      onUpdate: {
        service: "CognitoIdentityServiceProvider",
        action: "describeUserPoolClient",
        parameters: {
          UserPoolId: props.userPool.userPoolId,
          ClientId: props.client.userPoolClientId,
        },
        physicalResourceId: cr.PhysicalResourceId.of(
          `${props.userPool.userPoolId}-${props.client.userPoolClientId}`,
        ),
      },
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ["cognito-idp:DescribeUserPoolClient"],
          resources: [props.userPool.userPoolArn],
        }),
      ]),
    })

    this.clientSecretValue = clientSecret.getResponseField(
      "UserPoolClient.ClientSecret",
    )
  }
}
