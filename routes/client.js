import express from "express";
const router = express.Router();
import { body } from "express-validator";
import { createClient } from "../controllers/clientController.js"

import { deepClean } from "../middlewares/deepClean.js";
import { auth } from "../middlewares/auth.js"

router.post('/create', auth, )

export default router;