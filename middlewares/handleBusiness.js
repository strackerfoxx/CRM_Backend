import {PrismaClient} from '@prisma/client';
const prisma = new PrismaClient()

export async function changingBusinessState(businessId, operation = new Date()){

    const appointments = await prisma.appointment.findMany({
        where: { 
            businessId
        },
    })
    appointments.forEach( async (appointment) => {
        if(appointment.status === "SCHEDULED"){
            await prisma.appointment.update({
                where: { id: appointment.id },
                data: {
                    status: "CANCELED"
                }
            })
        }
    })

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