import jwt from "jsonwebtoken";
import prisma from "../helpers/prisma.js";

export async function appointmentAuth(req, res, next) {
    const authHeader = req.get("Authorization");
    if (!authHeader) return res.status(403).json({ msg: "There is NOT a Token" });

    const token = authHeader.split(" ")[1];

    try {
        // Verificamos el token (falla y va al catch si es inválido o expiró)
        const decodedToken = jwt.verify(token, process.env.SECRET_KEY);

        // Validamos si la cuenta está eliminada
        if (decodedToken.role) {
            // Es un Usuario (Empleado/Dueño)
            const user = await prisma.user.findFirst({
                where: {
                    id: decodedToken.id,
                    deletedAt: null
                }
            });
            if (!user) {
                return res.status(403).json({ msg: "Account deactivated" });
            }
        } else {
            // Es un Cliente
            const client = await prisma.businessClient.findFirst({
                where: {
                    id: decodedToken.id,
                    deletedAt: null
                }
            });
            if (!client) {
                return res.status(403).json({ msg: "Account deactivated" });
            }
        }

        // Guardamos la información en req.user para AMBOS (clientes y usuarios)
        // Como ambos tokens tienen 'businessId', tu controlador funcionará sin cambios.
        req.user = decodedToken;

        return next();
    } catch (error) {
        if (error.name === "TokenExpiredError") {
             return res.status(401).json({msg: "TokenExpiredError"});
        }
        return res.status(403).json({ msg: "403 Unauthorized" });
    }
}
