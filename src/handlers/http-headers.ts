import { createResponseHandler } from "./util/cloudfront"

// Headers are added in the response handler.
export const handler = createResponseHandler(
  // eslint-disable-next-line @typescript-eslint/require-await
  async (config, event) => event.Records[0].cf.response,
)
