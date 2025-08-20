const { supabaseAdmin } = require('../config/supabase');
const User = require('../models/User');
const Candidate = require('../models/Candidate');
const Student = require('../models/Student');
const Vote = require('../models/Vote');

async function syncUsersToSupabase() {
  try {
    const users = await User.find({});
    
    for (const user of users) {
      // Check if user exists in Supabase
      const { data: existingUser, error: checkError } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('email', user.email)
        .single();
      
      if (checkError && checkError.code !== 'PGRST116') {
        console.error(`Error checking user ${user.email}:`, checkError);
        continue;
      }
      
      if (existingUser) {
        // Update existing user
        const { error: updateError } = await supabaseAdmin
          .from('users')
          .update({
            has_voted: user.hasVoted,
            is_admin: user.isAdmin
          })
          .eq('id', existingUser.id);
          
        if (updateError) {
          console.error(`Error updating user ${user.email}:`, updateError);
        } else {
          console.log(`Updated user ${user.email} in Supabase`);
          // Update MongoDB with Supabase ID if not already set
          if (!user.supabaseId) {
            user.supabaseId = existingUser.id;
            await user.save();
          }
        }
      } else {
        // Create new user in Supabase auth
        const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email: user.email,
          password: 'temporary_password_need_to_reset',
          email_confirm: true
        });
        
        if (authError) {
          console.error(`Error creating auth user ${user.email}:`, authError);
          continue;
        }
        
        // Create user profile
        const { error: profileError } = await supabaseAdmin
          .from('users')
          .insert({
            id: authUser.user.id,
            email: user.email,
            has_voted: user.hasVoted,
            is_admin: user.isAdmin,
            created_at: user.createdAt
          });
          
        if (profileError) {
          console.error(`Error creating profile for ${user.email}:`, profileError);
        } else {
          // Update MongoDB with Supabase ID
          user.supabaseId = authUser.user.id;
          await user.save();
          console.log(`Created user ${user.email} in Supabase`);
        }
      }
    }
    
    console.log('User sync completed');
  } catch (error) {
    console.error('Error syncing users to Supabase:', error);
  }
}

async function syncCandidatesToSupabase() {
  try {
    const candidates = await Candidate.find({});
    
    for (const candidate of candidates) {
      // Check if candidate exists in Supabase
      const { data: existingCandidate, error: checkError } = await supabaseAdmin
        .from('candidates')
        .select('id')
        .eq('name', candidate.name)
        .single();
      
      if (checkError && checkError.code !== 'PGRST116') {
        console.error(`Error checking candidate ${candidate.name}:`, checkError);
        continue;
      }
      
      if (existingCandidate) {
        // Update existing candidate
        const { error: updateError } = await supabaseAdmin
          .from('candidates')
          .update({
            name: candidate.name
          })
          .eq('id', existingCandidate.id);
          
        if (updateError) {
          console.error(`Error updating candidate ${candidate.name}:`, updateError);
        } else {
          console.log(`Updated candidate ${candidate.name} in Supabase`);
          // Update MongoDB with Supabase ID if not already set
          if (!candidate.supabaseId) {
            candidate.supabaseId = existingCandidate.id;
            await candidate.save();
          }
        }
      } else {
        // Create new candidate in Supabase
        const { data: newCandidate, error: createError } = await supabaseAdmin
          .from('candidates')
          .insert({
            name: candidate.name,
            created_at: candidate.createdAt
          })
          .select()
          .single();
          
        if (createError) {
          console.error(`Error creating candidate ${candidate.name}:`, createError);
        } else {
          // Update MongoDB with Supabase ID
          candidate.supabaseId = newCandidate.id;
          await candidate.save();
          console.log(`Created candidate ${candidate.name} in Supabase`);
        }
      }
    }
    
    console.log('Candidate sync completed');
  } catch (error) {
    console.error('Error syncing candidates to Supabase:', error);
  }
}

