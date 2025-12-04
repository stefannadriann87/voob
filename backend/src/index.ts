import express = require("express");
import cors = require("cors");
const helmet = require("helmet");
import cookieParser = require("cookie-parser");
import dotenv = require("dotenv");
const { validateRequiredEnv, getEnv } = require("./lib/envValidator");
const { logger } = require("./lib/logger");
const { globalRateLimiter } = require("./middleware/globalRateLimit");
import authRouter = require("./routes/auth");
import businessRouter = require("./routes/business");
import bookingRouter = require("./routes/booking");
import consentRouter = require("./routes/consent");
import employeeRouter = require("./routes/employee");
const aiRouter = require("./routes/ai.routes");
const adminRouter = require("./admin/routes");
import clientRouter = require("./routes/client");
import userRouter = require("./routes/user");
const landingRouter = require("./routes/landing");
const paymentsRouter = require("./routes/payments");
const stripeWebhookRouter = require("./routes/stripeWebhook");
const businessOnboardingRouter = require("./routes/businessOnboarding");
const subscriptionRouter = require("./routes/subscription");
const platformSettingsRouter = require("./routes/platformSettings");
const billingRouter = require("./modules/billing/billing.routes");
const { billingWebhookHandler } = require("./modules/billing/billing.webhooks");
const healthRouter = require("./routes/health");

dotenv.config();

// Validează variabilele de mediu necesare la startup
try {
  validateRequiredEnv();
  logger.info("Environment variables validated successfully");
} catch (error) {
  logger.error("Environment validation failed", error);
  process.exit(1);
}
const rawBodySaver = (req: express.Request, _res: express.Response, buf: Buffer) => {
  (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
};

const app = express();

// Security headers cu Helmet.js
// Protecție: XSS, Clickjacking, MIME sniffing, etc.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.stripe.com"],
      frameSrc: ["'self'", "https://js.stripe.com", "https://hooks.stripe.com"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: process.env.NODE_ENV === "production" ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false, // Permite embedding pentru Stripe
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));

// CORS configuration - suportă multiple origins pentru AWS
const allowedOrigins = [
  getEnv("FRONTEND_URL", "http://localhost:3001"),
  getEnv("FRONTEND_URL_CDN", ""),
  getEnv("ADMIN_URL", ""),
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Permite requests fără origin (mobile apps, Postman, etc.) în development
    if (!origin && process.env.NODE_ENV === "development") {
      return callback(null, true);
    }
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

// Cookie parser pentru JWT HttpOnly cookies
app.use(cookieParser());

app.use(express.json({ limit: "12mb", verify: rawBodySaver }));
app.use(express.urlencoded({ extended: true, limit: "12mb" }));

// Aplică rate limiting global pe toate rutele (exceptând webhooks)
app.use(globalRateLimiter);

app.get("/", (req, res) => {
  res.json({ message: "LARSTEF API running ✅" });
});

// Health check endpoints (înainte de rate limiting pentru monitoring)
app.use("/health", healthRouter);

app.use("/auth", authRouter);
app.use("/business", businessRouter);
const { bookingRateLimiter } = require("./middleware/globalRateLimit");
app.use("/booking", bookingRateLimiter, bookingRouter);
app.use("/consent", consentRouter);
app.use("/employee", employeeRouter);
app.use("/client", clientRouter);
app.use("/api/user", userRouter);
app.use("/api/ai", aiRouter);
app.use("/landing", landingRouter);
app.use("/admin", adminRouter);
const { paymentRateLimiter } = require("./middleware/globalRateLimit");
app.use("/payments", paymentRateLimiter, paymentsRouter);
app.use("/business-onboarding", businessOnboardingRouter);
app.use("/subscription", subscriptionRouter);
app.use("/platform-settings", platformSettingsRouter);
app.use("/billing", billingRouter);
app.post("/webhooks/stripe", stripeWebhookRouter);
app.post("/billing/webhooks", express.raw({ type: "application/json" }), billingWebhookHandler);

// Global Error Handler - Format standard pentru toate erorile
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const isProduction = process.env.NODE_ENV === "production";
  
  logger.error("Unhandled error", err, {
    path: req.path,
    method: req.method,
    ip: req.ip,
  });

  // Format standard de eroare
  const errorResponse: { error: string; code?: string; details?: string | undefined } = {
    error: isProduction ? "A apărut o eroare. Te rugăm să încerci din nou." : err.message,
  };

  // Adaugă detalii doar în development
  if (!isProduction && err.stack) {
    errorResponse.details = err.stack;
  }

  // Determină status code
  const statusCode = (err as any).statusCode || (err as any).status || 500;
  
  res.status(statusCode).json(errorResponse);
});

// 404 Handler
app.use((req: express.Request, res: express.Response) => {
  res.status(404).json({ error: "Endpoint negăsit." });
});

const PORT = getEnv("PORT", "4000");
app.listen(Number(PORT), () => {
  logger.info(`API server started on port ${PORT}`);
});
