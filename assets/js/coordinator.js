/**
 * InternConnect - University Coordinator Dashboard Logic
 * Provides institutional oversight, placement monitoring, weekly progress report evaluations,
 * and live CSV report generation.
 */

const CoordinatorDashboard = {
  profile: null,
  placements: [],
  reports: [],

  async init() {
    this.profile = await AuthManager.requireAuth(["coordinator", "admin"]);
    this.renderHeader();
    await this.loadPlatformMetrics();
    await this.loadPlacements();
    this.setupActions();
    this.setupRealtime();
  },

  renderHeader() {
    if (!this.profile) return;
    const alertBox = document.getElementById("coordinatorStatusAlert");
    if (alertBox) {
      alertBox.innerHTML = `
        <span class="badge bg-secondary">● Connecting…</span>
        <span>Signed in as Coordinator: <strong>${this.profile.full_name || "Coordinator"}</strong> (${this.profile.organisation || "Institution"}).</span>
      `;
    }
  },

  setupRealtime() {
    const client = getSupabase();
    if (!client || !isConfigured() || !this.profile) {
      setRealtimeStatus("coordinatorStatusAlert", "NOT_CONFIGURED");
      return;
    }
    try {
      client
        .channel("coordinator_live_dashboard")
        .on("postgres_changes", { event: "*", schema: "public", table: "applications" }, () => {
          this.loadPlatformMetrics();
          this.loadPlacements();
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "progress_reports" }, () => {
          this.loadPlatformMetrics();
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => {
          this.loadPlatformMetrics();
        })
        .subscribe(status => setRealtimeStatus("coordinatorStatusAlert", status));
    } catch (e) {
      setRealtimeStatus("coordinatorStatusAlert", "ERROR");
      console.error("Coordinator realtime subscription failed:", e);
    }
  },

  setupActions() {
    // 1. Export Report Buttons
    const exportBtnTop = document.getElementById("btnExportReportTop");
    if (exportBtnTop) exportBtnTop.addEventListener("click", () => this.exportCSV());

    const exportBtnBottom = document.getElementById("btnExportReport");
    if (exportBtnBottom) exportBtnBottom.addEventListener("click", () => this.exportCSV());

    // 2. Review Placements Button
    const reviewPlacementsBtn = document.getElementById("btnReviewPlacements");
    if (reviewPlacementsBtn) reviewPlacementsBtn.addEventListener("click", () => this.openPlacementsModal());

    // 3. Review Reports Button
    const reviewReportsBtn = document.getElementById("btnReviewReports");
    if (reviewReportsBtn) reviewReportsBtn.addEventListener("click", () => this.openReportsModal());

    // 4. View Evaluations Button
    const viewEvalsBtn = document.getElementById("btnViewEvaluations");
    if (viewEvalsBtn) viewEvalsBtn.addEventListener("click", () => this.openEvaluationsModal());

    this.injectReportsModal();
    this.injectPlacementsModal();
    this.injectEvaluationsModal();
  },

  injectPlacementsModal() {
    if (!document.getElementById("coordinatorPlacementsModal")) {
      const modalHtml = `
        <div class="modal fade" id="coordinatorPlacementsModal" tabindex="-1" aria-labelledby="coordPlacLabel" aria-hidden="true">
          <div class="modal-dialog modal-xl modal-dialog-scrollable">
            <div class="modal-content">
              <div class="modal-header">
                <div>
                  <h5 class="modal-title fw-bold" id="coordPlacLabel">All Student Applications & Placements</h5>
                  <div class="text-secondary small">Live Supabase oversight · Update status or verify placements</div>
                </div>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
              </div>
              <div class="modal-body p-0">
                <div id="coordPlacementsListContainer" class="p-3"></div>
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

  async openPlacementsModal() {
    const container = document.getElementById("coordPlacementsListContainer");
    const modal = new bootstrap.Modal(document.getElementById("coordinatorPlacementsModal"));
    modal.show();

    const client = getSupabase();
    if (!client || !isConfigured()) {
      container.innerHTML = `<div class="alert alert-info">Supabase credentials required.</div>`;
      return;
    }

    container.innerHTML = `<div class="text-center py-4 text-secondary"><div class="spinner-border spinner-border-sm me-2"></div>Loading live applications from Supabase...</div>`;

    try {
      const { data: apps, error } = await client
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
          ),
          internships:internship_id (
            id,
            title,
            company_name,
            location,
            field
          )
        `)
        .order("applied_at", { ascending: false });

      if (error) throw error;

      if (!apps || apps.length === 0) {
        container.innerHTML = `<div class="text-center py-4 text-secondary">No applications in the system yet. Once students apply, they appear here.</div>`;
        return;
      }

      container.innerHTML = `
        <div class="table-responsive">
          <table class="table align-middle">
            <thead>
              <tr>
                <th>Student</th>
                <th>Programme</th>
                <th>Position & Company</th>
                <th>Applied</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${apps.map(a => {
                const student = a.profiles || {};
                const internship = a.internships || {};
                return `
                  <tr>
                    <td>
                      <div class="fw-semibold">${student.full_name || "Student"}</div>
                      <small class="text-secondary">${student.email || ""}</small>
                    </td>
                    <td><small>${student.programme || "Undergraduate"}</small></td>
                    <td>
                      <div class="fw-semibold">${internship.title || "Internship"}</div>
                      <small class="text-secondary">${internship.company_name || ""} (${internship.location || ""})</small>
                    </td>
                    <td><small class="text-secondary">${new Date(a.applied_at).toLocaleDateString()}</small></td>
                    <td>
                      <select class="form-select form-select-sm" onchange="CoordinatorDashboard.updateApplicationStatus('${a.id}', this.value)">
                        <option value="submitted" ${a.status === 'submitted' ? 'selected' : ''}>Submitted</option>
                        <option value="under_review" ${a.status === 'under_review' ? 'selected' : ''}>Under review</option>
                        <option value="shortlisted" ${a.status === 'shortlisted' ? 'selected' : ''}>Shortlisted</option>
                        <option value="accepted" ${a.status === 'accepted' ? 'selected' : ''}>Accepted (Placed)</option>
                        <option value="rejected" ${a.status === 'rejected' ? 'selected' : ''}>Rejected</option>
                      </select>
                    </td>
                    <td>
                      ${student.cv_url ? `<a href="#" data-resume-path="${escapeHtml(student.cv_url)}" class="btn btn-sm btn-outline-success">View CV</a>` : `<span class="small text-muted">No CV</span>`}
                    </td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        </div>
      `;
    } catch (err) {
      container.innerHTML = `<div class="alert alert-danger">${err.message || "Failed to load placements."}</div>`;
    }
  },

  async updateApplicationStatus(appId, newStatus) {
    const client = getSupabase();
    if (!client) return;
    try {
      const { error } = await client
        .from("applications")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", appId);
      if (error) throw error;
      await this.loadPlatformMetrics();
      await this.loadPlacements();
    } catch (err) {
      alert("Error updating application status: " + err.message);
    }
  },

  injectEvaluationsModal() {
    if (!document.getElementById("coordinatorEvalsModal")) {
      const modalHtml = `
        <div class="modal fade" id="coordinatorEvalsModal" tabindex="-1" aria-labelledby="coordEvalLabel" aria-hidden="true">
          <div class="modal-dialog modal-lg modal-dialog-scrollable">
            <div class="modal-content">
              <div class="modal-header">
                <div>
                  <h5 class="modal-title fw-bold" id="coordEvalLabel">Student & Placement Evaluations</h5>
                  <div class="text-secondary small">Performance feedback and placement ratings</div>
                </div>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
              </div>
              <div class="modal-body">
                <div id="coordEvalsListContainer">Loading live evaluations from Supabase...</div>
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

  async openEvaluationsModal() {
    const container = document.getElementById("coordEvalsListContainer");
    const modal = new bootstrap.Modal(document.getElementById("coordinatorEvalsModal"));
    modal.show();

    const client = getSupabase();
    if (!client || !isConfigured()) {
      container.innerHTML = `<div class="alert alert-info">Supabase credentials required.</div>`;
      return;
    }

    try {
      const { data: evals, error } = await client
        .from("evaluations")
        .select(`
          id,
          rating,
          feedback,
          created_at,
          student:student_id (
            full_name,
            programme,
            email
          ),
          internship:internship_id (
            title,
            company_name
          )
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;

      if (!evals || evals.length === 0) {
        container.innerHTML = `
          <div class="text-center py-4 text-secondary">
            No formal evaluations submitted yet. Company mentors and coordinators can submit midterm and final evaluations.
          </div>
        `;
        return;
      }

      container.innerHTML = evals.map(ev => {
        const student = ev.student || {};
        const internship = ev.internship || {};
        const stars = "★".repeat(ev.rating || 5) + "☆".repeat(Math.max(0, 5 - (ev.rating || 5)));
        return `
          <div class="card mb-3 border">
            <div class="card-body">
              <div class="d-flex justify-content-between align-items-center mb-2">
                <div>
                  <h6 class="fw-bold mb-0">${student.full_name || "Student"}</h6>
                  <small class="text-secondary">${internship.title || "Internship"} at ${internship.company_name || "Company"}</small>
                </div>
                <div class="text-warning fs-5" title="Rating: ${ev.rating || 5}/5">${stars}</div>
              </div>
              <p class="text-secondary small mb-2">${ev.feedback || "Satisfactory internship performance."}</p>
              <div class="small text-muted">Submitted: ${new Date(ev.created_at).toLocaleDateString()}</div>
            </div>
          </div>
        `;
      }).join("");
    } catch (err) {
      container.innerHTML = `<div class="alert alert-danger">${err.message || "Failed to load evaluations."}</div>`;
    }
  },

  injectReportsModal() {
    if (!document.getElementById("coordinatorReportsModal")) {
      const modalHtml = `
        <div class="modal fade" id="coordinatorReportsModal" tabindex="-1" aria-labelledby="coordRepLabel" aria-hidden="true">
          <div class="modal-dialog modal-lg modal-dialog-scrollable">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title fw-bold" id="coordRepLabel">Review Weekly Progress Reports</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
              </div>
              <div class="modal-body">
                <div id="coordReportsListContainer">Loading student progress reports...</div>
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

  async openReportsModal() {
    const container = document.getElementById("coordReportsListContainer");
    const modal = new bootstrap.Modal(document.getElementById("coordinatorReportsModal"));
    modal.show();

    const client = getSupabase();
    if (!client || !isConfigured()) {
      container.innerHTML = `<div class="alert alert-info">Supabase credentials required to load progress reports.</div>`;
      return;
    }

    try {
      const { data: reports, error } = await client
        .from("progress_reports")
        .select(`
          id,
          week_number,
          report_text,
          status,
          coordinator_feedback,
          submitted_at,
          profiles:student_id (
            full_name,
            programme,
            email
          )
        `)
        .order("submitted_at", { ascending: false });

      if (error) throw error;

      if (!reports || reports.length === 0) {
        container.innerHTML = `<div class="text-center py-4 text-secondary">No weekly progress reports submitted yet.</div>`;
        return;
      }

      container.innerHTML = reports.map(rep => {
        const student = rep.profiles || {};
        return `
          <div class="card mb-3 border">
            <div class="card-body">
              <div class="d-flex justify-content-between align-items-center mb-2">
                <div>
                  <h6 class="fw-bold mb-0">${student.full_name || "Student"} - Week ${rep.week_number}</h6>
                  <small class="text-secondary">${student.programme || ""} (${student.email || ""})</small>
                </div>
                <span class="badge ${rep.status === 'reviewed' ? 'text-bg-success' : 'text-bg-warning'}">
                  ${rep.status === 'reviewed' ? 'Reviewed' : 'Awaiting Review'}
                </span>
              </div>
              <div class="p-3 bg-light rounded my-2" style="white-space:pre-wrap;">${rep.report_text}</div>
              <div class="mt-3">
                <label class="form-label small fw-semibold">Coordinator Feedback</label>
                <div class="input-group">
                  <input type="text" id="feedback-${rep.id}" class="form-control form-control-sm" placeholder="Provide feedback or notes to student..." value="${rep.coordinator_feedback || ''}">
                  <button class="btn btn-sm btn-primary" onclick="CoordinatorDashboard.submitFeedback('${rep.id}')">Submit & Approve</button>
                </div>
              </div>
            </div>
          </div>
        `;
      }).join("");
    } catch (err) {
      container.innerHTML = `<div class="alert alert-danger">${err.message || "Failed to load reports."}</div>`;
    }
  },

  async submitFeedback(reportId) {
    const feedbackInput = document.getElementById(`feedback-${reportId}`);
    const feedback = feedbackInput?.value.trim() || "Approved by coordinator.";
    const client = getSupabase();
    if (!client) return;

    try {
      const { error } = await client
        .from("progress_reports")
        .update({
          coordinator_feedback: feedback,
          status: "reviewed",
          reviewed_at: new Date().toISOString()
        })
        .eq("id", reportId);

      if (error) throw error;
      alert("Feedback saved and report marked as reviewed!");
      await this.loadPlatformMetrics();
      this.openReportsModal();
    } catch (err) {
      alert("Error saving feedback: " + err.message);
    }
  },

  exportCSV() {
    if (!this.placements || this.placements.length === 0) {
      alert("No placement data available to export.");
      return;
    }

    const headers = ["Student Name", "Email", "Academic Programme", "Organisation", "Internship Title", "Field", "Status", "Applied Date"];
    const rows = this.placements.map(p => {
      const student = p.profiles || {};
      const internship = p.internships || {};
      return [
        `"${(student.full_name || '').replace(/"/g, '""')}"`,
        `"${(student.email || '').replace(/"/g, '""')}"`,
        `"${(student.programme || '').replace(/"/g, '""')}"`,
        `"${(internship.company_name || '').replace(/"/g, '""')}"`,
        `"${(internship.title || '').replace(/"/g, '""')}"`,
        `"${(internship.field || '').replace(/"/g, '""')}"`,
        `"${p.status}"`,
        `"${new Date(p.applied_at).toLocaleDateString()}"`
      ];
    });

    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const today = new Date().toISOString().split("T")[0];
    link.setAttribute("href", url);
    link.setAttribute("download", `InternConnect_Programme_Placements_${today}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};

window.CoordinatorDashboard = CoordinatorDashboard;

document.addEventListener("DOMContentLoaded", () => {
  if (window.location.pathname.includes("coordinator-dashboard.html")) {
    CoordinatorDashboard.init();
  }
});
