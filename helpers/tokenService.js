import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const ACCESS_TOKEN_EXPIRES_IN = process.env.ACCESS_TOKEN_EXPIRES_IN || '10m';
const REFRESH_TOKEN_EXPIRES_DAYS = Number(process.env.REFRESH_TOKEN_EXPIRES_DAYS || 7);
const REFRESH_TOKEN_MAX_AGE = REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000;

export const generateAccessToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      role: user.role,
      businessId: user.businessId,
    },
    process.env.SECRET_KEY,
    {
      expiresIn: ACCESS_TOKEN_EXPIRES_IN,
    }
  );
};

export const verifyAccessToken = (token) => {
  return jwt.verify(token, process.env.SECRET_KEY);
};

export const generateRefreshToken = () => {
  return crypto.randomBytes(64).toString('hex');
};

export const getRefreshTokenCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  path: '/',
  maxAge: REFRESH_TOKEN_MAX_AGE,
});

export const setRefreshTokenCookie = (res, token) => {
  res.cookie('refreshToken', token, getRefreshTokenCookieOptions());
};

export const clearRefreshTokenCookie = (res) => {
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    path: '/',
  });
};

export const parseCookies = (req) => {
  const cookieHeader = req.headers.cookie || '';
  return cookieHeader.split(';').reduce((cookies, cookie) => {
    const [name, ...rest] = cookie.trim().split('=');
    if (!name) return cookies;
    cookies[name] = decodeURIComponent(rest.join('='));
    return cookies;
  }, {});
};

export const refreshTokenExpirationMs = REFRESH_TOKEN_MAX_AGE;
