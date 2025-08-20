const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const router = express.Router();
const Student = require("../models/Student");
const { supabase } = require("../config/supabase");

// REGISTER
router.post("/register", async (req, res) => {
  const { email, password } = req.body;

  try {
    // Validate input
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    // Check if email is valid format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    // Check if password meets minimum requirements
    if (password.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters" });
    }

    // Check if email exists in student database
    const validStudent = await Student.findOne({ email });
    if (!validStudent) {
      return res.status(403).json({
        message: "This email is not registered as a valid student email. Please contact your administrator."
      });
    }

    // Check if student has already registered for voting
    if (validStudent.isRegistered) {
      return res.status(400).json({
        message: "This student email has already been used to register for voting."
      });
    }

    // Check if user already exists in voting system
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    // Hash password and create user
    const hashedPassword = await bcrypt.hash(password, 10);

    // Check if this is the admin email
    const isAdmin = email === process.env.ADMIN_EMAIL;

    const user = new User({
      email,
      password: hashedPassword,
      isAdmin
    });

    await user.save();

    // Mark student as registered
    validStudent.isRegistered = true;
    await validStudent.save();

    res.status(201).json({
      message: "User registered successfully",
      studentInfo: {
        email: validStudent.email,
        studentId: validStudent.studentId,
        name: validStudent.name,
        department: validStudent.department
      }
    });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// LOGIN
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    // Validate input
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // Also authenticate with Supabase
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      
      if (error) {
        console.error("Supabase login error:", error);
      }
    } catch (supabaseError) {
      console.error("Supabase authentication failed:", supabaseError);
    }

    // Create token with isAdmin flag
    const token = jwt.sign(
      {
        userId: user._id,
        isAdmin: user.isAdmin
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      token,
      message: "Login successful",
      hasVoted: user.hasVoted,
      isAdmin: user.isAdmin
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Change password
router.post("/change-password", async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const token = req.header("Authorization")?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Authentication required" });
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Find user
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }

    // Check if new password meets requirements
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ message: "New password must be at least 8 characters" });
    }

    // Hash and update password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    res.json({ message: "Password changed successfully" });
  } catch (err) {
    if (err.name === "JsonWebTokenError") {
      return res.status(401).json({ message: "Invalid token" });
    }
    console.error("Password change error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

module.exports = router;