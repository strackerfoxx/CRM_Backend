import defaultPrisma from '../helpers/prisma.js';
import { parseHourToMinutes, orderedDays } from '../helpers/availability.js';
import { DateTime } from 'luxon';

let prisma = defaultPrisma;

export function setPrismaClientForTesting(mockPrisma) {
  prisma = mockPrisma;
}

/**
 * Validates and parses start and end dates with timezone validation and max range checks.
 * Defaults to the last 30 days if omitted.
 */
export function parseDateRange(startDateStr, endDateStr, timezone = 'UTC', maxDays = 366) {
  if (!timezone || typeof timezone !== 'string' || !DateTime.now().setZone(timezone).isValid) {
    const err = new Error('Invalid timezone parameter');
    err.code = 'INVALID_TIMEZONE';
    throw err;
  }

  let endDate;
  if (endDateStr) {
    const parsedEnd = DateTime.fromISO(endDateStr, { zone: timezone });
    if (!parsedEnd.isValid) {
      const err = new Error('Invalid endDate format');
      err.code = 'INVALID_DATES';
      throw err;
    }
    endDate = parsedEnd.endOf('day').toJSDate();
  } else {
    endDate = DateTime.now().setZone(timezone).endOf('day').toJSDate();
  }

  let startDate;
  if (startDateStr) {
    const parsedStart = DateTime.fromISO(startDateStr, { zone: timezone });
    if (!parsedStart.isValid) {
      const err = new Error('Invalid startDate format');
      err.code = 'INVALID_DATES';
      throw err;
    }
    startDate = parsedStart.startOf('day').toJSDate();
  } else {
    startDate = DateTime.fromJSDate(endDate).setZone(timezone).minus({ days: 30 }).startOf('day').toJSDate();
  }

  if (startDate > endDate) {
    const err = new Error('startDate cannot be after endDate');
    err.code = 'INVALID_DATES';
    throw err;
  }

  const diffDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays > maxDays) {
    const err = new Error(`Date range exceeds maximum allowed limit of ${maxDays} days`);
    err.code = 'DATE_RANGE_EXCEEDED';
    throw err;
  }

  return { startDate, endDate };
}

/**
 * Calculates previous period date boundaries matching the exact duration of current period.
 */
export function calculatePreviousPeriod(startDate, endDate) {
  const durationMs = endDate.getTime() - startDate.getTime();
  const prevEndDate = new Date(startDate.getTime() - 1);
  const prevStartDate = new Date(prevEndDate.getTime() - durationMs);
  return { prevStartDate, prevEndDate };
}

/**
 * Helper to compute comparison stats (current, previous, change, percentageChange).
 */
export function calculateMetricComparison(current, previous) {
  const change = Number((current - previous).toFixed(2));
  let percentageChange = null;
  if (previous > 0) {
    percentageChange = Number((((current - previous) / previous) * 100).toFixed(2));
  }
  return {
    current: Number(current.toFixed(2)),
    previous: Number(previous.toFixed(2)),
    change,
    percentageChange,
  };
}

/**
 * Merges overlapping/adjacent blocked time intervals and clips them to working schedule.
 */
export function mergeAndClipBlockedIntervals(dayBlocks, schedStart, schedEnd) {
  const intervals = [];

  for (const b of dayBlocks) {
    const bStart = parseHourToMinutes(b.start);
    const bEnd = parseHourToMinutes(b.end);

    if (isNaN(bStart) || isNaN(bEnd) || bEnd <= bStart) continue;

    const start = Math.max(schedStart, bStart);
    const end = Math.min(schedEnd, bEnd);

    if (end > start) {
      intervals.push({ start, end });
    }
  }

  if (intervals.length === 0) return 0;

  intervals.sort((a, b) => a.start - b.start);

  const merged = [];
  for (const interval of intervals) {
    if (merged.length === 0) {
      merged.push({ ...interval });
    } else {
      const last = merged[merged.length - 1];
      if (interval.start <= last.end) {
        last.end = Math.max(last.end, interval.end);
      } else {
        merged.push({ ...interval });
      }
    }
  }

  let totalBlockedMins = 0;
  for (const item of merged) {
    totalBlockedMins += (item.end - item.start);
  }

  return totalBlockedMins;
}

/**
 * 1. Business Overview Analytics
 */
