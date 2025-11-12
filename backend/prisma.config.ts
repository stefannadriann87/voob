import prismaConfig = require("prisma/config");
import dotenv = require("dotenv");

const { defineConfig, env } = prismaConfig;

dotenv.config();

export = defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  engine: "classic",
  datasource: {
    url: env("DATABASE_URL"),
  },
});
