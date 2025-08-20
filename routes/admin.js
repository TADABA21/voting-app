const express = require("express");
const User = require("../models/User");
const Vote = require("../models/Vote");
const Candidate = require("../models/Candidate");
const verifyAdmin = require("../middleware/verifyAdmin");
const router = express.Router();
const jwt = require("jsonwebtoken");
const Student = require("../models/Student");
const XLSX = require('xlsx')
const { syncAllToSupabase } = require("../utils/syncToSupabase");
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../public/uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'candidate-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: function (req, file, cb) {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

router.post("/students", verifyAdmin, async (req, res) => {
  try {
    const { email, studentId, name, department } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    // Check if student already exists
    const existingStudent = await Student.findOne({ email });
    if (existingStudent) {
      return res.status(400).json({ message: "Student email already exists" });
    }

    const student = new Student({
      email,
      studentId,
      name,
      department
    });
    await student.save();

    res.json({
      message: `Student ${email} added successfully`,
      student: {
        email: student.email,
        studentId: student.studentId,
        name: student.name,
        department: student.department
      }
    });
  } catch (err) {
    res.status(500).json({
      message: "Error adding student",
      error: err.message
    });
  }
});

// Bulk upload students from CSV/array
// In your admin routes file (this route already exists)
router.post("/students/bulk", verifyAdmin, async (req, res) => {
  try {
    const { students } = req.body; // Array of student objects

    if (!students || !Array.isArray(students)) {
      return res.status(400).json({ message: "Students array is required" });
    }

    const results = {
      added: 0,
      skipped: 0,
      errors: []
    };

    for (const studentData of students) {
      try {
        if (!studentData.email) {
          results.errors.push(`Missing email for student: ${JSON.stringify(studentData)}`);
          continue;
        }

        // Check if student already exists
        const existingStudent = await Student.findOne({ email: studentData.email });
        if (existingStudent) {
          results.skipped++;
          continue;
        }

        const student = new Student(studentData);
        await student.save();
        results.added++;
      } catch (error) {
        results.errors.push(`Error adding ${studentData.email}: ${error.message}`);
      }
    }

    res.json({
      message: `Bulk upload completed. Added: ${results.added}, Skipped: ${results.skipped}`,
      results
    });
  } catch (err) {
    res.status(500).json({
      message: "Error in bulk upload",
      error: err.message
    });
  }
});

// Get all students
router.get("/students", verifyAdmin, async (req, res) => {
  try {
    const students = await Student.find({}).select("email studentId name department isRegistered createdAt");
    res.json({ students });
  } catch (err) {
    res.status(500).json({
      message: "Error fetching students",
      error: err.message
    });
  }
});

// Remove student
router.delete("/students/:email", verifyAdmin, async (req, res) => {
  try {
    const { email } = req.params;

    const student = await Student.findOneAndDelete({ email });
    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    res.json({ message: `Student ${email} removed successfully` });
  } catch (err) {
    res.status(500).json({
      message: "Error removing student",
      error: err.message
    });
  }
});

