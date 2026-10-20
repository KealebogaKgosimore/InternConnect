/**
 * InternConnect - Company Dashboard Logic
 * Handles company vacancies, posting new internships, reviewing applicants,
 * and managing applicant status pipeline.
 */

const CompanyDashboard = {
  profile: null,
  listings: [],
  selectedInternshipId: null,

  async init() {
    this.profile = await AuthManager.requireAuth(["company"]);
    this.renderHeader();
    await this.loadDashboardData();
    this.setupPostForm();
    this.setupReviewModal();
    this.setupRealtime();
  },

  setupRealtime() {
    const client = getSupabase();
    if (!client || !isConfigured() || !this.profile) {
      setRealtimeStatus("companyStatusAlert", "NOT_CONFIGURED");
      return;
    }
    try {
      client
        .channel("company_live_dashboard")
        .on("postgres_changes", { event: "*", schema: "public", table: "applications" }, () => {
          this.loadDashboardData();
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "internships" }, () => {
          this.loadDashboardData();
        })
        .subscribe(status => setRealtimeStatus("companyStatusAlert", status));
    } catch (e) {
      setRealtimeStatus("companyStatusAlert", "ERROR");
      console.error("Company realtime subscription failed:", e);
    }
  },

  renderHeader() {
    if (!this.profile) return;
    const title = document.querySelector("h1.h2");
    if (title) {
      title.textContent = `${this.profile.organisation || this.profile.full_name || "Company"} Dashboard`;
    }
    const alertBox = document.getElementById("companyStatusAlert");
    if (alertBox) {
      alertBox.innerHTML = `
        <span class="badge bg-secondary">● Connecting…</span>
        <span>Signed in as <strong>${this.profile.full_name || "Company Rep"}</strong> (${this.profile.organisation || "Partner Company"}).</span>
      `;
    }
  },

  async loadDashboardData() {
    const client = getSupabase();
    if (!client || !isConfigured()) return;

    try {
      // 1. Fetch internships posted by this company (or all if company_id is null in preview)
      const query = client.from("internships").select("*");
      if (this.profile) {
        query.or(`company_id.eq.${this.profile.id},company_id.is.null`);
      }
      const { data: internships, error: intError } = await query.order("created_at", { ascending: false });

      if (intError) throw intError;
      this.listings = internships || [];

      // 2. Fetch applications for these listings
      const internshipIds = this.listings.map(l => l.id);
      let applications = [];
      if (internshipIds.length > 0) {
        const { data: apps, error: appError } = await client
          .from("applications")
          .select(`
            id,
            internship_id,
            status,
            applied_at,
            cover_note,
            profiles (
              id,
              full_name,
              email,
              phone,
              programme,
              skills,
              cv_url
            )
          `)
          .in("internship_id", internshipIds);

        if (!appError) applications = apps || [];
      }

      this.updateStats(this.listings, applications);
      this.renderListingsTable(this.listings, applications);
    } catch (err) {
      console.warn("Error loading company dashboard data:", err);
    }
  },

  updateStats(listings, applications) {
    const statBoxes = document.querySelectorAll(".dashboard-stat .stat-number");
    if (statBoxes.length >= 4) {
      const activeVacancies = listings.filter(l => l.status === "open").length;
      const totalApps = applications.length;
      const shortlisted = applications.filter(a => a.status === "shortlisted").length;
      const filled = applications.filter(a => a.status === "accepted").length;

      statBoxes[0].textContent = String(activeVacancies).padStart(2, "0");
      statBoxes[1].textContent = String(totalApps).padStart(2, "0");
      statBoxes[2].textContent = String(shortlisted).padStart(2, "0");
      statBoxes[3].textContent = String(filled).padStart(2, "0");
    }
  },

  renderListingsTable(listings, applications) {
    const tableBody = document.querySelector(".table tbody");
    if (!tableBody) return;

    if (listings.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="5" class="text-center py-4 text-secondary">
            No internships posted yet. Click <strong>+ Post an internship</strong> above to get started.
          </td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = listings.map(item => {
      const applicantCount = applications.filter(a => a.internship_id === item.id).length;
      const statusBadge = item.status === "open" 
        ? `<span class="status-badge status-open">Open</span>`
        : `<span class="status-badge status-paused">Paused</span>`;

      return `
        <tr>
          <td class="fw-semibold">${item.title}</td>
          <td>${item.location}</td>
          <td><span class="badge text-bg-light border">${applicantCount} applicants</span></td>
          <td>${statusBadge}</td>
          <td class="text-end">
            <button class="btn btn-sm btn-outline-primary" onclick="CompanyDashboard.openReviewModal('${item.id}', '${item.title}')">
              Review (${applicantCount})
            </button>
          </td>
        </tr>
      `;
    }).join("");
  },

  setupPostForm() {
    const postForm = document.getElementById("postInternshipForm");
    if (!postForm) return;

    postForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      if (!isConfigured()) {
        alert("Supabase credentials needed in assets/js/supabase-config.js to persist new postings.");
        return;
      }

      const title = document.getElementById("jobTitle").value.trim();
      const field = document.getElementById("jobField").value;
      const location = document.getElementById("jobLocation").value.trim();
      const duration = document.getElementById("jobDuration").value.trim();
      const skills = document.getElementById("jobSkills").value.trim();
      const description = document.getElementById("jobDescription").value.trim();

      const submitBtn = postForm.querySelector("button[type='submit']");
      submitBtn.disabled = true;
      submitBtn.textContent = "Publishing...";

      const client = getSupabase();
      try {
        const { error } = await client.from("internships").insert({
          company_id: this.profile?.id || null,
          company_name: this.profile?.organisation || this.profile?.full_name || "Partner Company",
          title,
          field,
          location,
          duration,
          required_skills: skills,
          description,
          status: "open"
        });

        if (error) throw error;

        // Hide modal & reset
        const modalInstance = bootstrap.Modal.getInstance(document.getElementById("postModal"));
        if (modalInstance) modalInstance.hide();
        postForm.reset();

        alert("Internship vacancy published successfully!");
        await this.loadDashboardData();
      } catch (err) {
        alert(err.message || "Failed to post internship.");
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Publish Listing";
      }
    });
  },

  setupReviewModal() {
    if (!document.getElementById("reviewApplicantsModal")) {
      const modalHtml = `
        <div class="modal fade" id="reviewApplicantsModal" tabindex="-1" aria-labelledby="reviewModalLabel" aria-hidden="true">
          <div class="modal-dialog modal-lg modal-dialog-scrollable">
            <div class="modal-content">
              <div class="modal-header">
                <div>
                  <h5 class="modal-title fw-bold" id="reviewModalTitle">Review Applicants</h5>
                  <div class="text-secondary small" id="reviewModalSubtitle"></div>
                </div>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
              </div>
              <div class="modal-body p-0">
                <div id="applicantsListContainer" class="p-3"></div>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
              </div>
            </div>
          </div>
        </div>
      `;
      document.body.insertAdjacentHTML("beforeend", modalHtml);
    }
  },

  async openReviewModal(internshipId, title) {
    this.selectedInternshipId = internshipId;
    document.getElementById("reviewModalTitle").textContent = `Applicants for: ${title}`;
    const container = document.getElementById("applicantsListContainer");
    container.innerHTML = `<div class="text-center py-4 text-secondary">Loading applicants from database...</div>`;

    const modal = new bootstrap.Modal(document.getElementById("reviewApplicantsModal"));
    modal.show();

    const client = getSupabase();
    if (!client || !isConfigured()) {
      container.innerHTML = `<div class="alert alert-info">Supabase not configured. Connect your credentials to view live applicants.</div>`;
      return;
    }

    try {
      const { data: applicants, error } = await client
        .from("applications")
        .select(`
          id,
          status,
          applied_at,
          cover_note,
          profiles:student_id (
            id,
            full_name,
            email,
            phone,
            programme,
            skills,
            cv_url
          )
        `)
        .eq("internship_id", internshipId)
        .order("applied_at", { ascending: false });

      if (error) throw error;

      if (!applicants || applicants.length === 0) {
        container.innerHTML = `<div class="text-center py-4 text-secondary">No candidates have applied for this position yet.</div>`;
        return;
      }

      container.innerHTML = applicants.map(app => {
        const student = app.profiles || {};
        return `
          <div class="card mb-3 border">
            <div class="card-body">
              <div class="d-flex justify-content-between align-items-start mb-2">
                <div>
                  <h6 class="fw-bold mb-1">${student.full_name || "Applicant"}</h6>
                  <div class="text-secondary small">
                    ${student.email || ""} ${student.phone ? '· ' + student.phone : ''}
                  </div>
                  <div class="small mt-1 text-primary"><strong>Programme:</strong> ${student.programme || "Not specified"}</div>
                </div>
                <div class="d-flex align-items-center gap-2">
                  <select class="form-select form-select-sm" onchange="CompanyDashboard.updateApplicantStatus('${app.id}', this.value)">
                    <option value="submitted" ${app.status === 'submitted' ? 'selected' : ''}>Submitted</option>
                    <option value="under_review" ${app.status === 'under_review' ? 'selected' : ''}>Under review</option>
                    <option value="shortlisted" ${app.status === 'shortlisted' ? 'selected' : ''}>Shortlisted</option>
                    <option value="accepted" ${app.status === 'accepted' ? 'selected' : ''}>Accepted</option>
                    <option value="rejected" ${app.status === 'rejected' ? 'selected' : ''}>Rejected</option>
                  </select>
                </div>
              </div>
              <div class="small text-secondary mb-2"><strong>Skills:</strong> ${student.skills || "None listed"}</div>
              ${app.cover_note ? `<div class="p-2 bg-light rounded small mb-2"><em>"${app.cover_note}"</em></div>` : ''}
              <div class="d-flex justify-content-between align-items-center pt-2 border-top">
                <span class="small text-secondary">Applied: ${new Date(app.applied_at).toLocaleDateString()}</span>
                ${student.cv_url ? `<a href="#" data-resume-path="${escapeHtml(student.cv_url)}" class="btn btn-sm btn-outline-success">View Attached CV &rarr;</a>` : '<span class="small text-muted">No CV attached</span>'}
              </div>
            </div>
          </div>
        `;
      }).join("");
    } catch (err) {
      container.innerHTML = `<div class="alert alert-danger">${err.message || "Failed to load applicants."}</div>`;
    }
  },

  async updateApplicantStatus(applicationId, newStatus) {
    const client = getSupabase();
    if (!client) return;

    try {
      const { error } = await client
        .from("applications")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", applicationId);

      if (error) throw error;
      await this.loadDashboardData();
    } catch (err) {
      alert("Failed to update applicant status: " + err.message);
    }
  }
};

window.CompanyDashboard = CompanyDashboard;

document.addEventListener("DOMContentLoaded", () => {
  if (window.location.pathname.includes("company-dashboard.html") || document.getElementById("postInternshipForm")) {
    CompanyDashboard.init();
  }
});
