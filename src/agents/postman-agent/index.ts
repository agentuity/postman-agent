import type { AgentContext, AgentRequest, AgentResponse } from "@agentuity/sdk";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { verifyGHWebhook, type GitHubWebhook } from "../../utils/github";
import { Octokit } from "octokit";
import { loadConfig } from "../../utils/config";
import { getSchemaFromGithub, getSchemaFromUrl } from "../../utils/openAPI";
import {
  fetchPostmanCollection,
  fetchPostmanSpecs,
  updatePostmanCollection,
  crawlCollection,
} from "../../utils/postman";
import { writeFileSync } from "fs";
import { isContext } from "vm";

const octokit = new Octokit({ auth: process.env.GITHUB_PAT });

export default async function Agent(
  req: AgentRequest,
  resp: AgentResponse,
  ctx: AgentContext
) {
  (async () => {
    const config = await loadConfig();

    if (!config["collection-id"]) {
      throw new Error("Collecion Id missing from config.yaml.");
    }

    let payload = (await req.data.json()) as GitHubWebhook;
    let rawBody = await req.data.binary();

    // First we check if the webhook actually came from GitHub.
    if (!verifyGHWebhook(req.metadata.headers, rawBody)) {
      ctx.logger.info("Webhook not from GitHub - ignoring.");
      throw new Error("Webhook not from GitHub - ignoring.");
    }

    // ctx.logger.info("Came from github.");

    // Check if the push is to a branch we're watching
    const isWatchedBranch =
      config.branches && config.branches.length > 0
        ? config.branches.some((branch: string) =>
            payload?.ref.includes(branch)
          )
        : true; // If no branches defined, watch all branches

    if (!isWatchedBranch) {
      ctx.logger.info("Not on watched branch - ignoring.");
      throw new Error("Not on watched branch - ignoring.");
    }

    // We want to get all the files that were changed, then ultimately get the changes from those files.
    let relevantDiffs = [];
    for (let commit of payload?.commits) {
      // ctx.logger.info("commit:", commit);
      let diffResponse = await octokit.request(
        "GET /repos/{owner}/{repo}/commits/{commit_sha}",
        {
          owner: payload.repository.owner.name,
          repo: payload.repository.name,
          commit_sha: commit.id,
        }
      );
      let files = diffResponse.data.files;

      // For each file in the commit, check if it is in scope
      for (let file of files) {
        const isInScope =
          config.scope && config.scope.length > 0
            ? config.scope.some((scopePath: string) =>
                file.filename.startsWith(scopePath)
              )
            : true; // If no scope defined, include all files

        if (isInScope) {
          // let fullFileContents = await fetch(file.raw_url);
          // file.full_content = fullFileContents;
          relevantDiffs.push(file);
        } else {
          ctx.logger.info(`${file.filename} is outside of scope - ignoring.`);
        }
      }
    }

    let openapiSchema;
    if (config["openapi-method"] == "raw-contents") {
      openapiSchema = await getSchemaFromGithub(config);
    } else {
      openapiSchema = await getSchemaFromUrl(config);
    }

    // If the changes did not affect any relevant files, ignore.
    if (relevantDiffs.length <= 0) {
      ctx.logger.info("No relevant changes - ignoring.");
      throw new Error("No relevant changes - ignoring.");
    }

    // Now we get the current state of the postman collection.
    let collectionResponse = await fetchPostmanCollection(
      config["collection-id"]
    );
    let collection = await collectionResponse.json();
    let crawledCollection = crawlCollection(collection);
    ctx.logger.info("Crawled Collection:", crawledCollection);

    // Write collection to file
    writeFileSync("collection.json", JSON.stringify(collection, null, 2));

    // Also, may remove this, but get the specifications of a collection object.
    let specifications = await fetchPostmanSpecs();

    // We make the first call to the LLM to generate the changes that need to be made to our collection.
    let response = await generateText({
      model: openai("chatgpt-4o-latest"),
      system: systemPrompt,
      prompt: `
        ## Inputs
        ### 1. **Git commit diffs**
        ${JSON.stringify(relevantDiffs)}

        ### 2. **New OpenAPI Schema**
        ${JSON.stringify(openapiSchema)}

        ### 3. **Current Postman collection**
        ${JSON.stringify(collection)}

        ### 4. **Postman Collection Format v2.1.0**
        ${JSON.stringify(specifications)}
        `,
    });
    ctx.logger.info("Response from Agent:", response.text);
    // try {
    //   await updatePostmanCollection(updatedCollection, config["collection-id"]);
    //   ctx.logger.info("Successfully updated Postman collection");
    // } catch (error) {
    //   ctx.logger.error(`Failed to update collection: ${error}`);
    // }
  })();

  return resp.text("Successfully kicked off process");
}

// Storing prompt down here for readability.
const systemPrompt = `
# API Change Analysis Agent

Your job is to analyze git commit diffs to determine whether the Agentuity API has changed and generate an updated Postman collection schema.

## Inputs Provided
You will receive:
1. **Git commit diffs** - The code changes to analyze
2. **New OpenAPI Schema** - The new schema that is a result of the commit diffs.
3. **Current Postman collection** - The existing collection structure
4. **Postman Collection Format v2.1.0** - https://schema.getpostman.com/json/collection/v2.1.0/collection.json

## Task
1. **Analyze the provided git commit diff and OpenAPI schema**
2. **Identify API changes** including:
  - New endpoints
  - Modified endpoints (path, method, parameters)
  - Removed endpoints
  - Changed request/response schemas
  - Updated authentication requirements

3. **Generate a NUMBERED LIST of changes to make to the Postman Collection JSON object.**, being as specific as possible. Mention everything that needs to change, do not mention anything that should stay the same.

## Output Format
Return only the numbered list of changes to make in the Postman Collection JSON object.`;
