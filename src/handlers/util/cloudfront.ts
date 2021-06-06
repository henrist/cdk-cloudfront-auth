import {
  CloudFrontHeaders,
  CloudFrontRequestEvent,
  CloudFrontRequestHandler,
  CloudFrontRequestResult,
  CloudFrontResponseEvent,
  CloudFrontResponseHandler,
  CloudFrontResponseResult,
} from "aws-lambda"
import html from "../error-page/template.html"
import { Config, getConfig } from "./config"

export type HttpHeaders = Record<string, string>

function asCloudFrontHeaders(headers: HttpHeaders): CloudFrontHeaders {
  return Object.entries(headers).reduce(
    (reduced, [key, value]) =>
      Object.assign(reduced, {
        [key.toLowerCase()]: [
          {
            key,
            value,
          },
        ],
      }),
    {} as CloudFrontHeaders,
  )
}

export function redirectTo(
  path: string,
  props?: {
    cookies?: string[]
  },
): CloudFrontResponseResult {
  const headers: CloudFrontHeaders = props?.cookies
    ? {
        "set-cookie": props.cookies.map((value) => ({
          key: "set-cookie",
          value,
        })),
      }
    : {}

  return {
    status: "307",
    statusDescription: "Temporary Redirect",
    headers: {
      location: [
        {
          key: "location",
          value: path,
        },
      ],
      ...headers,
    },
  }
}

export function staticPage(props: {
  title: string
  message: string
  details: string
  linkHref: string
  linkText: string
  statusCode?: string
}): CloudFrontResponseResult {
  return {
    body: createErrorHtml(props),
    status: props.statusCode ?? "500",
    headers: {
      "content-type": [
        {
          key: "Content-Type",
          value: "text/html; charset=UTF-8",
        },
      ],
    },
  }
}

function createErrorHtml(props: {
  title: string
  message: string
  details: string
  linkHref: string
  linkText: string
}): string {
  const params = { ...props, region: process.env.AWS_REGION }
  return html.replace(
    /\${([^}]*)}/g,
    (_, v: keyof typeof params) => params[v] || "",
  )
}

function addCloudFrontHeaders<
  T extends CloudFrontRequestResult | CloudFrontResponseResult,
>(config: Config, response: T): T {
  if (!response) {
    throw new Error("Expected response value")
  }

  return {
    ...response,
    headers: {
      ...(response.headers ?? {}),
      ...asCloudFrontHeaders(config.httpHeaders),
    },
  }
}

export type RequestHandler = (
  config: Config,
  event: CloudFrontRequestEvent,
) => Promise<CloudFrontRequestResult>

export function createRequestHandler(
  inner: RequestHandler,
): CloudFrontRequestHandler {
  let config: Config

  return async (event) => {
    if (!config) {
      config = getConfig()
    }

    config.logger.debug("Handling event:", event)

    const response = addCloudFrontHeaders(config, await inner(config, event))

    config.logger.debug("Returning response:", response)
    return response
  }
}

export function createResponseHandler(
  inner: (
    config: Config,
    event: CloudFrontResponseEvent,
  ) => Promise<CloudFrontResponseResult>,
): CloudFrontResponseHandler {
  let config: Config

  return async (event) => {
    if (!config) {
      config = getConfig()
    }

    config.logger.debug("Handling event:", event)

    const response = addCloudFrontHeaders(config, await inner(config, event))

    config.logger.debug("Returning response:", response)
    return response
  }
}
