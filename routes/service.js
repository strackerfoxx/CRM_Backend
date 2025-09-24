import express from "express";
const router = express.Router();
import { body } from "express-validator";

import { createService, getServices, getServiceById, updateService, deleteService } from "../controllers/serviceController.js";

import { deepClean } from "../middlewares/deepClean.js";
import { auth } from "../middlewares/auth.js"

const clientValidation = [
    body('name').notEmpty().withMessage('The name is required'),
    body('durationMin')
    .notEmpty().withMessage('The dutation in minutes is required')
    .isInt({min: 1}).withMessage('The dutation must be a number'),
    body('price')
    .notEmpty().withMessage('The dutation in minutes is required')
    .isFloat({min: 1}).withMessage('The price must be a number')
]

router.post("/create", auth, deepClean, clientValidation, createService)
router.get("/get-services", auth, getServices)
router.get("/get-service-by-id", auth, getServiceById)
router.put("/update", auth, deepClean, clientValidation, updateService)
router.delete("/delete", auth, deepClean, deleteService)

export default router;