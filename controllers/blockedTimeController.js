import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

function parseHourToMinutes(hour) {
    const [h, m] = hour.split(':').map(Number);
    return h * 60 + m;
}

async function validateBlockedTimeConflicts({ businessId, date, start, end, userId, excludeId }) {
    const dateStart = new Date(date);
    dateStart.setUTCHours(0, 0, 0, 0);
    const dateEnd = new Date(date);
    dateEnd.setUTCHours(23, 59, 59, 999);

    const startMinutes = parseHourToMinutes(start);
    const endMinutes = parseHourToMinutes(end);

    const blockedTimes = await prisma.blockedTime.findMany({
        where: {
            businessId,
            date: {
                gte: dateStart,
                lte: dateEnd
            },
            ...(excludeId ? { id: { not: excludeId } } : {})
        }
    });

    const overlapsBlockedTime = blockedTimes.some((blocked) => {
        if (userId && blocked.userId && blocked.userId !== userId) return false;
        if (!userId && blocked.userId) return false;
        if (userId && !blocked.userId) return true;

        const blockedStart = parseHourToMinutes(blocked.start);
        const blockedEnd = parseHourToMinutes(blocked.end);
        return startMinutes < blockedEnd && endMinutes > blockedStart;
    });

    if (overlapsBlockedTime) {
        return { valid: false, status: 409, msg: 'Blocked time overlaps an existing blocked time' };
    }

    const appointmentConflicts = await prisma.appointment.findFirst({
        where: {
            businessId,
            deletedAt: null,
            status: { not: 'CANCELED' },
            date: {
                gte: dateStart,
                lte: dateEnd
            },
            startTimeMinutes: { lt: endMinutes },
            endTimeMinutes: { gt: startMinutes },
            ...(userId ? { userId } : {})
        }
    });

    if (appointmentConflicts) {
        return { valid: false, status: 409, msg: 'Blocked time conflicts with existing appointments' };
    }

    return { valid: true };
}

export async function createBlockedTime(req, res) {
    const { businessId } = req.user;
    const { date, start, end, userId } = req.body;

    try {
        const validation = await validateBlockedTimeConflicts({ businessId, date, start, end, userId });
        if (!validation.valid) {
            return res.status(validation.status).json({ msg: validation.msg });
        }

        const blockedTime = await prisma.blockedTime.create({
            data: {
                date: new Date(date),
                start,
                end,
                businessId,
                userId: userId || null
            }
        });
        return res.status(201).json(blockedTime);
    } catch (error) {
        return res.status(500).json(error);
    }
}

export async function getBlockedTimes(req, res) {
    const { businessId } = req.user;
    // Optional filtering
    const { date, userId } = req.query;

    const whereClause = { businessId };

    if (date) {
        const startDate = new Date(date);
        startDate.setUTCHours(0, 0, 0, 0);
        const endDate = new Date(date);
        endDate.setUTCHours(23, 59, 59, 999);

        whereClause.date = {
            gte: startDate,
            lte: endDate
        };
    }

    if (userId) {
        whereClause.userId = userId;
    }

    try {
        const blockedTimes = await prisma.blockedTime.findMany({
            where: whereClause,
            orderBy: {
                date: 'asc'
            }
        });
        return res.status(200).json(blockedTimes);
    } catch (error) {
        return res.status(500).json(error);
    }
}

export async function updateBlockedTime(req, res) {
    const { businessId } = req.user;
    const { id, date, start, end, userId } = req.body;

    try {
        const existingBlockedTime = await prisma.blockedTime.findFirst({
            where: {
                id,
                businessId
            }
        });

        if (!existingBlockedTime) {
            return res.status(404).json({ msg: "Blocked time not found or unauthorized access" });
        }

        const nextDate = date || existingBlockedTime.date;
        const nextStart = start || existingBlockedTime.start;
        const nextEnd = end || existingBlockedTime.end;
        const nextUserId = userId !== undefined ? userId : existingBlockedTime.userId;

        const validation = await validateBlockedTimeConflicts({
            businessId,
            date: nextDate,
            start: nextStart,
            end: nextEnd,
            userId: nextUserId,
            excludeId: id
        });
        if (!validation.valid) {
            return res.status(validation.status).json({ msg: validation.msg });
        }

        const updatedBlockedTime = await prisma.blockedTime.update({
            where: { id },
            data: {
                date: date ? new Date(date) : undefined,
                start,
                end,
                userId: userId !== undefined ? userId : undefined
            }
        });

        return res.status(200).json(updatedBlockedTime);
    } catch (error) {
        return res.status(500).json(error);
    }
}

export async function deleteBlockedTime(req, res) {
    const { businessId } = req.user;
    const { id } = req.body;

    try {
        const existingBlockedTime = await prisma.blockedTime.findFirst({
            where: {
                id,
                businessId
            }
        });

        if (!existingBlockedTime) {
            return res.status(404).json({ msg: "Blocked time not found or unauthorized access" });
        }

        await prisma.blockedTime.delete({
            where: { id }
        });

        return res.status(200).json({ msg: "Blocked time deleted successfully" });
    } catch (error) {
        return res.status(500).json(error);
    }
}
