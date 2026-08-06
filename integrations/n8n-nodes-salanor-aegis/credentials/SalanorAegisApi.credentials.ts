import type {
  IAuthenticateGeneric,
  ICredentialType,
  INodeProperties,
} from "n8n-workflow";

export class SalanorAegisApi implements ICredentialType {
  name = "salanorAegisApi";

  displayName = "Salanor Aegis API";

  documentationUrl = "https://docs.salanor.com/aegis/n8n";

  properties: INodeProperties[] = [
    {
      displayName: "API Base URL",
      name: "apiBaseUrl",
      type: "string",
      default: "https://api.salanor.com",
      required: true,
      description: "Aegis API origin (no trailing slash)",
    },
    {
      displayName: "Ingest API Key",
      name: "apiKey",
      type: "string",
      typeOptions: { password: true },
      default: "",
      required: true,
      description:
        "From Salanor Console → API keys. Value is used as Bearer token (aegis_…).",
    },
  ];

  authenticate: IAuthenticateGeneric = {
    type: "generic",
    properties: {
      headers: {
        Authorization: "=Bearer {{$credentials.apiKey}}",
      },
    },
  };
}
