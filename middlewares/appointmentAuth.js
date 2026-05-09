import jwt from "jsonwebtoken";

export async function appointmentAuth(req, res, next) {
    const authHeader = req.get("Authorization");
    if (!authHeader) return res.status(403).json({ msg: "There is NOT a Token" });

    //obtener header
    const token = authHeader.split(" ")[1]

    try {
        const decoded = jwt.verify(token, process.env.SECRET_KEY);

        // validate if the auth comes from a client or a user
        if (decoded.businessId && decoded.role) {
            req.user = decoded;
            return next();
        }

        if (decoded.businessId && !decoded.role) {
            req.client = decoded;
            return next();
        }
    } catch (error) {
        return res.status(403).json({ msg: "403 Unauthorized" });
    }

    return res.status(403).json({ msg: "403 Unauthorized" });
}
