# example

This provides a simple CDK application demonstrating the
usage of the construct.

It also works as a way to spin up a simple application for manual
integration testing.

## Manual testing

```bash
cd ..
npm pack
cd example
npm install --no-save ../henrist-cdk-cloudfront-auth-0.0.0-development.tgz
# must be logged in to aws for next command
npx cdk deploy --all
```

See link to test page in outputs.

A user example@example.com with password example is created.

Add or remove user from `test` group to test authorization.

## Cleanup

```bash
# (modify the next bucket name first, see deploy output)
aws s3 rm --recursive s3://cdk-cloudfront-auth-example-main-bucket83908e77-wc5jf6w82bqb
npx cdk destroy main
# wait so that CloudFront frees up the lambdas
npx cdk destroy auth-lambdas
```
