import { validationResult } from 'express-validator';
import {PrismaClient} from '@prisma/client';
const prisma = new PrismaClient()
import bcrypt from "bcrypt";

import { changingBusinessState } from '../middlewares/handleBusiness.js';
import login from '../middlewares/login.js';

export async function createUser(req, res){
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { name, email, password, role, businessId } = req.body;

    const salt = await bcrypt.genSalt(10);
    const passwordHashed = await bcrypt.hash(password, salt);

    try {
        await prisma.user.create({
            data:{
                name,
                email,
                password: passwordHashed,
                role,
                businessId
            }
        })
        res.status(201).json({ msg: "User created successfully" })
    } catch (error) {
        if (error.code === "P2002") {
            return res.status(409).json({ msg: "User already exists" })
        }
        return res.status(500).json(error)
    }
}

export async function loginUser(req, res, next){
    const { email, password } = req.body;

    try {
        const user = await prisma.user.findUnique({
            where: { email, isActive: true }
        })
        login(user, password,  res, next)
    } catch (error) {
        if (error.code === "P2025") {
            return res.status(404).json({ msg: "User not found" })
        }
        return res.status(500).json(error)
    }
}

export async function getUser(req, res) {
    const { id } = req.user
    try {
        const user = await prisma.user.findUnique({
            where: { id, isActive: true },
            include: { appointments: {
                where: {isActive: true},
                include: {services: true}
            }}
        })
        res.status(200).json(user)
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
            where: {isActive: true, businessId}
        })
        return res.status(200).json(users)
    } catch (error) {
        if (error.code === "P2025") {
            return res.status(404).json({ msg: "User not found" })
        }
        return res.status(500).json(error)
    }
}

export async function updateUser(req, res) {
    const { name, email, role, phone } = req.body
    const { id, role: userRole } = req.user
    if(role !== userRole){
        if(userRole !== 'ADMIN'){
            return res.status(403).json({ msg: "Role change Unauthorized" })
        }
    }
    
    try {
        await prisma.user.update({
            where: { id, isActive: true },
            data: { name, email, role, phone }
        })
        res.status(200).json({ msg: "User updated successfully" })
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
            where: { id, isActive: true },
            data: { isActive: false }
        })
        if(role === 'ADMIN'){
            await changingBusinessState(businessId, false)
            return res.status(200).json({ msg: "User and Business deleted successfully" })
        }else{
            res.status(200).json({ msg: "User deleted successfully" })
        }
    } catch (error) {
        if (error.code === "P2025") {
            return res.status(404).json({ msg: "User not found" })
        }
        return res.status(500).json(error)
    }
}