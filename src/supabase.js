import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://xodgubvgvsnbpheusggm.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhvZGd1YnZndnNuYnBoZXVzZ2dtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3MzE0NDIsImV4cCI6MjA4NjMwNzQ0Mn0.Kx9gQtLBp8frC5iE08303pgbsV6paDIpWvyeLOg4MHU'

export const supabase = createClient(supabaseUrl, supabaseKey)