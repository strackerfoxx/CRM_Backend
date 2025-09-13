import { validationResult } from 'express-validator';
import {PrismaClient} from '@prisma/client';
const prisma = new PrismaClient()

export async function createClient(req, res) {
    const { name, email, phone } = req.body
    const { businessId } = req.user

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    try {
        // we check if the client already exists in the business
        const client = await prisma.client.findUnique({
            where: { phone },
            include: { businesses: true }
        })

        if(client){
            // if the client exists we check if it is already associated with the business
            if(client.businesses.find(b => b.businessId === businessId)) return res.status(409).json({ msg: "Client already exists" })
            // if not we create the relation with the business
            const newBusinessClient = await prisma.businessClient.create({
                data: { clientId: client.id, businessId }
            })
            return res.status(201).json({ msg: "Client linked successfully", client: newBusinessClient})
        }
        // if not we create the client and the relation with the business
        const clientState = await prisma.client.create({
            data: { name, email, phone }
        })
        const newBusinessClient = await prisma.businessClient.create({
            data: { clientId: clientState.id, businessId }
        })
        return res.status(201).json({ msg: "Client created successfully", client: newBusinessClient})
        
    } catch (error) {
        if (error.code === "P2002") {
            return res.status(409).json({ msg: "Client already exists" })
        }
        return res.status(500).json(error)
    }
}

export async function getClients(req, res) {
    const { businessId } = req.user
    try {
        const clients = await prisma.businessClient.findMany({
            where: {
                businessId, 
                isActive: true
            }
        })
        return res.status(200).json({clients})
    } catch (error) {
        if (error.code === "P2005") {
            return res.status(409).json({ msg: "Business doesnt exists" })
        }
        return res.status(500).json(error)
    }

}
export async function getClientById(req, res) {
    const { id } = req.query
    try {
        const clients = await prisma.businessClient.findUnique({
            where: {
                id, 
                isActive: true
            }
        })
        return res.status(200).json({clients})
    } catch (error) {
        if (error.code === "P2005") {
            return res.status(409).json({ msg: "Business doesnt exists" })
        }
        return res.status(500).json(error)
    }
}

export async function deleteClient(req, res) {
    const { id } = req.body
    try {
        const clients = await prisma.businessClient.update({
            where: {
                id 
            },
            data: {
                isActive: false
            }
        })
        return res.status(200).json({clients})
    } catch (error) {
        if (error.code === "P2005") {
            return res.status(409).json({ msg: "Business doesnt exists" })
        }
        return res.status(500).json(error)
    }
}