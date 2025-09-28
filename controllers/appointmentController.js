import { validationResult } from 'express-validator';
import {PrismaClient} from '@prisma/client';
const prisma = new PrismaClient()

export async function createAppointment(req, res) {

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

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
            return res.status(201).json({ msg: "Appointment created successfully", appointment: fullAppointment })
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
            return res.status(404).json({ msg: "Appointment not found" })
        }
        return res.status(500).json(error)
    }
}

export async function getAppointmentById(req, res) {
    const { id } = req.query
    
    try {
        const appointment = await prisma.appointment.findUnique({
            where: {
                id,
                isActive: true
            }, include: {
                services: {
                    include: {
                        service: true
                    }
                }
            }
        })
        return res.status(200).json({ appointment })
    } catch (error) {
        if (error.code === "P2025") {
            return res.status(404).json({ msg: "Appointment not found" })
        }
        return res.status(500).json(error)
    }
}

export async function updateAppointment(req, res) {

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { id, date, services, status } = req.body

    try {
        const updateAppointment = await prisma.$transaction(async (prisma) => {
            // we check if the appointment isnt canceled or completed
            if(status !== "SCHEDULED"){

                // check the status of the appointment to not allow to change it if doesnt follow the flow
                const appointmentExist = await prisma.appointment.findUnique({
                    where: { id }
                })

                if(appointmentExist.status === "CANCELED"){
                    return res.status(200).json({ msg: `This appointment was canceled on ${appointmentExist.updatedAt}` })
                }else if(appointmentExist.status === "COMPLETED"){
                    return res.status(200).json({ msg: "Appointment has been completed" })
                }

                // if so we only update the status and return the appointment
                const appointment = await prisma.appointment.update({
                    where: {
                        id,
                        isActive: true
                    },
                    data: {
                        status
                    }
                })

                // we return the appointment object with the services
                const fullAppointment = await prisma.appointment.findUnique({
                    where: { id: appointment.id, isActive: true },
                    include: {
                        services: {
                            include: {
                                service: true
                            }
                        }
                    }
                })
                return res.status(201).json({ appointment: fullAppointment })
            }

            // if not we update the date, and services
            const appointment = await prisma.appointment.update({
                where: {
                    id,
                    isActive: true
                },
                data: {
                    date: new Date(date),
                }
            })

            // after creating the appointment we check if services were sent
            if (services) {
                // if so we delete the relation between the appointment and the service
                await prisma.appointmentService.deleteMany({
                    where: { appointmentId: appointment.id }
                })

                // them we create new relations
                if (services.length > 0) {
                    const appointmentServicesData = services.map(serviceId => ({
                        appointmentId: appointment.id,
                        serviceId
                    }))

                    await prisma.appointmentService.createMany({
                        data: appointmentServicesData
                    })
                }
            }

            // we return the appointment object with the services
            const fullAppointment = await prisma.appointment.findUnique({
                where: { id: appointment.id, isActive: true },
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
        if (error.code === "P2025") {
            return res.status(409).json({ msg: "Appointment doesnt exists" })
        }
        return res.status(500).json(error)
    }
}

export async function deleteAppointment(req, res) {
    const { id } = req.body
    try {
        const appointment = await prisma.appointment.findUnique({
            where: {id}
        })

        if(appointment.status === "SCHEDULED"){
            await prisma.appointment.update({
                where: { id },
                data: {
                    status: "CANCELED"
                }
            })
            return res.status(200).json({ msg: "Appointment canceled successfully" })
        }

        if(appointment.status === "COMPLETED"){
            return res.status(200).json({ msg: "Appointment has been completed" })
        }

        return res.status(200).json({ msg: `Appointment has already been canceled on ${appointment.updatedAt}` })
    } catch (error) {
        if (error.code === "P2025") {
            return res.status(409).json({ msg: "Appointment doesnt exists" })
        }
        return res.status(500).json(error)
    }
}