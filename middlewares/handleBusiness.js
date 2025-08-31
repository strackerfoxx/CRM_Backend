import {PrismaClient} from '@prisma/client';
const prisma = new PrismaClient()

export async function changingBusinessState(id, operation = false){
const notes = await prisma.note.findMany({
        where: {
            client: {
                businessId: id,
            },
        },
    })
    notes.forEach( async (n) => {
        await prisma.note.update({
            where: { id: n.id},
            data: { isActive: operation }
        })
    })

    const appointments = await prisma.appointmentService.findMany({
        where: { 
            appointment: {
                businessId: id
            }
        },
    })
    appointments.forEach( async (a) => {
        await prisma.appointmentService.delete({
            where: { id: a.id}
        })
    })

    await prisma.$transaction([
        prisma.business.update({
            where: { id },
            data: { isActive: operation },
        }),
        prisma.user.updateMany({
            where: { businessId: id },
            data: { isActive: operation },
        }),
        prisma.businessClient.updateMany({
            where: { businessId: id },
            data: { isActive: operation },
        }),
        prisma.appointment.updateMany({
            where: { businessId: id },
            data: { isActive: operation },
        }),
    ])
}