import jwt from "jsonwebtoken";

export const auth = async (req, res, next) => {
    const authHeader = req.get("Authorization");
    if(!authHeader) return res.status(403).json({msg: "There is NOT a Token"});
    
    //obtener header
    const token = authHeader.split(" ")[1]
    
    if(jwt.verify(token, process.env.SECRET_KEY).businessId && jwt.verify(token, process.env.SECRET_KEY).role) return res.status(403).json({msg: "Personal cannot access to this route"});
    
    try {
        const client = jwt.verify(token, process.env.SECRET_KEY);
        req.client = client
    } catch (error) {
        return res.status(403).json({msg: "403 Unauthorized"});
    };
    return next();
}