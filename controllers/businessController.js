import { validationResult } from 'express-validator';
import {PrismaClient} from '@prisma/client';
const prisma = new PrismaClient()

import { changingBusinessState } from '../middlewares/handleBusiness.js';

export async function createBusiness(req, res){

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const {name, address, phone, email} = req.body

    try {
        await prisma.business.create({
            data: {
                name,
                address,
                phone,
                email
            }
        })
        return res.status(201).json({message: "Business created successfully"})
    } catch (error) {
        if (error.code === "P2002") {
            return res.status(409).json({ msg: "Business already exists" })
        }
        return res.status(500).json(error)
    }
}

export async function getBusiness(req, res){
    const { businessId } = req.user

    try {
        const business = await prisma.business.findUnique({
            where: {
                id: businessId,
                isActive: true
            },include: {
                users: {
                    where: { isActive: true }
                },
                clients: {
                    where: { isActive: true },
                    include: {
                        client: true,
                        notes: {
                            where: { isActive: true }
                        }
                    }
                },
                services: {
                    where: { isActive: true },
                },
                appointments: {
                    where: { isActive: true }
                }
            }
        })
        if(!business) return res.status(404).json({msg: "Business not found"})
        return res.status(200).json(business)
    } catch (error) {
        return res.status(500).json({ msg: error })
    }
}

export async function updateBusiness(req, res) {

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { name, address, phone, email, id } = req.body

    try {
        await prisma.business.update({
            where: {
                id,
                isActive: true
            },
            data: {
                name,
                address,
                phone,
                email
            }
        })
        return res.status(200).json({ msg: "Business updated successfully" })
    } catch (error) {
        if (error.code === "P2025") {
            return res.status(404).json({ msg: "Business not found" })
        }
        return res.status(500).json(error)
    }
}

export async function deleteBusiness(req, res) {
    const { id } = req.body
    try {
        await changingBusinessState(id, false)
        return res.status(200).json({ msg: "Business deleted successfully" })
    } catch (error) {
        if (error.code === "P2025") {
            return res.status(404).json({ msg: "Business not found" })
        }
        return res.status(500).json(error)
    }
}

export async function reActivateBusiness(req, res) {
    const { role, businessId } = req.user

    try {
        if(role === 'ADMIN'){
            await changingBusinessState(businessId, true)
            return res.status(200).json({ msg: "Business ReActivated successfully" })
        }
    } catch (error) {
        if (error.code === "P2025") {
            return res.status(404).json({ msg: "Business not found" })
        }
        return res.status(500).json(error)
    }
}