import express = require("express");

interface AuthenticatedRequest extends express.Request {
  user?: {
    userId: string;
    role: string;
  };
}

function requireSuperAdmin(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  const authReq = req as AuthenticatedRequest;
  if (!authReq.user || authReq.user.role !== "SUPERADMIN") {
    return res.status(403).json({ error: "Acces restricționat la resursele SuperAdmin." });
  }
  return next();
}

module.exports = { requireSuperAdmin };

