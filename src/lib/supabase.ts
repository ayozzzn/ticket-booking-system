import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://mbaerlxfmungqhzvzrgk.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1iYWVybHhmbXVuZ3FoenZ6cmdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM1NzMyNzEsImV4cCI6MjEwOTE0OTI3MX0.0ZexASM4AI6Owim74ht-Jaekm7zh64sVWDmE28JdVjE";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
