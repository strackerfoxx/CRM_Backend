import {PrismaClient} from '@prisma/client';
const prisma = new PrismaClient()


import { orderedDays, parseHourToMinutes, formatMinutes, BLOCKING_APPOINTMENT_STATUSES } from '../helpers/availability.js';

export async function calculateAvailableSlots({
  date,
  businessId,
  services,
  excludeAppointmentId = null
}) {
  if (!date || !businessId || !services?.length) {
    throw new Error("Missing required fields")
  }

  //  1 Business
  const business = await prisma.business.findUnique({
    where: { id: businessId }
  })
  if (!business) throw new Error("Business not found")

  //  2 Business hours
  const dayKey = orderedDays[new Date(date).getDay()]
  const dayHours = business.businessHours?.[dayKey]

  if (!dayHours?.open || !dayHours?.close) {
    return { slots: [], resolveServicesForSlot: async () => [] }
  }

  const dayStartMin = parseHourToMinutes(dayHours.open)
  const dayEndMin = parseHourToMinutes(dayHours.close)

  if (dayStartMin >= dayEndMin) {
    return { slots: [], resolveServicesForSlot: async () => [] }
  }

  //  3 Services
  const serviceIds = services.map(s => s.serviceId)

  const dbServices = await prisma.service.findMany({
    where: {
      id: { in: serviceIds },
      businessId
    }
  })

  if (dbServices.length !== serviceIds.length) {
    throw new Error("Invalid services")
  }

  const serviceMap = Object.fromEntries(
    dbServices.map(s => [s.id, s])
  )

  const totalDuration = dbServices.reduce(
    (sum, s) => sum + s.durationMin + (s.cleaningTimeMin || 0),
    0
  )

  //  4 Existing appointments
  const dayStart = new Date(date)
  const dayEnd = new Date(date)
  dayEnd.setDate(dayEnd.getDate() + 1)

  const appointmentServices = await prisma.appointmentService.findMany({
    where: {
      appointment: {
        businessId,
        date: {
          gte: dayStart,
          lt: dayEnd
        },
        ...(excludeAppointmentId && {
          id: { not: excludeAppointmentId }
        }),
        status: {
          in: BLOCKING_APPOINTMENT_STATUSES
        }
      }
    },
    include: {
      appointment: true
    }
  })

  const ranges = appointmentServices.map(a => ({
    start: a.appointment.startTimeMinutes,
    end: a.appointment.endTimeMinutes,
    userId: a.userId
  }))

  const servicesWithUser = services.filter(s => s.userId)

  if (servicesWithUser.length) {
    const relations = await prisma.userService.findMany({
      where: {
        userId: { in: servicesWithUser.map(s => s.userId) },
        serviceId: { in: servicesWithUser.map(s => s.serviceId) }
      }
    })

    const validPairs = new Set(
      relations.map(r => `${r.userId}-${r.serviceId}`)
    )

    let invalid = false
    
    for (const { userId, serviceId } of servicesWithUser) {
      if (!validPairs.has(`${userId}-${serviceId}`)) {
        invalid = true
        break
      }
    }

    if (invalid) {
      return []
    }
  }

  // 5 Cache users per service
  const usersByService = {}

  for (const serviceId of serviceIds) {
    const users = await prisma.user.findMany({
      where: {
        businessId,
        deletedAt: null,
        services: {
          some: { serviceId }
        }
      },
      select: { id: true }
    })

    usersByService[serviceId] = users.map(u => u.id)
  }

  // 6 Generate slots
  const step = business.defaultSlotInterval || 30
  const slots = []

  for (
    let start = dayStartMin;
    start + totalDuration <= dayEndMin;
    start += step
  ) {
    let cursor = start
    let valid = true

    for (const { serviceId, userId } of services) {
      const service = serviceMap[serviceId]
      const duration =
        service.durationMin + (service.cleaningTimeMin || 0)

      const blockStart = cursor
      const blockEnd = cursor + duration

      if (userId) {
        const conflict = ranges.some(r =>
          r.userId === userId &&
          blockStart < r.end &&
          blockEnd > r.start
        )
        if (conflict) {
          valid = false
          break
        }
      } else {
        const candidates = usersByService[serviceId]
        const hasFreeUser = candidates.some(uid =>
          !ranges.some(r =>
            r.userId === uid &&
            blockStart < r.end &&
            blockEnd > r.start
          )
        )

        if (!hasFreeUser) {
          valid = false
          break
        }
      }

      cursor = blockEnd
    }

    if (valid) {
      slots.push(formatMinutes(start))
    }
  }

  // 7 Resolver users para un slot específico
  async function resolveServicesForSlot(startTime) {
    const startMinutes = parseHourToMinutes(startTime)
    let cursor = startMinutes

    const resolved = []

    for (const item of services) {
      const service = serviceMap[item.serviceId]
      const duration =
        service.durationMin + (service.cleaningTimeMin || 0)

      const blockStart = cursor
      const blockEnd = cursor + duration

      if (item.userId) {
        resolved.push({
          serviceId: item.serviceId,
          userId: item.userId
        })
        cursor = blockEnd
        continue
      }

      const candidates = usersByService[item.serviceId]

      const freeUser = candidates.find(uid =>
        !ranges.some(r =>
          r.userId === uid &&
          blockStart < r.end &&
          blockEnd > r.start
        )
      )

      if (!freeUser) {
        throw new Error("Slot no longer available")
      }

      resolved.push({
        serviceId: item.serviceId,
        userId: freeUser
      })

      cursor = blockEnd
    }

    return resolved
  }

  return {
    slots,
    resolveServicesForSlot
  }
}