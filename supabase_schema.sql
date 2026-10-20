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
    CASE
      WHEN NEW.raw_user_meta_data->>'role' IN ('student', 'company')
        THEN NEW.raw_user_meta_data->>'role'
      ELSE 'student'
    END,
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

-- Role- and ownership-scoped access rules.
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.role FROM public.profiles AS p WHERE p.id = auth.uid()
$$;
REVOKE ALL ON FUNCTION public.current_user_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;

CREATE OR REPLACE FUNCTION public.prevent_profile_role_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Account roles can only be changed by an administrator';
  END IF;
  RETURN NEW;
END;
$$;
-- Treat previously self-assignable privileged roles as untrusted until an administrator reassigns them.
UPDATE public.profiles SET role = 'student' WHERE role IN ('coordinator', 'admin');
DROP TRIGGER IF EXISTS prevent_profile_role_change ON public.profiles;
CREATE TRIGGER prevent_profile_role_change
  BEFORE UPDATE OF role ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_role_change();

DROP POLICY IF EXISTS "Public profiles read" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Profiles visible to owner and relevant staff" ON public.profiles;
CREATE POLICY "Profiles visible to owner and relevant staff" ON public.profiles
  FOR SELECT USING (
    id = auth.uid()
    OR public.current_user_role() IN ('coordinator', 'admin')
    OR EXISTS (
      SELECT 1
      FROM public.applications AS a
      JOIN public.internships AS i ON i.id = a.internship_id
      WHERE a.student_id = profiles.id AND i.company_id = auth.uid()
    )
  );
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id AND role IN ('student', 'company'));
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Anyone can read internships" ON public.internships;
DROP POLICY IF EXISTS "Companies and admins can create internships" ON public.internships;
DROP POLICY IF EXISTS "Companies can update own internships" ON public.internships;
DROP POLICY IF EXISTS "Companies can delete own internships" ON public.internships;
DROP POLICY IF EXISTS "Companies can create internships" ON public.internships;
CREATE POLICY "Anyone can read internships" ON public.internships
  FOR SELECT USING (true);
CREATE POLICY "Companies can create internships" ON public.internships
  FOR INSERT WITH CHECK (
    (public.current_user_role() = 'company' AND company_id = auth.uid())
    OR public.current_user_role() IN ('coordinator', 'admin')
  );
CREATE POLICY "Companies can update own internships" ON public.internships
  FOR UPDATE USING (
    (public.current_user_role() = 'company' AND company_id = auth.uid())
    OR public.current_user_role() IN ('coordinator', 'admin')
  ) WITH CHECK (
    (public.current_user_role() = 'company' AND company_id = auth.uid())
    OR public.current_user_role() IN ('coordinator', 'admin')
  );
CREATE POLICY "Companies can delete own internships" ON public.internships
  FOR DELETE USING (
    (public.current_user_role() = 'company' AND company_id = auth.uid())
    OR public.current_user_role() IN ('coordinator', 'admin')
  );

DROP POLICY IF EXISTS "Applications visible to owner, company, coordinator" ON public.applications;
DROP POLICY IF EXISTS "Students can apply" ON public.applications;
DROP POLICY IF EXISTS "Company and coordinator can update application status" ON public.applications;
DROP POLICY IF EXISTS "Applications visible to relevant users" ON public.applications;
DROP POLICY IF EXISTS "Students can apply to open internships" ON public.applications;
DROP POLICY IF EXISTS "Companies and coordinators can review applications" ON public.applications;
CREATE POLICY "Applications visible to relevant users" ON public.applications
  FOR SELECT USING (
    student_id = auth.uid()
    OR public.current_user_role() IN ('coordinator', 'admin')
    OR EXISTS (
      SELECT 1 FROM public.internships AS i
      WHERE i.id = applications.internship_id AND i.company_id = auth.uid()
    )
  );
CREATE POLICY "Students can apply to open internships" ON public.applications
  FOR INSERT WITH CHECK (
    student_id = auth.uid()
    AND public.current_user_role() = 'student'
    AND EXISTS (
      SELECT 1 FROM public.internships AS i
      WHERE i.id = applications.internship_id AND i.status = 'open'
    )
  );
CREATE POLICY "Companies and coordinators can review applications" ON public.applications
  FOR UPDATE USING (
    public.current_user_role() IN ('coordinator', 'admin')
    OR (public.current_user_role() = 'company' AND EXISTS (
      SELECT 1 FROM public.internships AS i
      WHERE i.id = applications.internship_id AND i.company_id = auth.uid()
    ))
  ) WITH CHECK (
    public.current_user_role() IN ('coordinator', 'admin')
    OR (public.current_user_role() = 'company' AND EXISTS (
      SELECT 1 FROM public.internships AS i
      WHERE i.id = applications.internship_id AND i.company_id = auth.uid()
    ))
  );
REVOKE UPDATE ON public.applications FROM authenticated;
GRANT UPDATE (status, updated_at) ON public.applications TO authenticated;

