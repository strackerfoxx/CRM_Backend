import express from "express";
const router = express.Router();
import { body } from "express-validator";
import { createClient } from "../controllers/clientController.js"

import { deepClean } from "../middlewares/deepClean.js";
import { auth } from "../middlewares/auth.js"

const clientValidation = [
    body('name').notEmpty().withMessage('The name is required'),
    body('phone')
    .notEmpty().withMessage('The phone number is required')
    .isMobilePhone().withMessage('The phone number is not valid'),
]

router.post('/create', auth, clientValidation, deepClean, createClient)

export default router;