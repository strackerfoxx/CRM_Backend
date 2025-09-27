import express from "express";
const router = express.Router();
import { body } from "express-validator";

import { createAppointment, getAppointments } from "../controllers/appointmentController.js"

import { deepClean } from "../middlewares/deepClean.js";
import { auth } from "../middlewares/auth.js"
import { authClient } from "../middlewares/authClient.js"
import { appointmentAuth } from "../middlewares/appointmentAuth.js";



router.post("/create", appointmentAuth, createAppointment)
router.get("/get-all", auth, getAppointments)

export default router;