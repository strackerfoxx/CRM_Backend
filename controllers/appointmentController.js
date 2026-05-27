import { validationResult } from 'express-validator';
import {PrismaClient} from '@prisma/client';
const prisma = new PrismaClient()

import { calculateAvailableSlots } from '../services/calculateAvailableSlots.js';


import { orderedDays, parseHourToMinutes, formatMinutes, isSameDay, BLOCKING_APPOINTMENT_STATUSES } from '../helpers/availability.js';

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
      deletedAt: null,
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

export async function getAvailableUsersForSlot(req, res) {
  try {
    const { businessId, date, startTime, services } = req.body;

    if (!businessId || !date || !startTime || !services || !services.length) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const serviceIds = services.map(s => s.serviceId);

    // 1. Get services info to calculate duration blocks
    const dbServices = await prisma.service.findMany({
      where: {
        id: { in: serviceIds },
        businessId,
      },
      include: {
        users: {
          include: {
            user: {
              select: { id: true, name: true, deletedAt: true }
            }
          }
        }
      }
    });

    if (dbServices.length !== serviceIds.length) {
      return res.status(400).json({ error: "Invalid services" });
    }

    const serviceMap = Object.fromEntries(dbServices.map(s => [s.id, s]));

    // 2. Fetch existing appointments and blocks for that day to check user availability
    const dayStart = new Date(`${date}T00:00:00.000Z`); // ensure UTC comparison
    const dayEnd = new Date(`${date}T23:59:59.999Z`);

    const appointmentServices = await prisma.appointmentService.findMany({
      where: {
        appointment: {
          businessId,
          date: {
            gte: dayStart,
            lt: dayEnd
          },
          status: {
            in: BLOCKING_APPOINTMENT_STATUSES
          }
        }
      },
      include: {
        appointment: true
      }
    });

    const blockedTimes = await prisma.blockedTime.findMany({
      where: {
        businessId,
        date: {
          gte: dayStart,
          lt: dayEnd
        }
      }
    });

    const ranges = [
      ...appointmentServices.map(a => ({
        start: a.appointment.startTimeMinutes,
        end: a.appointment.endTimeMinutes,
        userId: a.userId
      })),
      ...blockedTimes.map(b => ({
        start: parseHourToMinutes(b.start),
        end: parseHourToMinutes(b.end),
        userId: b.userId // can be null for business-wide block
      }))
    ];

    // 3. Check business hours and user schedules
    const dayKey = orderedDays[new Date(`${date}T12:00:00.000Z`).getDay()]; // Use midday UTC for robust day calculation
    const allUsers = await prisma.user.findMany({
      where: { businessId, deletedAt: null },
      include: { schedules: true }
    });

    const userSchedulesMap = {};
    for (const u of allUsers) {
      const schedule = u.schedules.find(s => s.dayOfWeek === dayKey);
      if (schedule && !isNaN(parseHourToMinutes(schedule.startTime)) && !isNaN(parseHourToMinutes(schedule.endTime))) {
        userSchedulesMap[u.id] = {
          start: parseHourToMinutes(schedule.startTime),
          end: parseHourToMinutes(schedule.endTime)
        };
      }
    }

    // 4. Calculate available users per service for their specific block
    let cursor = parseHourToMinutes(startTime);
    const result = [];

    for (const reqService of services) {
      const serviceId = reqService.serviceId;
      const service = serviceMap[serviceId];
      const duration = service.durationMin + (service.cleaningTimeMin || 0);
      const blockStart = cursor;
      const blockEnd = cursor + duration;

      const availableUsers = [];

      // Users associated with this service
      for (const us of service.users) {
        if (us.user.deletedAt !== null) continue;
        const uid = us.user.id;

        // Check if user is scheduled to work during this block
        const userSchedule = userSchedulesMap[uid];
        if (!userSchedule || blockStart < userSchedule.start || blockEnd > userSchedule.end) {
          continue;
        }

        // Check if user is free (no overlapping appointment or block)
        const isBusy = ranges.some(r =>
          (!r.userId || r.userId === uid) &&
          blockStart < r.end &&
          blockEnd > r.start
        );

        if (!isBusy) {
          availableUsers.push({ id: us.user.id, name: us.user.name });
        }
      }

      result.push({
        serviceId,
        availableUsers
      });

      cursor = blockEnd;
    }

    return res.status(200).json(result);

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: error.message,
      meta: error.meta,
      stack: error.stack
    });
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

    const overlappingAppointment = await prisma.appointment.findFirst({
      where: {
        businessId,
        deletedAt: null,
        businessClientId,
        date: appointmentDate,
        status: { not: "CANCELED" },
        startTimeMinutes: { lt: parseHourToMinutes(endTime) },
        endTimeMinutes: { gt: parseHourToMinutes(startTime) }
      }
    })

    if (overlappingAppointment) {
      return res.status(409).json({
        msg: "Client already has an appointment during this time"
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

    if (!availableSlots.includes(startTime)) {
      return res
        .status(409)
        .json({ error: "Schedule not available" })
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
              businessId,
              deletedAt: null
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

          prisma.appointment.count({ where: { businessId, deletedAt: null } })
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
        } : undefined,
        deletedAt: null
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
        deletedAt: null
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
        const appointment = await prisma.appointment.findFirst({
            where: {
                id,
                deletedAt: null
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
    const appointment = await prisma.appointment.findFirst({
      where: { id: appointmentId, deletedAt: null },
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
        users: true,
      }
    })

    if (dbServices.length !== serviceIds.length) {
      return res.status(400).json({ msg: "Invalid services" })
    }

    const serviceMap = Object.fromEntries(
      dbServices.map(s => [s.id, s])
    )

    const totalAmount = services.reduce((sum, { serviceId }) => {
      const service = serviceMap[serviceId]
      return sum + (service?.price || 0)
    }, 0)

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

    const overlappingAppointment = await prisma.appointment.findFirst({
      where: {
        businessId,
        deletedAt: null,
        businessClientId,
        date: new Date(`${date}T00:00:00`),
        id: { not: appointmentId },
        status: { not: "CANCELED" },
        startTimeMinutes: { lt: endMinutes },
        endTimeMinutes: { gt: startMinutes }
      }
    })

    if (overlappingAppointment) {
      return res.status(409).json({
        msg: "Client already has an appointment during this time"
      })
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
          status,
          amount: Math.round(totalAmount)
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
        const appointment = await prisma.appointment.findFirst({
            where: { id, deletedAt: null }
        })

        if (!appointment) {
            return res.status(404).json({ msg: "Appointment not found" })
        }

        await prisma.appointment.update({
            where: { id },
            data: {
                deletedAt: new Date()
            }
        })

        return res.status(200).json({ msg: "Appointment deleted successfully" })

    } catch (error) {
        if (error.code === "P2025") {
            return res.status(409).json({ msg: "Appointment doesnt exists" })
        }
        return res.status(500).json(error)
    }
}

export async function getCalendarMetrics(req, res) {
  const { businessId } = req.user;
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({ error: "startDate and endDate are required" });
  }

  try {
    const start = new Date(startDate);
    const end = new Date(endDate);

    const appointments = await prisma.appointment.findMany({
      where: {
        businessId,
        deletedAt: null,
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

      let color = 'blue';
      if (percentage > 85) {
        color = 'red';
      } else if (percentage > 60) {
        color = 'yellow';
      } else if (percentage > 30) {
        color = 'green';
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

export async function getDayMetrics(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { businessId } = req.user;
  const { date } = req.query;

  try {
    const targetDate = new Date(date);
    if (isNaN(targetDate.getTime())) {
      return res.status(400).json({ error: "Invalid date format" });
    }

    const startOfDay = new Date(targetDate);
    startOfDay.setUTCHours(0, 0, 0, 0);

    const endOfDay = new Date(targetDate);
    endOfDay.setUTCHours(23, 59, 59, 999);

    const weekday = orderedDays[targetDate.getDay()];

    const [business, appointments, blockedTimes] = await Promise.all([
      prisma.business.findUnique({
        where: { id: businessId },
        select: { businessHours: true },
      }),
      prisma.appointment.findMany({
        where: {
          businessId,
          deletedAt: null,
          date: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
        include: {
          businessClient: {
            include: {
              client: {
                select: { name: true },
              },
            },
          },
          user: {
            select: { name: true, id: true },
          },
          services: {
            include: {
              service: { select: { durationMin: true } },
              user: { select: { name: true, id: true } }
            }
          }
        },
        orderBy: {
          startTimeMinutes: 'asc',
        },
      }),
      prisma.blockedTime.findMany({
        where: {
          businessId,
          date: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
      }),
    ]);

    if (!business) {
      return res.status(404).json({ error: "Business not found" });
    }

    // Default business hours structure from previous code
    const businessHours = business.businessHours || {};
    const dayHours = businessHours[weekday];

    let totalBusinessMinutes = 0;
    let businessOpenMinutes = 0;
    let businessCloseMinutes = 0;

    if (dayHours && !dayHours.closed) {
      businessOpenMinutes = parseHourToMinutes(dayHours.open);
      businessCloseMinutes = parseHourToMinutes(dayHours.close);
      if (!isNaN(businessOpenMinutes) && !isNaN(businessCloseMinutes)) {
        totalBusinessMinutes = Math.max(0, businessCloseMinutes - businessOpenMinutes);
      }
    }

    let totalRevenue = 0;
    const occupancyByEmployee = {};
    const mappedAppointments = [];
    const appointmentIntervals = [];

    for (const app of appointments) {
      // Map appointment format
      const clientName = app.businessClient?.client?.name || "Unknown";

      let employeeNamesSet = new Set();
      if (app.user?.name) employeeNamesSet.add(app.user.name);
      if (app.services && app.services.length > 0) {
         app.services.forEach(s => {
             if (s.user?.name) employeeNamesSet.add(s.user.name);
         });
      }
      const employeeName = Array.from(employeeNamesSet).join(", ") || "No assigned employee";

      mappedAppointments.push({
        id: app.id,
        startTime: app.startTime,
        endTime: app.endTime,
        status: app.status,
        clientName,
        employeeName,
      });

      // Ignore CANCELED appointments for revenue and occupancy
      if (app.status !== 'CANCELED') {
        totalRevenue += app.amount || 0;

        if (app.services && app.services.length > 0) {
            app.services.forEach(s => {
                if (s.user?.name) {
                    const empName = s.user.name;
                    if (!occupancyByEmployee[empName]) occupancyByEmployee[empName] = 0;
                    occupancyByEmployee[empName] += s.service?.durationMin || 0;
                }
            });
        } else if (app.user?.name) {
            const duration = app.durationMin || (app.endTimeMinutes - app.startTimeMinutes);
            if (!occupancyByEmployee[app.user.name]) occupancyByEmployee[app.user.name] = 0;
            occupancyByEmployee[app.user.name] += duration;
        }

        appointmentIntervals.push({
          start: app.startTimeMinutes,
          end: app.endTimeMinutes,
        });
      }
    }

    // Include blocked times in intervals if they consume schedule capacity
    for (const blocked of blockedTimes) {
      appointmentIntervals.push({
        start: parseHourToMinutes(blocked.start),
        end: parseHourToMinutes(blocked.end),
      });
    }

    // Merge overlapping intervals to calculate occupied minutes
    appointmentIntervals.sort((a, b) => a.start - b.start);
    const mergedIntervals = [];

    for (const interval of appointmentIntervals) {
      if (mergedIntervals.length === 0) {
        mergedIntervals.push(interval);
      } else {
        const last = mergedIntervals[mergedIntervals.length - 1];
        if (interval.start <= last.end) {
          last.end = Math.max(last.end, interval.end);
        } else {
          mergedIntervals.push(interval);
        }
      }
    }

    let totalOccupiedMinutes = 0;
    for (const interval of mergedIntervals) {
      // We only count occupied time that falls within the business hours
      const overlapStart = Math.max(businessOpenMinutes, interval.start);
      const overlapEnd = Math.min(businessCloseMinutes, interval.end);
      if (overlapEnd > overlapStart) {
        totalOccupiedMinutes += (overlapEnd - overlapStart);
      }
    }

    const deadTimeMinutes = Math.max(0, totalBusinessMinutes - totalOccupiedMinutes);

    return res.status(200).json({
      appointments: mappedAppointments,
      revenue: totalRevenue,
      employeeOccupancy: occupancyByEmployee,
      deadTime: deadTimeMinutes,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
