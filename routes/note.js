import express from "express";
const router = express.Router();
import { body } from "express-validator";

import { createNote, getNotes, getNoteById, updateNote, deleteNote} from "../controllers/noteController.js";

import { auth } from "../middlewares/auth.js"

const noteValidator = [
    body('content').notEmpty().withMessage('The content is required')
]

router.post("/create", noteValidator, auth, createNote)
router.get("/get-notes", auth, getNotes)
router.get("/get-note-by-id", auth, getNoteById)
router.put("/update", noteValidator, auth, updateNote)
router.delete("/delete", auth, deleteNote)

export default router;