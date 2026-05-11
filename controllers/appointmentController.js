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
      },
      include: {
        users: true
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
    let price = 0

    for (const s of services) {
      const service = dbServices.find(d => d.id === s.serviceId)
      price += service.price || 0
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

    const appointmentDate = new Date(`${date}T00:00:00`)

    const duplicatedAppointment = await prisma.appointment.findFirst({
      where: {
        businessId,
        businessClientId,
        date: appointmentDate,
        startTime,
        endTime,
        status: { not: "CANCELED" }
      }
    })

    if (duplicatedAppointment) {
      return res.status(409).json({
        msg: "A duplicated appointment already exists for the same date and time"
      })
    }

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
          date: appointmentDate,
          startTime,
          endTime,
          amount: price,
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
    
    const searchParams = req.query

    const page = Number(searchParams.page) || 1
    const limit = Number(searchParams.limit) || 20

    try {
        const [appointments, total] = await Promise.all([
          prisma.appointment.findMany({
              where: {
              businessId
          }, 
          include: {
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
              },

              orderBy: { createdAt: "desc" },
              skip: (page - 1) * limit,
              take: limit
          }),

          prisma.appointment.count({ where: { businessId } })
        ])

        const totalPages = Math.ceil(total / limit)
        return res.status(200).json({appointments, total, totalPages})
    } catch (error) {
        if (error.code === "P2025") {
            return res.status(404).json({ msg: "Appointment not found" })
        }
        return res.status(500).json(error)
    }
}

export async function getAppointmentsParams(req, res) {
    const { businessId } = req.user
    const searchParams = req.query

    const category = searchParams.category || null
    const status = searchParams.status || null
    const service = searchParams.service || null
    const clientId = searchParams.client || null
    const search = searchParams.search || null

    const page = Number(searchParams.page) || 1
    const limit = Number(searchParams.limit) || 20

    let startDate = searchParams.startDate || null
    let endDate = searchParams.endDate || null

      const where = {
        businessId,
        status: status ? status.toUpperCase() : undefined,
        date: startDate ? 
        { 
          gte: new Date(startDate).toISOString(), 
          lt: new Date(new Date(endDate || startDate).getTime() + 86400000).toISOString() 
        } 
        : undefined,
        businessClient: {
            id: clientId ? clientId : undefined,
            client: search ? {
                OR:[
                {   name: {
                        contains: search,
                        mode: "insensitive"
                    }
                },
                {
                    phone: {
                        contains: search,
                        mode: "insensitive"
                    }
                },
                {
                    email: {
                        contains: search,
                        mode: "insensitive"
                    }
                }
            ]
            }: undefined,
        },
        services: service ? {
            some: {
                serviceId: service
            }
        } : undefined

      }
    

    try {
        const [appointments, total] = await Promise.all([
            prisma.appointment.findMany({
                where, 
                include: {
                    services: {
                        include: {
                            service: true
                        }
                    },
                    businessClient: {
                    select: {
                        client: {
                            select: {
                                name: true,
                                phone: true
                            }
                        }
                    }
                },
                },
                orderBy: { date: "asc" },
                skip: (page - 1) * limit,
                take: limit
            }),

            prisma.appointment.count({ where })
        ])

        const totalPages = Math.ceil(total / limit)
        return res.status(200).json({appointments, total, totalPages})
    } catch (error) {
            return res.status(500).json({
            message: error.message,
            meta: error.meta,
            stack: error.stack
        })
    }
}

export async function getClientAppointments(req, res) {
    const { businessId } = req.user
    const searchParams = req.query


    const clientId = searchParams.clientId

    const page = Number(searchParams.page) || 1
    const limit = Number(searchParams.limit) || 20

    const where = {
        businessId,
        businessClientId: clientId,
    }

    try {
        const [appointments, total] = await Promise.all([
            prisma.appointment.findMany({
                where,
                include: {
                    services: {
                        include: {
                            service: true
                        }
                    }
                },
                orderBy: { createdAt: "desc" },
                skip: (page - 1) * limit,
                take: limit
            }),

            prisma.appointment.count({ where })
        ])

        const totalPages = Math.ceil(total / limit)
        return res.status(200).json({ appointments, total, totalPages })
    } catch (error) {
            return res.status(500).json({
            message: error.message,
            meta: error.meta,
            stack: error.stack
        })
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
                        service: true,
                        user: { select: { name: true } }
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
      return res.status(400).json({ msg: "Missing required fields" })
    }

    /* Obtener cita */
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        services: true
      }
    })

    if (!appointment) {
      return res.status(404).json({ msg: "Appointment not found" })
    }

    if (appointment.businessId !== businessId) {
      return res.status(403).json({ msg: "Invalid business" })
    }

    if (appointment.status === "COMPLETED") {
      return res
        .status(409)
        .json({ msg: "Completed appointments cannot be updated" })
    }

    /* Validar disponibilidad (EXCLUYENDO esta cita) */
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
        msg: "Selected slot is no longer available"
      })
    }

    /* Obtener servicios reales */
    const serviceIds = services.map(s => s.serviceId)

    const dbServices = await prisma.service.findMany({
      where: {
        id: { in: serviceIds },
        businessId
      },
      include: {
        users: true
      }
    })

    if (dbServices.length !== serviceIds.length) {
      return res.status(400).json({ msg: "Invalid services" })
    }

    const serviceMap = Object.fromEntries(
      dbServices.map(s => [s.id, s])
    )

    /* Calcular nuevos tiempos */
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

    /* Transacción */
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

export async function getCalendarMetrics(req, res) {
  const { businessId } = req.user;
  const { startDate, endDate } = req.body;

  if (!startDate || !endDate) {
    return res.status(400).json({ error: "startDate and endDate are required" });
  }

  try {
    const start = new Date(startDate);
    const end = new Date(endDate);

    const appointments = await prisma.appointment.findMany({
      where: {
        businessId,
        date: {
          gte: start,
          lte: end,
        },
        status: {
          not: 'CANCELED',
        },
      },
      select: {
        date: true,
      },
    });

    const totalAppointments = appointments.length;
    const dailyCounts = {};

    appointments.forEach((appointment) => {
      // Formato YYYY-MM-DD
      const dateStr = appointment.date.toISOString().split('T')[0];
      if (!dailyCounts[dateStr]) {
        dailyCounts[dateStr] = 0;
      }
      dailyCounts[dateStr]++;
    });

    const dailyMetrics = Object.keys(dailyCounts).map((date) => {
      const count = dailyCounts[date];
      const percentage = totalAppointments > 0 ? (count / totalAppointments) * 100 : 0;

      let color = 'ligero';
      if (percentage > 85) {
        color = 'saturado';
      } else if (percentage > 60) {
        color = 'alto';
      } else if (percentage > 30) {
        color = 'medio';
      }

      return {
        date,
        count,
        color,
      };
    });

    return res.status(200).json({
      totalAppointments,
      dailyMetrics,
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
