import { createHmac, timingSafeEqual } from "crypto";

export function verifyGHWebhook(headers: any, payload: any): boolean {
  let secretHash = Buffer.from(headers["x-hub-signature-256"], "utf8");
  let myHash = Buffer.from(
    "sha256=" +
      createHmac("sha256", process.env.GITHUB_SECRET || "")
        .update(payload)
        .digest("hex"),
    "utf8"
  );
  // console.log(`Secret Hash: ${secretHash}, My Hash: ${myHash}`);
  return timingSafeEqual(secretHash, myHash);
}

export type GitHubWebhook = {
  ref: string;
  commits: Array<{
    id: string;
    message: string;
    timestamp: string;
    url: string;
    author: {
      name: string;
      email: string;
      username: string;
    };
    committer: {
      name: string;
      email: string;
      username: string;
    };
    added: string[];
    removed: string[];
    modified: string[];
  }>;
  repository: {
    name: string;
    owner: {
      name: string;
    };
  };
};
