"use strict";
const prismaConfig = require("prisma/config");
const dotenv = require("dotenv");
const { defineConfig, env } = prismaConfig;
dotenv.config();
module.exports = defineConfig({
    schema: "prisma/schema.prisma",
    migrations: {
        path: "prisma/migrations",
    },
    engine: "classic",
    datasource: {
        url: env("DATABASE_URL"),
    },
});
//# sourceMappingURL=prisma.config.js.map