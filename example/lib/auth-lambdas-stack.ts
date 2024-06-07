import { AuthLambdas } from "@liflig/cdk-cloudfront-auth"
import * as cdk from "aws-cdk-lib"
import { Construct } from "constructs"

export class AuthLambdasStack extends cdk.Stack {
  readonly authLambdas: AuthLambdas

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    this.authLambdas = new AuthLambdas(this, "AuthLambdas", {
      regions: ["eu-west-1"],
    })
  }
}
