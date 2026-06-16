import jwt from "jsonwebtoken";

export const auth = async (req, res, next) => {
    const authHeader = req.get("Authorization");
    if(!authHeader) return res.status(403).json({msg: "There is NOT a Token"});

    //obtener header
    const token = authHeader.split(" ")[1]

    try {
        const decodedToken = jwt.verify(token, process.env.SECRET_KEY);

        if(!decodedToken.businessId && !decodedToken.role) {
            return res.status(403).json({msg: "403 Unauthorized"});
        }

        req.user = decodedToken;
    } catch (error) {
        if (error.name === "TokenExpiredError") {
             return res.status(401).json({msg: "TokenExpiredError"});
        }
        return res.status(403).json({msg: "403 Unauthorized"});
    };
    return next();
}