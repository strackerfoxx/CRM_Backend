import bcrypt from "bcrypt";
import jwt from "jsonwebtoken"
import dotenv from "dotenv"
dotenv.config({ path: '.env' });

const login = async (user, password) => {

    // verificar password y autenticar usuario
    if(!bcrypt.compareSync(password, user.password))return res.status(401).json({msg: "The Password is Incorrect"});
    
    // Crear JWT
    const token = jwt.sign({
        "id": user.id,
        "name": user.name,
        "role": user.role,
        "businessId": user.businessId,
    }, process.env.SECRET_KEY, {
        expiresIn: "30d"
    });
    return token
}

export default login