import { Octokit } from "octokit";

const octokit = new Octokit({ auth: process.env.GITHUB_PAT });

export async function getSchemaFromUrl(config: any) {
  let response = await fetch(config["url"]);
  if (!response.ok) {
    throw new Error("Failed to fetch OpenAPI Schema from live url.");
  }
  return await response.json();
}

export async function getSchemaFromGithub(config: any) {
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
