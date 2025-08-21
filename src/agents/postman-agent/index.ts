import type { AgentContext, AgentRequest, AgentResponse } from "@agentuity/sdk";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { verifyGHWebhook, type GitHubWebhook } from "../../utils/github";
import { Octokit } from "octokit";
import { loadConfig } from "../../utils/config";
import {
  fetchPostmanCollection,
  fetchPostmanSpecs,
  updatePostmanCollection,
} from "../../utils/postman";

const octokit = new Octokit({ auth: process.env.GITHUB_PAT });
const config = await loadConfig();

export default async function Agent(
  req: AgentRequest,
  resp: AgentResponse,
  ctx: AgentContext
) {
  let payload = (await req.data.json()) as GitHubWebhook;
  let rawBody = await req.data.binary();

  // First we check if the webhook actually came from GitHub.
  if (!verifyGHWebhook(req.metadata.headers, rawBody)) {
    ctx.logger.info("Webhook not from GitHub - ignoring.");
    return resp.text("Webhook not from GitHub - ignoring.");
  }

  ctx.logger.info("Came from github.");

  // Check if the push is to a branch we're watching
  const isWatchedBranch =
    config.branches && config.branches.length > 0
      ? config.branches.some((branch: string) => payload?.ref.includes(branch))
      : true; // If no branches defined, watch all branches

  if (!isWatchedBranch) {
    ctx.logger.info("Not on watched branch - ignoring.");
    return resp.text("Not on watched branch - ignoring.");
  }

  // We want to get all the files that were changed, then ultimately get the changes from those files.
  for (let commit of payload?.commits) {
    ctx.logger.info("commit:", commit);
    let diffResponse = await octokit.request(
      "GET /repos/{owner}/{repo}/commits/{commit_sha}",
      {
        owner: payload.repository.owner.name,
        repo: payload.repository.name,
        commit_sha: commit.id,
      }
    );
    console.log("diffResponse:", diffResponse);
    let files = diffResponse.data.files;

    // For each file in the commit, check if it is in scope
    let relevantDiffs = [];
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

    // If the changes did not affect any relevant files, ignore.
    if (relevantDiffs.length <= 0) {
      ctx.logger.info("No relevant changes - ignoring.");
      return resp.text("No relevant changes - ignoring.");
    }

    // Now we get the current state of the postman collection.
    let collection = await fetchPostmanCollection();

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

      ### 2. **Current Postman collection**
      ${JSON.stringify(collection)}

      ### 3. **Postman Collection Format v2.1.0**
      ${JSON.stringify(specifications)}
      `,
    });
    ctx.logger.info(`Change instructions: ${response.text}`);

    // Now, we make a second call to implement the proposed changes.
    let finalCollection = await generateText({
      model: openai("chatgpt-4o-latest"),
      system: applyChangesPrompt,
      prompt: `
      ## Inputs
      ### 1. **Change instructions**
      ${JSON.stringify(response.text)}

      ### 2. **Current Postman collection**
      ${JSON.stringify(collection)}

      ### 3. **Postman Collection Format v2.1.0**
      ${JSON.stringify(specifications)}
      `,
    });
    ctx.logger.info(`Final Collection: ${finalCollection.text}`);

    // Update the Postman collection with the new schema
    // Clean the response text to remove markdown code blocks if present
    let cleanedResponse = finalCollection.text.trim();
    if (cleanedResponse.startsWith('```json')) {
      cleanedResponse = cleanedResponse.replace(/^```json\n?/, '').replace(/\n?```$/, '');
    } else if (cleanedResponse.startsWith('```')) {
      cleanedResponse = cleanedResponse.replace(/^```\n?/, '').replace(/\n?```$/, '');
    }
    
    const updatedCollection = JSON.parse(cleanedResponse);

    try {
      await updatePostmanCollection(updatedCollection);
      ctx.logger.info("Successfully updated Postman collection");
      return resp.text(
        `Successfully updated Postman collection: ${finalCollection.text}`
      );
    } catch (error) {
      ctx.logger.error(`Failed to update collection: ${error}`);
      return resp.text(`Failed to update collection: ${error}`);
    }
  }

  return resp.text("Done.");
}

// Storing prompt down here for readability.
const systemPrompt = `
# API Change Analysis Agent

Your job is to analyze git commit diffs to determine whether the Agentuity API has changed and generate an updated Postman collection schema.

## Inputs Provided
You will receive:
1. **Git commit diffs** - The code changes to analyze
2. **Current Postman collection** - The existing collection structure
3. **Postman Collection Format v2.1.0** - https://schema.getpostman.com/json/collection/v2.1.0/collection.json

## Task
1. **Analyze the provided git commit diff**
2. **Identify API changes** including:
  - New endpoints
  - Modified endpoints (path, method, parameters)
  - Removed endpoints
  - Changed request/response schemas
  - Updated authentication requirements

3. **Generate a NUMBERED LIST of changes to make to the Postman Collection JSON object.**, being as specific as possible. Mention everything that needs to change, do not mention anything that should stay the same.

## Output Format
Return only the numbered list of changes to make in the Postman Collection JSON object.`;

const applyChangesPrompt = `
# Collection Update Agent

## Inputs Provided
You will receive:
1. **Change instructions**
2. **Current Postman collection** - The existing collection structure
3. **Postman Collection Format v2.1.0** - https://schema.getpostman.com/json/collection/v2.1.0/collection.json

Apply the analyzed changes to a Postman collection to produce the final updated collection.

## Task
Take the change instructions from the first agent and the current collection, then return the complete updated collection.

## Output Format
Return the FULL valid JSON object following Postman Collection Format v2.1.0 structure with the changes applied. No explanations or additional text.
`;
