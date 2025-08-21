import type { AgentContext, AgentRequest, AgentResponse } from "@agentuity/sdk";
import { loadConfig } from "../../utils/config";
import { getSchemaFromGithub, getSchemaFromUrl } from "../../utils/openAPI";
import {
  importFromOpenAPI,
  updatePostmanCollection,
} from "../../utils/postman";

export default async function Agent(
  req: AgentRequest,
  resp: AgentResponse,
  ctx: AgentContext
) {
  const config = await loadConfig();
  // Get OpenAPI Schema from repo.
  let openapiSchema;
  if (config["openapi-method"] == "raw-contents") {
    openapiSchema = await getSchemaFromGithub(config);
  } else {
    openapiSchema = await getSchemaFromUrl(config);
  }

  // Import OpenAPI schema directly to Postman
  let importResponse = await importFromOpenAPI(openapiSchema);
  let importData = await importResponse.json();

  if (!importData) {
    throw new Error("Failed to import OpenAPI schema to Postman collection.");
  }

  // Write the collectionId
  let collectionId = importData.collections[0].id;
  if (!collectionId) {
    throw new Error("Failed to find collection id.");
  }
  const fs = await import("fs/promises");
  const configContent = await fs.readFile("src/config.yaml", "utf-8");
  const updatedConfig = configContent.replace(
    /^collection-id:.*$/m,
    `collection-id: ${collectionId}`
  );
  await fs.writeFile("src/config.yaml", updatedConfig);

  return resp.text("Created new Postman Collection.");
}
