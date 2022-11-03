#!/usr/bin/env node
import * as cdk from "aws-cdk-lib"
import "source-map-support/register"
import { AuthLambdasStack } from "../lib/auth-lambdas-stack"
import { MainStack } from "../lib/main-stack"

const app = new cdk.App()

const authLambdasStack = new AuthLambdasStack(app, "auth-lambdas", {
  env: {
    region: "us-east-1",
  },
  stackName: "cdk-cloudfront-auth-example-auth-lambdas",
})

new MainStack(app, "main", {
  env: {
    region: "eu-west-1",
  },
  stackName: "cdk-cloudfront-auth-example-main",
  authLambdas: authLambdasStack.authLambdas,
})
