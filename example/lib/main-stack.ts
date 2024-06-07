import { AuthLambdas, CloudFrontAuth } from "@liflig/cdk-cloudfront-auth"
import * as cdk from "aws-cdk-lib"
import * as cloudfront from "aws-cdk-lib/aws-cloudfront"
import * as origins from "aws-cdk-lib/aws-cloudfront-origins"
import * as cognito from "aws-cdk-lib/aws-cognito"
import * as s3 from "aws-cdk-lib/aws-s3"
import * as s3Deployment from "aws-cdk-lib/aws-s3-deployment"
import * as constructs from "constructs"
import { CognitoUser } from "./cognito-user"

interface Props extends cdk.StackProps {
  authLambdas: AuthLambdas
}

export class MainStack extends cdk.Stack {
  constructor(scope: constructs.Construct, id: string, props: Props) {
    super(scope, id, props)

    const bucket = new s3.Bucket(this, "Bucket")

    const userPool = new cognito.UserPool(this, "UserPool", {
      signInAliases: {
        email: true,
      },
      passwordPolicy: {
        minLength: 6,
        requireSymbols: false,
        requireUppercase: false,
      },
      signInCaseSensitive: false,
    })

    const domainPrefix = `${this.account}-${this.stackName}`

    userPool.addDomain("UserPoolDomain", {
      cognitoDomain: {
        domainPrefix,
      },
    })

    const auth = new CloudFrontAuth(this, "Auth", {
      cognitoAuthDomain: `${domainPrefix}.auth.${this.region}.amazoncognito.com`,
      authLambdas: props.authLambdas,
      userPool,
      requireGroupAnyOf: ["test"],
    })

    const origin = new origins.S3Origin(bucket)

    const distribution = new cloudfront.Distribution(this, "Distribution", {
      defaultBehavior: auth.createProtectedBehavior(origin),
      additionalBehaviors: auth.createAuthPagesBehaviors(origin),
      defaultRootObject: "index.html",
    })

    auth.updateClient("ClientUpdate", {
      signOutUrl: `https://${distribution.distributionDomainName}${auth.signOutRedirectTo}`,
      callbackUrl: `https://${distribution.distributionDomainName}${auth.callbackPath}`,
    })

    new s3Deployment.BucketDeployment(this, "BucketDeployment", {
      sources: [s3Deployment.Source.asset("./website")],
      destinationBucket: bucket,
      distribution,
    })

    new CognitoUser(this, "User", {
      userPool,
      email: "example@example.com",
      password: "example",
    })

    new cdk.CfnOutput(this, "UrlOutput", {
      value: `https://${distribution.domainName}`,
    })

    new cdk.CfnOutput(this, "BucketNameOutput", {
      value: bucket.bucketName,
    })
  }
}
