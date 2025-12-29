import {PrismaClient} from "@prisma/client";
const prisma = new PrismaClient()

export async function createNote(req, res) {
    const { businessClientId, content } = req.body
    try {
        const note = await prisma.note.create({
            data:{
                businessClientId,
                content
            }
        })
        return res.status(201).json({ msg: "Note created successfully", note })
    } catch (error) {
        return res.status(500).json(error)
    }
}

export async function getNotes(req, res) {
    const { businessClientId } = req.query
    try {
        const notes = await prisma.note.findMany({
            where: { businessClientId, deletedAt: null }
        })
        return res.status(200).json({ notes })
    } catch (error) {
        return res.status(500).json(error)
    }
}

export async function getNoteById(req, res) {
    const { id } = req.query
    try {
        const note = await prisma.note.findMany({
            where: { id, deletedAt: null }
        })
        return res.status(200).json({ note })
    } catch (error) {
        return res.status(500).json(error)
    }
}

export async function updateNote(req, res) {
    const { id, content } = req.body
    try {
        const note = await prisma.note.update({
            where: {id},
            data:{
                content
            }
        })
        return res.status(201).json({ msg: "Note updated successfully", note })
    } catch (error) {
        return res.status(500).json(error)
    }
}

export async function deleteNote(req, res) {
    const { id } = req.body
    try {
        await prisma.note.update({
            where: {id},
            data:{
                deletedAt: new Date()
            }
        })
        return res.status(201).json({ msg: "Note deleted successfully" })
    } catch (error) {
        return res.status(500).json(error)
    }
}