// Check if user is admin (for client-side verification)
router.get("/check", verifyAdmin, async (req, res) => {
  try {
    res.json({
      message: "Admin verified successfully",
      email: req.user.email
    });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Get all users who voted
router.get("/voters", verifyAdmin, async (req, res) => {
  try {
    const voters = await User.find({ hasVoted: true }).select("email");
    res.json({ voters });
  } catch (err) {
    res.status(500).json({ message: "Error fetching voters", error: err.message });
  }
});

// Get vote counts for all candidates
router.get("/vote-counts", verifyAdmin, async (req, res) => {
  try {
    // Get vote counts by position and candidate
    const voteCounts = await Vote.aggregate([
      {
        $lookup: {
          from: 'candidates',
          localField: 'candidate',
          foreignField: '_id',
          as: 'candidateInfo'
        }
      },
      {
        $unwind: '$candidateInfo'
      },
      {
        $group: {
          _id: {
            position: '$candidateInfo.position',
            candidate: '$candidateInfo.name'
          },
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: '$_id.position',
          candidates: {
            $push: {
              name: '$_id.candidate',
              count: '$count'
            }
          },
          total: { $sum: '$count' }
        }
      }
    ]);

    res.json({ voteCounts });
  } catch (err) {
    res.status(500).json({
      message: "Error fetching vote counts",
      error: err.message
    });
  }
});

// Add a new candidate
router.post("/candidates", verifyAdmin, upload.single('image'), async (req, res) => {
  try {
    console.log("Request body:", req.body);
    console.log("Request file:", req.file);

    const { name, position } = req.body;

    if (!name || !position) {
      return res.status(400).json({
        message: "Candidate name and position are required",
        received: { name, position }
      });
    }

    // Check if candidate already exists for this position
    const existingCandidate = await Candidate.findOne({ name, position });
    if (existingCandidate) {
      return res.status(400).json({
        message: "Candidate already exists for this position",
        existingCandidate: {
          name: existingCandidate.name,
          position: existingCandidate.position
        }
      });
    }

    // Handle image upload
    let imageUrl = null;
    if (req.file) {
      imageUrl = `/uploads/${req.file.filename}`;
    }

    // Create and save the new candidate
    const candidate = new Candidate({ name, position, imageUrl });
    await candidate.save();

    res.json({
      message: `${name} added as a candidate for ${position}`,
      candidate: {
        name: candidate.name,
        position: candidate.position,
        imageUrl: candidate.imageUrl
      }
    });
  } catch (err) {
    console.error("Error adding candidate:", err);
    res.status(500).json({
      message: "Error adding candidate",
      error: err.message
    });
  }
});

// Delete a candidate
// Enhanced delete candidate route with better debugging
// Update the delete candidate route to handle both name and position
router.delete("/candidates/:name/:position", verifyAdmin, async (req, res) => {
  console.log(`🗑️ Delete candidate request received for: ${req.params.name}, ${req.params.position}`);
  console.log(`🗑️ Raw params:`, req.params);

  try {
    // Decode and trim the name and position
    const name = decodeURIComponent(req.params.name).trim();
    const position = decodeURIComponent(req.params.position).trim();
    console.log(`🔍 Processed candidate: name="${name}", position="${position}"`);

    // First, let's see what candidates exist
    const allCandidates = await Candidate.find({}).select('name position');
    console.log(`📋 All candidates in DB:`, allCandidates.map(c => `"${c.name}" (${c.position})`));

    // Check if candidate exists (case-insensitive)
    const candidate = await Candidate.findOne({
      name: { $regex: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
      position: { $regex: new RegExp(`^${position.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
    });

    if (!candidate) {
      console.log(`❌ Candidate not found: "${name}" for position "${position}"`);
      console.log(`💡 Available candidates: ${allCandidates.map(c => `${c.name} (${c.position})`).join(', ')}`);
      return res.status(404).json({
        message: "Candidate not found for this position",
        searchedFor: { name, position },
        availableCandidates: allCandidates.map(c => ({ name: c.name, position: c.position }))
      });
    }

    console.log(`✅ Candidate found: "${candidate.name}" (${candidate.position}) - ID: ${candidate._id}, Supabase ID: ${candidate.supabaseId}`);

    // Check if candidate has received votes
    const voteCount = await Vote.countDocuments({ candidate: candidate._id });
    console.log(`📊 Vote count for ${candidate.name}: ${voteCount}`);

    if (voteCount > 0) {
      console.log(`⚠️ Cannot delete candidate ${candidate.name} - has ${voteCount} votes`);
      return res.status(400).json({
        message: `Cannot delete candidate ${candidate.name}. They have received ${voteCount} vote(s). Reset votes first if you want to delete this candidate.`
      });
    }

    // Store candidate info before deletion for response
    const candidateInfo = {
      name: candidate.name,
      position: candidate.position,
      id: candidate._id,
      supabaseId: candidate.supabaseId
    };

    // Delete the candidate using the found candidate's ID
    const deleteResult = await Candidate.findOneAndDelete({
      name: candidate.name,
      position: candidate.position
    });
    console.log(`✅ Delete result:`, deleteResult ? 'Success' : 'Failed');

    if (!deleteResult) {
      throw new Error('Delete operation failed - candidate not removed');
    }

    console.log(`✅ Successfully deleted candidate: "${candidateInfo.name}" (${candidateInfo.position}) from both MongoDB and Supabase`);

    res.json({
      message: `Candidate ${candidateInfo.name} for position ${candidateInfo.position} deleted successfully`,
      deletedCandidate: candidateInfo
    });

  } catch (err) {
    console.error(`❌ Error deleting candidate:`, err);
    res.status(500).json({
      message: "Error deleting candidate",
      error: err.message,
      candidateName: req.params.name,
      candidatePosition: req.params.position
    });
  }
});

// Get all candidates
router.get("/candidates", verifyAdmin, async (req, res) => {
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

// Get all users (for admin management)
router.get("/users", verifyAdmin, async (req, res) => {
  try {
    const users = await User.find({}).select("email isAdmin hasVoted createdAt");
    res.json({ users });
  } catch (err) {
    res.status(500).json({
      message: "Error fetching users",
      error: err.message
    });
  }
});

// Make a user admin
router.post("/make-admin", verifyAdmin, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.isAdmin) {
      return res.status(400).json({ message: "User is already an admin" });
    }

    user.isAdmin = true;
    await user.save();

    res.json({
      message: `${email} has been granted admin privileges`,
      user: {
        email: user.email,
        isAdmin: user.isAdmin
      }
    });
  } catch (err) {
    res.status(500).json({
      message: "Error making user admin",
      error: err.message
    });
  }
});

// Remove admin privileges
router.post("/remove-admin", verifyAdmin, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    // Prevent removing admin privileges from the main admin
    if (email === process.env.ADMIN_EMAIL) {
      return res.status(400).json({
        message: "Cannot remove admin privileges from the main admin account"
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.isAdmin) {
      return res.status(400).json({ message: "User is not an admin" });
    }

    user.isAdmin = false;
    await user.save();

    res.json({
      message: `Admin privileges removed from ${email}`,
      user: {
        email: user.email,
        isAdmin: user.isAdmin
      }
    });
  } catch (err) {
    res.status(500).json({
      message: "Error removing admin privileges",
      error: err.message
    });
  }
});

// Reset votes
router.post("/reset", verifyAdmin, async (req, res) => {
  try {
    await Vote.deleteMany({});
    await User.updateMany({}, { hasVoted: false });
    res.json({ message: "All votes and vote flags have been reset" });
  } catch (err) {
    res.status(500).json({
      message: "Error resetting votes",
      error: err.message
    });
  }
});

router.post("/bootstrap", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required"
      });
    }

    // Check if any admin already exists
    const adminExists = await User.findOne({ isAdmin: true });
    if (adminExists) {
      return res.status(400).json({
        message: "Admin already exists. Bootstrap not allowed."
      });
    }

    // Find the user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        message: "User not found. Please register first."
      });
    }

    // Verify password (assuming you have bcrypt for password hashing)
    const bcrypt = require("bcryptjs");
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(400).json({
        message: "Invalid password"
      });
    }

    // Make this user the first admin
    user.isAdmin = true;
    await user.save();

    // Generate token
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.json({
      message: `${email} is now the first admin!`,
      token,
      user: {
        id: user._id,
        email: user.email,
        isAdmin: user.isAdmin
      }
    });

  } catch (err) {
    res.status(500).json({
      message: "Error creating bootstrap admin",
      error: err.message
    });
  }
});

// Check if bootstrap is needed (public route)
router.get("/bootstrap-status", async (req, res) => {
  try {
    const adminExists = await User.findOne({ isAdmin: true });
    res.json({
      needsBootstrap: !adminExists,
      message: adminExists ? "Admin exists" : "No admin found - bootstrap available"
    });
  } catch (err) {
    res.status(500).json({
      message: "Error checking bootstrap status",
      error: err.message
    });
  }
});

router.post("/students/bulk-excel", verifyAdmin, async (req, res) => {
  try {
    if (!req.files || !req.files.excelFile) {
      return res.status(400).json({ message: "No Excel file uploaded" });
    }

    const excelFile = req.files.excelFile;

    // Parse the Excel file
    const workbook = XLSX.read(excelFile.data);
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(firstSheet);

    // Map to our expected format
    const students = jsonData.map(row => {
      const email = row.email || row.Email || row['Email Address'] || row['E-mail'];
      const studentId = row.studentId || row['Student ID'] || row.id || row.ID;
      const name = row.name || row.Name || row['Full Name'];
      const department = row.department || row.Department || row.dept || row.Dept;

      if (!email) {
        throw new Error('Excel file must contain an email column');
      }

      return {
        email: email.toString().trim(),
        studentId: studentId ? studentId.toString().trim() : undefined,
        name: name ? name.toString().trim() : undefined,
        department: department ? department.toString().trim() : undefined
      };
    });

    const results = {
      added: 0,
      skipped: 0,
      errors: []
    };

    for (const studentData of students) {
      try {
        if (!studentData.email) {
          results.errors.push(`Missing email for student: ${JSON.stringify(studentData)}`);
          continue;
        }

        // Check if student already exists
        const existingStudent = await Student.findOne({ email: studentData.email });
        if (existingStudent) {
          results.skipped++;
          continue;
        }

        const student = new Student(studentData);
        await student.save();
        results.added++;
      } catch (error) {
        results.errors.push(`Error adding ${studentData.email}: ${error.message}`);
      }
    }

    res.json({
      message: `Bulk upload completed. Added: ${results.added}, Skipped: ${results.skipped}`,
      results
    });
  } catch (err) {
    res.status(500).json({
      message: "Error processing Excel file",
      error: err.message
    });
  }
});
// routes/admin.js - Add this route
router.post("/sync-to-supabase", verifyAdmin, async (req, res) => {
  try {
    await syncAllToSupabase();
    res.json({ message: "Sync to Supabase completed successfully" });
  } catch (err) {
    res.status(500).json({
      message: "Error syncing to Supabase",
      error: err.message
    });
  }
});

module.exports = router;