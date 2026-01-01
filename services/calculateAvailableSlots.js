import {PrismaClient} from '@prisma/client';
const prisma = new PrismaClient()

const orderedDays = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday"
]

const parseToMinutes = (time) => {
  if (!time) return null
  const [h, m] = time.split(":").map(Number)
  return h * 60 + (m || 0)
}

const formatMinutes = (mins) => {
  const h = String(Math.floor(mins / 60)).padStart(2, "0")
  const m = String(mins % 60).padStart(2, "0")
  return `${h}:${m}`
}


/* ---------------- main ---------------- */

export async function calculateAvailableSlots({
  date,
  businessId,
  services
}) {
  if (!date || !businessId || !services?.length) {
    throw new Error("Missing required fields")
  }

  /* 1️⃣ Business */
  const business = await prisma.business.findUnique({
    where: { id: businessId }
  })

  if (!business) throw new Error("Business not found")

  /* 2️⃣ Business hours */
  const dayKey = orderedDays[new Date(date).getDay()]
  const dayHours = business.businessHours?.[dayKey]

  if (!dayHours?.open || !dayHours?.close) {
    return []
  }

  const dayStartMin = parseToMinutes(dayHours.open)
  const dayEndMin = parseToMinutes(dayHours.close)

  if (
    dayStartMin === null ||
    dayEndMin === null ||
    dayStartMin >= dayEndMin
  ) {
    return []
  }

  /* 3️⃣ Services */
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

  const usersByService = new Map()

  const serviceUsers = await prisma.userService.findMany({
    where: {
      serviceId: { in: serviceIds }
    },
    include: {
      user: true
    }
  })

  for (const us of serviceUsers) {
    if (!usersByService.has(us.serviceId)) {
      usersByService.set(us.serviceId, [])
    }
    usersByService.get(us.serviceId).push(us.user)
  }

  /* 4️⃣ Existing appointments (IMPORTANT FIX) */
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

  /* 5️⃣ Generate slots */
  const slots = []
  const step = business.defaultSlotInterval || 30

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

      let conflict = false

      // CASO 1: user específico
      if (userId) {
        conflict = ranges.some(r =>
          r.userId === userId &&
          blockStart < r.end &&
          blockEnd > r.start
        )
      }

      // CASO 2: sin user → lógica por capacidad
      else {
        const possibleUsers = usersByService.get(serviceId) || []

        let busyUsers = 0

        for (const user of possibleUsers) {
          const isBusy = ranges.some(r =>
            r.userId === user.id &&
            blockStart < r.end &&
            blockEnd > r.start
          )

          if (isBusy) busyUsers++
        }

        // solo conflicto si TODOS están ocupados
        if (
          possibleUsers.length > 0 &&
          busyUsers === possibleUsers.length
        ) {
          conflict = true
        }
      }

      if (conflict) {
        valid = false
        break
      }

      cursor = blockEnd
    }

    if (valid) {
      slots.push(formatMinutes(start))
    }
  }

  return slots
}
