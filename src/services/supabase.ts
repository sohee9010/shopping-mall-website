import { createClient } from '@supabase/supabase-js'

// Supabase 프로젝트 설정
const supabaseUrl = 'https://toueihqbuqbmkatatonp.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRvdWVpaHFidXFibWthdGF0b25wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwNTAxODksImV4cCI6MjA4NDYyNjE4OX0.8kduDOHf2EBEpNjCxOeEfpGhhjBN99d-jt_sM7HZCts'

console.log('Supabase initialized')

export const supabase = createClient(supabaseUrl, supabaseAnonKey)