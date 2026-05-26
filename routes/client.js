import express from "express";
const router = express.Router();
import { body } from "express-validator";
import { 
    createClient, 
    getClients, 
    getClientById, 
    deleteClient, 
    createClientSelfService, 
    confirmClient, 
    loginClient, 
    updateClient, 
    getClientParams 
} from "../controllers/clientController.js"

import { deepClean } from "../middlewares/deepClean.js";
import { auth } from "../middlewares/auth.js"

const clientValidation = [
    body('name').notEmpty().withMessage('The name is required'),
    body('phone')
    .notEmpty().withMessage('The phone number is required')
    .isMobilePhone().withMessage('The phone number is not valid'),
]

router.post('/create', clientValidation, deepClean, createClient)
router.post('/self-create', deepClean, createClientSelfService)

router.post('/confirm-client',
    [
        body('phone')
        .notEmpty().withMessage('The phone number is required')
        .isMobilePhone().withMessage('The phone number is not valid'),
        body('idToken').notEmpty().withMessage('Firebase idToken is required')
    ],
    confirmClient
)
router.post('/login',loginClient)

router.get('/get-clients', auth, getClients)
router.get('/get-client-by-id', auth, getClientById)
router.get('/get-client-by-params', auth, getClientParams)

router.put('/update-client', clientValidation, 
    [ body('id').notEmpty().withMessage('The ID is required') ],
     auth, updateClient)

router.delete('/delete-client', auth, deleteClient)

export default router;
