import { validationResult } from "express-validator";
import prisma from "../helpers/prisma.js";

export async function createCategory(req, res) {
    const { businessId } = req.user;
    const { name } = req.body;

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const category = await prisma.category.create({
            data: { name, businessId }
        });

        return res.status(201).json({
            msg: "Category created successfully",
            category
        });
    } catch (error) {
        if (error.code === "P2002") {
            return res.status(409).json({ msg: "A category with this name already exists" });
        }

        return res.status(500).json({ msg: "Internal server error" });
    }
}

export async function getCategories(req, res) {
    const { businessId } = req.user;

    try {
        const categories = await prisma.category.findMany({
            where: { businessId },
            orderBy: { name: "asc" }
        });

        return res.status(200).json({ categories });
    } catch (error) {
        return res.status(500).json({ msg: "Internal server error" });
    }
}

export async function updateCategory(req, res) {
    const { businessId } = req.user;
    const { id, name } = req.body;

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const existingCategory = await prisma.category.findFirst({
            where: { id, businessId }
        });

        if (!existingCategory) {
            return res.status(404).json({ msg: "Category not found" });
        }

        const category = await prisma.category.update({
            where: { id },
            data: { name }
        });

        return res.status(200).json({
            msg: "Category updated successfully",
            category
        });
    } catch (error) {
        if (error.code === "P2002") {
            return res.status(409).json({ msg: "A category with this name already exists" });
        }

        return res.status(500).json({ msg: "Internal server error" });
    }
}

export async function deleteCategory(req, res) {
    const { businessId } = req.user;
    const { id } = req.body;

    try {
        const existingCategory = await prisma.category.findFirst({
            where: { id, businessId }
        });

        if (!existingCategory) {
            return res.status(404).json({ msg: "Category not found" });
        }

        await prisma.category.delete({
            where: { id }
        });

        return res.status(200).json({ msg: "Category deleted successfully" });
    } catch (error) {
        return res.status(500).json({ msg: "Internal server error" });
    }
}
