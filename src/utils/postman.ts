// Postman API utility functions

import { createTextStreamResponse } from "ai";

/**
 * Fetch the current Postman collection
 */
export async function fetchPostmanCollection(collectionId: string) {
  const response = await fetch(
    `https://api.getpostman.com/collections/${collectionId}`,
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
export async function updatePostmanCollection(
  updatedCollection: any,
  collectionId: string
) {
  const response = await fetch(
    `https://api.getpostman.com/collections/${collectionId}`,
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

// Crawls the collection and returns a list of the following objects
export type PostmanCollectionRequest = {
  type: "request" | "folder";
  name: string; // Name of request.
  id?: string; // Id of request
  location: string; // Path of request in original collection.
  data?: any; // The full request data.
};
export function crawlCollection(collection: any): PostmanCollectionRequest[] {
  let requests: PostmanCollectionRequest[] = [];
  // First we find all subfolders and store their locations in this array, assuming that the base array is "item"
  let base = collection.collection;
  let locations = ["item"];
  let locationIndex = 0;
  while (locationIndex < locations.length) {
    let currentPath = locations[locationIndex];
    let item = getObjectByPath(base, locations[locationIndex]);
    for (let i = 0; i < item.length; i++) {
      // For each nested folder we find in location.
      if (item[i]["item"]) {
        locations.push(`${currentPath}:${i}:item`);
      }
      if (item[i]["request"]) {
        requests.push({
          type: "request",
          name: item[i]["name"],
          id: item[i]["id"],
          location: `${currentPath}:${i}`,
          data: item[i]["request"],
        });
      } else {
        requests.push({
          type: "folder",
          name: item[i]["name"],
          location: `${currentPath}`,
        });
      }
    }
    locationIndex++;
  }

  return requests;
}

function getObjectByPath(base: any, location: string): any {
  let locationArray = location.split(":");
  let object = base;

  for (let L of locationArray) {
    if (!object) {
      console.error(
        `Path traversal failed at '${L}' in location '${location}' - object is null/undefined`
      );
      return null;
    }

    if (Number.isNaN(parseInt(L))) {
      if (!(L in object)) {
        console.error(
          `Property '${L}' not found in object at location '${location}'`
        );
        return null;
      }
      object = object[L];
    } else {
      const index = parseInt(L);
      if (!Array.isArray(object)) {
        console.error(
          `Expected array at index '${index}' but got ${typeof object} at location '${location}'`
        );
        return null;
      }
      if (index >= object.length || index < 0) {
        console.error(
          `Array index ${index} out of bounds (length: ${object.length}) at location '${location}'`
        );
        return null;
      }
      object = object[index];
    }
  }

  console.log(
    `Successfully retrieved object at location '${location}':`,
    typeof object === "object" ? `[${typeof object}]` : object
  );
  return object;
}
