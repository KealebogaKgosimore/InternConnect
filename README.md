# InternConnect — Internship Management System

InternConnect is a full-featured web-based internship management system connecting **students**, **partner companies**, and **university coordinators**. Powered by **Supabase** (PostgreSQL, Supabase Auth, and Cloud Storage).

---

## 🚀 Features

- **Authentication & RBAC**: Student and company self-registration with Supabase Auth; coordinator and admin roles are assigned by an administrator.
- **Dynamic Skill-Matching Engine**: Calculates real-time candidate-to-internship match percentages (0–100%) by comparing student skills and programmes against vacancy criteria.
- **Internship Directory & Filtering**: Live querying by keyword, field, location, and relevance/date sorting.
- **Application Pipeline**: One-click student application submissions with cover notes; company review modal with status pipeline management (`Under review`, `Shortlisted`, `Accepted`, `Rejected`).
- **Student Dashboard**: Live profile completion tracking, application history, profile updates, and private CV uploads in Supabase Storage.
- **Weekly Progress Monitoring**: Students submit weekly placement reports; coordinators review, approve, and submit feedback.
- **Coordinator Oversight & CSV Export**: Real-time institutional metrics and one-click CSV export of placement reports.

---

## 🛠️ Supabase Setup (3 Quick Steps)

### Step 1: Run the Database Schema
1. Open your project on [supabase.com](https://supabase.com).
2. Go to **SQL Editor** &rarr; **New query**.
3. Copy the entire contents of [`supabase_schema.sql`](supabase_schema.sql) and paste it into the editor.
4. Click **Run**.
   *This sets up the tables (`profiles`, `internships`, `applications`, `progress_reports`, `evaluations`), signup trigger, restrictive row-level security policies, private `resumes` bucket, Realtime publication, and initial seed listings. Every run resets existing coordinator/admin profiles to student because their prior roles could have been self-assigned. After each run, verify trusted staff accounts and promote them as described below.*

### Step 2: Configure Your Project Credentials
1. In your Supabase Dashboard, go to **Project Settings** &rarr; **API**.
2. Copy your **Project URL** and **anon / public key**.
3. Open [`assets/js/supabase-config.js`](assets/js/supabase-config.js) and replace the placeholders:
   ```javascript
   const SUPABASE_CONFIG = {
     url: "https://your-project-ref.supabase.co",
     anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
   };
   ```

### Step 3: Run the Website
Because the entire backend is hosted on Supabase, the application runs directly in any modern web browser:
- Open `index.html` with Visual Studio Code **Live Server**, or any local HTTP server (e.g. `python -m http.server 8000`).
- For production, deploy the folder directly to **Vercel**, **Netlify**, **Cloudflare Pages**, or **GitHub Pages**.

### Assign coordinator or administrator access
Only create coordinator/admin access for accounts you have verified. In the Supabase SQL Editor, promote the correct profile by its verified email:
```sql
UPDATE public.profiles
SET role = 'coordinator'
WHERE email = 'verified-coordinator@example.com';
```
Use `admin` instead of `coordinator` only for a trusted administrator. Do not expose a Supabase service-role key in the website.

The dashboard badges now show the actual Realtime subscription state; a successful badge means the channel subscribed, not that every page operation succeeded. CVs are stored privately and opened using short-lived signed links. Test profile, application, report, and CV permissions using separate student, company, and coordinator accounts before launch.

---

## 📂 Project Structure

- `index.html` — Landing page with featured match preview
- `internships.html` — Live searchable and filterable internship listings with match scores
- `login.html` — Role-based authentication
- `register.html` — Account registration with role metadata
- `student-dashboard.html` — Student workspace with applications, profile, CV upload, and report submission
- `company-dashboard.html` — Company workspace with vacancy posting and applicant review modal
- `coordinator-dashboard.html` — Coordinator workspace with platform stats, report review, and CSV export
- `supabase_schema.sql` — Complete SQL setup script for Supabase
- `assets/js/`
  - `supabase-config.js` — Supabase client initialization & connection banner
  - `matching.js` — Skill-matching engine
  - `auth.js` — Sign up, sign in, session guard, and role routing
  - `internships.js` — Listings query, search/filters, and application modal
  - `student.js` — Student dashboard, profile edit, CV cloud upload, and report logs
  - `company.js` — Company dashboard, vacancy publishing, and applicant review
  - `coordinator.js` — Coordinator dashboard, approvals, and CSV export
- `assets/css/styles.css` — Custom styling and responsive design
