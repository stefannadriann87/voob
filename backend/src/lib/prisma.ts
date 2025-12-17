/**
 * Prisma Client Configuration
 * Configurează connection pool pentru performanță optimă
 */

const { PrismaClient } = require("@prisma/client");
const { logger } = require("./logger");

// Connection pool configuration
// Formula recomandată: connections = ((core_count * 2) + effective_spindle_count)
// Pentru PostgreSQL: max 20-100 connections (depinde de server)
// Configurarea se face prin DATABASE_URL query parameters:
// postgresql://user:pass@host:5432/db?connection_limit=10&pool_timeout=10

// Configurează Prisma Client cu connection pool
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "development" 
    ? [{ emit: "event", level: "query" }, { emit: "stdout", level: "error" }]
    : [{ emit: "stdout", level: "error" }],
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

// Connection pool settings pentru PostgreSQL
// Prisma folosește connection pooling implicit, dar putem optimiza prin DATABASE_URL
// Exemplu: postgresql://user:pass@host:5432/db?connection_limit=10&pool_timeout=10

// Event listeners pentru monitoring
if (process.env.NODE_ENV === "development") {
  prisma.$on("query" as any, (e: any) => {
    if (e.duration > 1000) {
      // Log slow queries (>1s)
      logger.warn(`Slow query detected: ${e.duration}ms`, {
        query: e.query.substring(0, 200),
        params: e.params,
      });
    }
  });
}

// Graceful shutdown
process.on("beforeExit", async () => {
  await prisma.$disconnect();
  logger.info("Prisma client disconnected");
});

// Error handling
prisma.$on("error" as any, (e: any) => {
  logger.error("Prisma error:", e);
});

module.exports = prisma;
