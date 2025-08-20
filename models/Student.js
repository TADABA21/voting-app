const mongoose = require("mongoose");
const { supabaseAdmin } = require("../config/supabase");

const StudentSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  studentId: {
    type: String,
    required: false
  },
  name: {
    type: String,
    required: false
  },
  department: {
    type: String,
    required: false
  },
  isRegistered: {
    type: Boolean,
    default: false
  },
  supabaseId: {
    type: String,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Sync with Supabase after saving
StudentSchema.post('save', async function(doc) {
  try {
    if (!doc.supabaseId) {
      // Create student in Supabase
      const { data, error } = await supabaseAdmin
        .from('students')
        .insert({
          email: doc.email,
          student_id: doc.studentId,
          name: doc.name,
          department: doc.department,
          is_registered: doc.isRegistered,
          created_at: doc.createdAt
        })
        .select()
        .single();
        
      if (error) {
        console.error('Error creating Supabase student:', error);
      } else {
        // Update the document with Supabase ID
        doc.supabaseId = data.id;
        await doc.save();
      }
    } else {
      // Update existing student in Supabase
      const { error } = await supabaseAdmin
        .from('students')
        .update({
          student_id: doc.studentId,
          name: doc.name,
          department: doc.department,
          is_registered: doc.isRegistered
        })
        .eq('id', doc.supabaseId);
        
      if (error) {
        console.error('Error updating Supabase student:', error);
      }
    }
  } catch (error) {
    console.error('Error syncing student with Supabase:', error);
  }
});

// Sync with Supabase after removing
StudentSchema.post('findOneAndDelete', async function(doc) {
  try {
    if (doc && doc.supabaseId) {
      const { error } = await supabaseAdmin
        .from('students')
        .delete()
        .eq('id', doc.supabaseId);
        
      if (error) {
        console.error('Error deleting Supabase student:', error);
      }
    }
  } catch (error) {
    console.error('Error syncing student deletion with Supabase:', error);
  }
});

module.exports = mongoose.model("Student", StudentSchema);