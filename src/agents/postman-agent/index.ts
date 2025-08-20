import type { AgentContext, AgentRequest, AgentResponse } from "@agentuity/sdk";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { verifyGHWebhook, type GitHubWebhook } from "./utils/github";
import fs from "fs/promises";
import { Octokit, App } from "octokit";

const octokit = new Octokit({ auth: process.env.GITHUB_PAT });

export default async function Agent(
  req: AgentRequest,
  resp: AgentResponse,
  ctx: AgentContext
) {
  let payload = (await req.data.json()) as GitHubWebhook;
  let rawBody = await req.data.binary();

  // First we check if the webhook actually came from GitHub.
  if (verifyGHWebhook(req.metadata.headers, rawBody)) {
    ctx.logger.info("Came from github.");
    // Now, for testing purposes, we only want to receive webhooks from pushing to the test branch.
    if (payload?.ref.includes("nick-test-do-not-merge")) {
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

        // For each file in the commit, check if it is in the api
        let relevantFiles = [];
        for (let file of files) {
          if (file.filename.startsWith("api/")) {
            let fullFileContents = await fetch(file.raw_url);
            file.full_content = fullFileContents;
            relevantFiles.push(file);
          } else {
            ctx.logger.info(
              `${file.filename} is outside of api scope - ignoring.`
            );
          }
        }

        // Now we get the current state of the postman collection.
        let collection = await fetch(
          `https://api.getpostman.com/collections/${process.env.POSTMAN_COLLECTION_ID}`,
          {
            method: "GET",
            headers: {
              "x-api-key": process.env.POSTMAN_API_KEY!,
            },
          }
        );

        // Also, may remove this, but get the specifications of a collection object.
        let specifications = await fetch(
          `https://schema.postman.com/json/collection/v2.1.0/collection.json`
        );

        let response = await generateText({
          model: openai("chatgpt-4o-latest"),
          system: systemPrompt,
          prompt: `
          ## Inputs
          ### 1. **Git commit diffs**
          ${JSON.stringify(relevantFiles)}

          ### 2. **Current Postman collection**
          ${JSON.stringify(collection)}

          ### 3. **Postman collection schema**
          ${JSON.stringify(specifications)}
          `,
        });
        ctx.logger.info(`JSON Response: ${response.text}`);

        // Update the Postman collection with the new schema
        const updatedCollection = JSON.parse(response.text);
        const updateResponse = await fetch(
          `https://api.getpostman.com/collections/${process.env.POSTMAN_COLLECTION_ID}`,
          {
            method: "PUT",
            headers: {
              "x-api-key": process.env.POSTMAN_API_KEY!,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ collection: updatedCollection }),
          }
        );

        if (updateResponse.ok) {
          ctx.logger.info("Successfully updated Postman collection");
          return resp.text(
            `Successfully updated Postman collection: ${response.text}`
          );
        } else {
          ctx.logger.error(
            `Failed to update collection: ${updateResponse.status}`
          );
          return resp.text(
            `Failed to update collection: ${await updateResponse.text()}`
          );
        }
      }
    } else {
      ctx.logger.info("Not on test branch - ignoring.");
      return resp.text("Not on test branch - ignoring.");
    }
  } else {
    ctx.logger.info("Webhook not from GitHub - ignoring.");
    return resp.text("Webhook not from GitHub - ignoring.");
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
3. **Postman collection schema** - https://schema.getpostman.com/json/collection/v2.1.0/collection.json

## Task
1. **Analyze the provided git commit diff**
2. **Identify API changes** including:
  - New endpoints
  - Modified endpoints (path, method, parameters)
  - Removed endpoints
  - Changed request/response schemas
  - Updated authentication requirements

3. **Generate a JSON object** representing the updated Postman collection schema that reflects these changes.
  - Do NOT return anything other than the valid JSON object. No explanations or text of any kind.

## Output Format
Return a valid JSON object following Postman Collection Format v2.1.0 structure.`;
