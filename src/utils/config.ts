import yaml from "js-yaml";
import fs from "fs/promises";

// Load config
export async function loadConfig() {
  try {
    const configContent = await fs.readFile("src/config.yaml", "utf-8");
    let configParsed = yaml.load(configContent) as any;

    // Validate required fields
    if (!configParsed) {
      throw new Error("Config file is empty or invalid");
    }

    if (
      configParsed["openapi-method"] !== "raw-contents" &&
      configParsed["openapi-method"] !== "live-url"
    ) {
      throw new Error(
        `Invalid field in openapi-method: ${configParsed["openapi-method"]}`
      );
    }

    if (
      configParsed["openapi-method"] === "raw-contents" &&
      !configParsed.path
    ) {
      throw new Error(
        "Missing required field: path (required when openapi-method is raw-contents)"
      );
    }

    if (configParsed["openapi-method"] === "live-url" && !configParsed.url) {
      throw new Error(
        "Missing required field: url (required when openapi-method is live-url)"
      );
    }

    if (!configParsed.branches || !Array.isArray(configParsed.branches)) {
      throw new Error("Missing or invalid field: branches (must be an array)");
    }

    // scope is optional, but if provided should be an array
    if (configParsed.scope && !Array.isArray(configParsed.scope)) {
      throw new Error("Invalid field: scope (must be an array if provided)");
    }

    return configParsed;
  } catch (error) {
    console.error("Failed to load config:", error);
    return { scope: [], branches: [] }; // Default fallback
  }
}
