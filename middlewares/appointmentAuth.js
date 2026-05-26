import jwt from "jsonwebtoken";

export async function appointmentAuth(req, res, next) {
    const authHeader = req.get("Authorization");
    if (!authHeader) return res.status(403).json({ msg: "There is NOT a Token" });

    const token = authHeader.split(" ")[1];

    try {
        // Verificamos el token (falla y va al catch si es inválido o expiró)
        const decodedToken = jwt.verify(token, process.env.SECRET_KEY);

        // Guardamos la información en req.user para AMBOS (clientes y usuarios)
        // Como ambos tokens tienen 'businessId', tu controlador funcionará sin cambios.
        req.user = decodedToken;

        return next();
    } catch (error) {
        return res.status(403).json({ msg: "403 Unauthorized" });
    }
}