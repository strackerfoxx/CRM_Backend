import { validationResult } from 'express-validator';
import {PrismaClient} from '@prisma/client';
const prisma = new PrismaClient()


export async function createService(req, res) {
    const { businessId } = req.user
    const { name, durationMin, price, description } = req.body

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
                businessId
            }
        })
        return res.status(201).json({ msg: "Service created successfuly", service })
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
            }
        })
        return res.status(200).json({ services })
    } catch (error) {
        if (error.code === "P2005") {
            return res.status(409).json({ msg: "Client doesnt exists" })
        }
        return res.status(500).json(error)
    }
}

export async function getServiceById(req, res) {
    const { businessId } = req.user
    try {
        const services = await prisma.service.findMany({
            where: { 
                businessId, 
                id: req.query.id, 
                isActive: true 
            }
        })
        return res.status(200).json({ services })
    } catch (error) {
        if (error.code === "P2005") {
            return res.status(409).json({ msg: "Client doesnt exists" })
        }
        return res.status(500).json(error)
    }
}

export async function updateService(req, res) {
    const { businessId } = req.user
    const { name, durationMin, price, description, serviceId } = req.body

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    
    try {
        const service = await prisma.service.update({
            where: { id: serviceId, isActive: true },
            data: {
                name,
                durationMin,
                price,
                description,
                businessId
            }
        })
        return res.status(201).json({ msg: "Service created successfuly", service })
    } catch (error) {
        if (error.code === "P2005") {
            return res.status(409).json({ msg: "Client doesnt exists" })
        }
        return res.status(500).json(error)
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
        return res.status(500).json(error)
    }
}