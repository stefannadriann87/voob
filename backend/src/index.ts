import express = require("express");
import cors = require("cors");
import dotenv = require("dotenv");
import authRouter = require("./routes/auth");
import businessRouter = require("./routes/business");
import bookingRouter = require("./routes/booking");
import consentRouter = require("./routes/consent");

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ message: "LARSTEF API running ✅" });
});

app.use("/auth", authRouter);
app.use("/business", businessRouter);
app.use("/booking", bookingRouter);
app.use("/consent", consentRouter);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`✅ API running on port ${PORT}`));
