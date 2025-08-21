// Postman API utility functions

/**
 * Fetch the current Postman collection
 */
export async function fetchPostmanCollection() {
  const response = await fetch(
    `https://api.getpostman.com/collections/${process.env.POSTMAN_COLLECTION_ID}`,
    {
      method: "GET",
      headers: {
        "x-api-key": process.env.POSTMAN_API_KEY!,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch Postman collection: ${response.status}`);
  }

  return response;
}

/**
 * Fetch the Postman collection format specifications
 */
export async function fetchPostmanSpecs() {
  const response = await fetch(
    `https://schema.postman.com/json/collection/v2.1.0/collection.json`
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch Postman specs: ${response.status}`);
  }

  return await response.json();
}

/**
 * Update the Postman collection with new data
 */
export async function updatePostmanCollection(updatedCollection: any) {
  const response = await fetch(
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

  if (!response.ok) {
    throw new Error(
      `Failed to update Postman collection: ${
        response.status
      } - ${await response.text()}`
    );
  }

  return response;
}

/**
 * Update the Postman collection with new data
 */
export async function createPostmanCollection(newCollection: any) {
  const response = await fetch(
    `https://api.getpostman.com/collections?workspace=${process.env.POSTMAN_WORKSPACE_ID}`,
    {
      method: "POST",
      headers: {
        "x-api-key": process.env.POSTMAN_API_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ collection: newCollection }),
    }
  );

  if (!response.ok) {
    throw new Error(
      `Failed to create Postman collection: ${
        response.status
      } - ${await response.text()}`
    );
  }

  return response;
}

/**
 * Import OpenAPI schema to create a new Postman collection
 */
export async function importFromOpenAPI(openapiSchema: any) {
  const response = await fetch(
    `https://api.getpostman.com/import/openapi?workspace=${process.env.POSTMAN_WORKSPACE_ID}`,
    {
      method: "POST",
      headers: {
        "x-api-key": process.env.POSTMAN_API_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "json",
        input: openapiSchema,
        options: {
          folderStrategy: "Tags",
          requestParametersResolution: "Example",
          optimizeConversion: false,
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to import OpenAPI to Postman collection: ${response.status} - ${errorText}`
    );
  }

  return response;
}
