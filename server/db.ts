import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";

let dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
  throw new Error("DATABASE_URL must be set");
}

if (dbUrl.includes("@helium") || dbUrl.includes("@helium/")) {
  dbUrl = "postgresql://postgres@localhost:5432/heliumdb";
  process.env.DATABASE_URL = dbUrl;
}

export const pool = new Pool({
  connectionString: dbUrl,
});

export const db = drizzle(pool, { schema });
