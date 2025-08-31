import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import routerBusiness from "./routes/business.js";
import routerUser from "./routes/user.js"
import routerClient from "./routes/client.js";
import routerAppointment from "./routes/appointment.js";
import routerService from "./routes/service.js";
import routerNote from "./routes/note.js";


dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/business", routerBusiness);
app.use("/api/user", routerUser);
app.use("/api/client", routerClient);
app.use("/api/appointment", routerAppointment);
app.use("/api/service", routerService);
app.use("/api/note", routerNote);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {});
