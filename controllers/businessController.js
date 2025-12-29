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
            // se toma el id del token del usuario ya que todos los usuarios llegan a la misma pantalla 
            // de login pero queremos que en cuanto se identifiquen se redirija al business al que pertenecen
            where: {
                id: businessId,
                deletedAt: null
            },include: {
                users: {
                    where: { deletedAt: null }
                },
                clients: {
                    where: { deletedAt: null },
                    include: {
                        client: true,
                        notes: {
                            where: { deletedAt: null }
                        }
                    }
                },
                services: {
                    where: { isActive: true },
                },
            }
        })
        if(!business) return res.status(404).json({msg: "Business not found"})
        return res.status(200).json(business)
    } catch (error) {
            return res.status(500).json({
            message: error.message,
            meta: error.meta,
            stack: error.stack
        })
    }
}

export async function updateBusiness(req, res) {

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { name, address, phone, email, id, defaultSlotInterval, businessHours, specialDays } = req.body

    try {
        await prisma.business.update({
            where: {
                id,
                deletedAt: null
            },
            data: {
                name,
                address,
                phone,
                email,
                defaultSlotInterval,
                businessHours,
                specialDays
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
    const { businessId } = req.body
    const { role } = req.user

    if(role !== 'ADMIN'){
        return res.status(403).json({ msg: "Only ADMIN users can delete the Business" })
    }

    try {
        await changingBusinessState(businessId, new Date())
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
            await changingBusinessState(businessId, null)
            return res.status(200).json({ msg: "Business ReActivated successfully" })
        }
    } catch (error) {
        if (error.code === "P2025") {
            return res.status(404).json({ msg: "Business not found" })
        }
        return res.status(500).json(error)
    }
}