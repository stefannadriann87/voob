/**
 * Input Validation Middleware
 * Validează request body folosind Zod schemas
 */

import express = require("express");
const zod = require("zod");
const { z, ZodError } = zod;
type ZodSchema = any; // ZodSchema type from zod package
const { logger } = require("../lib/logger");

interface ValidationRequest extends express.Request {
  validatedBody?: unknown;
}

/**
 * Middleware pentru validare request body cu Zod schema
 * @param schema - Zod schema pentru validare
 * @returns Express middleware
 */
const validate = (schema: ZodSchema) => {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      const validated = schema.parse(req.body);
      (req as ValidationRequest).validatedBody = validated;
      req.body = validated; // Override cu datele validate
      next();
    } catch (error: unknown) {
      const zodError = error as any;
      if (zodError instanceof ZodError) {
        const errors = (zodError.errors || []).map((err: any) => ({
          field: (err.path || []).join("."),
          message: err.message || "Validation error",
        }));

        logger.warn("Validation failed", {
          path: req.path,
          method: req.method,
          errors,
        });

        return res.status(400).json({
          error: "Date invalide",
          details: errors,
        });
      }

      logger.error("Validation middleware error", error);
      return res.status(500).json({ error: "Eroare la validarea datelor." });
    }
  };
};

/**
 * Middleware pentru validare query parameters
 * @param schema - Zod schema pentru validare
 * @returns Express middleware
 */
const validateQuery = (schema: ZodSchema) => {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      const validated = schema.parse(req.query);
      req.query = validated as express.Request["query"];
      next();
    } catch (error: unknown) {
      const zodError = error as any;
      if (zodError instanceof ZodError) {
        const errors = (zodError.errors || []).map((err: any) => ({
          field: (err.path || []).join("."),
          message: err.message || "Validation error",
        }));

        logger.warn("Query validation failed", {
          path: req.path,
          method: req.method,
          errors,
        });

        return res.status(400).json({
          error: "Parametri invalizi",
          details: errors,
        });
      }

      logger.error("Query validation middleware error", error);
      return res.status(500).json({ error: "Eroare la validarea parametrilor." });
    }
  };
};

/**
 * Middleware pentru validare params (URL parameters)
 * @param schema - Zod schema pentru validare
 * @returns Express middleware
 */
const validateParams = (schema: ZodSchema) => {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      const validated = schema.parse(req.params);
      req.params = validated as express.Request["params"];
      next();
    } catch (error: unknown) {
      const zodError = error as any;
      if (zodError instanceof ZodError) {
        const errors = (zodError.errors || []).map((err: any) => ({
          field: (err.path || []).join("."),
          message: err.message || "Validation error",
        }));

        logger.warn("Params validation failed", {
          path: req.path,
          method: req.method,
          errors,
        });

        return res.status(400).json({
          error: "Parametri URL invalizi",
          details: errors,
        });
      }

      logger.error("Params validation middleware error", error);
      return res.status(500).json({ error: "Eroare la validarea parametrilor URL." });
    }
  };
};

module.exports = {
  validate,
  validateQuery,
  validateParams,
  z,
  ZodError,
};

