import * as constructs from "constructs"
import * as cognito from "aws-cdk-lib/aws-cognito"
import * as iam from "aws-cdk-lib/aws-iam"
import * as cr from "aws-cdk-lib/custom-resources"

interface Props {
  userPool: cognito.IUserPool
  email: string
  password: string
}

export class CognitoUser extends constructs.Construct {
  constructor(scope: constructs.Construct, id: string, props: Props) {
    super(scope, id)

    const user = new cr.AwsCustomResource(this, "User", {
      onCreate: {
        service: "CognitoIdentityServiceProvider",
        action: "adminCreateUser",
        parameters: {
          UserPoolId: props.userPool.userPoolId,
          Username: props.email,
        },
        physicalResourceId: cr.PhysicalResourceId.of(props.email),
      },
      onDelete: {
        service: "CognitoIdentityServiceProvider",
        action: "adminDeleteUser",
        parameters: {
          UserPoolId: props.userPool.userPoolId,
          Username: props.email,
        },
        physicalResourceId: cr.PhysicalResourceId.of(props.email),
      },
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: [
            "cognito-idp:AdminCreateUser",
            "cognito-idp:AdminDeleteUser",
          ],
          resources: [props.userPool.userPoolArn],
        }),
      ]),
      installLatestAwsSdk: false,
    })

    const password = new cr.AwsCustomResource(this, "Password", {
      onUpdate: {
        service: "CognitoIdentityServiceProvider",
        action: "adminSetUserPassword",
        parameters: {
          UserPoolId: props.userPool.userPoolId,
          Username: props.email,
          Password: props.password,
          Permanent: true,
        },
        physicalResourceId: cr.PhysicalResourceId.of(`password-test`),
      },
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ["cognito-idp:AdminSetUserPassword"],
          resources: [props.userPool.userPoolArn],
        }),
      ]),
      installLatestAwsSdk: false,
    })

    password.node.addDependency(user)
  }
}
