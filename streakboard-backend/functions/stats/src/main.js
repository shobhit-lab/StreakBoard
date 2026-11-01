import { Client, TablesDB, Query, Permission, Role } from 'node-appwrite';
import { handle } from './handler.js';

// Identity comes from execution headers only (x-appwrite-user-id), never the body.
// The per-execution key is injected by Appwrite with the scopes in appwrite.json.
export default async (context) => {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(context.req.headers['x-appwrite-key'] || process.env.APPWRITE_API_KEY);
  return handle(context, { db: new TablesDB(client), sdk: { Query, Permission, Role } });
};
