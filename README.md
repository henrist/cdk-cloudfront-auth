# CloudFront authorization with Cognito for CDK

Easily add Cognito-based authorization to your CloudFront distribution,
to place static files behind authorization.

This is based on https://github.com/aws-samples/cloudfront-authorization-at-edge.

## Usage

```bash
npm install @henrist/cdk-cloudfront-auth
```

Deploy the Lambda@Edge functions to us-east-1:

```ts
// In a stack deployed to us-east-1.
const authLambdas = new AuthLambdas(this, "AuthLambdas", {
  regions: ["eu-west-1"],
})
```

Deploy the Cognito and CloudFront setup in whatever region
of your choice:

```ts
const auth = new CloudFrontAuth(this, "Auth", {
  cognitoAuthDomain: `${domain.domainName}.auth.${region}.amazoncognito.com`,
  authLambdas, // AuthLambdas from above
  userPool, // Cognito User Pool
})
const distribution = new cloudfront.CloudFrontWebDistribution(
  this,
  "CloudFrontDistribution",
  {
    originConfigs: [
      {
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
  signOutUrl: `https://${distribution.domainName}${auth.signOutRedirectTo}`,
  callbackUrl: `https://${distribution.domainName}${auth.callbackPath}`,
})
```
