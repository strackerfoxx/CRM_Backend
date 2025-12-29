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
    const { date, services, startTime } = req.body

    try {
            const appointmentWithServices = await prisma.$transaction(async (prisma) => {
                if (services && services.length > 0) {

                    // Ahora lo que tenemos que hacer es adaptar la logica que ya esta hecha y funciona con la nueva que es basicamente
                    // lo mismo pero el array de services ahora es un array de objetos con serviceId y userId

                    const servicesIds = services.map(s => (typeof s === "object" && s != null) ? s.serviceId : s);
                    
                    const servicesData = await prisma.service.findMany({
                        where: {
                            id: {
                                in: servicesIds
                            },

                            businessId
                        }
                    })

                    if(servicesData.length !== services.length){
                        return res.status(400).json({ msg: "One or more services are invalid" })
                    }

                    // Validate that when a userId is provided for a service, the user is allowed to perform that service
                    const invalidAssignments = []
                    for (const item of services) {
                        if (item && typeof item === "object" && item.userId) {
                            const canDo = await prisma.userService.findFirst({
                                where: {
                                    userId: item.userId,
                                    serviceId: item.serviceId
                                }
                            });
                            if (!canDo) invalidAssignments.push({ serviceId: item.serviceId, userId: item.userId })
                        }
                    }
                    if (invalidAssignments.length > 0) {
                        return res.status(400).json({ msg: "User not allowed for one or more services", details: invalidAssignments })
                    }

                    const durationMin = servicesData.reduce((total, service) => total + service.durationMin + service.cleaningTimeMin, 0)

                    const [h, m] = startTime.split(":")
                    const totalDuration = (Number(h) * 60 + Number(m)) + durationMin

                    function formatMinutes(mins) {
                        const h = String(Math.floor(mins / 60)).padStart(2, "0")
                        const m = String(mins % 60).padStart(2, "0")
                        return `${h}:${m}`
                    }

                    const appointment = await prisma.appointment.create({
                        data: {
                            date: new Date(date),
                            businessClientId,
                            businessId,
                            startTime,
                            endTime: formatMinutes(totalDuration), 
                            durationMin
                        }
                    })

                    // after creating the appointment we create the appointmentService and link it with the appointment
                    const appointmentServicesData = services.map(service => ({
                        appointmentId: appointment.id,
                        serviceId: (typeof service === "object" && service != null) ? service.serviceId : service,
                        userId: (typeof service === "object" && service != null) ? (service.userId ?? null) : null
                    }))

                    await prisma.appointmentService.createMany({
                        data: appointmentServicesData
                    })
                    

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
                }else{
                    return res.status(400).json({ msg: "Services are required" })
                }
            })
    } catch (error) {
        if (error.code === "P2002") {
            return res.status(409).json({ msg: "Appointment already exists" })
        }
        return res.status(500).json({
            message: error.message,
            meta: error.meta,
            stack: error.stack
        })
    }

}

export async function getAppointments(req, res) {
    const { businessId } = req.user

    try {
        const appointments = await prisma.appointment.findMany({
            where: {
                businessId
            }, include: {
                services: {
                    include: {
                        service: true
                    }
                },
                businessClient: {
                    select: {
                        id: true,
                        client: {
                            select: {
                                name: true,
                                email: true,
                                phone: true
                            }
                        }
                    }
                },
                user: {
                    select: { name: true }
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
            }, include: {
                services: {
                    include: {
                        service: true
                    }
                },
                businessClient: {
                    select: {
                        id: true,
                        client: {
                            select: {
                                name: true,
                                email: true,
                                phone: true
                            }
                        }
                    }
                },
                user: {
                    select: { name: true }
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
                        id
                    },
                    data: {
                        status
                    }
                })

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
            }

            // if not we update the date, and services
            const appointment = await prisma.appointment.update({
                where: {
                    id
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

                // then we create new relations. Support both array of serviceIds or array of objects { serviceId, userId }
                if (services.length > 0) {
                    const invalidAssignments = []
                    const appointmentServicesData = services.map(s => {
                        if (s && typeof s === "object") {
                            return {
                                appointmentId: appointment.id,
                                serviceId: s.serviceId,
                                userId: s.userId ?? null
                            }
                        }
                        return {
                            appointmentId: appointment.id,
                            serviceId: s,
                            userId: null
                        }
                    })

                    // Validate assignments for objects with userId
                    for (const item of services) {
                        if (item && typeof item === "object" && item.userId) {
                            const canDo = await prisma.userService.findFirst({
                                where: {
                                    userId: item.userId,
                                    serviceId: item.serviceId
                                }
                            })
                            if (!canDo) invalidAssignments.push({ serviceId: item.serviceId, userId: item.userId })
                        }
                    }
                    if (invalidAssignments.length > 0) {
                        return res.status(400).json({ msg: "User not allowed for one or more services", details: invalidAssignments })
                    }

                    await prisma.appointmentService.createMany({
                        data: appointmentServicesData
                    })
                }
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