import express = require("express");
import cors = require("cors");
import dotenv = require("dotenv");
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

dotenv.config();
const rawBodySaver = (req: express.Request, _res: express.Response, buf: Buffer) => {
  (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
};

const app = express();
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3001",
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(express.json({ limit: "12mb", verify: rawBodySaver }));
app.use(express.urlencoded({ extended: true, limit: "12mb" }));

app.get("/", (req, res) => {
  res.json({ message: "LARSTEF API running ✅" });
});

app.use("/auth", authRouter);
app.use("/business", businessRouter);
app.use("/booking", bookingRouter);
app.use("/consent", consentRouter);
app.use("/employee", employeeRouter);
app.use("/client", clientRouter);
app.use("/api/user", userRouter);
app.use("/api/ai", aiRouter);
app.use("/landing", landingRouter);
app.use("/admin", adminRouter);
app.use("/payments", paymentsRouter);
app.post("/webhooks/stripe", stripeWebhookRouter);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`✅ API running on port ${PORT}`));
