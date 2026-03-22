import { defineConfig } from "drizzle-kit";

let dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

if (dbUrl.includes("@helium") || dbUrl.includes("@helium/")) {
  dbUrl = "postgresql://postgres@localhost:5432/heliumdb";
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: dbUrl,
  },
});
