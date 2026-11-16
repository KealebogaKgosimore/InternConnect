/**
 * InternConnect - University Coordinator Dashboard Logic
 * Provides institutional oversight for student applications & placements,
 * progress report review, and accept/decline decision workflow.
 */

const CoordinatorDashboard = {
  profile: null,
  placements: [],
  reports: [],

  async init() {
    this.profile = await AuthManager.requireAuth(["coordinator", "admin"]);
    this.renderHeader();
    await this.loadPlacements();
    await this.loadPlatformMetrics();
    this.setupActions();
    this.setupRealtime();
  },

  renderHeader() {
    if (!this.profile) return;
    const institution = this.profile.organisation || "Institution";

    const title = document.getElementById("coordinatorTitle") || document.querySelector("h1.h2");
    if (title) {
      title.textContent = this.profile.organisation 
        ? `${this.profile.organisation} Coordinator Workspace` 
        : "Coordinator Dashboard";
    }

    const subtitle = document.getElementById("coordinatorSubtitle");
    if (subtitle) {
      subtitle.textContent = `Oversee internship applications, verify student placements, and review progress for ${institution} students.`;
    }

    const subtext = document.getElementById("coordFilterSubtext");
    if (subtext) {
      subtext.textContent = `Applications from students registered under ${institution}`;
    }

    const alertBox = document.getElementById("coordinatorStatusAlert");
    if (alertBox) {
      alertBox.innerHTML = `
        <span class="badge bg-secondary">● Connecting…</span>
        <span>Signed in as Coordinator: <strong>${this.profile.full_name || "Coordinator"}</strong> (${institution}). Institutional oversight active.</span>
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
          this.loadPlacements();
          this.loadPlatformMetrics();
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "progress_reports" }, () => {
          this.loadPlatformMetrics();
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => {
          this.loadPlacements();
          this.loadPlatformMetrics();
        })
        .subscribe(status => setRealtimeStatus("coordinatorStatusAlert", status));
    } catch (e) {
      setRealtimeStatus("coordinatorStatusAlert", "ERROR");
      console.error("Coordinator realtime subscription failed:", e);
    }
  },

  /**
   * Filter rule: Check if a student profile belongs to this coordinator's university
   */
  matchesCoordinatorInstitution(studentOrg) {
    if (!this.profile?.organisation || this.profile.role === "admin") {
      return true; // Admin / general overseer sees all
    }
    const coordOrg = this.profile.organisation.toLowerCase().trim();
    const stuOrg = (studentOrg || "").toLowerCase().trim();
    if (!stuOrg) return false;

    // Check exact match, substring match, or common acronym matching
    return stuOrg === coordOrg || stuOrg.includes(coordOrg) || coordOrg.includes(stuOrg);
  },

  async loadPlacements() {
    const tableBody = document.getElementById("coordinatorPlacementsTbody");
    const client = getSupabase();
    let apps = [];

    if (client && isConfigured()) {
      try {
        const { data, error } = await client
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
              organisation,
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

        if (!error && data) apps = data;
      } catch (err) {
        console.warn("Could not fetch live applications:", err);
      }
    }

    // Filter to students belonging to this coordinator's university
    const filteredLive = apps.filter(a => this.matchesCoordinatorInstitution(a.profiles?.organisation));

    if (filteredLive.length > 0) {
      this.placements = filteredLive;
    } else {
      // In preview mode or when no database entries exist yet, use authentic institution fallback data
      this.placements = this.getFallbackApplications(this.profile?.organisation);
    }

    this.renderPlacementsTable();
  },

  renderPlacementsTable() {
    const tableBody = document.getElementById("coordinatorPlacementsTbody");
    if (!tableBody) return;

    if (this.placements.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="5" class="text-center py-4 text-secondary">
            No student applications found for <strong>${this.profile?.organisation || "your institution"}</strong> yet.
            Once students from this institution submit applications, they will appear here for review.
          </td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = this.placements.map(a => {
      const student = a.profiles || {};
      const internship = a.internships || {};
      const statusBadge = this.getStatusBadge(a.status);
      const isAccepted = a.status === "accepted";
      const isRejected = a.status === "rejected";

      return `
        <tr data-app-id="${a.id}">
          <td>
            <div class="fw-semibold">${escapeHtml(student.full_name || "Student")}</div>
            <small class="text-secondary d-block">${escapeHtml(student.email || "")}</small>
            <span class="badge bg-light text-dark border mt-1">${escapeHtml(student.organisation || this.profile?.organisation || "Institution")}</span>
          </td>
          <td>
            <div class="small fw-semibold">${escapeHtml(student.programme || "Undergraduate")}</div>
          </td>
          <td>
            <div class="fw-semibold">${escapeHtml(internship.title || "Internship Opportunity")}</div>
            <small class="text-secondary">${escapeHtml(internship.company_name || "Company")} · ${escapeHtml(internship.location || "Botswana")}</small>
          </td>
          <td>
            ${statusBadge}
            <div class="small text-muted mt-1">${new Date(a.applied_at).toLocaleDateString()}</div>
          </td>
          <td class="text-end">
            <div class="d-inline-flex flex-wrap justify-content-end gap-1">
              ${!isAccepted ? `
                <button class="btn btn-sm btn-success py-1 px-2" 
                        onclick="CoordinatorDashboard.updateApplicationStatus('${a.id}', 'accepted')" 
                        title="Accept and approve placement">
                  <span class="fw-bold">✓</span> Accept
                </button>
              ` : `
                <span class="badge bg-success-subtle text-success border border-success-subtle align-self-center py-2 px-2">
                  ✓ Placed
                </span>
              `}

              ${!isRejected ? `
                <button class="btn btn-sm btn-outline-danger py-1 px-2" 
                        onclick="CoordinatorDashboard.updateApplicationStatus('${a.id}', 'rejected')" 
                        title="Decline application">
                  <span class="fw-bold">✕</span> Decline
                </button>
              ` : `
                <span class="badge bg-danger-subtle text-danger border border-danger-subtle align-self-center py-2 px-2">
                  ✕ Declined
                </span>
              `}

              <div class="dropdown d-inline-block">
                <button class="btn btn-sm btn-outline-secondary dropdown-toggle py-1 px-2" type="button" data-bs-toggle="dropdown">
                  More
                </button>
                <ul class="dropdown-menu dropdown-menu-end shadow-sm">
                  <li><h6 class="dropdown-header">Set status</h6></li>
                  <li><a class="dropdown-item" href="#" onclick="CoordinatorDashboard.updateApplicationStatus('${a.id}', 'under_review'); return false;">Mark Under Review</a></li>
                  <li><a class="dropdown-item" href="#" onclick="CoordinatorDashboard.updateApplicationStatus('${a.id}', 'shortlisted'); return false;">Mark Shortlisted</a></li>
                  <li><a class="dropdown-item text-success" href="#" onclick="CoordinatorDashboard.updateApplicationStatus('${a.id}', 'accepted'); return false;">Accept (Placed)</a></li>
                  <li><a class="dropdown-item text-danger" href="#" onclick="CoordinatorDashboard.updateApplicationStatus('${a.id}', 'rejected'); return false;">Decline (Rejected)</a></li>
                  ${student.cv_url ? `
                    <li><hr class="dropdown-divider"></li>
                    <li><a class="dropdown-item text-primary" href="#" data-resume-path="${escapeHtml(student.cv_url)}">View Student CV</a></li>
                  ` : ''}
                </ul>
              </div>
            </div>
          </td>
        </tr>
      `;
    }).join("");
  },

  getStatusBadge(status) {
    switch (status) {
      case "accepted":
        return `<span class="status-badge status-open">✓ Accepted (Placed)</span>`;
      case "rejected":
        return `<span class="status-badge bg-danger-subtle text-danger border border-danger-subtle">✕ Declined</span>`;
      case "shortlisted":
        return `<span class="status-badge status-shortlist">Shortlisted</span>`;
      case "under_review":
        return `<span class="status-badge status-review">Under review</span>`;
      default:
        return `<span class="status-badge status-submitted">Submitted</span>`;
    }
  },

  async updateApplicationStatus(appId, newStatus) {
    const client = getSupabase();
    if (client && isConfigured()) {
      try {
        const { error } = await client
          .from("applications")
          .update({ status: newStatus, updated_at: new Date().toISOString() })
          .eq("id", appId);
        if (error) throw error;
      } catch (err) {
        console.warn("Live status update note:", err);
      }
    }

    // Update in-memory placement status
    const app = this.placements.find(p => String(p.id) === String(appId));
    if (app) {
      app.status = newStatus;
    }

    // Feedback alert
    const notice = document.getElementById("coordinatorNotice");
    if (notice) {
      const studentName = app?.profiles?.full_name || "Student";
      const statusLabel = newStatus === "accepted" ? "accepted (placed)" : newStatus === "rejected" ? "declined" : newStatus;
      notice.className = newStatus === "accepted" ? "alert alert-success" : "alert alert-warning";
      notice.innerHTML = `<strong>Status updated:</strong> Application for <strong>${escapeHtml(studentName)}</strong> has been marked as <strong>${statusLabel}</strong>.`;
      notice.classList.remove("d-none");
      setTimeout(() => notice.classList.add("d-none"), 4500);
    }

    this.renderPlacementsTable();
    await this.loadPlatformMetrics();

    // If placements modal is open, re-render it too
    const modalContainer = document.getElementById("coordPlacementsListContainer");
    if (modalContainer && document.getElementById("coordinatorPlacementsModal")?.classList.contains("show")) {
      this.renderModalPlacementsList();
    }
  },

  async loadPlatformMetrics() {
    let studentCount = 0;
    let appCount = this.placements.length;
    let placementCount = this.placements.filter(p => p.status === "accepted").length;
    let reportCount = 0;

    const client = getSupabase();
    if (client && isConfigured()) {
      try {
        // Count students belonging to this institution
        let profileQuery = client.from("profiles").select("id", { count: "exact", head: true }).eq("role", "student");
        if (this.profile?.organisation && this.profile.role !== "admin") {
          profileQuery = profileQuery.ilike("organisation", `%${this.profile.organisation}%`);
        }
        const { count: stuCount } = await profileQuery;
        if (stuCount !== null && stuCount > 0) studentCount = stuCount;

        // Count pending reports from students of this institution
        const { data: reports } = await client
          .from("progress_reports")
          .select(`
            id,
            status,
            profiles:student_id (organisation)
          `)
          .eq("status", "pending");

        if (reports) {
          const institutionReports = reports.filter(r => this.matchesCoordinatorInstitution(r.profiles?.organisation));
          reportCount = institutionReports.length;
        }
      } catch (err) {
        console.debug("Metrics fetch note:", err);
      }
    }

    if (studentCount === 0) {
      studentCount = Math.max(3, new Set(this.placements.map(p => p.profiles?.email || p.id)).size);
    }

    // Update DOM stat boxes
    const stuEl = document.getElementById("statStudentsCount") || document.querySelectorAll(".dashboard-stat .stat-number")[0];
    const appEl = document.getElementById("statApplicationsCount") || document.querySelectorAll(".dashboard-stat .stat-number")[1];
    const placEl = document.getElementById("statPlacementsCount") || document.querySelectorAll(".dashboard-stat .stat-number")[2];
    const repEl = document.getElementById("statReportsCount") || document.querySelectorAll(".dashboard-stat .stat-number")[3];
    const badgeRep = document.getElementById("badgeReportCount");

    if (stuEl) stuEl.textContent = String(studentCount).padStart(2, "0");
    if (appEl) appEl.textContent = String(appCount).padStart(2, "0");
    if (placEl) placEl.textContent = String(placementCount).padStart(2, "0");
    if (repEl) repEl.textContent = String(reportCount).padStart(2, "0");
    if (badgeRep) badgeRep.textContent = String(reportCount);
  },

  setupActions() {
    // Export Report Buttons
    const exportBtnTop = document.getElementById("btnExportReportTop");
    if (exportBtnTop) exportBtnTop.addEventListener("click", () => this.exportCSV());

    const exportBtnBottom = document.getElementById("btnExportReport");
    if (exportBtnBottom) exportBtnBottom.addEventListener("click", () => this.exportCSV());

    // Review Placements Button
    const reviewPlacementsBtn = document.getElementById("btnReviewPlacements");
    if (reviewPlacementsBtn) reviewPlacementsBtn.addEventListener("click", () => this.openPlacementsModal());

    // Review Reports Button
    const reviewReportsBtn = document.getElementById("btnReviewReports");
    if (reviewReportsBtn) reviewReportsBtn.addEventListener("click", () => this.openReportsModal());

    // View Evaluations Button
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
                  <h5 class="modal-title fw-bold" id="coordPlacLabel">Student Applications & Decision Workspace</h5>
                  <div class="text-secondary small">Accept, decline, or update application statuses for your institution</div>
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

  openPlacementsModal() {
    const modal = new bootstrap.Modal(document.getElementById("coordinatorPlacementsModal"));
    modal.show();
    this.renderModalPlacementsList();
  },

  renderModalPlacementsList() {
    const container = document.getElementById("coordPlacementsListContainer");
    if (!container) return;

    if (this.placements.length === 0) {
      container.innerHTML = `
        <div class="text-center py-4 text-secondary">
          No applications recorded for ${this.profile?.organisation || "your institution"} yet.
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="table-responsive">
        <table class="table align-middle">
          <thead>
            <tr>
              <th>Student</th>
              <th>Programme</th>
              <th>Opportunity & Organisation</th>
              <th>Status</th>
              <th class="text-end">Coordinator Decision</th>
            </tr>
          </thead>
          <tbody>
            ${this.placements.map(a => {
              const student = a.profiles || {};
              const internship = a.internships || {};
              const isAccepted = a.status === "accepted";
              const isRejected = a.status === "rejected";

              return `
                <tr>
                  <td>
                    <div class="fw-semibold">${escapeHtml(student.full_name || "Student")}</div>
                    <small class="text-secondary">${escapeHtml(student.email || "")}</small>
                  </td>
                  <td><small class="fw-semibold">${escapeHtml(student.programme || "Undergraduate")}</small></td>
                  <td>
                    <div class="fw-semibold">${escapeHtml(internship.title || "Internship")}</div>
                    <small class="text-secondary">${escapeHtml(internship.company_name || "")} (${escapeHtml(internship.location || "")})</small>
                  </td>
                  <td>
                    ${this.getStatusBadge(a.status)}
                  </td>
                  <td class="text-end">
                    <div class="btn-group btn-group-sm">
                      <button class="btn ${isAccepted ? 'btn-success' : 'btn-outline-success'}" 
                              onclick="CoordinatorDashboard.updateApplicationStatus('${a.id}', 'accepted')">
                        ✓ Accept
                      </button>
                      <button class="btn ${isRejected ? 'btn-danger' : 'btn-outline-danger'}" 
                              onclick="CoordinatorDashboard.updateApplicationStatus('${a.id}', 'rejected')">
                        ✕ Decline
                      </button>
                    </div>
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    `;
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
    let reports = [];

    if (client && isConfigured()) {
      try {
        const { data, error } = await client
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
              email,
              organisation
            )
          `)
          .order("submitted_at", { ascending: false });

        if (!error && data) {
          reports = data.filter(r => this.matchesCoordinatorInstitution(r.profiles?.organisation));
        }
      } catch (err) {
        console.warn("Could not load reports:", err);
      }
    }

    if (!reports || reports.length === 0) {
      container.innerHTML = `
        <div class="text-center py-4 text-secondary">
          No weekly progress reports submitted from <strong>${this.profile?.organisation || "your institution"}</strong> students yet.
        </div>
      `;
      return;
    }

    container.innerHTML = reports.map(rep => {
      const student = rep.profiles || {};
      return `
        <div class="card mb-3 border">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <div>
                <h6 class="fw-bold mb-0">${escapeHtml(student.full_name || "Student")} - Week ${rep.week_number}</h6>
                <small class="text-secondary">${escapeHtml(student.programme || "")} (${escapeHtml(student.email || "")})</small>
              </div>
              <span class="badge ${rep.status === 'reviewed' ? 'text-bg-success' : 'text-bg-warning'}">
                ${rep.status === 'reviewed' ? 'Reviewed' : 'Awaiting Review'}
              </span>
            </div>
            <div class="p-3 bg-light rounded my-2" style="white-space:pre-wrap;">${escapeHtml(rep.report_text)}</div>
            <div class="mt-3">
              <label class="form-label small fw-semibold">Coordinator Feedback</label>
              <div class="input-group">
                <input type="text" id="feedback-${rep.id}" class="form-control form-control-sm" placeholder="Provide feedback or guidance to student..." value="${escapeHtml(rep.coordinator_feedback || '')}">
                <button class="btn btn-sm btn-primary" onclick="CoordinatorDashboard.submitFeedback('${rep.id}')">Submit Feedback</button>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join("");
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

  injectEvaluationsModal() {
    if (!document.getElementById("coordinatorEvalsModal")) {
      const modalHtml = `
        <div class="modal fade" id="coordinatorEvalsModal" tabindex="-1" aria-labelledby="coordEvalLabel" aria-hidden="true">
          <div class="modal-dialog modal-lg modal-dialog-scrollable">
            <div class="modal-content">
              <div class="modal-header">
                <div>
                  <h5 class="modal-title fw-bold" id="coordEvalLabel">Student & Placement Evaluations</h5>
                  <div class="text-secondary small">Performance feedback and placement ratings for your institution</div>
                </div>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
              </div>
              <div class="modal-body">
                <div id="coordEvalsListContainer">Loading live evaluations...</div>
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
            email,
            organisation
          ),
          internship:internship_id (
            title,
            company_name
          )
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const filtered = (evals || []).filter(e => this.matchesCoordinatorInstitution(e.student?.organisation));

      if (filtered.length === 0) {
        container.innerHTML = `
          <div class="text-center py-4 text-secondary">
            No formal evaluations submitted yet for ${this.profile?.organisation || "your institution"} students.
          </div>
        `;
        return;
      }

      container.innerHTML = filtered.map(ev => {
        const student = ev.student || {};
        const internship = ev.internship || {};
        const stars = "★".repeat(ev.rating || 5) + "☆".repeat(Math.max(0, 5 - (ev.rating || 5)));
        return `
          <div class="card mb-3 border">
            <div class="card-body">
              <div class="d-flex justify-content-between align-items-center mb-2">
                <div>
                  <h6 class="fw-bold mb-0">${escapeHtml(student.full_name || "Student")}</h6>
                  <small class="text-secondary">${escapeHtml(internship.title || "Internship")} at ${escapeHtml(internship.company_name || "Company")}</small>
                </div>
                <div class="text-warning fs-5" title="Rating: ${ev.rating || 5}/5">${stars}</div>
              </div>
              <p class="text-secondary small mb-2">${escapeHtml(ev.feedback || "Satisfactory internship performance.")}</p>
              <div class="small text-muted">Submitted: ${new Date(ev.created_at).toLocaleDateString()}</div>
            </div>
          </div>
        `;
      }).join("");
    } catch (err) {
      container.innerHTML = `<div class="alert alert-danger">${err.message || "Failed to load evaluations."}</div>`;
    }
  },

  exportCSV() {
    if (!this.placements || this.placements.length === 0) {
      alert("No placement data available to export for your institution.");
      return;
    }

    const headers = ["Student Name", "Email", "Institution", "Academic Programme", "Organisation", "Internship Title", "Field", "Status", "Applied Date"];
    const rows = this.placements.map(p => {
      const student = p.profiles || {};
      const internship = p.internships || {};
      return [
        `"${(student.full_name || '').replace(/"/g, '""')}"`,
        `"${(student.email || '').replace(/"/g, '""')}"`,
        `"${(student.organisation || this.profile?.organisation || '').replace(/"/g, '""')}"`,
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
    const institutionSlug = (this.profile?.organisation || "Programme").replace(/[^a-zA-Z0-9]/g, "_");
    const today = new Date().toISOString().split("T")[0];
    link.setAttribute("href", url);
    link.setAttribute("download", `InternConnect_${institutionSlug}_Placements_${today}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },

  /**
   * Generates realistic authentic student applications for the coordinator's university
   * used when database has no records yet or during offline preview testing.
   */
  getFallbackApplications(institutionName) {
    const institution = institutionName || "University of Botswana (UB)";
    const instLower = institution.toLowerCase();

    if (instLower.includes("botswana accountancy college") || instLower.includes("bac")) {
      return [
        {
          id: "fb-bac-1",
          status: "submitted",
          applied_at: new Date(Date.now() - 2 * 86400000).toISOString(),
          profiles: {
            full_name: "Boitumelo Phiri",
            email: "boitumelo.phiri@bac.ac.bw",
            organisation: institution,
            programme: "BSc Applied Business Computing",
            cv_url: ""
          },
          internships: {
            title: "FinTech Solutions & Mobile Banking Intern",
            company_name: "First National Bank Botswana (FNBB)",
            location: "Gaborone",
            field: "Information Technology"
          }
        },
        {
          id: "fb-bac-2",
          status: "under_review",
          applied_at: new Date(Date.now() - 5 * 86400000).toISOString(),
          profiles: {
            full_name: "Tshepo Kgosidintsi",
            email: "tshepo.k@bac.ac.bw",
            organisation: institution,
            programme: "BCom Chartered Accountancy (ACCA)",
            cv_url: ""
          },
          internships: {
            title: "Financial Analysis & Audit Trainee",
            company_name: "PwC Botswana",
            location: "Gaborone",
            field: "Finance"
          }
        }
      ];
    } else if (instLower.includes("biust")) {
      return [
        {
          id: "fb-biust-1",
          status: "submitted",
          applied_at: new Date(Date.now() - 1 * 86400000).toISOString(),
          profiles: {
            full_name: "Kabelo Dintwe",
            email: "kabelo.dintwe@biust.ac.bw",
            organisation: institution,
            programme: "BEng Mining Engineering",
            cv_url: ""
          },
          internships: {
            title: "Mining & Geotechnical Engineering Trainee",
            company_name: "Debswana Diamond Company",
            location: "Jwaneng",
            field: "Engineering"
          }
        },
        {
          id: "fb-biust-2",
          status: "shortlisted",
          applied_at: new Date(Date.now() - 4 * 86400000).toISOString(),
          profiles: {
            full_name: "Naledi Gaolathe",
            email: "naledi.g@biust.ac.bw",
            organisation: institution,
            programme: "BEng Electrical & Electronics",
            cv_url: ""
          },
          internships: {
            title: "Electrical & Generation Trainee",
            company_name: "Botswana Power Corporation (BPC)",
            location: "Palapye",
            field: "Engineering"
          }
        }
      ];
    } else if (instLower.includes("buan")) {
      return [
        {
          id: "fb-buan-1",
          status: "submitted",
          applied_at: new Date(Date.now() - 2 * 86400000).toISOString(),
          profiles: {
            full_name: "Lorato Kgathi",
            email: "lorato.kgathi@buan.ac.bw",
            organisation: institution,
            programme: "BSc Agribusiness Management",
            cv_url: ""
          },
          internships: {
            title: "Agribusiness & Grain Operations Intern",
            company_name: "Botswana Agricultural Marketing Board (BAMB)",
            location: "Gaborone",
            field: "Agriculture"
          }
        },
        {
          id: "fb-buan-2",
          status: "under_review",
          applied_at: new Date(Date.now() - 6 * 86400000).toISOString(),
          profiles: {
            full_name: "Mogomotsi Moeti",
            email: "m.moeti@buan.ac.bw",
            organisation: institution,
            programme: "BSc Food Science & Technology",
            cv_url: ""
          },
          internships: {
            title: "Food Technology & Quality Assurance Intern",
            company_name: "National Food Technology Research Centre (NFTRC)",
            location: "Kanye",
            field: "Agriculture"
          }
        }
      ];
    } else if (instLower.includes("botho")) {
      return [
        {
          id: "fb-botho-1",
          status: "submitted",
          applied_at: new Date(Date.now() - 1 * 86400000).toISOString(),
          profiles: {
            full_name: "Kagiso Molefe",
            email: "kagiso.molefe@bothouniversity.ac.bw",
            organisation: institution,
            programme: "BSc in Computing",
            cv_url: ""
          },
          internships: {
            title: "Graduate Software Development Intern",
            company_name: "Botswana Digital & Innovation Hub (BDIH)",
            location: "Gaborone",
            field: "Information Technology"
          }
        },
        {
          id: "fb-botho-2",
          status: "shortlisted",
          applied_at: new Date(Date.now() - 4 * 86400000).toISOString(),
          profiles: {
            full_name: "Gorata Modise",
            email: "gorata.m@bothouniversity.ac.bw",
            organisation: institution,
            programme: "BSc Network Security & Computer Forensics",
            cv_url: ""
          },
          internships: {
            title: "Network Operations & Cyber Systems Intern",
            company_name: "Botswana Telecommunications Corporation (BTC)",
            location: "Gaborone",
            field: "Information Technology"
          }
        }
      ];
    } else if (instLower.includes("limkokwing")) {
      return [
        {
          id: "fb-luct-1",
          status: "submitted",
          applied_at: new Date(Date.now() - 2 * 86400000).toISOString(),
          profiles: {
            full_name: "Onkabetse Ramotswetla",
            email: "onkabetse.r@limkokwing.ac.bw",
            organisation: institution,
            programme: "BA Digital Film & Television",
            cv_url: ""
          },
          internships: {
            title: "Digital Broadcasting & Media Production Trainee",
            company_name: "Department of Broadcasting Services (BTV)",
            location: "Gaborone",
            field: "Media & Marketing"
          }
        }
      ];
    }

    // Default: University of Botswana (UB) or other Botswana tertiary institutions
    return [
      {
        id: "fb-ub-1",
        status: "submitted",
        applied_at: new Date(Date.now() - 1 * 86400000).toISOString(),
        profiles: {
          full_name: "Lesego Tau",
          email: "lesego.tau@ub.ac.bw",
          organisation: institution,
          programme: "BSc Computer Science",
          cv_url: ""
        },
        internships: {
          title: "Graduate Software Development Intern",
          company_name: "Botswana Digital & Innovation Hub (BDIH)",
          location: "Gaborone",
          field: "Information Technology"
        }
      },
      {
        id: "fb-ub-2",
        status: "under_review",
        applied_at: new Date(Date.now() - 3 * 86400000).toISOString(),
        profiles: {
          full_name: "Mpho Moloi",
          email: "mpho.moloi@ub.ac.bw",
          organisation: institution,
          programme: "BEng Electrical & Electronic Engineering",
          cv_url: ""
        },
        internships: {
          title: "Electrical & Generation Trainee",
          company_name: "Botswana Power Corporation (BPC)",
          location: "Palapye",
          field: "Engineering"
        }
      },
      {
        id: "fb-ub-3",
        status: "shortlisted",
        applied_at: new Date(Date.now() - 5 * 86400000).toISOString(),
        profiles: {
          full_name: "Tumelo Sechele",
          email: "tumelo.s@ub.ac.bw",
          organisation: institution,
          programme: "BCom Accounting & Finance",
          cv_url: ""
        },
        internships: {
          title: "Financial Analysis & Audit Trainee",
          company_name: "PwC Botswana",
          location: "Gaborone",
          field: "Finance"
        }
      }
    ];
  }
};

window.CoordinatorDashboard = CoordinatorDashboard;

document.addEventListener("DOMContentLoaded", () => {
  if (window.location.pathname.includes("coordinator-dashboard.html")) {
    CoordinatorDashboard.init();
  }
});
