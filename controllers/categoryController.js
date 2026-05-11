import { validationResult } from 'express-validator';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export async function createCategory(req, res) {
    const { businessId } = req.user;
    const { name } = req.body;

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const category = await prisma.category.create({
            data: {
                name,
                businessId
            }
        });

        return res.status(201).json({ msg: "Category created successfully", category });
    } catch (error) {
        return res.status(500).json({
            message: error.message,
            meta: error.meta,
            stack: error.stack
        });
    }
}

export async function getCategories(req, res) {
    const { businessId } = req.user;

    try {
        const categories = await prisma.category.findMany({
            where: {
                businessId,
                isActive: true
            }
        });

        return res.status(200).json({ categories });
    } catch (error) {
        return res.status(500).json({
            message: error.message,
            meta: error.meta,
            stack: error.stack
        });
    }
}

export async function getCategoryById(req, res) {
    const { businessId } = req.user;
    const { id } = req.query;

    try {
        const category = await prisma.category.findFirst({
            where: {
                id,
                businessId,
                isActive: true
            }
        });

        if (!category) {
            return res.status(404).json({ msg: "Category not found" });
        }

        return res.status(200).json({ category });
    } catch (error) {
        return res.status(500).json({
            message: error.message,
            meta: error.meta,
            stack: error.stack
        });
    }
}

export async function updateCategory(req, res) {
    const { businessId } = req.user;
    const { categoryId, name } = req.body;

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        // Find existing to ensure businessId matches
        const existingCategory = await prisma.category.findFirst({
            where: { id: categoryId, businessId, isActive: true }
        });

        if (!existingCategory) {
            return res.status(404).json({ msg: "Category not found" });
        }

        const category = await prisma.category.update({
            where: { id: categoryId },
            data: { name }
        });

        return res.status(200).json({ msg: "Category updated successfully", category });
    } catch (error) {
        return res.status(500).json({
            message: error.message,
            meta: error.meta,
            stack: error.stack
        });
    }
}

export async function deleteCategory(req, res) {
    const { businessId } = req.user;
    const { categoryId } = req.query;

    try {
        // Find existing to ensure businessId matches
        const existingCategory = await prisma.category.findFirst({
            where: { id: categoryId, businessId, isActive: true }
        });

        if (!existingCategory) {
            return res.status(404).json({ msg: "Category not found" });
        }

        await prisma.category.update({
            where: { id: categoryId },
            data: { isActive: false }
        });

        return res.status(200).json({ msg: "Category deleted successfully" });
    } catch (error) {
        return res.status(500).json({
            message: error.message,
            meta: error.meta,
            stack: error.stack
        });
    }
}