export async function getOverviewData(businessId, { startDate: sStr, endDate: eStr, timezone = 'UTC' }) {
  const { startDate, endDate } = parseDateRange(sStr, eStr, timezone, 366);
  const { prevStartDate, prevEndDate } = calculatePreviousPeriod(startDate, endDate);

  const nowLuxon = DateTime.now().setZone(timezone);
  const todayStart = nowLuxon.startOf('day').toJSDate();
  const todayEnd = nowLuxon.endOf('day').toJSDate();

  // A. Today's appointments (independent of historical period filter)
  const todaysAppointments = await prisma.appointment.count({
    where: {
      businessId,
      deletedAt: null,
      date: { gte: todayStart, lte: todayEnd },
      status: { in: ['SCHEDULED', 'CONFIRMED', 'COMPLETED'] },
    },
  });

  // B. Completed appointments (current vs previous)
  const [currCompleted, prevCompleted] = await Promise.all([
    prisma.appointment.count({
      where: {
        businessId,
        deletedAt: null,
        date: { gte: startDate, lte: endDate },
        status: 'COMPLETED',
      },
    }),
    prisma.appointment.count({
      where: {
        businessId,
        deletedAt: null,
        date: { gte: prevStartDate, lte: prevEndDate },
        status: 'COMPLETED',
      },
    }),
  ]);

  // C. New clients: clients whose FIRST non-canceled appointment date falls within the period
  // Optimized 2-step candidate queries to avoid full table scan across all history
  const [currCandidates, prevCandidates] = await Promise.all([
    prisma.appointment.groupBy({
      by: ['businessClientId'],
      where: {
        businessId,
        deletedAt: null,
        status: { not: 'CANCELED' },
        date: { gte: startDate, lte: endDate },
      },
    }),
    prisma.appointment.groupBy({
      by: ['businessClientId'],
      where: {
        businessId,
        deletedAt: null,
        status: { not: 'CANCELED' },
        date: { gte: prevStartDate, lte: prevEndDate },
      },
    }),
  ]);

  let currNewClients = 0;
  if (currCandidates.length > 0) {
    const currCandidateIds = currCandidates.map((c) => c.businessClientId);
    const currPriors = await prisma.appointment.groupBy({
      by: ['businessClientId'],
      where: {
        businessId,
        deletedAt: null,
        status: { not: 'CANCELED' },
        date: { lt: startDate },
        businessClientId: { in: currCandidateIds },
      },
    });
    const currPriorSet = new Set(currPriors.map((c) => c.businessClientId));
    currNewClients = currCandidateIds.filter((id) => !currPriorSet.has(id)).length;
  }

  let prevNewClients = 0;
  if (prevCandidates.length > 0) {
    const prevCandidateIds = prevCandidates.map((c) => c.businessClientId);
    const prevPriors = await prisma.appointment.groupBy({
      by: ['businessClientId'],
      where: {
        businessId,
        deletedAt: null,
        status: { not: 'CANCELED' },
        date: { lt: prevStartDate },
        businessClientId: { in: prevCandidateIds },
      },
    });
    const prevPriorSet = new Set(prevPriors.map((c) => c.businessClientId));
    prevNewClients = prevCandidateIds.filter((id) => !prevPriorSet.has(id)).length;
  }

  // D. Cancellation rate
  const [currTotal, currCanceled, prevTotal, prevCanceled] = await Promise.all([
    prisma.appointment.count({
      where: { businessId, deletedAt: null, date: { gte: startDate, lte: endDate } },
    }),
    prisma.appointment.count({
      where: { businessId, deletedAt: null, date: { gte: startDate, lte: endDate }, status: 'CANCELED' },
    }),
    prisma.appointment.count({
      where: { businessId, deletedAt: null, date: { gte: prevStartDate, lte: prevEndDate } },
    }),
    prisma.appointment.count({
      where: { businessId, deletedAt: null, date: { gte: prevStartDate, lte: prevEndDate }, status: 'CANCELED' },
    }),
  ]);

  const currCancellationRate = currTotal > 0 ? (currCanceled / currTotal) * 100 : 0;
  const prevCancellationRate = prevTotal > 0 ? (prevCanceled / prevTotal) * 100 : 0;

  return {
    todaysAppointments,
    completedAppointments: calculateMetricComparison(currCompleted, prevCompleted),
    newClients: calculateMetricComparison(currNewClients, prevNewClients),
    cancellationRate: calculateMetricComparison(currCancellationRate, prevCancellationRate),
    period: {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    },
  };
}

/**
 * 2. Appointment Trends over time
 */
