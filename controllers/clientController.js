import { validationResult } from 'express-validator';
import {PrismaClient} from '@prisma/client';
const prisma = new PrismaClient()

import jwt from "jsonwebtoken"
import dotenv from "dotenv"
dotenv.config({ path: '.env' });

import twilio from "twilio";
import { sendOTP, verifyOTP } from "../middlewares/OTP-handler.js"

export async function createClient(req, res) {
    const { name, email, phone, businessId } = req.body

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
            if(client.businesses.find(b => b.businessId === businessId)) return res.status(409).json({ msg: "Client already exists", client })
            // if not we create the relation with the business
            const newBusinessClient = await prisma.businessClient.create({
                data: { clientId: client.id, businessId }
            })
            return res.status(201).json({ msg: "Client linked successfully", client: newBusinessClient})
        }
        // if not we create the client and the relation with the business
        const newClient = await prisma.client.create({
            data: { 
                name, 
                email, 
                phone, 
                isConfirmed: true, 
                token: null
            }
        })
        const newBusinessClient = await prisma.businessClient.create({
            data: { clientId: newClient.id, businessId }
        })
        return res.status(201).json({ msg: "Client created successfully", client: newBusinessClient})
        
    } catch (error) {
        if (error.code === "P2002") {
            return res.status(409).json({ msg: "Client already exists" })
        }
        return res.status(500).json(error)
    }
}

export async function createClientSelfService(req, res) {
    const { name, email, phone, businessId } = req.body

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
            console.log("from client exists")
            // if the client exists we check if it is already associated with the business
            if(client.businesses.find(b => b.businessId === businessId)) return res.status(409).json({ msg: "Client already exists", client })
            // if not we create the relation with the business
            const newBusinessClient = await prisma.businessClient.create({
                data: { clientId: client.id, businessId }
            })
            return res.status(201).json({ msg: "Client linked successfully", client: newBusinessClient})
        }

        // if not we create the client and the relation with the business
        const newClient = await prisma.client.create({
            data: { 
                name, 
                email, 
                phone, 
                isConfirmed: false,
            }
        })
        const newBusinessClient = await prisma.businessClient.create({
            data: { clientId: newClient.id, businessId }
        })

        // now we send the OTP to the phone number
        // sendOTP(phone)

        return res.status(201).json({ msg: "Client created, waiting for confirmation", client: newBusinessClient})
        
    } catch (error) {
        if (error.code === "P2002") {
            return res.status(409).json({ msg: "Client already exists" })
        }
        return res.status(500).json(error)
    }
}

export async function confirmClient(req, res) {
    const { phone, code } = req.body;

    try {
        const client = await prisma.client.findUnique({ where: { phone } });
        const businessClient = await prisma.businessClient.findFirst({ where: { clientId: client.id } });

        if (!client) {
            return res.status(404).json({ msg: "Client not found" });
        }

        // we validate the OTP sent to the phone number
        // const verification = await verifyOTP(phone, code)
        // if(verification.success === false) return res.status(400).json({ msg: "Invalid token" });

        // update client to set isConfirmed to true
        await prisma.client.update({
            where: { phone },
            data: { 
                isConfirmed: true
            }
        });

        const token = jwt.sign({
            "id": businessClient.id,
            "name": client.name,
            "phone": phone
        }, process.env.SECRET_KEY, {
            expiresIn: "30d"
        });

        return res.status(200).json({ msg: "Phone confirmed successfully", token });
    } catch (error) {
        return res.status(500).json(error);
    }
}

export async function testingAuth(req, res) {
    res.send("pepe")
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