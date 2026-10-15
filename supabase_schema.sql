-- ====================================================================
-- InternConnect - Complete Supabase Database Schema & Setup Script
-- Run this in your Supabase Project -> SQL Editor -> New Query -> Run
-- ====================================================================

-- 1. Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Create PROFILES table (linked to Supabase Auth)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'company', 'coordinator', 'admin')),
  phone TEXT DEFAULT '',
  organisation TEXT DEFAULT '',
  programme TEXT DEFAULT '',
  skills TEXT DEFAULT '',
  cv_url TEXT DEFAULT '',
  bio TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create INTERNSHIPS table
CREATE TABLE IF NOT EXISTS public.internships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  company_name TEXT NOT NULL,
  title TEXT NOT NULL,
  field TEXT NOT NULL,
  location TEXT NOT NULL,
  duration TEXT NOT NULL,
  required_skills TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'paused', 'closed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Create APPLICATIONS table
CREATE TABLE IF NOT EXISTS public.applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  internship_id UUID NOT NULL REFERENCES public.internships(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'under_review', 'shortlisted', 'accepted', 'rejected')),
  cover_note TEXT DEFAULT '',
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_student_internship UNIQUE (internship_id, student_id)
);

-- 5. Create PROGRESS_REPORTS table
CREATE TABLE IF NOT EXISTS public.progress_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  internship_id UUID REFERENCES public.internships(id) ON DELETE SET NULL,
  week_number INT DEFAULT 1,
  report_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed')),
  coordinator_feedback TEXT DEFAULT '',
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);

-- 6. Create EVALUATIONS table
CREATE TABLE IF NOT EXISTS public.evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  internship_id UUID REFERENCES public.internships(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  evaluator_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  rating INT CHECK (rating >= 1 AND rating <= 5),
  feedback TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ====================================================================
-- AUTOMATIC PROFILE CREATION TRIGGER ON SIGNUP
-- ====================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    role,
    phone,
    organisation,
    programme,
    skills
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'User'),
    COALESCE(NEW.raw_user_meta_data->>'role', 'student'),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    COALESCE(NEW.raw_user_meta_data->>'organisation', ''),
    COALESCE(NEW.raw_user_meta_data->>'programme', ''),
    COALESCE(NEW.raw_user_meta_data->>'skills', '')
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    phone = EXCLUDED.phone,
    organisation = EXCLUDED.organisation;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ====================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ====================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.progress_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluations ENABLE ROW LEVEL SECURITY;

-- PROFILES Policies
DROP POLICY IF EXISTS "Public profiles read" ON public.profiles;
CREATE POLICY "Public profiles read" ON public.profiles
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- INTERNSHIPS Policies
DROP POLICY IF EXISTS "Anyone can read internships" ON public.internships;
CREATE POLICY "Anyone can read internships" ON public.internships
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Companies and admins can create internships" ON public.internships;
CREATE POLICY "Companies and admins can create internships" ON public.internships
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Companies can update own internships" ON public.internships;
CREATE POLICY "Companies can update own internships" ON public.internships
  FOR UPDATE USING (
    auth.uid() = company_id OR
    company_id IS NULL OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('coordinator', 'admin'))
  );

DROP POLICY IF EXISTS "Companies can delete own internships" ON public.internships;
CREATE POLICY "Companies can delete own internships" ON public.internships
  FOR DELETE USING (
    auth.uid() = company_id OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('coordinator', 'admin'))
  );

-- APPLICATIONS Policies
DROP POLICY IF EXISTS "Applications visible to owner, company, coordinator" ON public.applications;
CREATE POLICY "Applications visible to owner, company, coordinator" ON public.applications
  FOR SELECT USING (
    student_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.internships 
      WHERE internships.id = applications.internship_id 
        AND (internships.company_id = auth.uid() OR internships.company_id IS NULL)
    ) OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('coordinator', 'admin'))
  );

DROP POLICY IF EXISTS "Students can apply" ON public.applications;
CREATE POLICY "Students can apply" ON public.applications
  FOR INSERT WITH CHECK (auth.uid() = student_id);

DROP POLICY IF EXISTS "Company and coordinator can update application status" ON public.applications;
CREATE POLICY "Company and coordinator can update application status" ON public.applications
  FOR UPDATE USING (
    student_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.internships 
      WHERE internships.id = applications.internship_id 
        AND (internships.company_id = auth.uid() OR internships.company_id IS NULL)
    ) OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('coordinator', 'admin'))
  );

-- PROGRESS REPORTS Policies
DROP POLICY IF EXISTS "Reports visible to student and coordinators" ON public.progress_reports;
CREATE POLICY "Reports visible to student and coordinators" ON public.progress_reports
  FOR SELECT USING (
    student_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('coordinator', 'admin'))
  );

