interface SpaceliftInputConfig {
  name: string;
  description: string;
  type: "string" | "number" | "boolean";
  required?: boolean;
  graphqlFieldKey?: string;
}

export function defineSpaceliftInputConfig(
  config: SpaceliftInputConfig,
): SpaceliftInputConfig {
  return config;
}

export function mapInputConfig(
  inputConfig: Record<string, SpaceliftInputConfig>,
) {
  return {
    type: "object" as const,
    properties: Object.fromEntries(
      Object.entries(inputConfig).map(([key, config]) => [
        key,
        {
          type: config.type,
          description: config.description,
        },
      ]),
    ),
    required: Object.keys(inputConfig).filter(
      (key) => inputConfig[key].required,
    ),
  };
}

export function mapInputsToGraphQLVariables(
  inputConfig: Record<string, SpaceliftInputConfig>,
  inputValues: Record<string, any>,
): Record<string, any> {
  const variables: Record<string, any> = {};

  for (const [key, config] of Object.entries(inputConfig)) {
    const graphqlKey = config.graphqlFieldKey || key;
    const value = inputValues[key];

    if (value !== undefined) {
      variables[graphqlKey] = value;
    }
  }

  return variables;
}