import { defineConfig, env } from "prisma/config";

// Prisma 7 no longer auto-loads .env when a config file is present — load it ourselves.
// Node >= 20.12 provides process.loadEnvFile().
try {
  process.loadEnvFile(".env");
} catch {
  // .env not found or already loaded — ignore
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  // Migrations use a DIRECT connection (port 5432), not the pooler.
  datasource: {
    url: env("DIRECT_URL"),
  },
});