DROP POLICY IF EXISTS "Students can insert own reports" ON public.progress_reports;
CREATE POLICY "Students can insert own reports" ON public.progress_reports
  FOR INSERT WITH CHECK (auth.uid() = student_id);

DROP POLICY IF EXISTS "Coordinators can update reports" ON public.progress_reports;
CREATE POLICY "Coordinators can update reports" ON public.progress_reports
  FOR UPDATE USING (
    student_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('coordinator', 'admin'))
  );

-- EVALUATIONS Policies
DROP POLICY IF EXISTS "Evaluations visible to student, evaluator, and coordinator" ON public.evaluations;
CREATE POLICY "Evaluations visible to student, evaluator, and coordinator" ON public.evaluations
  FOR SELECT USING (
    student_id = auth.uid() OR
    evaluator_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('coordinator', 'admin'))
  );

DROP POLICY IF EXISTS "Evaluators and coordinators can create evaluations" ON public.evaluations;
CREATE POLICY "Evaluators and coordinators can create evaluations" ON public.evaluations
  FOR INSERT WITH CHECK (
    auth.uid() = evaluator_id OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('coordinator', 'admin', 'company'))
  );

DROP POLICY IF EXISTS "Evaluators can update own evaluations" ON public.evaluations;
CREATE POLICY "Evaluators can update own evaluations" ON public.evaluations
  FOR UPDATE USING (
    evaluator_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('coordinator', 'admin'))
  );

-- ====================================================================
-- SUPABASE STORAGE BUCKET FOR RESUMES / CVS
-- ====================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('resumes', 'resumes', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Storage object access policies
DROP POLICY IF EXISTS "Public read resumes" ON storage.objects;
CREATE POLICY "Public read resumes" ON storage.objects
  FOR SELECT USING (bucket_id = 'resumes');

DROP POLICY IF EXISTS "Authenticated users can upload resumes" ON storage.objects;
CREATE POLICY "Authenticated users can upload resumes" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'resumes' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Users can update/delete own resumes" ON storage.objects;
CREATE POLICY "Users can update/delete own resumes" ON storage.objects
  FOR UPDATE USING (bucket_id = 'resumes' AND auth.uid() = owner);

-- ====================================================================
-- SAMPLE SEED DATA (INITIAL INTERNSHIP LISTINGS)
-- ====================================================================
CREATE UNIQUE INDEX IF NOT EXISTS uq_internships_title_company ON public.internships (title, company_name);

INSERT INTO public.internships (company_name, title, field, location, duration, required_skills, description, status)
VALUES
  (
    'TechBridge Botswana',
    'Software Development Intern',
    'Information Technology',
    'Gaborone',
    '6 months',
    'Java, SQL, HTML5, Web Development, JavaScript',
    'Support our development team with web applications, automated testing, API integrations, and database operations.',
    'open'
  ),
  (
    'Pula Advisory',
    'Finance Assistant Intern',
    'Finance',
    'Gaborone',
    '3 months',
    'Excel, Financial Reporting, Financial Analysis, Accounting',
    'Assist with financial record auditing, spreadsheet financial modelling, and monthly compliance reporting.',
    'open'
  ),
  (
    'Northstar Engineering',
    'Engineering Trainee',
    'Engineering',
    'Francistown',
    '6 months',
    'CAD, AutoCAD, Technical Design, Problem Solving',
    'Work alongside senior structural and mechanical engineers on project documentation, site inspection, and technical design tasks.',
    'open'
  ),
  (
    'Kgalagadi Creative',
    'Digital Marketing Intern',
    'Marketing',
    'Remote',
    '3 months',
    'Social Media, Content Creation, Analytics, Copywriting',
    'Help plan digital media schedules, track audience engagement, create promotional graphics, and assist with online campaigns.',
    'open'
  ),
  (
    'BluePeak Systems',
    'IT Support Intern',
    'Information Technology',
    'Gaborone',
    '6 months',
    'Networking, Troubleshooting, Windows Server, Linux, Helpdesk',
    'Provide technical support for enterprise hardware and network systems, troubleshooting user workstations and managing asset tracking.',
    'open'
  ),
  (
    'PixelWorks Digital',
    'Junior Web & UI Intern',
    'Information Technology',
    'Remote',
    '4 months',
    'HTML5, CSS3, UI/UX, Figma, JavaScript, Responsive Design',
    'Collaborate with designers and front-end developers to craft interactive web layouts and modernize user interfaces.',
    'open'
  )
ON CONFLICT (title, company_name) DO NOTHING;

