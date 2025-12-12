/**
 * Pagination Schemas
 * Zod schemas pentru pagination în API
 */

const { z } = require("zod");

/**
 * Schema pentru query parameters de pagination
 */
const paginationQuerySchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).optional().default("1"),
  limit: z.string().regex(/^\d+$/).transform(Number).optional().default("20"),
  cursor: z.string().optional(), // Pentru cursor-based pagination
}).refine((data: { page?: number; limit?: number; cursor?: string }) => {
  const page = Number(data.page) || 1;
  const limit = Number(data.limit) || 20;
  return page > 0 && limit > 0 && limit <= 100; // Max 100 per page
}, {
  message: "Page trebuie să fie > 0, limit trebuie să fie între 1 și 100",
});

/**
 * Helper pentru a calcula skip și take din page și limit
 */
function getPaginationParams(page: number, limit: number): { skip: number; take: number } {
  const pageNum = Math.max(1, page);
  const limitNum = Math.min(100, Math.max(1, limit)); // Max 100, min 1
  return {
    skip: (pageNum - 1) * limitNum,
    take: limitNum,
  };
}

/**
 * Helper pentru a construi răspunsul de pagination
 */
function buildPaginationResponse<T>(
  data: T[],
  total: number,
  page: number,
  limit: number
): {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
} {
  const totalPages = Math.ceil(total / limit);
  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

module.exports = {
  paginationQuerySchema,
  getPaginationParams,
  buildPaginationResponse,
};
