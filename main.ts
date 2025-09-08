import { defineApp } from "@slflows/sdk/v1";
import { blocks } from "./blocks/index";

export const app = defineApp({
  name: "Spacelift Self-Service",
  installationInstructions:
    "To connect your Spacelift account:\n1. **Get API Key**: Log in to your Spacelift account and generate an API key\n2. **Configure**: Enter your API Key ID, API Key Secret, and Spacelift endpoint (e.g., 'your-account.app.spacelift.io')\n3. **Confirm**: Click 'Confirm' to complete the installation",

  blocks,

  config: {
    apiKeyId: {
      name: "API Key ID",
      description: "Your Spacelift API key ID",
      type: "string",
      required: true,
    },
    apiKeySecret: {
      name: "API Key Secret",
      description: "Your Spacelift API key secret",
      type: "string",
      required: true,
      sensitive: true,
    },
    endpoint: {
      name: "Spacelift Endpoint",
      description: "Your Spacelift endpoint (e.g., 'your-account.app.spacelift.io')",
      type: "string",
      required: true,
    },
    spaceId: {
      name: "Space ID",
      description: "The Spacelift space where stacks will be created",
      type: "string",
      required: true,
    },
  },
});
