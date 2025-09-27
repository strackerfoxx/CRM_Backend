import jwt from "jsonwebtoken";

export async function appointmentAuth(req, res, next) {
    const authHeader = req.get("Authorization");
        if(!authHeader) return res.status(403).json({msg: "There is NOT a Token"});
        
        //obtener header
        const token = authHeader.split(" ")[1]
        
        // validate if the auth comes from a client or a user
        
        if(jwt.verify(token, process.env.SECRET_KEY).businessId && jwt.verify(token, process.env.SECRET_KEY).role){
            try {
                const user = jwt.verify(token, process.env.SECRET_KEY);
                req.user = user
            } catch (error) {
                return res.status(403).json({msg: "403 Unauthorized"});
            };
            return next();
        }

        if(jwt.verify(token, process.env.SECRET_KEY).businessId && jwt.verify(token, process.env.SECRET_KEY).role){
            try {
                const client = jwt.verify(token, process.env.SECRET_KEY);
                req.client = client
            } catch (error) {
                return res.status(403).json({msg: "403 Unauthorized"});
            };
            return next();
        }
        
        return res.status(403).json({msg: "403 Unauthorized"});
}