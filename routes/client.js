import express from "express";
const router = express.Router();
import { body } from "express-validator";
import { createClient, getClients, getClientById, deleteClient, createClientSelfService, confirmClient, loginClient } from "../controllers/clientController.js"

import { deepClean } from "../middlewares/deepClean.js";
import { auth } from "../middlewares/auth.js"

const clientValidation = [
    body('name').notEmpty().withMessage('The name is required'),
    body('phone')
    .notEmpty().withMessage('The phone number is required')
    .isMobilePhone().withMessage('The phone number is not valid'),
]

router.post('/create', clientValidation, deepClean, createClient)
router.post('/self-create', clientValidation, deepClean, createClientSelfService)

router.post('/confirm-client', clientValidation, deepClean, confirmClient)
router.post('/login', clientValidation, deepClean, loginClient)

router.get('/get-clients', auth, getClients)
router.get('/get-client-by-id', auth, getClientById)

router.delete('/delete-client', auth, deleteClient)

export default router;