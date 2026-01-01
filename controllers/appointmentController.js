import { validationResult } from 'express-validator';
import {PrismaClient} from '@prisma/client';
const prisma = new PrismaClient()

import { calculateAvailableSlots } from '../services/calculateAvailableSlots.js';


import { orderedDays, parseHourToMinutes, formatMinutes, isSameDay } from '../helpers/availability.js';

export async function getAvailableDates(req, res) {
  const { businessId, services, from, days = 14 } = req.body

  if (!services || !services.length) {
    return res.status(400).json({ error: "services[] is required" })
  }

  const serviceIds = Array.isArray(services) ? services : [services]
  const startDate = from ? new Date(from) : new Date()

  // 1. Obtener servicios
  const serviceRecords = await prisma.service.findMany({
    where: {
      id: { in: serviceIds },
      businessId,
      isActive: true
    }
  })

  if (serviceRecords.length !== serviceIds.length) {
    return res.json([])
  }

  const totalDuration = serviceRecords.reduce(
    (sum, s) => sum + s.durationMin + s.cleaningTimeMin,
    0
  )

  // 2. Usuarios compatibles (deben poder hacer TODOS los servicios)
  const users = await prisma.user.findMany({
    where: {
      businessId,
      deletedAt: null
    },
    include: {
      schedules: true,
      services: true
    }
  })

  const compatibleUsers = users.filter(user =>
    serviceIds.every(serviceId =>
      user.services.some(us => us.serviceId === serviceId)
    )
  )

  if (!compatibleUsers.length) return res.json([])

  // 3. Pre-cargar citas y bloqueos
  const endDate = new Date(startDate)
  endDate.setDate(startDate.getDate() + Number(days))

  const appointments = await prisma.appointment.findMany({
    where: {
      businessId,
      status: { not: "CANCELED" },
      date: { gte: startDate, lte: endDate }
    }
  })

  const blockedTimes = await prisma.blockedTime.findMany({
    where: {
      businessId,
      date: { gte: startDate, lte: endDate }
    }
  })

  const validDates = []

  // 4. Evaluar día por día
  for (let i = 0; i < days; i++) {
    const currentDate = new Date(startDate)
    currentDate.setDate(startDate.getDate() + i)

    const weekday = orderedDays[currentDate.getDay()]
    let hasSlot = false

    for (const user of compatibleUsers) {
      const schedule = user.schedules.find(s => s.dayOfWeek === weekday)
      if (!schedule) continue
      
      const open = parseHourToMinutes(schedule.startTime)
      const close = parseHourToMinutes(schedule.endTime)
      if (isNaN(open) || isNaN(close)) continue

      const occupied = []

      // bloqueos (globales + del user)
      blockedTimes
        .filter(b =>
          isSameDay(b.date, currentDate) &&
          (!b.userId || b.userId === user.id)
        )
        .forEach(b =>
          occupied.push({
            start: parseHourToMinutes(b.start),
            end: parseHourToMinutes(b.end)
          })
        )

      // citas del user
      appointments
        .filter(a =>
          a.userId === user.id &&
          isSameDay(a.date, currentDate)
        )
        .forEach(a =>
          occupied.push({
            start: parseHourToMinutes(a.startTime),
            end: parseHourToMinutes(a.endTime)
          })
        )

      // generar slots
      for (let t = open; t + totalDuration <= close; t += 30) {
        const overlaps = occupied.some(r =>
          t < r.end && t + totalDuration > r.start
        )

        if (!overlaps) {
          hasSlot = true
          break
        }
      }

      if (hasSlot) break
    }

    if (hasSlot) {
      validDates.push(currentDate.toISOString().split("T")[0])
    }
  }

  return res.status(201).json({ validDates })
}

export const getAvailableSlots = async (req, res) => {
  try {
    const slots = await calculateAvailableSlots(req.body)
    return res.status(200).json({ slots })

  } catch (error) {
    console.error(error)
    return res.status(500).json({
        message: error.message,
        meta: error.meta,
        stack: error.stack
    })
  }
}

export async function createAppointment(req, res) {
  try {
    const {
      businessId,
      businessClientId,
      date,
      startTime,
      services
    } = req.body

    if (
      !businessId ||
      !businessClientId ||
      !date ||
      !startTime ||
      !services?.length
    ) {
      return res.status(400).json({ error: "Missing required fields" })
    }

    /**
     * 1 Obtener servicios
     */
    const serviceIds = services.map(s => s.serviceId)


    const dbServices = await prisma.service.findMany({
      where: {
        id: { in: serviceIds },
        businessId,
        isActive: true
      }
    })
    if (dbServices.length !== serviceIds.length) {
      return res.status(400).json({ error: "Invalid services" })
    }

    /**
     * 2 Construir timeline por servicio
     */
    let currentMinutes = parseHourToMinutes(startTime)
    const timeline = []

    for (const s of services) {
      const service = dbServices.find(d => d.id === s.serviceId)
      const duration =
        service.durationMin + (service.cleaningTimeMin || 0)

      timeline.push({
        serviceId: s.serviceId,
        userId: s.userId || null,
        start: currentMinutes,
        end: currentMinutes + duration
      })

      currentMinutes += duration
    }

    const endTime = formatMinutes(currentMinutes)
    const totalDuration = currentMinutes - parseHourToMinutes(startTime)

    /**
     * 3 Revalidar disponibilidad POR USER
     */
    for (const block of timeline) {
      const availableSlots = await calculateAvailableSlots({
        date,
        businessId,
        services
      })


      const slotStart = formatMinutes(block.start)

      if (!availableSlots.includes(slotStart)) {
        return res
          .status(409)
          .json({ error: "Schedule not available" })
      }
    }

    /**
     * 4 Crear cita (transacción)
     */
    const appointment = await prisma.$transaction(async tx => {
      const appointment = await tx.appointment.create({
        data: {
          businessId,
          businessClientId,
          date: new Date(`${date}T00:00:00`),
          startTime,
          endTime,
         startTimeMinutes: parseHourToMinutes(startTime),
          endTimeMinutes: currentMinutes,
          durationMin: totalDuration,
          status: "SCHEDULED"
        }
      })

      await tx.appointmentService.createMany({
        data: timeline.map(t => ({
          appointmentId: appointment.id,
          serviceId: t.serviceId,
          userId: t.userId
        }))
      })

      return appointment
    })

    return res.status(201).json({msg: "Appointment created successfully", appointment})
  } catch (error) {
    console.error(error)
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
