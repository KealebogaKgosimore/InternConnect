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
    await this.loadPlatformMetrics();
    await this.loadPlacements();
    this.setupActions();
  },

  async loadPlatformMetrics() {
    const client = getSupabase();
    if (!client || !isConfigured()) return;

    try {
      // 1. Students count
      const { count: studentCount } = await client
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("role", "student");

      // 2. Partner companies count
      const { count: companyCount } = await client
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("role", "company");

      // 3. Placed/accepted count
      const { count: placedCount } = await client
        .from("applications")
        .select("*", { count: "exact", head: true })
        .eq("status", "accepted");

      // 4. Pending reports count
      const { count: reportCount } = await client
        .from("progress_reports")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending");

      const statBoxes = document.querySelectorAll(".dashboard-stat .stat-number");
      if (statBoxes.length >= 4) {
        if (studentCount !== null) statBoxes[0].textContent = String(studentCount);
        if (companyCount !== null) statBoxes[1].textContent = String(companyCount);
        if (placedCount !== null) statBoxes[2].textContent = String(placedCount);
        if (reportCount !== null) {
          statBoxes[3].textContent = String(reportCount);
          // Also update badge in action button
          const badge = document.querySelector(".btn-outline-primary .badge");
          if (badge) badge.textContent = String(reportCount);
        }
      }
    } catch (err) {
      console.warn("Metrics load error:", err);
    }
  },

  async loadPlacements() {
    const client = getSupabase();
    if (!client || !isConfigured()) return;

    try {
      const { data, error } = await client
        .from("applications")
        .select(`
          id,
          status,
          applied_at,
          profiles:student_id (
            full_name,
            programme,
            email
          ),
          internships:internship_id (
            title,
            company_name,
            field
          )
        `)
        .order("applied_at", { ascending: false })
        .limit(25);

      if (error) throw error;
      this.placements = data || [];
      this.renderPlacementsTable(this.placements);
    } catch (err) {
      console.warn("Placements table load error:", err);
    }
  },

  renderPlacementsTable(placements) {
    const tableBody = document.querySelector(".table tbody");
    if (!tableBody) return;

    if (placements.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="4" class="text-center py-4 text-secondary">
            No placement applications recorded yet.
          </td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = placements.map(p => {
      const student = p.profiles || {};
      const internship = p.internships || {};
      let badge = `<span class="status-badge status-review">Under review</span>`;
      if (p.status === "accepted") badge = `<span class="status-badge status-open">Placed</span>`;
      if (p.status === "shortlisted") badge = `<span class="status-badge status-shortlist">Shortlisted</span>`;

      return `
        <tr>
          <td class="fw-semibold">${student.full_name || "Student"}</td>
          <td>${student.programme || "Undergraduate"}</td>
          <td>${internship.company_name || "Partner"}</td>
          <td>${badge}</td>
        </tr>
      `;
    }).join("");
  },

  setupActions() {
    // 1. Export Report Button
    const exportBtn = document.querySelector("button[onclick*='report export']");
    if (exportBtn) {
      exportBtn.removeAttribute("onclick");
      exportBtn.addEventListener("click", () => this.exportCSV());
    }

    // 2. Action buttons
    const actionButtons = document.querySelectorAll(".panel-card .d-grid button");
    if (actionButtons.length >= 4) {
      // Review progress reports button
      actionButtons[1].removeAttribute("onclick");
      actionButtons[1].addEventListener("click", () => this.openReportsModal());

      // Generate programme report
      actionButtons[3].removeAttribute("onclick");
      actionButtons[3].addEventListener("click", () => this.exportCSV());
    }

    this.injectReportsModal();
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
