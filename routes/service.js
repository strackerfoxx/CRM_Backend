import express from "express";
const router = express.Router();
import { body } from "express-validator";

import { createService } from "../controllers/serviceController.js";

import { deepClean } from "../middlewares/deepClean.js";
import { auth } from "../middlewares/auth.js"


router.post("/create", auth, deepClean, createService)

export default router;