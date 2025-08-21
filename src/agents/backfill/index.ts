import type { AgentContext, AgentRequest, AgentResponse } from "@agentuity/sdk";
import { openai } from "@ai-sdk/openai";
import { convertFileListToFileUIParts, generateText } from "ai";
import { Octokit } from "octokit";
import { loadConfig } from "../../utils/config";
import {
  fetchPostmanSpecs,
  createPostmanCollection,
} from "../../utils/postman";

const octokit = new Octokit({ auth: process.env.GITHUB_PAT });
const config = await loadConfig();

async function getSchemaFromUrl() {
  let response = await fetch(config["url"]);
  if (!response.ok) {
    throw new Error("Failed to fetch OpenAPI Schema from live url.");
  }
  return await response.json();
}

async function getSchemaFromGithub() {
  const fileResponse = await octokit.request(
    "GET /repos/{owner}/{repo}/contents/{path}",
    {
      owner: config["owner"],
      repo: config["repo"],
      path: config["path"],
    }
  );
  if (!fileResponse?.data?.download_url) {
    throw new Error("Failed to fetch file from GitHub.");
  }
  let response = await fetch(fileResponse?.data?.download_url);
  console.log(fileResponse?.data?.download_url);
  if (!response.ok) {
    throw new Error("Failed to fetch OpenAPI Schema from GitHub.");
  }
  return await response.json();
}
export default async function Agent(
  req: AgentRequest,
  resp: AgentResponse,
  ctx: AgentContext
) {
  // Get OpenAPI Schema from repo.
  let openapiSchema;
  if (config["openapi-method"] == "raw-contents") {
    openapiSchema = await getSchemaFromGithub();
  } else {
    openapiSchema = await getSchemaFromUrl();
  }

  let specifications = await fetchPostmanSpecs();

  let response = await generateText({
    model: openai("chatgpt-4o-latest"),
    system: backfillPrompt,
    prompt: `
        ## Inputs
        ### 1. **OpenAPI Schema**
        ${JSON.stringify(openapiSchema)}

        ### 2. **Postman Collection Format v2.1.0**
        ${JSON.stringify(specifications)}
        `,
  });

  let newPostmanCollection = JSON.parse(response.text);
  if (!newPostmanCollection) {
    throw new Error("Agent failed to generate response.");
  }

  createPostmanCollection(newPostmanCollection);

  return resp.text("Created new Postman Collection.");
}

const backfillPrompt = `
# Postman Collection Backfill Agent

Generate a complete Postman collection from an OpenAPI Schema.

## Provided Inputs
1. **OpenAPI Schema** - The schema from the API we want to create a collection for.
2. **Postman Collection Format v2.1.0** - the schema your output must match.

## Task
Analyze the provided OpenAPI Schema and convert it to a Postman Collection:

## Output Format
Return ONLY a valid JSON object following Postman Collection Format v2.1.0 structure. Include:
- Collection info (name, description)
- All endpoints as request items
- Proper folder organization

CRITICAL: Return raw JSON only. Do NOT wrap in markdown code blocks (\`\`\`json). Do NOT include any text before or after the JSON. Your response must parse directly with JSON.parse() in TypeScript.
`;
