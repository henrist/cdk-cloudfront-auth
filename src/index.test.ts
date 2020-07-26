import { CloudFrontWebDistribution } from "@aws-cdk/aws-cloudfront"
import { UserPool } from "@aws-cdk/aws-cognito"
import { Bucket } from "@aws-cdk/aws-s3"
import * as cdk from "@aws-cdk/core"
import "jest-cdk-snapshot"
import { AuthLambdas, CloudFrontAuth } from "."

test("A simple example", () => {
  const app = new cdk.App()
  const stack1 = new cdk.Stack(app, "Stack1", {
    env: {
      account: "112233445566",
      region: "us-east-1",
    },
  })
  const stack2 = new cdk.Stack(app, "Stack2", {
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

  expect(stack1).toMatchCdkSnapshot()
  expect(stack2).toMatchCdkSnapshot()
})
