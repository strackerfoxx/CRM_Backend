import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";

import routerBusiness from "./routes/business.js";
import routerUser from "./routes/user.js";
import routerClient from "./routes/client.js";
import routerAppointment from "./routes/appointment.js";
import routerService from "./routes/service.js";
import routerNote from "./routes/note.js";
import routerBlockedTime from "./routes/blockedTime.js";

dotenv.config();

const app = express();

app.use(cors({
  // origin: [
  //   "http://localhost:3000",
  //   process.env.FRONTEND_ORIGIN
  // ],
  origin: true,
  credentials: true
}));

app.use(express.json());
app.use(cookieParser());

app.get("/", (req, res) => {
  res.send("API running");
});

app.use("/api/business", routerBusiness);
app.use("/api/user", routerUser);
app.use("/api/client", routerClient);
app.use("/api/appointment", routerAppointment);
app.use("/api/service", routerService);
app.use("/api/note", routerNote);
app.use("/api/blocked-time", routerBlockedTime);

app.use((err, req, res, next) => {
  console.error(err);

  res.status(500).json({
    message: "Internal server error"
  });
});

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});