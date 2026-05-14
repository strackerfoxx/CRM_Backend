import express from "express";
const router = express.Router();
import { body } from "express-validator";

import {
    createAppointment,
    getAppointments,
    getAppointmentById,
    updateAppointment,
    deleteAppointment,
    getClientAppointments,

    getAvailableDates,
    getAvailableSlots,
    getAppointmentsParams,
    getCalendarMetrics,
    getDayMetrics,
} from "../controllers/appointmentController.js"

import { auth } from "../middlewares/auth.js"
import { appointmentAuth } from "../middlewares/appointmentAuth.js";

const appointmentValidation = [
    body('date').notEmpty().withMessage('The date is required'),
    body('services').notEmpty().withMessage('The service is required')
]

router.post("/create", appointmentValidation, appointmentAuth, createAppointment)

router.get("/get-appointments", auth, getAppointments)
router.get("/get-appointments-by-id", appointmentAuth, getAppointmentById)
router.get("/get-appointments-by-client-id", appointmentAuth, getClientAppointments)
router.get("/get-appointments-by-params", appointmentAuth, getAppointmentsParams)

router.put("/update", body('date').notEmpty().withMessage('The date is required'), updateAppointment)

router.delete("/delete", appointmentAuth, deleteAppointment)


// ahora tenemos que hacer el flujo desde que el usuario elige los servicios que quiere,
// pasando por mostrar horarios disponibles hasta que finalmente crea la cita.

router.post("/availability", appointmentAuth, getAvailableDates)

router.post("/availability/slots", appointmentAuth, getAvailableSlots)

router.get("/calendar-metrics", auth, getCalendarMetrics)

router.get("/day-metrics", auth, getDayMetrics)

export default router;