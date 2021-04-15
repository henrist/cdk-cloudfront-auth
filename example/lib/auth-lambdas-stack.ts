import * as cdk from "@aws-cdk/core"
import { AuthLambdas } from "@henrist/cdk-cloudfront-auth"

export class AuthLambdasStack extends cdk.Stack {
  readonly authLambdas: AuthLambdas

  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    this.authLambdas = new AuthLambdas(this, "AuthLambdas", {
      regions: ["eu-west-1"],
    })
  }
}
