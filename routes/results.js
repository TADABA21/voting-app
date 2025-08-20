const express = require("express");
const Vote = require("../models/Vote");
const router = express.Router();

// Get public results (no authentication required)
router.get("/", async (req, res) => {
  try {
    // Group votes by candidate and count them
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
          _id: "$candidate",
          candidateName: { $first: "$candidateInfo.name" },
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);
    
    res.json({ results });
  } catch (err) {
    res.status(500).json({ message: "Error fetching results", error: err.message });
  }
});

module.exports = router;