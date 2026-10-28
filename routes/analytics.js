import express from "express";
const router = express.Router();

import {
  getOverview,
  getAppointmentsOverTime,
  getTopServices,
  getEmployeeAnalytics,
} from "../controllers/analyticsController.js";

import { businessAuth } from "../middlewares/businessAuth.js";

router.get("/overview", businessAuth, getOverview);
router.get("/appointments-over-time", businessAuth, getAppointmentsOverTime);
router.get("/top-services", businessAuth, getTopServices);
router.get("/employees", businessAuth, getEmployeeAnalytics);

export default router;
