import express from "express";
const router = express.Router();
import { body } from "express-validator";
import { createBusiness, getBusiness, updateBusiness, deleteBusiness, reActivateBusiness } from "../controllers/businessController.js";

import { deepClean } from "../middlewares/deepClean.js";
import { auth } from "../middlewares/auth.js"

// Validation middleware
const businessValidation = [
    body('name').notEmpty().withMessage('The name is required'),
    body('address').notEmpty().withMessage('The address is required'),
    body('phone')
    .notEmpty().withMessage('The phone number is required')
    .isMobilePhone().withMessage('The phone number is not valid'),
    body('email')
    .notEmpty().withMessage('The email is required')
    .isEmail().withMessage('Email is not valid')
]

router.post("/create", businessValidation, deepClean, createBusiness);
router.get("/get-business-by-id", auth, getBusiness);
router.put("/update", auth,
    businessValidation, 
    [body('id').notEmpty().withMessage('The ID is required')], 
    deepClean,
    updateBusiness
);
router.delete("/delete", 
    businessValidation, 
    [body('id').notEmpty().withMessage('The ID is required')], 
    deepClean,
    auth,
    deleteBusiness
);
router.get("/re-activate", auth, reActivateBusiness);

export default router