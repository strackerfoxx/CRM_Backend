import express from "express";
const router = express.Router();
import { body } from "express-validator";

import { createCategory, getCategories, getCategoryById, updateCategory, deleteCategory } from "../controllers/categoryController.js";

import { deepClean } from "../middlewares/deepClean.js";
import { auth } from "../middlewares/auth.js";

const categoryValidation = [
    body('name').notEmpty().withMessage('The name is required')
];

router.post("/create", auth, deepClean, categoryValidation, createCategory);
router.get("/get-categories", auth, getCategories);
router.get("/get-category-by-id", auth, getCategoryById);
router.put("/update", auth, deepClean, categoryValidation, updateCategory);
router.delete("/delete", auth, deepClean, deleteCategory);

export default router;
