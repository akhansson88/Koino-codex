import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://prumjueusdyqnwwovpen.supabase.co";
const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBydW1qdWV1c2R5cW53d292cGVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzcwMTEzMzIsImV4cCI6MjA1MjU4NzMzMn0.O9DuG9qUeYtfe2Y8e0ykOdg6qoeTqT8bI_i7SwLBh50";

export const roomImagesBucket = "room-images";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
  },
});
