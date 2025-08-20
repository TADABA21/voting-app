const mongoose = require("mongoose");
const { supabase, supabaseAdmin } = require("../config/supabase");

const UserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true
  },
  hasVoted: {
    type: Boolean,
    default: false
  },
  isAdmin: {
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
UserSchema.post('save', async function(doc) {
  try {
    if (!doc.supabaseId) {
      // Create user in Supabase
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email: doc.email,
        password: doc.password,
        email_confirm: true
      });
      
      if (error) {
        console.error('Error creating Supabase user:', error);
      } else {
        // Update the document with Supabase ID
        doc.supabaseId = data.user.id;
        await doc.save();
        
        // Insert into public.users table
        const { error: profileError } = await supabaseAdmin
          .from('users')
          .insert({
            id: data.user.id,
            email: doc.email,
            has_voted: doc.hasVoted,
            is_admin: doc.isAdmin,
            created_at: doc.createdAt
          });
          
        if (profileError) {
          console.error('Error creating user profile:', profileError);
        }
      }
    } else {
      // Update existing user in Supabase
      const { error } = await supabaseAdmin
        .from('users')
        .update({
          has_voted: doc.hasVoted,
          is_admin: doc.isAdmin
        })
        .eq('id', doc.supabaseId);
        
      if (error) {
        console.error('Error updating Supabase user:', error);
      }
    }
  } catch (error) {
    console.error('Error syncing with Supabase:', error);
  }
});

module.exports = mongoose.model("User", UserSchema);