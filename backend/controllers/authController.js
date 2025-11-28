import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.warn(
    "WARNING: JWT_SECRET is not set. Authentication tokens will be insecure or may fail. Set JWT_SECRET in your environment."
  );
}
const TOKEN_EXP = process.env.JWT_EXPIRES_IN || "8h";

function setTokenCookie(res, token) {
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    maxAge: 1000 * 60 * 60 * 8, // 8 hours
    path: "/",
  };
  res.cookie("token", token, cookieOptions);
}

export const register = async (req, res) => {
  try {
    const { username, password, displayName } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "username and password required" });
    }
    const existing = await User.findOne({ username });
    if (existing) return res.status(409).json({ error: "User exists" });
    const hash = await bcrypt.hash(password, 10);
    const user = new User({ username, passwordHash: hash, displayName });
    await user.save();
    const payload = {
      sub: user._id.toString(),
      username: user.username,
      role: user.role,
    };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXP });
    setTokenCookie(res, token);
    res.json({
      user: {
        id: user._id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("register error", err);
    res.status(500).json({ error: err.message });
  }
};

export const login = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: "username and password required" });
    const user = await User.findOne({ username });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    const payload = {
      sub: user._id.toString(),
      username: user.username,
      role: user.role,
    };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXP });
    setTokenCookie(res, token);
    res.json({
      user: {
        id: user._id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("login error", err);
    res.status(500).json({ error: err.message });
  }
};

export const me = async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    const { sub } = req.user;
    const user = await User.findById(sub).select(
      "_id username displayName role"
    );
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({
      user: {
        id: user._id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("me error", err);
    res.status(500).json({ error: err.message });
  }
};

export const logout = async (req, res) => {
  try {
    res.clearCookie("token", { path: "/" });
    res.json({ message: "Logged out" });
  } catch (err) {
    console.error("logout error", err);
    res.status(500).json({ error: err.message });
  }
};
