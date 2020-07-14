import { randomBytes } from "crypto"

type OnEventHandler = (event: {
  PhysicalResourceId?: string
  RequestType: "Create" | "Update" | "Delete"
}) => Promise<{
  PhysicalResourceId?: string
  Data?: Record<string, string>
}>

// eslint-disable-next-line @typescript-eslint/require-await
export const handler: OnEventHandler = async (event) => {
  switch (event.RequestType) {
    case "Delete":
      return {
        PhysicalResourceId: event.PhysicalResourceId,
      }

    case "Create":
    case "Update":
      return {
        PhysicalResourceId: "generate-secret",
        Data: {
          Value: randomBytes(16).toString("hex"),
        },
      }
  }
}
