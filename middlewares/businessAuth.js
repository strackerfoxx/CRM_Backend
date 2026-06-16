import jwt from "jsonwebtoken";

// Middleware estricto: SOLO USUARIOS DEL NEGOCIO
export async function businessAuth(req, res, next) {
    const authHeader = req.get("Authorization");
    if (!authHeader) return res.status(403).json({ msg: "There is NOT a Token" });

    const token = authHeader.split(" ")[1];

    try {
        const decodedToken = jwt.verify(token, process.env.SECRET_KEY);

        // Validamos que estrictamente tenga un 'role'
        if (!decodedToken.role) {
            return res.status(403).json({ msg: "403 Forbidden: Business access only" });
        }

        req.user = decodedToken;
        return next();
    } catch (error) {
        if (error.name === "TokenExpiredError") {
             return res.status(401).json({msg: "TokenExpiredError"});
        }
        return res.status(403).json({ msg: "403 Unauthorized" });
    }
}