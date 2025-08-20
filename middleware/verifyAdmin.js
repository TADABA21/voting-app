const jwt = require("jsonwebtoken");
const User = require("../models/User");

module.exports = async function (req, res, next) {
  try {
    // Check if Authorization header exists
    const authHeader = req.header("Authorization");
    if (!authHeader) {
      return res.status(401).json({
        message: "Access denied. No token provided."
      });
    }

    // Extract token from header (Bearer <token>)
    const token = authHeader.split(" ")[1];
    if (!token) {
      return res.status(401).json({
        message: "Access denied. Invalid token format."
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded || !decoded.userId) {
      return res.status(401).json({
        message: "Access denied. Invalid token."
      });
    }

    // Find user by id
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({
        message: "Access denied. User not found."
      });
    }

    // Check if this is the bootstrap admin (from .env)
    const isBootstrapAdmin = user.email === process.env.ADMIN_EMAIL;
    
    // Check if there are any admins in the database
    const adminCount = await User.countDocuments({ isAdmin: true });
    
    // If no admins exist and this user is the bootstrap admin, make them admin
    if (adminCount === 0 && isBootstrapAdmin) {
      user.isAdmin = true;
      await user.save();
      console.log(`Bootstrap admin created: ${user.email}`);
    }
    
    // If no admins exist and no bootstrap admin is set, make the first user admin
    if (adminCount === 0 && !process.env.ADMIN_EMAIL) {
      user.isAdmin = true;
      await user.save();
      console.log(`First user became admin: ${user.email}`);
    }

    // Verify user has admin privileges
    if (!user.isAdmin) {
      return res.status(403).json({
        message: "Access denied. Admin privileges required."
      });
    }

    // Attach user to request object
    req.user = user;
    next();
  } catch (err) {
    if (err.name === "JsonWebTokenError") {
      return res.status(401).json({
        message: "Access denied. Invalid token."
      });
    }
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({
        message: "Access denied. Token expired."
      });
    }
    return res.status(500).json({
      message: "Server error during authentication.",
      error: err.message
    });
  }
};