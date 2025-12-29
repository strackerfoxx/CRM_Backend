export function errorHandler(err, req, res, next) {
    console.error('ERROR:', err);

    // Prisma errors
    if (err.code && err.code.startsWith("P")) {
        return res.status(400).json({
            type: "PrismaError",
            code: err.code,
            message: err.message,
            meta: err.meta || null
        });
    }

    // Validation errors (express-validator)
    if (err.errors) {
        return res.status(400).json({
            type: "ValidationError",
            errors: err.errors
        });
    }

    // Generic server error
    return res.status(500).json({
        type: "ServerError",
        message: err.message || "Internal server error",
        stack: err.stack // opcional: quítalo si no quieres mostrarlo en producción
    });
}
