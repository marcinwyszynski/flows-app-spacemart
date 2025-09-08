import { AppBlock, kv } from "@slflows/sdk/v1";
import { executeSpaceliftQuery, extractCredentials } from "../../client";
import { createHash } from "node:crypto";

export const storageBucket: AppBlock = {
  name: "Storage Bucket",
  description:
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Aliquam a tempus orci, ut lobortis enim. Vestibulum at leo mi. Vivamus bibendum faucibus ipsum a dapibus. Pellentesque ultrices ut nibh eu dictum. Proin diam nisl, rutrum vel neque a, porta condimentum libero. Mauris quis sodales arcu. Pellentesque bibendum consequat velit non tincidunt. Mauris fermentum non tellus et eleifend.",
  config: {
    random_length: {
      name: "Random Length",
      type: "number",
      required: false,
      default: 8,
      description: "Byte length for the random ID",
    },
    prefix: {
      name: "Prefix",
      type: "string",
      required: false,
      default: "demo",
      description: "Prefix to use for generated resources",
    },
    pet_name_length: {
      name: "Pet Name Length",
      type: "number",
      required: false,
      default: 2,
      description: "Number of words in the pet name",
    },
    password_length: {
      name: "Password Length",
      type: "number",
      required: false,
      default: 16,
      description: "Length of the generated password",
    },
    include_special_chars: {
      name: "Include Special Chars",
      type: "boolean",
      required: false,
      default: true,
      description: "Include special characters in the password",
    },
  },
  signals: {
    stackId: {
      name: "Stack ID",
      description: "The ID of the created Spacelift stack",
    },
    resource_summary: {
      name: "Resource Summary",
      description: "Summary of all generated resources",
    },
    random_id_base64: {
      name: "Random ID Base64",
      description: "Generated random ID in base64 URL-safe format",
    },
    random_id: {
      name: "Random ID",
      description: "Generated random ID in hexadecimal format",
    },
    pet_name: {
      name: "Pet Name",
      description: "Generated pet name with prefix",
    },
    password: {
      name: "Password",
      description: "Generated random password",
    },
  },

  async onSync({ app, block }) {
    try {
      const credentials = extractCredentials(app.config);
      const spaceId = app.config.spaceId as string;

      // Check if stack already exists
      let { stackId } = block.lifecycle?.signals || {};

      if (!stackId) {
        console.log(`Creating new stack for block ${block.id}...`);

        // Create the stack first
        const createStackMutation = `
          mutation CreateStack($input: StackInput!, $manageState: Boolean!) {
            stackCreate(input: $input, manageState: $manageState) {
              id
              name
            }
          }
        `;

        const stackInput = {
          name: `[${block.id.slice(-8)}] ${block.name}`,
          repository: "demo",
          branch: "main",
          projectRoot: "supermodule",
          space: spaceId,
          workflowTool: "OPEN_TOFU",
          administrative: false,
          autodeploy: true,
        };

        console.log("Stack input:", JSON.stringify(stackInput, null, 2));

        const stackResult = await executeSpaceliftQuery(
          credentials,
          createStackMutation,
          {
            input: stackInput,
            manageState: true,
          }
        );

        stackId = stackResult.stackCreate.id;
        console.log(`Created stack: ${stackId}`);
      } else {
        console.log(`Using existing stack: ${stackId}`);
      }

      console.log("Creating/updating tfvars file mount...");

      const addConfigMutation = `
        mutation AddStackConfig($stack: ID!, $config: ConfigInput!) {
          stackConfigAdd(stack: $stack, config: $config) {
            id
            value
            writeOnly
            type
          }
        }
      `;

      const tfvarsContent = JSON.stringify(block.config, null, 2);
      const currentHash = createHash('sha256').update(tfvarsContent).digest('hex');
      
      // Get current mode and stored hash
      const { value: storedHash } = await kv.block.get('tfvars_hash');
      const { value: currentMode } = await kv.block.get('mode');
      
      // Check if config has changed
      const configChanged = storedHash !== currentHash;
      
      if (currentMode === 'state_polling') {
        // We're in state polling mode - check stack status
        console.log('In state polling mode, checking stack state...');
        
        const getStackQuery = `
          query GetStack($id: ID!) {
            stack(id: $id) {
              id
              state
              outputs {
                id
                value
                sensitive
              }
            }
          }
        `;
        
        const stackData = await executeSpaceliftQuery(credentials, getStackQuery, {
          id: stackId
        });
        
        const stack = stackData.stack;
        console.log(`Stack state: ${stack.state}`);
        
        if (stack.state === 'FINISHED') {
          // Stack is ready, get outputs
          console.log('Stack is ready with outputs');
          
          const outputs: Record<string, string> = {};
          if (stack.outputs) {
            for (const output of stack.outputs) {
              // Skip sensitive outputs
              if (output.sensitive) {
                console.log(`Skipping sensitive output: ${output.id}`);
                continue;
              }
              
              let value = output.value;
              if (value) {
                // Unquote JSON string values
                if (value.startsWith('"') && value.endsWith('"')) {
                  value = value.slice(1, -1);
                }
                outputs[output.id] = value;
              }
            }
          }
          
          // Clear polling mode
          await kv.block.delete(['mode']);
          
          return {
            newStatus: "ready",
            signalUpdates: { ...outputs },
          };
        } else if (stack.state === 'FAILED') {
          // Stack failed
          console.log('Stack failed');
          
          // Clear polling mode
          await kv.block.delete(['mode']);
          
          return { newStatus: "failed" };
        } else {
          // Stack still processing
          console.log(`Stack state: ${stack.state}, will check again in 15 seconds`);
          
          return {
            newStatus: "in_progress",
            syncAfter: 15000
          };
        }
      }
      
      if (configChanged) {
        // Config changed - enter config change mode
        console.log('Config changed, entering config change mode...');
        
        await executeSpaceliftQuery(credentials, addConfigMutation, {
          stack: stackId,
          config: {
            id: `source/supermodule/terraform.tfvars.json`,
            value: Buffer.from(tfvarsContent).toString('base64'),
            writeOnly: false,
            type: "FILE_MOUNT",
          },
        });
        
        // Store the new hash and enter state polling mode
        await kv.block.setMany([
          { key: 'tfvars_hash', value: currentHash },
          { key: 'mode', value: 'state_polling' },
        ]);
        console.log(`Mounted tfvars file: source/supermodule/terraform.tfvars.json`);
        
        // Trigger a run on the stack
        console.log('Triggering stack run...');
        const triggerRunMutation = `
          mutation TriggerRun($stack: ID!) {
            runTrigger(stack: $stack) {
              id
              state
            }
          }
        `;
        
        await executeSpaceliftQuery(credentials, triggerRunMutation, {
          stack: stackId
        });
        
        console.log(`Triggered run on stack ${stackId}, entering state polling mode`);
        
        return {
          newStatus: "in_progress",
          customStatusDescription: "Deploying",
          signalUpdates: { stackId },
          nextScheduleDelay: 30,
        };
      }

      // No config change, no active mode - just idle
      console.log('Config unchanged, staying idle');
      return { newStatus: "ready" };
    } catch (error) {
      console.error("Error in onSync:", error);
      return { newStatus: "failed" };
    }
  },

  async onDrain({ app, block }) {
    try {
      const { stackId } = block.lifecycle?.signals || {};
      
      if (stackId) {
        console.log(`Starting destroy for stack: ${stackId}`);
        
        const credentials = extractCredentials(app.config);
        
        // Delete the stack with resources
        const deleteStackMutation = `
          mutation DeleteStack($id: ID!, $destroyResources: Boolean!) {
            stackDelete(id: $id, destroyResources: $destroyResources) {
              id
            }
          }
        `;
        
        await executeSpaceliftQuery(credentials, deleteStackMutation, {
          id: stackId,
          destroyResources: true
        });
        
        console.log(`Stack deletion initiated: ${stackId}`);
      } else {
        console.log('No stack to delete');
      }
      
      return { newStatus: "drained" };
    } catch (error) {
      console.error("Error in onDrain:", error);
      return { newStatus: "draining_failed"};
    }
  },
};
