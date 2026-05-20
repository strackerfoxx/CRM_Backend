import { validationResult } from 'express-validator';
import {PrismaClient} from '@prisma/client';
const prisma = new PrismaClient()


export async function createService(req, res) {
    const { businessId } = req.user
    const { name, durationMin, price, description, users, cleaningTimeMin = 0 } = req.body

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    
    try {
        const service = await prisma.service.create({
            data: {
                name,
                durationMin,
                price,
                description,
                businessId,
                cleaningTimeMin
            }
        })
        if(users && users.length > 0){
            users.forEach(async userId => {
                await prisma.userService.create({
                    data: {
                        userId,
                        serviceId: service.id
                    }
                })
            });
        }else{
            return res.status(201).json({ msg: "Users not provided" })
        }

        return res.status(201).json({ service, msg: "Service created successfuly", service })
    } catch (error) {
        if (error.code === "P2002") {
            return res.status(409).json({ msg: "Client already exists" })
        }
        return res.status(500).json(error)
    }
}

export async function getServices(req, res) {
    const { businessId } = req.user
    try {
        const services = await prisma.service.findMany({
            where: { 
                businessId, 
                isActive: true
            },
            include: {
                users: {
                    select: {
                        user: {
                            select: {
                                id: true,
                                name: true,
                                }
                            }
                        }
                    }
                }
        })
        return res.status(200).json({ services })
    } catch (error) {
        if (error.code === "P2005") {
            return res.status(409).json({ msg: "Client doesnt exists" })
        }
        return res.status(500).json({
            message: error.message,
            meta: error.meta,
            stack: error.stack
        })
    }
}

export async function getServiceById(req, res) {
    const { businessId } = req.user
    try {
        const service = await prisma.service.findUnique({
            where: { 
                businessId, 
                id: req.query.id, 
                isActive: true
            },
            include: {
                users: {
                    select: {
                        user: {
                            select: {
                                id: true,
                                name: true,
                                email: true
                            }
                        }
                    }
                }
            }
        })
        return res.status(200).json({ service })
    } catch (error) {
        if (error.code === "P2005") {
            return res.status(409).json({ msg: "Client doesnt exists" })
        }
        return res.status(500).json(error)
    }
}

export async function updateService(req, res) {
    const { businessId } = req.user

    const {
        name,
        durationMin,
        price,
        description,
        serviceId,
        cleaningTimeMin = 0,
        users = []
    } = req.body

    const errors = validationResult(req)

    if (!errors.isEmpty()) {
        return res.status(400).json({
            errors: errors.array()
        })
    }

    try {

        const existing = await prisma.userService.findMany({
            where: {
                serviceId
            },
            select: {
                userId: true
            }
        })

        const existingIds = existing.map(x => x.userId)

        const toCreate = users.filter(
            id => !existingIds.includes(id)
        )

        const toDelete = existingIds.filter(
            id => !users.includes(id)
        )

        const result = await prisma.$transaction(async (tx) => {

            await tx.userService.deleteMany({
                where: {
                    serviceId,
                    userId: {
                        in: toDelete
                    }
                }
            })

            await tx.userService.createMany({
                data: toCreate.map(userId => ({
                    serviceId,
                    userId
                })),
                skipDuplicates: true
            })

            const service = await tx.service.update({
                where: {
                    id: serviceId
                },
                data: {
                    name,
                    durationMin,
                    price,
                    description,
                    businessId,
                    cleaningTimeMin,
                }
            })

            return service
        })

        return res.status(200).json({
            msg: "Service updated successfully",
            service: result
        })

    } catch (error) {

        if (error.code === "P2025") {
            return res.status(404).json({
                msg: "Service not found"
            })
        }

        return res.status(500).json({
            msg: "Internal server error",
            error
        })
    }
}

export async function deleteService(req, res) {
    const { serviceId } = req.body

    try {
        await prisma.service.update({
            where: {
                id: serviceId, 
                isActive: true
            },
            data: {
                isActive: false
            }
        })
        return res.status(200).json({ msg: "Service deleted successfuly" })
    } catch (error) {
        if (error.code === "P2005") {
            return res.status(409).json({ msg: "Client doesnt exists" })
        }
        return res.status(500).json({
            message: error.message,
            meta: error.meta,
            stack: error.stack
        })
    }
}
export async function getServicesParams(req, res) {
    const searchParams = req.query

    const page = Number(searchParams.page) || 1
    const limit = Number(searchParams.limit) || 20
    const search = searchParams.search || ""

    const { businessId } = req.user

    const where = {
        businessId,
        isActive: true,
        OR:[
            {   name: {
                    contains: search,
                    mode: "insensitive"
                }
            },
            {
                description: {
                    contains: search,
                    mode: "insensitive"
                }
            }
        ],
    }

    try {
        const [services, total] = await Promise.all([
            prisma.service.findMany({
                where,
                orderBy: { createdAt: "asc" },
                skip: (page - 1) * limit,
                take: limit,
                include: {
                    users: {
                        select: {
                            user: {
                                select: {
                                    id: true,
                                    name: true,
                                }
                            }
                        }
                    }
                }
            }),

            prisma.service.count({ where })
        ])
        const totalPages = Math.ceil(total / limit)
        return res.status(200).json({services, total})
    } catch (error) {
            return res.status(500).json({
            message: error.message,
            meta: error.meta,
            stack: error.stack
        })
    }
}
