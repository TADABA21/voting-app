const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cors = require("cors");
const path = require("path");
const adminRoutes = require('./routes/admin');
const verifyAdmin = require("./middleware/verifyAdmin");
const authRoutes = require("./routes/auth");
const voteRoutes = require("./routes/vote");
const resultsRoutes = require("./routes/results");
const { supabase } = require("./config/supabase");
const { syncAllToSupabase } = require("./utils/syncToSupabase");

dotenv.config();
const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, "public")));

// Serve admin.html from views directory
app.use('/views', express.static(path.join(__dirname, "views")));

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/vote", voteRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/results', resultsRoutes);

// Sync endpoint
app.post("/api/sync-to-supabase", async (req, res) => {
  try {
    await syncAllToSupabase();
    res.json({ message: "Sync to Supabase completed successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error syncing to Supabase", error: error.message });
  }
});

// MongoDB connection with retry logic for serverless environments
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
    });
    console.log("✅ MongoDB Connected");
    
    // Ensure admin account exists on startup
    await ensureAdminExists();
    
    // Test Supabase connection
    supabase.auth.getSession()
      .then(({ data, error }) => {
        if (error) {
          console.error('❌ Supabase connection error:', error);
        } else {
          console.log('✅ Supabase connected successfully');
        }
      });
  } catch (err) {
    console.error("❌ MongoDB Connection Error:", err.message);
    // Don't throw error in serverless environment, just log it
  }
};

// Function to ensure the admin account exists
async function ensureAdminExists() {
  try {
    const bcrypt = require("bcrypt");
    const User = require("./models/User");
    
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) {
      console.error("⚠️ No ADMIN_EMAIL set in environment variables");
      return;
    }
    
    // Check if admin exists
    const adminExists = await User.findOne({ email: adminEmail });
    if (adminExists) {
      console.log("✅ Admin account already exists");
      return;
    }
    
    // Create an admin account with a default password
    const defaultPassword = "adminPassword123";
    const hashedPassword = await bcrypt.hash(defaultPassword, 10);
    
    const admin = new User({
      email: adminEmail,
      password: hashedPassword,
      isAdmin: true
    });
    
    await admin.save();
    console.log("✅ Admin account created with default password");
  } catch (error) {
    console.error("❌ Error ensuring admin account:", error.message);
  }
}

// Health check endpoint
app.get("/api/health", async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      res.status(200).json({ 
        status: "OK", 
        database: "Connected",
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(500).json({ 
        status: "Error", 
        database: "Disconnected",
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    res.status(500).json({ 
      status: "Error", 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Default route - serve login page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

// Admin route
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "admin.html"));
});

// Results route
app.get("/results", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "results.html"));
});

// Handle all other routes - serve index.html for client-side routing
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

// Connect to database and start server
const PORT = process.env.PORT || 5000;

if (process.env.VERCEL) {
  // Export for Vercel serverless
  module.exports = app;
} else {
  // Start standalone server for local development
  connectDB().then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  });
}

//module.exports = app;