async function syncStudentsToSupabase() {
  try {
    const students = await Student.find({});
    
    for (const student of students) {
      // Check if student exists in Supabase
      const { data: existingStudent, error: checkError } = await supabaseAdmin
        .from('students')
        .select('id')
        .eq('email', student.email)
        .single();
      
      if (checkError && checkError.code !== 'PGRST116') {
        console.error(`Error checking student ${student.email}:`, checkError);
        continue;
      }
      
      if (existingStudent) {
        // Update existing student
        const { error: updateError } = await supabaseAdmin
          .from('students')
          .update({
            student_id: student.studentId,
            name: student.name,
            department: student.department,
            is_registered: student.isRegistered
          })
          .eq('id', existingStudent.id);
          
        if (updateError) {
          console.error(`Error updating student ${student.email}:`, updateError);
        } else {
          console.log(`Updated student ${student.email} in Supabase`);
          // Update MongoDB with Supabase ID if not already set
          if (!student.supabaseId) {
            student.supabaseId = existingStudent.id;
            await student.save();
          }
        }
      } else {
        // Create new student in Supabase
        const { data: newStudent, error: createError } = await supabaseAdmin
          .from('students')
          .insert({
            email: student.email,
            student_id: student.studentId,
            name: student.name,
            department: student.department,
            is_registered: student.isRegistered,
            created_at: student.createdAt
          })
          .select()
          .single();
          
        if (createError) {
          console.error(`Error creating student ${student.email}:`, createError);
        } else {
          // Update MongoDB with Supabase ID
          student.supabaseId = newStudent.id;
          await student.save();
          console.log(`Created student ${student.email} in Supabase`);
        }
      }
    }
    
    console.log('Student sync completed');
  } catch (error) {
    console.error('Error syncing students to Supabase:', error);
  }
}

async function syncVotesToSupabase() {
  try {
    const votes = await Vote.find({}).populate('user').populate('candidate');
    
    for (const vote of votes) {
      // Check if vote exists in Supabase
      if (vote.supabaseId) {
        const { data: existingVote, error: checkError } = await supabaseAdmin
          .from('votes')
          .select('id')
          .eq('id', vote.supabaseId)
          .single();
        
        if (checkError && checkError.code !== 'PGRST116') {
          console.error(`Error checking vote ${vote._id}:`, checkError);
          continue;
        }
        
        if (existingVote) {
          console.log(`Vote ${vote._id} already exists in Supabase`);
          continue;
        }
      }
      
      // Create new vote in Supabase if user and candidate have Supabase IDs
      if (vote.user.supabaseId && vote.candidate.supabaseId) {
        const { data: newVote, error: createError } = await supabaseAdmin
          .from('votes')
          .insert({
            user_id: vote.user.supabaseId,
            candidate_id: vote.candidate.supabaseId,
            created_at: vote.createdAt
          })
          .select()
          .single();
          
        if (createError) {
          console.error(`Error creating vote ${vote._id}:`, createError);
        } else {
          // Update MongoDB with Supabase ID
          vote.supabaseId = newVote.id;
          await vote.save();
          console.log(`Created vote ${vote._id} in Supabase`);
        }
      } else {
        console.log(`Skipping vote ${vote._id} - user or candidate missing Supabase ID`);
      }
    }
    
    console.log('Vote sync completed');
  } catch (error) {
    console.error('Error syncing votes to Supabase:', error);
  }
}

async function syncAllToSupabase() {
  console.log('Starting full sync to Supabase...');
  await syncUsersToSupabase();
  await syncCandidatesToSupabase();
  await syncStudentsToSupabase();
  await syncVotesToSupabase();
  console.log('Full sync to Supabase completed');
}

module.exports = {
  syncUsersToSupabase,
  syncCandidatesToSupabase,
  syncStudentsToSupabase,
  syncVotesToSupabase,
  syncAllToSupabase
};