export async function getAppointmentsOverTimeData(businessId, { startDate: sStr, endDate: eStr, interval = 'day', timezone = 'UTC' }) {
  const allowedIntervals = ['day', 'week', 'month'];
  if (!allowedIntervals.includes(interval)) {
    const err = new Error('Invalid interval. Supported values: day, week, month');
    err.code = 'INVALID_INTERVAL';
    throw err;
  }

  const { startDate, endDate } = parseDateRange(sStr, eStr, timezone, 366);

  const appointments = await prisma.appointment.findMany({
    where: {
      businessId,
      deletedAt: null,
      date: { gte: startDate, lte: endDate },
    },
    select: {
      date: true,
      status: true,
    },
  });

  // Generate continuous buckets
  const buckets = [];
  let currentLuxon = DateTime.fromJSDate(startDate).setZone(timezone);
  const endLuxon = DateTime.fromJSDate(endDate).setZone(timezone);

  const bucketMap = new Map();

  while (currentLuxon <= endLuxon) {
    let key;
    if (interval === 'day') {
      key = currentLuxon.toISODate();
      currentLuxon = currentLuxon.plus({ days: 1 });
    } else if (interval === 'week') {
      key = currentLuxon.startOf('week').toISODate();
      currentLuxon = currentLuxon.plus({ weeks: 1 });
    } else if (interval === 'month') {
      key = currentLuxon.toFormat('yyyy-MM');
      currentLuxon = currentLuxon.plus({ months: 1 });
    }

    if (!bucketMap.has(key)) {
      const bucketObj = { date: key, completed: 0, pending: 0, canceled: 0, total: 0 };
      bucketMap.set(key, bucketObj);
      buckets.push(bucketObj);
    }
  }

  // Aggregate appointments into buckets
  for (const app of appointments) {
    const appLuxon = DateTime.fromJSDate(app.date).setZone(timezone);
    let key;
    if (interval === 'day') {
      key = appLuxon.toISODate();
    } else if (interval === 'week') {
      key = appLuxon.startOf('week').toISODate();
    } else if (interval === 'month') {
      key = appLuxon.toFormat('yyyy-MM');
    }

    let bucket = bucketMap.get(key);
    if (!bucket) {
      bucket = { date: key, completed: 0, pending: 0, canceled: 0, total: 0 };
      bucketMap.set(key, bucket);
      buckets.push(bucket);
    }

    if (app.status === 'COMPLETED') {
      bucket.completed++;
    } else if (app.status === 'SCHEDULED' || app.status === 'CONFIRMED') {
      bucket.pending++;
    } else if (app.status === 'CANCELED') {
      bucket.canceled++;
    }
    bucket.total++;
  }

  buckets.sort((a, b) => a.date.localeCompare(b.date));

  return buckets;
}

/**
 * 3. Top Services
 */
export async function getTopServicesData(businessId, { startDate: sStr, endDate: eStr, limit: limitRaw = 5, timezone = 'UTC' }) {
  const limitNum = Number(limitRaw);
  if (isNaN(limitNum) || !Number.isInteger(limitNum) || limitNum < 1 || limitNum > 50) {
    const err = new Error('Limit must be an integer between 1 and 50');
    err.code = 'INVALID_LIMIT';
    throw err;
  }

  const { startDate, endDate } = parseDateRange(sStr, eStr, timezone, 366);

  // Exclude CANCELED appointments
  const appointmentServices = await prisma.appointmentService.findMany({
    where: {
      appointment: {
        businessId,
        deletedAt: null,
        date: { gte: startDate, lte: endDate },
        status: { in: ['SCHEDULED', 'CONFIRMED', 'COMPLETED'] },
      },
      service: {
        businessId,
      },
    },
    include: {
      service: {
        select: {
          id: true,
          name: true,
          businessId: true,
        },
      },
    },
  });

  const serviceCounts = new Map();
  let totalServiceBookings = 0;

  for (const item of appointmentServices) {
    if (!item.service || item.service.businessId !== businessId) continue;

    const sId = item.service.id;
    if (!serviceCounts.has(sId)) {
      serviceCounts.set(sId, {
        serviceId: sId,
        serviceName: item.service.name,
        bookings: 0,
      });
    }
    serviceCounts.get(sId).bookings++;
    totalServiceBookings++;
  }

  const sortedServices = Array.from(serviceCounts.values())
    .sort((a, b) => b.bookings - a.bookings)
    .slice(0, limitNum);

  return sortedServices.map((s) => ({
    serviceId: s.serviceId,
    serviceName: s.serviceName,
    bookings: s.bookings,
    percentage: totalServiceBookings > 0 ? Number(((s.bookings / totalServiceBookings) * 100).toFixed(2)) : 0,
  }));
}

/**
 * 4. Employee Analytics
 */
