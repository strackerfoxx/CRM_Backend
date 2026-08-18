import express from "express";
import { body } from "express-validator";

import { createCategory, deleteCategory, getCategories, updateCategory } from "../controllers/categoryController.js";
import { auth } from "../middlewares/auth.js";
import { deepClean } from "../middlewares/deepClean.js";

const router = express.Router();

const categoryValidation = [
    body("name")
        .trim()
        .notEmpty()
        .withMessage("The category name is required")
        .isLength({ max: 100 })
        .withMessage("The category name must be at most 100 characters")
];

router.post("/create", auth, deepClean, categoryValidation, createCategory);
router.get("/get-categories", auth, getCategories);
router.put(
    "/update",
    auth,
    deepClean,
    [body("id").trim().notEmpty().withMessage("The category ID is required"), ...categoryValidation],
    updateCategory
);
router.delete(
    "/delete",
    auth,
    deepClean,
    [body("id").trim().notEmpty().withMessage("The category ID is required")],
    deleteCategory
);

export default router;