DROP POLICY IF EXISTS "Reports visible to student and coordinators" ON public.progress_reports;
DROP POLICY IF EXISTS "Students can insert own reports" ON public.progress_reports;
DROP POLICY IF EXISTS "Coordinators can update reports" ON public.progress_reports;
DROP POLICY IF EXISTS "Students and coordinators can view reports" ON public.progress_reports;
DROP POLICY IF EXISTS "Students can submit own reports" ON public.progress_reports;
DROP POLICY IF EXISTS "Coordinators can review reports" ON public.progress_reports;
CREATE POLICY "Students and coordinators can view reports" ON public.progress_reports
  FOR SELECT USING (
    student_id = auth.uid()
    OR public.current_user_role() IN ('coordinator', 'admin')
  );
CREATE POLICY "Students can submit own reports" ON public.progress_reports
  FOR INSERT WITH CHECK (
    student_id = auth.uid() AND public.current_user_role() = 'student'
  );
CREATE POLICY "Coordinators can review reports" ON public.progress_reports
  FOR UPDATE USING (public.current_user_role() IN ('coordinator', 'admin'))
  WITH CHECK (public.current_user_role() IN ('coordinator', 'admin'));
REVOKE UPDATE ON public.progress_reports FROM authenticated;
GRANT UPDATE (coordinator_feedback, status, reviewed_at) ON public.progress_reports TO authenticated;

DROP POLICY IF EXISTS "Evaluations visible to student, evaluator, and coordinator" ON public.evaluations;
DROP POLICY IF EXISTS "Evaluators and coordinators can create evaluations" ON public.evaluations;
DROP POLICY IF EXISTS "Evaluators can update own evaluations" ON public.evaluations;
DROP POLICY IF EXISTS "Evaluations visible to relevant users" ON public.evaluations;
DROP POLICY IF EXISTS "Companies and coordinators can create evaluations" ON public.evaluations;
DROP POLICY IF EXISTS "Evaluators and coordinators can update evaluations" ON public.evaluations;
CREATE POLICY "Evaluations visible to relevant users" ON public.evaluations
  FOR SELECT USING (
    student_id = auth.uid()
    OR evaluator_id = auth.uid()
    OR public.current_user_role() IN ('coordinator', 'admin')
    OR EXISTS (
      SELECT 1 FROM public.internships AS i
      WHERE i.id = evaluations.internship_id AND i.company_id = auth.uid()
    )
  );
CREATE POLICY "Companies and coordinators can create evaluations" ON public.evaluations
  FOR INSERT WITH CHECK (
    public.current_user_role() IN ('coordinator', 'admin')
    OR (
      public.current_user_role() = 'company'
      AND evaluator_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.internships AS i
        WHERE i.id = evaluations.internship_id AND i.company_id = auth.uid()
      )
    )
  );
CREATE POLICY "Evaluators and coordinators can update evaluations" ON public.evaluations
  FOR UPDATE USING (
    evaluator_id = auth.uid()
    OR public.current_user_role() IN ('coordinator', 'admin')
  ) WITH CHECK (
    evaluator_id = auth.uid()
    OR public.current_user_role() IN ('coordinator', 'admin')
  );

-- ====================================================================
-- SUPABASE STORAGE BUCKET FOR RESUMES / CVS
-- ====================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('resumes', 'resumes', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Storage object access policies
DROP POLICY IF EXISTS "Public read resumes" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload resumes" ON storage.objects;
DROP POLICY IF EXISTS "Users can update/delete own resumes" ON storage.objects;
DROP POLICY IF EXISTS "Users can read permitted resumes" ON storage.objects;
DROP POLICY IF EXISTS "Students can upload own resumes" ON storage.objects;
DROP POLICY IF EXISTS "Students can update own resumes" ON storage.objects;
DROP POLICY IF EXISTS "Students can delete own resumes" ON storage.objects;
CREATE POLICY "Users can read permitted resumes" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'resumes' AND (
      name LIKE 'resumes/' || auth.uid()::text || '-%'
      OR public.current_user_role() IN ('coordinator', 'admin')
      OR EXISTS (
        SELECT 1
        FROM public.applications AS a
        JOIN public.internships AS i ON i.id = a.internship_id
        WHERE i.company_id = auth.uid()
          AND name LIKE 'resumes/' || a.student_id::text || '-%'
      )
    )
  );
CREATE POLICY "Students can upload own resumes" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'resumes'
    AND public.current_user_role() = 'student'
    AND name LIKE 'resumes/' || auth.uid()::text || '-%'
  );
CREATE POLICY "Students can update own resumes" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'resumes'
    AND public.current_user_role() = 'student'
    AND name LIKE 'resumes/' || auth.uid()::text || '-%'
  ) WITH CHECK (
    bucket_id = 'resumes'
    AND public.current_user_role() = 'student'
    AND name LIKE 'resumes/' || auth.uid()::text || '-%'
  );
CREATE POLICY "Students can delete own resumes" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'resumes'
    AND public.current_user_role() = 'student'
    AND name LIKE 'resumes/' || auth.uid()::text || '-%'
  );

-- Convert previously stored public URLs to private-bucket object paths.
UPDATE public.profiles
SET cv_url = regexp_replace(cv_url, '^https?://[^/]+/storage/v1/object/public/resumes/', '')
WHERE cv_url ~ '^https?://[^/]+/storage/v1/object/public/resumes/';

-- Make the tables watched by the dashboards available to Supabase Realtime.
DO $$
DECLARE
  table_name TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH table_name IN ARRAY ARRAY['internships', 'applications', 'progress_reports', 'profiles']
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = table_name
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', table_name);
      END IF;
    END LOOP;
  END IF;
END;
$$;

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
