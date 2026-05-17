import { validationResult } from 'express-validator';
import {PrismaClient} from '@prisma/client';
const prisma = new PrismaClient()
import bcrypt from "bcrypt";

import { changingBusinessState } from '../middlewares/handleBusiness.js';
import login from '../middlewares/login.js';

// 
// Ahora tenemos que agregar el UserSchedule en el createUser controller
// 

export async function createUser(req, res){
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { name, email, password, role, businessId, userSchedule } = req.body;

    const salt = await bcrypt.genSalt(10);
    const passwordHashed = await bcrypt.hash(password, salt);

    const business = await prisma.business.findUnique({
        where: { id: businessId, deletedAt: null }
    })

    const businessHours = business.businessHours;

    try {
        const user = await prisma.user.create({
            data:{
                name,
                email,
                password: passwordHashed,
                role,
                businessId
            }
        })

        if(userSchedule.length < 1){
            for (const day of Object.keys(business.businessHours)) {
                await prisma.userSchedule.create({
                    data: {
                        dayOfWeek: day,
                        startTime: businessHours[day].open,
                        endTime: businessHours[day].close,
                        userId: user.id
                    }
                })
            }
        }else{

        }
        
        return res.status(201).json({ msg: "User created successfully" })
    } catch (error) {
        if (error.code === "P2002") {
            return res.status(409).json({ msg: "User already exists" })
        }
        console.error(error)
        return res.status(500).json({
            message: error.message,
            meta: error.meta,
            stack: error.stack
        })
    }
}

export async function loginUser(req, res, next){
    const { email, password } = req.body;

    try {
        const user = await prisma.user.findUnique({
            where: { email, deletedAt: null }
        })
        const business = await prisma.business.findUnique({
            where: { id: user.businessId, deletedAt: null }
        })
        return res.status(201).json({ token: await login(user, password), user: {name: user.name, role: user.role}})
    } catch (error) {
        if (error.code === "P2025") {
            return res.status(404).json({ msg: "User not found" })
        }
        next(error);
    }
}

export async function getUser(req, res) {
    const { id } = req.query
    const { businessId } = req.user
    try {
        const user = await prisma.user.findFirst({
            where: { 
                id, 
                deletedAt: null 
            },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                businessId: true,
                createdAt: true,
                updatedAt: true,
                phone: true,

                schedules: true,
                blockedTimes: true
            }
        })
        if(user.businessId !== businessId){
            return res.status(403).json({ msg: "Access denied" })
        }
        return res.status(200).json(user)
    } catch (error) {
        if (error.code === "P2025") {
            return res.status(404).json({ msg: "User not found" })
        }
        return res.status(500).json(error)
    }
}

export async function getAllUsers(req, res) {
    const { businessId, role } = req.user
    if(role !== 'ADMIN'){
        return res.status(403).json({ msg: "Access denied" })
    }
    try {
        const users = await prisma.user.findMany({
            where: { deletedAt: null, businessId },
            select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                role: true,
                phone: true,
                createdAt: true,
                updatedAt: true
            },
            orderBy: { createdAt: 'asc' }
        })
        return res.status(200).json(users)
    } catch (error) {
        if (error.code === "P2025") {
            return res.status(404).json({ msg: "Users not found" })
        }
        return res.status(500).json(error)
    }
}

export async function getUsersParams(req, res) {
    const searchParams = req.query
    
    const page = Number(searchParams.page) || 1
    const limit = Number(searchParams.limit) || 20
    const search = searchParams.search || ""
    const role = req.query.role

    const { businessId } = req.user
    
    const where = {
        businessId,
        deletedAt: null,
        role,
                OR:[
                {   name: {
                        contains: search,
                        mode: "insensitive"
                    }
                },
                {
                    phone: {
                        contains: search,
                        mode: "insensitive"
                    }
                },
                {
                    email: {
                        contains: search,
                        mode: "insensitive"
                    },
                },
            ],
    }

    try {
        const [users, total] = await Promise.all([
            prisma.user.findMany({
                where,
                orderBy: { createdAt: "asc" },
                skip: (page - 1) * limit,
                take: limit
            }),

            prisma.user.count({ where })
        ])
        const totalPages = Math.ceil(total / limit)
        return res.status(200).json({users, total})
    } catch (error) {
            return res.status(500).json({
            message: error.message,
            meta: error.meta,
            stack: error.stack
        })
    }
}

export async function updateUser(req, res) {
    const { id, name, email, role, phone } = req.body
    const { role: userRole } = req.user
    if(role !== userRole){
        if(userRole !== 'ADMIN'){
            return res.status(403).json({ msg: "Role change Unauthorized" })
        }
    }
    
    try {
        await prisma.user.update({
            where: { id, deletedAt: null },
            data: { name, email, role, phone }
        })
        return res.status(200).json({ msg: "User updated successfully" })
    } catch (error) {
        if (error.code === "P2025") {
            return res.status(404).json({ msg: "User not found" })
        }
        return res.status(500).json(error)
    }
}

export async function deleteUser(req, res) {
    const { id, businessId, role } = req.user

    try {
        await prisma.user.update({
            where: { id, deletedAt: null },
            data: { deletedAt: new Date() }
        })
        if(role === 'ADMIN'){
            await changingBusinessState(businessId, new Date())
            return res.status(200).json({ msg: "User and Business deleted successfully" })
        }else{
            return res.status(200).json({ msg: "User deleted successfully" })
        }
    } catch (error) {
        if (error.code === "P2025") {
            return res.status(404).json({ msg: "User not found" })
        }
        return res.status(500).json(error)
    }
}
export async function getUserSchedule(req, res) {
    const { id, businessId, role } = req.user;
    // Assuming if the client wants another user's schedule, they provide it in query. Default to auth user id.
    const targetUserId = req.query.userId || id;

    try {
        const user = await prisma.user.findFirst({
            where: { id: targetUserId, businessId, deletedAt: null }
        });

        if (!user) {
            return res.status(404).json({ msg: "User not found or unauthorized access" });
        }

        const schedules = await prisma.userSchedule.findMany({
            where: { userId: targetUserId, deletedAt: null },
            orderBy: { dayOfWeek: 'asc' } // or whatever order is preferred
        });

        return res.status(200).json(schedules);
    } catch (error) {
        return res.status(500).json(error);
    }
}

export async function updateUserSchedule(req, res) {
    const { id: authUserId, businessId, role } = req.user;
    const { id, dayOfWeek, startTime, endTime } = req.body;

    try {
        const schedule = await prisma.userSchedule.findFirst({
            where: { id, deletedAt: null },
            include: { user: true }
        });

        if (!schedule || schedule.user.businessId !== businessId) {
            return res.status(404).json({ msg: "User schedule not found or unauthorized access" });
        }

        if (role !== 'ADMIN' && schedule.userId !== authUserId) {
            return res.status(403).json({ msg: "Unauthorized to update this schedule" });
        }

        await prisma.userSchedule.update({
            where: { id },
            data: { dayOfWeek, startTime, endTime }
        });

        return res.status(200).json({ msg: "User schedule updated successfully" });
    } catch (error) {
        return res.status(500).json(error);
    }
}