export async function getEmployeeAnalyticsData(businessId, { startDate: sStr, endDate: eStr, userId, timezone = 'UTC' }) {
  const { startDate, endDate } = parseDateRange(sStr, eStr, timezone, 366);

  // Fetch active employees of the business
  const employees = await prisma.user.findMany({
    where: {
      businessId,
      deletedAt: null,
    },
    include: {
      schedules: {
        where: { deletedAt: null },
      },
    },
  });

  let targetEmployees = employees;
  if (userId) {
    targetEmployees = employees.filter((e) => e.id === userId);
    if (targetEmployees.length === 0) {
      const err = new Error('Employee not found or unauthorized');
      err.code = 'UNAUTHORIZED_EMPLOYEE';
      throw err;
    }
  }

  const targetUserIds = targetEmployees.map((e) => e.id);

  // Batch query blocked times and appointments in range for all target employees
  const [blockedTimes, allAppointments, allCompletedServices] = await Promise.all([
    prisma.blockedTime.findMany({
      where: {
        businessId,
        date: { gte: startDate, lte: endDate },
      },
    }),
    prisma.appointment.findMany({
      where: {
        businessId,
        deletedAt: null,
        date: { gte: startDate, lte: endDate },
        OR: [
          { userId: { in: targetUserIds } },
          { services: { some: { userId: { in: targetUserIds } } } },
        ],
      },
      include: {
        services: {
          include: {
            service: { select: { durationMin: true, cleaningTimeMin: true } },
          },
        },
      },
    }),
    prisma.appointmentService.findMany({
      where: {
        userId: { in: targetUserIds },
        appointment: {
          businessId,
          deletedAt: null,
          date: { gte: startDate, lte: endDate },
          status: 'COMPLETED',
        },
      },
      select: {
        userId: true,
      },
    }),
  ]);

  const results = [];

  for (const emp of targetEmployees) {
    // Filter assigned appointments for this specific employee
    const assignedAppointments = allAppointments.filter(
      (a) => a.userId === emp.id || a.services.some((s) => s.userId === emp.id)
    );

    const assignedCount = assignedAppointments.length;
    const completedCount = assignedAppointments.filter((a) => a.status === 'COMPLETED').length;
    const canceledCount = assignedAppointments.filter((a) => a.status === 'CANCELED').length;
    const cancellationRate = assignedCount > 0 ? Number(((canceledCount / assignedCount) * 100).toFixed(2)) : 0;

    // Services performed (completed appointmentServices assigned to employee)
    const servicesPerformed = allCompletedServices.filter((s) => s.userId === emp.id).length;

    // Occupied minutes (non-canceled assigned appointments)
    let occupiedMinutes = 0;
    for (const app of assignedAppointments) {
      if (app.status === 'CANCELED') continue;

      const userServices = app.services.filter((s) => s.userId === emp.id);
      if (userServices.length > 0) {
        for (const s of userServices) {
          occupiedMinutes += (s.service?.durationMin || 0) + (s.service?.cleaningTimeMin || 0);
        }
      } else if (app.userId === emp.id) {
        if (app.services.length === 0) {
          occupiedMinutes += app.durationMin || (app.endTimeMinutes - app.startTimeMinutes) || 0;
        } else {
          // If app has services, sum duration for services unassigned to any specific user
          const unassignedServices = app.services.filter((s) => !s.userId);
          for (const s of unassignedServices) {
            occupiedMinutes += (s.service?.durationMin || 0) + (s.service?.cleaningTimeMin || 0);
          }
        }
      }
    }

    // Available working minutes & Occupancy rate
    let availableWorkingMinutes = 0;
    let currDay = DateTime.fromJSDate(startDate).setZone(timezone);
    const endLuxon = DateTime.fromJSDate(endDate).setZone(timezone);

    while (currDay <= endLuxon) {
      const weekdayStr = orderedDays[currDay.weekday % 7]; // 0=Sunday in orderedDays
      const schedule = emp.schedules.find((s) => s.dayOfWeek === weekdayStr);

      if (schedule) {
        const schedStart = parseHourToMinutes(schedule.startTime);
        const schedEnd = parseHourToMinutes(schedule.endTime);

        if (!isNaN(schedStart) && !isNaN(schedEnd) && schedEnd > schedStart) {
          const totalSchedMins = schedEnd - schedStart;

          // Find blocked times on this day for employee or business-wide
          const dayBlocks = blockedTimes.filter((b) => {
            const bDateLuxon = DateTime.fromJSDate(b.date).setZone(timezone);
            return bDateLuxon.toISODate() === currDay.toISODate() && (!b.userId || b.userId === emp.id);
          });

          // Merge overlapping blocked intervals clipped to schedule
          const totalBlockedMins = mergeAndClipBlockedIntervals(dayBlocks, schedStart, schedEnd);

          const dayWorkingMins = Math.max(0, totalSchedMins - totalBlockedMins);
          availableWorkingMinutes += dayWorkingMins;
        }
      }

      currDay = currDay.plus({ days: 1 });
    }

    const occupancyRate = availableWorkingMinutes > 0
      ? Number(((occupiedMinutes / availableWorkingMinutes) * 100).toFixed(2))
      : null;

    results.push({
      userId: emp.id,
      userName: emp.name,
      assignedAppointments: assignedCount,
      completedAppointments: completedCount,
      canceledAppointments: canceledCount,
      cancellationRate,
      servicesPerformed,
      occupiedMinutes,
      availableWorkingMinutes,
      occupancyRate,
    });
  }

  return results;
}
