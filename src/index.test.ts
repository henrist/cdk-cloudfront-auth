import { CloudFrontWebDistribution } from "aws-cdk-lib/aws-cloudfront"
import { UserPool } from "aws-cdk-lib/aws-cognito"
import { CfnVersion } from "aws-cdk-lib/aws-lambda"
import { Bucket } from "aws-cdk-lib/aws-s3"
import "jest-cdk-snapshot"
import { AuthLambdas, CloudFrontAuth } from "."
import { App, Stack } from "aws-cdk-lib"

test("A simple example", () => {
  const app = new App()
  const stack1 = new Stack(app, "Stack1", {
    env: {
      account: "112233445566",
      region: "us-east-1",
    },
  })
  const stack2 = new Stack(app, "Stack2", {
    env: {
      account: "112233445566",
      region: "eu-west-1",
    },
  })

  const authLambdas = new AuthLambdas(stack1, "AuthLambdas", {
    regions: ["eu-west-1"],
  })

  const userPool = new UserPool(stack2, "UserPool")

  const auth = new CloudFrontAuth(stack2, "Auth", {
    cognitoAuthDomain: `my-domain.auth.eu-west-1.amazoncognito.com`,
    authLambdas, // AuthLambdas from above
    userPool, // Cognito User Pool
  })

  const bucket = new Bucket(stack2, "Bucket")

  const distribution = new CloudFrontWebDistribution(
    stack2,
    "CloudFrontDistribution",
    {
      originConfigs: [
        {
          s3OriginSource: {
            s3BucketSource: bucket,
          },
          behaviors: [
            ...auth.authPages,
            {
              isDefaultBehavior: true,
              lambdaFunctionAssociations: auth.authFilters,
            },
          ],
        },
      ],
    },
  )

  auth.updateClient("ClientUpdate", {
    signOutUrl: `https://${distribution.distributionDomainName}${auth.signOutRedirectTo}`,
    callbackUrl: `https://${distribution.distributionDomainName}${auth.callbackPath}`,
  })

  expect(stack1).toMatchCdkSnapshot({
    ignoreAssets: true,
  })
  expect(stack2).toMatchCdkSnapshot({
    ignoreAssets: true,
  })
})

test("Auth Lambdas with nonce", () => {
  const app1 = new App()
  const app2 = new App()
  const stack1 = new Stack(app1, "Stack", {
    env: {
      account: "112233445566",
      region: "us-east-1",
    },
  })
  const stack2 = new Stack(app2, "Stack", {
    env: {
      account: "112233445566",
      region: "us-east-1",
    },
  })

  const authLambdas1 = new AuthLambdas(stack1, "AuthLambdas", {
    regions: ["eu-west-1"],
  })

  const authLambdas2 = new AuthLambdas(stack2, "AuthLambdas", {
    regions: ["eu-west-1"],
    nonce: "2",
  })

  function getLogicalId(scope: AuthLambdas): string {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return Stack.of(scope).resolve(
      (
        scope.node
          .findChild("ParseAuthFunction")
          .node.findChild("CurrentVersion").node.defaultChild as CfnVersion
      ).logicalId,
    )
  }

  const logicalId1 = getLogicalId(authLambdas1)
  const logicalId2 = getLogicalId(authLambdas2)

  expect(logicalId1).not.toBe(logicalId2)
})
