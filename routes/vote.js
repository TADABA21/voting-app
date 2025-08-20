const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Vote = require("../models/Vote");
const Candidate = require("../models/Candidate");
const router = express.Router();
const { supabaseAdmin } = require("../config/supabase");

// Middleware to verify user token
async function verifyToken(req, res, next) {
  try {
    const authHeader = req.header("Authorization");
    if (!authHeader) {
      return res.status(401).json({ message: "No token provided" });
    }
    
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (!decoded || !decoded.userId) {
      return res.status(401).json({ 
        message: "Invalid token format - missing userId"
      });
    }
    
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    req.user = user;
    next();
  } catch (err) {
    if (err.name === "JsonWebTokenError") {
      return res.status(401).json({ message: "Invalid token" });
    }
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Token expired" });
    }
    res.status(500).json({ message: "Server error", error: err.message });
  }
}

// Check token validity
router.get("/check", verifyToken, (req, res) => {
  res.json({
    message: "Token is valid",
    email: req.user.email,
    hasVoted: req.user.hasVoted
  });
});

// Get all candidates for voting
router.get("/candidates", async (req, res) => {
  try {
    const candidates = await Candidate.find({}).select("name position imageUrl");
    res.json({ candidates });
  } catch (err) {
    res.status(500).json({ 
      message: "Error fetching candidates", 
      error: err.message 
    });
  }
});

// Submit a vote
router.post("/submit", verifyToken, async (req, res) => {
  try {
    const { candidateName } = req.body;
    if (!candidateName) {
      return res.status(400).json({ message: "Candidate name is required" });
    }
    
    // Check if user has already voted
    if (req.user.hasVoted) {
      return res.status(400).json({ message: "You have already voted" });
    }
    
    // Verify candidate exists
    const candidate = await Candidate.findOne({ name: candidateName });
    if (!candidate) {
      return res.status(404).json({ message: "Candidate not found" });
    }
    
    // Check if a vote with this user already exists
    const existingVote = await Vote.findOne({ user: req.user._id });

    if (existingVote) {
      // Update user's voting status if there's already a vote but hasVoted is false
      if (!req.user.hasVoted) {
        req.user.hasVoted = true;
        await req.user.save();
      }
      return res.status(400).json({ message: "You have already voted" });
    }
    
    // Create vote record
    const vote = new Vote({
      user: req.user._id,
      candidate: candidate._id
    });
    
    await vote.save();
    
    // Update user's voting status
    req.user.hasVoted = true;
    await req.user.save();
    
    res.json({ message: "Vote submitted successfully" });
  } catch (err) {
    console.error("Vote submission error:", err);
    res.status(500).json({ message: "Error submitting vote", error: err.message });
  }
});

// Get voting results
router.get("/results", verifyToken, async (req, res) => {
  try {
    // Group votes by position and candidate
    const results = await Vote.aggregate([
      {
        $lookup: {
          from: "candidates",
          localField: "candidate",
          foreignField: "_id",
          as: "candidateInfo"
        }
      },
      { $unwind: "$candidateInfo" },
      {
        $group: {
          _id: {
            position: "$candidateInfo.position",
            candidateName: "$candidateInfo.name",
            candidateImage: "$candidateInfo.imageUrl"
          },
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: "$_id.position",
          candidates: {
            $push: {
              name: "$_id.candidateName",
              imageUrl: "$_id.candidateImage",
              count: "$count"
            }
          },
          totalVotes: { $sum: "$count" }
        }
      },
      { $sort: { "_id": 1 } }
    ]);
    
    res.json({ results });
  } catch (err) {
    res.status(500).json({ message: "Error fetching results", error: err.message });
  }
});

module.exports = router;