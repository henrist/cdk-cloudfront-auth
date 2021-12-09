/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */

export enum LogLevel {
  "none" = 0,
  "error" = 10,
  "warn" = 20,
  "info" = 30,
  "debug" = 40,
}

export class Logger {
  constructor(private logLevel: LogLevel) {}

  private jsonify(args: any[]) {
    return args.map((arg: any): any => {
      if (typeof arg === "object") {
        try {
          return JSON.stringify(arg)
        } catch {
          return arg
        }
      }
      return arg
    })
  }
  public info(...args: any): void {
    if (this.logLevel >= LogLevel.info) {
      console.log(...this.jsonify(args))
    }
  }
  public warn(...args: any): void {
    if (this.logLevel >= LogLevel.warn) {
      console.warn(...this.jsonify(args))
    }
  }
  public error(...args: any): void {
    if (this.logLevel >= LogLevel.error) {
      console.error(...this.jsonify(args))
    }
  }
  public debug(...args: any): void {
    if (this.logLevel >= LogLevel.debug) {
      console.trace(...this.jsonify(args))
    }
  }
}
