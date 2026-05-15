import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export async function createBlockedTime(req, res) {
    const { businessId } = req.user;
    const { date, start, end, userId } = req.body;

    try {
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
