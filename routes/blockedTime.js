import express from "express";
const router = express.Router();
import { body } from "express-validator";
import { createBlockedTime, getBlockedTimes, updateBlockedTime, deleteBlockedTime } from "../controllers/blockedTimeController.js";

import { deepClean } from "../middlewares/deepClean.js";
import { auth } from "../middlewares/auth.js";

const blockedTimeValidation = [
    body('date').notEmpty().withMessage('The date is required').isISO8601().withMessage('Date must be a valid ISO 8601 string'),
    body('start').notEmpty().withMessage('The start time is required').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Start time must be HH:mm'),
    body('end').notEmpty().withMessage('The end time is required').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('End time must be HH:mm')
];

router.post("/create", auth, blockedTimeValidation, deepClean, createBlockedTime);
router.get("/get-blocked-times", auth, getBlockedTimes);
router.put("/update", auth,
    blockedTimeValidation,
    [body('id').notEmpty().withMessage('The ID is required')],
    deepClean,
    updateBlockedTime
);
router.delete("/delete", auth,
    [body('id').notEmpty().withMessage('The ID is required')],
    deepClean,
    deleteBlockedTime
);

export default router;
