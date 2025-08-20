const mongoose = require("mongoose");
const { supabaseAdmin } = require("../config/supabase");

const CandidateSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
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
CandidateSchema.post('save', async function(doc) {
  try {
    if (!doc.supabaseId) {
      // Create candidate in Supabase
      const { data, error } = await supabaseAdmin
        .from('candidates')
        .insert({
          name: doc.name,
          created_at: doc.createdAt
        })
        .select()
        .single();
        
      if (error) {
        console.error('Error creating Supabase candidate:', error);
      } else {
        // Update the document with Supabase ID
        doc.supabaseId = data.id;
        await doc.save();
      }
    } else {
      // Update existing candidate in Supabase
      const { error } = await supabaseAdmin
        .from('candidates')
        .update({
          name: doc.name
        })
        .eq('id', doc.supabaseId);
        
      if (error) {
        console.error('Error updating Supabase candidate:', error);
      }
    }
  } catch (error) {
    console.error('Error syncing candidate with Supabase:', error);
  }
});

// Sync with Supabase after removing
CandidateSchema.post('findOneAndDelete', async function(doc) {
  try {
    if (doc && doc.supabaseId) {
      const { error } = await supabaseAdmin
        .from('candidates')
        .delete()
        .eq('id', doc.supabaseId);
        
      if (error) {
        console.error('Error deleting Supabase candidate:', error);
      }
    }
  } catch (error) {
    console.error('Error syncing candidate deletion with Supabase:', error);
  }
});

module.exports = mongoose.model("Candidate", CandidateSchema);