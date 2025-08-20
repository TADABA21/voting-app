const mongoose = require('mongoose');
const { supabaseAdmin } = require("../config/supabase");

const VoteSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  candidate: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Candidate',
    required: true,
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

// Ensure a user can vote only once
VoteSchema.index({ user: 1 }, { unique: true });

// Sync with Supabase after saving
VoteSchema.post('save', async function(doc) {
  try {
    if (!doc.supabaseId) {
      // Get user and candidate to get their Supabase IDs
      const User = mongoose.model('User');
      const Candidate = mongoose.model('Candidate');
      
      const user = await User.findById(doc.user);
      const candidate = await Candidate.findById(doc.candidate);
      
      if (user && user.supabaseId && candidate && candidate.supabaseId) {
        // Create vote in Supabase
        const { data, error } = await supabaseAdmin
          .from('votes')
          .insert({
            user_id: user.supabaseId,
            candidate_id: candidate.supabaseId,
            created_at: doc.createdAt
          })
          .select()
          .single();
          
        if (error) {
          console.error('Error creating Supabase vote:', error);
        } else {
          // Update the document with Supabase ID
          doc.supabaseId = data.id;
          await doc.save();
        }
      }
    }
  } catch (error) {
    console.error('Error syncing vote with Supabase:', error);
  }
});

// Sync with Supabase after removing
VoteSchema.post('findOneAndDelete', async function(doc) {
  try {
    if (doc && doc.supabaseId) {
      const { error } = await supabaseAdmin
        .from('votes')
        .delete()
        .eq('id', doc.supabaseId);
        
      if (error) {
        console.error('Error deleting Supabase vote:', error);
      }
    }
  } catch (error) {
    console.error('Error syncing vote deletion with Supabase:', error);
  }
});

const Vote = mongoose.model('Vote', VoteSchema);

module.exports = Vote;