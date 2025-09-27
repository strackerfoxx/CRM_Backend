import { validationResult } from 'express-validator';
import {PrismaClient} from '@prisma/client';
const prisma = new PrismaClient()

export async function createAppointment(req, res) {
    let businessClientId = ""
    let businessId = ""

    if(req.user.id){
        businessClientId = req.body.businessClientId
        businessId = req.user.businessId
    }
    if(req.client.id){
        businessClientId = req.client.id
        businessId = req.client.businessId
    }
    const { date, services } = req.body

    try {
    const appointmentWithServices = await prisma.$transaction(async (prisma) => {
        const appointment = await prisma.appointment.create({
            data: {
                date: new Date(date),
                businessClientId,
                businessId,
            }
        })

        // after creating the appointment we create the appointmentService and link it with the appointment
        if (services && services.length > 0) {
            const appointmentServicesData = services.map(serviceId => ({
                appointmentId: appointment.id,
                serviceId
            }))

            await prisma.appointmentService.createMany({
                data: appointmentServicesData
            })
        }

        // we return the appointment object with the services
        const fullAppointment = await prisma.appointment.findUnique({
            where: { id: appointment.id },
            include: {
                services: {
                    include: {
                        service: true
                    }
                }
            }
        })
        return res.status(201).json({ appointment: fullAppointment })
    })
    } catch (error) {
        if (error.code === "P2002") {
            return res.status(409).json({ msg: "Appointment already exists" })
        }
        return res.status(500).json(error)
    }

}

export async function getAppointments(req, res) {
    const { businessId } = req.user

    try {
        const appointments = await prisma.appointment.findMany({
            where: {
                isActive: true,
                businessId
            }, include: {
                services: {
                    include: {
                        service: true
                    }
                }
            }
        })
        return res.status(200).json({ appointments })
    } catch (error) {
        if (error.code === "P2025") {
            return res.status(404).json({ msg: "Business not found" })
        }
        return res.status(500).json(error)
    }
}