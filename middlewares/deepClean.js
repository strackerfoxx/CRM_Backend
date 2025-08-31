export function deepClean(req, res, next) {
    function clean(obj) {
    if (!obj || typeof obj !== 'object') return obj;

    for (const key in obj) {
      const val = obj[key];

      if (typeof val === 'string') {
        if (key === 'name' || key === "password" || key === "role") {
          // Solo trim para req.body.name
          obj[key] = val.trim();
        } else {
          // Trim + lowercase para todos los demás strings
          obj[key] = val.trim().toLowerCase();
        }
      } else if (val && typeof val === 'object') {
        clean(val); // recursión para objetos y arrays
      }
    }

    return obj;
  }

  if (req.body) clean(req.body);
  next();
}