import express from "express";
const router = express.Router();
import { body } from "express-validator";
import { createUser, loginUser, getUser, getAllUsers, updateUser, deleteUser } from "../controllers/userController.js";

import { deepClean } from "../middlewares/deepClean.js";
import { auth } from "../middlewares/auth.js";
import { errorHandler } from "../middlewares/errorHandler.js"

const businessValidation = [
    body('name').notEmpty().withMessage('The name is required'),
    body('email')
    .notEmpty().withMessage('The email is required')
    .isEmail().withMessage('Email is not valid'),
    body('password')
    .custom((value) => {
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[\d@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
        if (!passwordRegex.test(value)) {
            throw new Error('Password must be at least 8 characters long and include at least one uppercase letter, one lowercase letter, one number OR and one special character.');
        }
        return true;
    })
    .notEmpty().withMessage('The name is required'),
    body('businessId').notEmpty().withMessage('The business ID is required')
]

router.post("/create", businessValidation, createUser);
router.post("/login",
    deepClean,
    [
        body('email')
        .notEmpty().withMessage('The email is required')
        .isEmail().withMessage('Email is not valid'),
        body('password').notEmpty().withMessage('The password is required'),
    ],
     loginUser,
     errorHandler
);
router.get("/get-user-by-id", auth, getUser)
router.get("/get-all-users", auth, getAllUsers)
router.patch("/update-user", 
    deepClean,
    [
        body('name').notEmpty().withMessage('The name is required'),
        body('email')
        .notEmpty().withMessage('The email is required')
        .isEmail().withMessage('Email is not valid'),
        body('role').notEmpty().withMessage('The role is required')
    ],
    auth, 
    updateUser
)

router.delete("/delete-user", auth, deleteUser)

export default router;