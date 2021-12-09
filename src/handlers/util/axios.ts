/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */

// Workaround for https://github.com/axios/axios/issues/3219
/// <reference lib="dom" />

import axios, { AxiosRequestConfig, AxiosResponse } from "axios"
import { Agent } from "https"
import { Logger } from "./logger"

const axiosInstance = axios.create({
  httpsAgent: new Agent({ keepAlive: true }),
})

export async function httpPostWithRetry(
  url: string,
  data: any,
  config: AxiosRequestConfig,
  logger: Logger,
): Promise<AxiosResponse<any>> {
  let attempts = 0
  while (true) {
    ++attempts
    try {
      return await axiosInstance.post(url, data, config)
    } catch (err: any) {
      logger.debug(`HTTP POST to ${url} failed (attempt ${attempts}):`)
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      logger.debug((err.response && err.response.data) || err)
      if (attempts >= 5) {
        // Try 5 times at most.
        logger.error(
          `No success after ${attempts} attempts, seizing further attempts`,
        )
        throw err
      }
      if (attempts >= 2) {
        // After attempting twice immediately, do some exponential backoff with jitter.
        logger.debug(
          "Doing exponential backoff with jitter, before attempting HTTP POST again ...",
        )
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            25 * (Math.pow(2, attempts) + Math.random() * attempts),
          ),
        )
        logger.debug("Done waiting, will try HTTP POST again now")
      }
    }
  }
}
