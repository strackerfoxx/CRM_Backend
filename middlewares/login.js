import bcrypt from "bcrypt";
import dotenv from "dotenv"
import { generateAccessToken, generateRefreshToken, setRefreshTokenCookie } from "../helpers/tokenService.js";

dotenv.config({ path: '.env' });

const login = async (res, user, password) => {

    // verificar password y autenticar usuario
    if(!bcrypt.compareSync(password, user.password))return res.status(401).json({msg: "The Password is Incorrect"});

    // Crear JWT
    const token = generateAccessToken(user);
    const refreshToken = generateRefreshToken({ id: user.id, type: 'user' });

    setRefreshTokenCookie(res, refreshToken);

    return token
}

export default login