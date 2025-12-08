import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.warn(
        "WARNING: JWT_SECRET is not set. Token verification may fail. Set JWT_SECRET in your environment."
    );
}

export default function verifyToken(req, res, next) {
    const auth = req.headers.authorization || req.headers.Authorization || "";
    const headerToken = auth && auth.startsWith("Bearer ") ? auth.slice(7) : null;
    const cookieToken = req.cookies && req.cookies.token;
    const token = headerToken || cookieToken || req.query ?.token;
    if (!token) return res.status(401).json({ error: "No token provided" });
    try {
        const payload = jwt.verify(token, JWT_SECRET);
        req.user = payload;
        return next();
    } catch (err) {
        return res.status(403).json({ error: "Invalid token" });
    }
}