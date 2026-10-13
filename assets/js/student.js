/**
 * InternConnect - Student Dashboard Logic
 * Handles student metrics, application tracking, profile management, CV uploads to Supabase Storage,
 * and weekly progress report submissions.
 */

const StudentDashboard = {
  profile: null,
  applications: [],

  async init() {
    // Role guard: require student role
    this.profile = await AuthManager.requireAuth(["student"]);
    if (this.profile) {
      this.renderProfileDetails();
      await this.loadApplications();
    }
    this.setupProfileModal();
    this.setupReportModal();
  },

  renderProfileDetails() {
    if (!this.profile) return;

    // Greeting
    const greeting = document.querySelector("h1.h2");
    if (greeting) {
      greeting.textContent = `Good morning, ${this.profile.full_name || "Student"}`;
    }

    // Profile Completion Calculation
    let completion = 25; // Base registration done
    if (this.profile.programme) completion += 25;
    if (this.profile.skills && this.profile.skills.length > 0) completion += 25;
    if (this.profile.cv_url) completion += 25;

    // Update completion UI
    const compNumber = document.querySelector(".dashboard-stat .stat-number");
    const compBar = document.querySelector(".dashboard-stat .progress-bar");
    if (compNumber && compBar) {
      compNumber.textContent = `${completion}%`;
      compBar.style.width = `${completion}%`;
    }

    // Update checklist icons
    const checklist = document.querySelectorAll(".checklist-item");
    if (checklist.length >= 4) {
      // 0: Personal details (done)
      // 1: Academic programme
      checklist[1].innerHTML = `<span class="${this.profile.programme ? 'check-done' : 'check-pending'}">${this.profile.programme ? '✓' : '•'}</span> Academic programme ${this.profile.programme ? `<small class="text-secondary">(${this.profile.programme})</small>` : ''}`;
      // 2: Skills
      checklist[2].innerHTML = `<span class="${this.profile.skills ? 'check-done' : 'check-pending'}">${this.profile.skills ? '✓' : '•'}</span> Add skills and interests`;
      // 3: CV upload
      checklist[3].innerHTML = `<span class="${this.profile.cv_url ? 'check-done' : 'check-pending'}">${this.profile.cv_url ? '✓' : '•'}</span> ${this.profile.cv_url ? '<a href="' + this.profile.cv_url + '" target="_blank" class="text-success fw-semibold">CV Uploaded (View)</a>' : 'Upload your CV'}`;
    }

    // Pre-fill profile modal inputs if open
    const skillsInput = document.getElementById("skills");
    const progInput = document.getElementById("programme");
    if (skillsInput && this.profile.skills) skillsInput.value = this.profile.skills;
    if (progInput && this.profile.programme) progInput.value = this.profile.programme;
  },

  async loadApplications() {
    const client = getSupabase();
    if (!client || !isConfigured() || !this.profile) return;

    try {
      const { data, error } = await client
        .from("applications")
        .select(`
          id,
          status,
          applied_at,
          cover_note,
          internships (
            id,
            title,
            company_name,
            location,
            field
          )
        `)
        .eq("student_id", this.profile.id)
        .order("applied_at", { ascending: false });

      if (error) throw error;
      this.applications = data || [];
      this.renderApplicationsTable(this.applications);
      this.updateStatCounters(this.applications);
    } catch (err) {
      console.warn("Error fetching applications:", err);
    }
  },

  updateStatCounters(apps) {
    const statBoxes = document.querySelectorAll(".dashboard-stat .stat-number");
    if (statBoxes.length >= 4) {
      // Box 1: Applications count
      statBoxes[1].textContent = String(apps.length).padStart(2, "0");
      // Box 2: Shortlisted count
      const shortlisted = apps.filter(a => a.status === "shortlisted" || a.status === "accepted").length;
      statBoxes[2].textContent = String(shortlisted).padStart(2, "0");
    }
  },

  renderApplicationsTable(apps) {
    const tableBody = document.querySelector(".table tbody");
    if (!tableBody) return;

    if (apps.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="4" class="text-center py-4 text-secondary">
            No applications submitted yet. <a href="internships.html" class="fw-semibold">Browse opportunities & apply</a>.
          </td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = apps.map(app => {
      const internship = app.internships || {};
      const statusBadge = this.getStatusBadge(app.status);
      const dateStr = new Date(app.applied_at).toLocaleDateString();

      return `
        <tr>
          <td class="fw-semibold">${internship.title || "Internship"}</td>
          <td>${internship.company_name || "Company"}</td>
          <td>${statusBadge}</td>
          <td class="text-secondary small">${dateStr}</td>
        </tr>
      `;
    }).join("");
  },

  getStatusBadge(status) {
    switch (status) {
      case "shortlisted":
        return `<span class="status-badge status-shortlist">Shortlisted</span>`;
      case "accepted":
        return `<span class="status-badge status-open">Accepted</span>`;
      case "under_review":
        return `<span class="status-badge status-review">Under review</span>`;
      case "rejected":
        return `<span class="status-badge bg-danger-subtle text-danger">Not selected</span>`;
      default:
        return `<span class="status-badge status-submitted">Submitted</span>`;
    }
  },

  setupProfileModal() {
    const modal = document.getElementById("profileModal");
    if (!modal) return;

    // Enhance modal body to include CV upload and save button
    const modalBody = modal.querySelector(".modal-body");
    const modalFooter = modal.querySelector(".modal-footer");

    if (modalBody && !document.getElementById("cvUploadInput")) {
      modalBody.insertAdjacentHTML("beforeend", `
        <div class="mt-3">
          <label class="form-label" for="cvUploadInput">Upload CV / Resume (PDF or DOCX)</label>
          <input type="file" id="cvUploadInput" class="form-control" accept=".pdf,.doc,.docx">
          <div class="form-text" id="cvStatusText">Files are stored securely in Supabase Cloud Storage.</div>
        </div>
        <div id="profileSaveAlert" class="alert d-none mt-3"></div>
      `);
    }

    if (modalFooter && !document.getElementById("saveProfileBtn")) {
      modalFooter.insertAdjacentHTML("beforeend", `
        <button type="button" class="btn btn-primary" id="saveProfileBtn">Save changes</button>
      `);
    }

    const saveBtn = document.getElementById("saveProfileBtn");
    if (saveBtn) {
      saveBtn.addEventListener("click", () => this.saveProfile());
    }
  },

  async saveProfile() {
    const alertBox = document.getElementById("profileSaveAlert");
    const saveBtn = document.getElementById("saveProfileBtn");
    const skills = document.getElementById("skills")?.value.trim() || "";
    const programme = document.getElementById("programme")?.value.trim() || "";
    const fileInput = document.getElementById("cvUploadInput");

    if (!isConfigured()) {
      alertBox.className = "alert alert-warning";
      alertBox.textContent = "Supabase not connected. Credentials needed in assets/js/supabase-config.js.";
      alertBox.classList.remove("d-none");
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";

    const client = getSupabase();
    let cvUrl = this.profile?.cv_url || "";

    try {
      // 1. Handle CV file upload to Supabase Storage if file was chosen
      if (fileInput && fileInput.files && fileInput.files[0]) {
        const file = fileInput.files[0];
        const fileExt = file.name.split('.').pop();
        const fileName = `${this.profile.id}-${Date.now()}.${fileExt}`;
        const filePath = `resumes/${fileName}`;

        const { error: uploadError } = await client.storage
          .from("resumes")
          .upload(filePath, file, { upsert: true });

        if (uploadError) {
          console.warn("Storage upload note:", uploadError);
          if (uploadError.message?.toLowerCase().includes("bucket")) {
            alert("To enable CV uploads: Create a public bucket named 'resumes' in your Supabase Dashboard under Storage. Other profile changes are still being saved.");
          }
        } else {
          const { data: publicUrlData } = client.storage
            .from("resumes")
            .getPublicUrl(filePath);
          if (publicUrlData) cvUrl = publicUrlData.publicUrl;
        }
      }

      // 2. Update profile table in Supabase
      const { error: updateError } = await client
        .from("profiles")
        .update({
          skills,
          programme,
          cv_url: cvUrl,
          updated_at: new Date().toISOString()
        })
        .eq("id", this.profile.id);

      if (updateError) throw updateError;

      // Update local profile and UI
      this.profile.skills = skills;
      this.profile.programme = programme;
      this.profile.cv_url = cvUrl;
      this.renderProfileDetails();

      alertBox.className = "alert alert-success";
      alertBox.textContent = "Profile successfully updated!";
      alertBox.classList.remove("d-none");

      setTimeout(() => {
        const modalInstance = bootstrap.Modal.getInstance(document.getElementById("profileModal"));
        if (modalInstance) modalInstance.hide();
        alertBox.classList.add("d-none");
      }, 1200);
    } catch (err) {
      alertBox.className = "alert alert-danger";
      alertBox.textContent = err.message || "Failed to update profile.";
      alertBox.classList.remove("d-none");
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = "Save changes";
    }
  },

  setupReportModal() {
    const modal = document.getElementById("reportModal");
    if (!modal) return;

    // Enhance modal to have week selection and working submit button
    const modalBody = modal.querySelector(".modal-body");
    if (modalBody && !document.getElementById("reportWeek")) {
      modalBody.insertAdjacentHTML("afterbegin", `
        <div class="mb-3">
          <label for="reportWeek" class="form-label">Week Number</label>
          <input type="number" id="reportWeek" class="form-control" value="1" min="1" max="52">
        </div>
      `);
      modalBody.insertAdjacentHTML("beforeend", `<div id="reportAlert" class="alert d-none mt-3"></div>`);
    }

    const submitBtn = modal.querySelector(".modal-footer .btn-primary");
    if (submitBtn) {
      submitBtn.removeAttribute("onclick");
      submitBtn.addEventListener("click", () => this.submitReport());
    }
  },

  async submitReport() {
    const alertBox = document.getElementById("reportAlert");
    const weekInput = document.getElementById("reportWeek");
    const reportText = document.getElementById("reportText");
    const submitBtn = document.querySelector("#reportModal .modal-footer .btn-primary");

    const text = reportText?.value.trim();
    const week = parseInt(weekInput?.value || "1", 10);

    if (!text) {
      alertBox.className = "alert alert-warning";
      alertBox.textContent = "Please enter your activities and learning before submitting.";
      alertBox.classList.remove("d-none");
      return;
    }

    if (!isConfigured()) {
      alertBox.className = "alert alert-warning";
      alertBox.textContent = "Supabase credentials needed in assets/js/supabase-config.js to persist reports.";
      alertBox.classList.remove("d-none");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting...";

    const client = getSupabase();
    try {
      const { error } = await client
        .from("progress_reports")
        .insert({
          student_id: this.profile.id,
          week_number: week,
          report_text: text,
          status: "pending"
        });

      if (error) throw error;

      alertBox.className = "alert alert-success";
      alertBox.textContent = "Weekly progress report submitted to university coordinator!";
      alertBox.classList.remove("d-none");

      setTimeout(() => {
        const modalInstance = bootstrap.Modal.getInstance(document.getElementById("reportModal"));
        if (modalInstance) modalInstance.hide();
        reportText.value = "";
        alertBox.classList.add("d-none");
      }, 1500);
    } catch (err) {
      alertBox.className = "alert alert-danger";
      alertBox.textContent = err.message || "Failed to submit progress report.";
      alertBox.classList.remove("d-none");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit report";
    }
  }
};

window.StudentDashboard = StudentDashboard;

document.addEventListener("DOMContentLoaded", () => {
  if (window.location.pathname.includes("student-dashboard.html") || document.getElementById("profileModal")) {
    StudentDashboard.init();
  }
});
