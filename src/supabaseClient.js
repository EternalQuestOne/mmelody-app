import { createClient } from '@supabase/supabase-js'

const supabaseUrl = localStorage.getItem('supabaseUrl');
const supabaseAnonKey = localStorage.getItem('supabaseAnonKey');

export const supabase = (supabaseUrl && supabaseAnonKey) 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null;