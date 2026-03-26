import { Client } from "@notionhq/client";
import type {
  QueryDatabaseParameters,
  CreatePageParameters,
  UpdatePageParameters,
  QueryDatabaseResponse,
  CreatePageResponse,
  UpdatePageResponse,
} from "@notionhq/client/build/src/api-endpoints.js";
import "dotenv/config";

const NOTION_API_KEY = process.env.NOTION_API_KEY;
if (!NOTION_API_KEY) {
  throw new Error(
    "NOTION_API_KEY is not set. Add it to your .env file (format: ntn_...)"
  );
}

export const notionClient = new Client({ auth: NOTION_API_KEY });

/**
 * Query a Notion database with optional filter and sorts.
 * Automatically handles pagination to return all matching results.
 */
export async function queryDatabase(
  databaseId: string,
  filter?: QueryDatabaseParameters["filter"],
  sorts?: QueryDatabaseParameters["sorts"]
): Promise<QueryDatabaseResponse["results"]> {
  const results: QueryDatabaseResponse["results"] = [];
  let cursor: string | undefined = undefined;

  do {
    const response = await notionClient.databases.query({
      database_id: databaseId,
      filter,
      sorts,
      start_cursor: cursor,
      page_size: 100,
    });

    results.push(...response.results);
    cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
  } while (cursor);

  return results;
}

/**
 * Create a new page (row) in a Notion database.
 */
export async function createPage(
  databaseId: string,
  properties: CreatePageParameters["properties"]
): Promise<CreatePageResponse> {
  const response = await notionClient.pages.create({
    parent: { database_id: databaseId },
    properties,
  });
  return response;
}

/**
 * Update an existing Notion page's properties.
 */
export async function updatePage(
  pageId: string,
  properties: UpdatePageParameters["properties"]
): Promise<UpdatePageResponse> {
  const response = await notionClient.pages.update({
    page_id: pageId,
    properties: properties!,
  });
  return response;
}
