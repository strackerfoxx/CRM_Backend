import {PrismaClient} from '@prisma/client';
const prisma = new PrismaClient()

export async function changingBusinessState(businessId, operation = new Date()){

    const appointments = await prisma.appointment.findMany({
        where: { 
            businessId
        },
    })

    const scheduledIds = appointments
        .filter(appointment => appointment.status === "SCHEDULED")
        .map(appointment => appointment.id);

    if (scheduledIds.length > 0) {
        await prisma.appointment.updateMany({
            where: { id: { in: scheduledIds } },
            data: {
                status: "CANCELED"
            }
        });
    }

    await prisma.$transaction([
        prisma.business.update({
            where: { id: businessId },
            data: { deletedAt: operation },
        }),
        prisma.user.updateMany({
            where: { businessId },
            data: { deletedAt: operation }
        }),
        prisma.businessClient.updateMany({
            where: { businessId },
            data: { deletedAt: operation }
        })
    ])
}