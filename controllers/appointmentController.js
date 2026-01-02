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
    const {slots} = await calculateAvailableSlots(req.body)
    return res.status(200).json( slots )

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

    const calculations = await calculateAvailableSlots({
      date,
      businessId,
      services
    })
    const availableSlots = calculations.slots
    const resolvedServicesForSlot = await calculations.resolveServicesForSlot(startTime)
    
    for (const block of timeline) {
      const slotStart = formatMinutes(block.start)

      if (!availableSlots.includes(slotStart)) {
        return res
          .status(409)
          .json({ error: "Schedule not available" })
      }
    }

    const invalidUserService = services.some(
      s => s.userId && !dbServices.find(ds =>
        ds.id === s.serviceId &&
        ds.users?.some(u => u.userId === s.userId)
      )
    )

    if (invalidUserService) {
      throw new Error("User not allowed for one or more services")
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
        data: resolvedServicesForSlot.map(resolved => ({
          appointmentId: appointment.id,
          serviceId: resolved.serviceId,
          userId: resolved.userId
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
  try {
    const {
      appointmentId,
      date,
      startTime,
      businessId,
      businessClientId,
      services,
      status
    } = req.body

    if (
      !appointmentId ||
      !date ||
      !startTime ||
      !businessId ||
      !businessClientId ||
      !status ||
      !services?.length
    ) {
      return res.status(400).json({ message: "Missing required fields" })
    }

    /* 1️⃣ Obtener cita */
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        services: true
      }
    })

    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found" })
    }

    if (appointment.businessId !== businessId) {
      return res.status(403).json({ message: "Invalid business" })
    }

    if (appointment.status === "COMPLETED") {
      return res
        .status(409)
        .json({ message: "Completed appointments cannot be updated" })
    }

    /* 2️⃣ Validar disponibilidad (EXCLUYENDO esta cita) */
    const calculations = await calculateAvailableSlots({
      date,
      businessId,
      services,
      excludeAppointmentId: appointmentId
    })
    const availableSlots = calculations.slots
    const resolvedServicesForSlot = await calculations.resolveServicesForSlot(startTime)

    if (!availableSlots.includes(startTime)) {
      return res.status(409).json({
        message: "Selected slot is no longer available"
      })
    }

    /* 3️⃣ Obtener servicios reales */
    const serviceIds = services.map(s => s.serviceId)

    const dbServices = await prisma.service.findMany({
      where: {
        id: { in: serviceIds },
        businessId
      }
    })

    if (dbServices.length !== serviceIds.length) {
      return res.status(400).json({ message: "Invalid services" })
    }

    const serviceMap = Object.fromEntries(
      dbServices.map(s => [s.id, s])
    )

    /* 4️⃣ Calcular nuevos tiempos */
    const startMinutes = parseHourToMinutes(startTime)

    let cursor = startMinutes
    const serviceBlocks = []

    for (const { serviceId, userId } of services) {
      const service = serviceMap[serviceId]
      const duration =
      service.durationMin + (service.cleaningTimeMin || 0)

      serviceBlocks.push({
        serviceId,
        userId: userId || null,
        start: cursor,
        end: cursor + duration
      })

      cursor += duration
    }

    const endMinutes = cursor

    const invalidUserService = services.some(
      s => s.userId && !dbServices.find(ds =>
        ds.id === s.serviceId &&
        ds.users?.some(u => u.userId === s.userId)
      )
    )

    if (invalidUserService) {
      throw new Error("User not allowed for one or more services")
    }

    /* 5️⃣ Transacción */
    const updated = await prisma.$transaction(async tx => {
      // borrar services anteriores
      await tx.appointmentService.deleteMany({
        where: { appointmentId }
      })

      // actualizar cita
      const updatedAppointment = await tx.appointment.update({
        where: { id: appointmentId },
        data: {
          date: new Date(date),
          startTime,
          endTime: `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`,
          startTimeMinutes: startMinutes,
          endTimeMinutes: endMinutes,
          businessClientId,
          status
        }
      })

      // crear nuevos appointmentServices
      for (const { serviceId, userId } of resolvedServicesForSlot) {
        await tx.appointmentService.create({
          data: {
            appointmentId,
            serviceId,
            userId: userId || null
          }
        })
      }

      return updatedAppointment
    })

    return res.status(200).json(updated)

  } catch (error) {
    console.error(error)
    return res.status(500).json({
      message: error.message,
      meta: error.meta,
      stack: error.stack
    })
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
