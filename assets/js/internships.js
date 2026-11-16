/**
 * InternConnect - Live Internship Directory & Applications
 * Connects to Supabase internships table, applies search/filters, computes match scores,
 * and handles student application submissions.
 */

const InternshipService = {
  currentStudentProfile: null,
  allInternships: [],

  // Initial mock listings fallback if Supabase is offline or not configured yet
  fallbackListings: [
    {
      id: "bw-1",
      title: "Graduate Software Development Intern",
      company_name: "Botswana Digital & Innovation Hub (BDIH)",
      field: "Information Technology",
      location: "Gaborone",
      duration: "6 months",
      required_skills: "Java, Python, SQL, Web Development, JavaScript, Git",
      description: "Work at the Science and Technology Park supporting national digital transformation projects, civic tech web platforms, and REST API development for Botswana innovators.",
      status: "open",
      created_at: new Date(Date.now() - 1 * 86400000).toISOString()
    },
    {
      id: "bw-2",
      title: "Mining & Geotechnical Engineering Trainee",
      company_name: "Debswana Diamond Company",
      field: "Engineering",
      location: "Jwaneng",
      duration: "6 months",
      required_skills: "Mining Engineering, AutoCAD, Rock Mechanics, Safety Compliance, Data Analysis",
      description: "Join the Jwaneng Mine open-pit and cut-9 geotechnical team. Assist with slope stability monitoring, blast fragmentation analysis, and mine planning documentation.",
      status: "open",
      created_at: new Date(Date.now() - 2 * 86400000).toISOString()
    },
    {
      id: "bw-3",
      title: "Financial Analysis & Audit Trainee",
      company_name: "PricewaterhouseCoopers (PwC Botswana)",
      field: "Finance",
      location: "Gaborone",
      duration: "6 months",
      required_skills: "Excel, Financial Reporting, Auditing, IFRS, Accounting, Analytical Thinking",
      description: "Assist statutory audit teams in testing financial internal controls, verifying balance sheet reconciliations, and preparing client working papers in line with IFRS.",
      status: "open",
      created_at: new Date(Date.now() - 3 * 86400000).toISOString()
    },
    {
      id: "bw-4",
      title: "Network Operations & Cyber Systems Intern",
      company_name: "Botswana Telecommunications Corporation (BTC)",
      field: "Information Technology",
      location: "Gaborone",
      duration: "6 months",
      required_skills: "Networking, Cisco, Linux, Network Security, Troubleshooting, TCP/IP",
      description: "Support BTC's Network Operations Centre (NOC). Assist in monitoring national optical fibre backbones, router configurations, subscriber IP assignments, and telemetry.",
      status: "open",
      created_at: new Date(Date.now() - 4 * 86400000).toISOString()
    },
    {
      id: "bw-5",
      title: "Agribusiness & Grain Operations Intern",
      company_name: "Botswana Agricultural Marketing Board (BAMB)",
      field: "Agriculture",
      location: "Gaborone",
      duration: "6 months",
      required_skills: "Agribusiness, Crop Science, Inventory Management, Quality Inspection, Supply Chain",
      description: "Assist in the procurement, grade certification, and strategic silo storage management for domestic sorghum, maize, and pulse crops across BAMB national depots.",
      status: "open",
      created_at: new Date(Date.now() - 5 * 86400000).toISOString()
    },
    {
      id: "bw-6",
      title: "Electrical & Generation Trainee",
      company_name: "Botswana Power Corporation (BPC)",
      field: "Engineering",
      location: "Palapye",
      duration: "6 months",
      required_skills: "Electrical Engineering, High Voltage, PLC, Power Systems, CAD, Maintenance",
      description: "Stationed near the Morupule power generation hub. Assist transmission engineers with substation inspections, switchgear testing, and SCADA monitoring protocols.",
      status: "open",
      created_at: new Date(Date.now() - 5 * 86400000).toISOString()
    },
    {
      id: "bw-7",
      title: "Food Technology & Quality Assurance Intern",
      company_name: "National Food Technology Research Centre (NFTRC)",
      field: "Agriculture",
      location: "Kanye",
      duration: "6 months",
      required_skills: "Food Science, Microbiology, Laboratory Testing, HACCP, Food Safety, Chemistry",
      description: "Conduct laboratory analyses on indigenous food formulations, nutritional profiling, post-harvest processing, and food hygiene quality standards compliance.",
      status: "open",
      created_at: new Date(Date.now() - 6 * 86400000).toISOString()
    },
    {
      id: "bw-8",
      title: "Biomedical Laboratory Research Intern",
      company_name: "Botswana Harvard Health Partnership (BHP)",
      field: "Health Sciences",
      location: "Gaborone",
      duration: "6 months",
      required_skills: "Laboratory Techniques, PCR, Biomedical Sciences, Biosafety, Data Recording",
      description: "Support research laboratory teams based at Princess Marina Hospital conducting genomic diagnostics, clinical trial sample processing, and epidemiological data entry.",
      status: "open",
      created_at: new Date(Date.now() - 7 * 86400000).toISOString()
    },
    {
      id: "bw-9",
      title: "FinTech Solutions & Mobile Banking Intern",
      company_name: "First National Bank Botswana (FNBB)",
      field: "Information Technology",
      location: "Gaborone",
      duration: "6 months",
      required_skills: "SQL, Python, FinTech, API Integrations, Mobile Apps, Cybersecurity, Problem Solving",
      description: "Collaborate with FNBB's Digital Innovation wing on cardless payment channels, e-Wallet services enhancements, fraud transaction pattern detection, and merchant integrations.",
      status: "open",
      created_at: new Date(Date.now() - 7 * 86400000).toISOString()
    },
    {
      id: "bw-10",
      title: "Civil & Hydraulics Infrastructure Intern",
      company_name: "Water Utilities Corporation (WUC)",
      field: "Engineering",
      location: "Francistown",
      duration: "6 months",
      required_skills: "Civil Engineering, Hydraulics, GIS, AutoCAD, Pipeline Design, Water Quality",
      description: "Assist civil engineers overseeing northern water network expansion, reservoir pump stations, leak detection telemetry, and rural reticulation upgrades.",
      status: "open",
      created_at: new Date(Date.now() - 8 * 86400000).toISOString()
    },
    {
      id: "bw-11",
      title: "Digital Broadcasting & Media Production Trainee",
      company_name: "Department of Broadcasting Services (BTV)",
      field: "Media & Marketing",
      location: "Gaborone",
      duration: "4 months",
      required_skills: "Video Editing, Camera Operation, Audio Production, Adobe Premiere, Graphic Design, Storytelling",
      description: "Work hands-on within BTV newsrooms and recording studios, aiding camera operators, video montage editors, and broadcast sound technicians on daily live programming.",
      status: "open",
      created_at: new Date(Date.now() - 9 * 86400000).toISOString()
    },
    {
      id: "bw-12",
      title: "Eco-Tourism & Wildlife Research Intern",
      company_name: "Botswana Tourism Organisation (BTO)",
      field: "Environmental & Tourism",
      location: "Maun",
      duration: "6 months",
      required_skills: "Tourism Management, Environmental Science, GIS, Research, Hospitality, Wildlife Conservation",
      description: "Based in the Okavango Delta tourism gateway. Participate in eco-accreditation audits, wildlife concession mapping, and destination marketing data collation.",
      status: "open",
      created_at: new Date(Date.now() - 10 * 86400000).toISOString()
    },
    {
      id: "bw-13",
      title: "Economic Research & Monetary Policy Intern",
      company_name: "Bank of Botswana (BoB)",
      field: "Finance",
      location: "Gaborone",
      duration: "6 months",
      required_skills: "Economics, Econometrics, Financial Modelling, Statistics, Excel, Research",
      description: "Assist the Research and Financial Stability department in collecting macro-economic indicators, inflation forecasting data, and banking sector balance sheet statistics.",
      status: "open",
      created_at: new Date(Date.now() - 11 * 86400000).toISOString()
    },
    {
      id: "bw-14",
      title: "Telecommunications & Digital Marketing Intern",
      company_name: "Mascom Wireless",
      field: "Media & Marketing",
      location: "Gaborone",
      duration: "4 months",
      required_skills: "Digital Marketing, Social Media Analytics, Content Creation, Graphic Design, Copywriting",
      description: "Assist Mascom's marketing and communications unit with youth consumer campaign rollouts, digital subscriber engagement analysis, and brand collateral preparation.",
      status: "open",
      created_at: new Date(Date.now() - 12 * 86400000).toISOString()
    },
    {
      id: "bw-15",
      title: "Mineral Processing & Metallurgical Trainee",
      company_name: "Khoemacau Copper Mining",
      field: "Engineering",
      location: "Maun",
      duration: "6 months",
      required_skills: "Metallurgy, Mineral Processing, Chemical Analysis, Plant Operations, Safety",
      description: "Work at the Zone 5 processing facility near Toteng assisting plant metallurgists with flotation circuit sampling, copper-silver concentrate recovery, and assay testing.",
      status: "open",
      created_at: new Date(Date.now() - 13 * 86400000).toISOString()
    },
    {
      id: "bw-16",
      title: "Health Informatics & Hospital Systems Trainee",
      company_name: "Sir Ketumile Masire Teaching Hospital (SKMTH)",
      field: "Health Sciences",
      location: "Gaborone",
      duration: "6 months",
      required_skills: "Health Informatics, Data Management, Medical Records, Confidentiality, Hospital Systems",
      description: "Support clinical documentation workflows, digital patient management systems, and medical registry reporting at the national quaternary referral hospital.",
      status: "open",
      created_at: new Date(Date.now() - 14 * 86400000).toISOString()
    }
  ],

  appliedInternshipIds: new Map(),

  async init() {
    // Check if user is logged in to compute real personal match scores and check applied status
    if (window.AuthManager) {
      try {
        this.currentStudentProfile = await AuthManager.getCurrentProfile();
        if (this.currentStudentProfile && this.currentStudentProfile.role === "student") {
          await this.fetchUserApplications();
        }
      } catch (e) {
        console.warn("Could not retrieve student profile for matching:", e);
      }
    }

    await this.fetchInternships();
    this.setupFilters();
    this.setupApplyModal();
    this.setupRealtime();
  },

  async fetchUserApplications() {
    const client = getSupabase();
    if (!client || !this.currentStudentProfile) return;
    try {
      const { data, error } = await client
        .from("applications")
        .select("internship_id, status")
        .eq("student_id", this.currentStudentProfile.id);
      if (!error && data) {
        this.appliedInternshipIds = new Map(data.map(a => [a.internship_id, a.status]));
      }
    } catch (e) {
      console.debug("User applications load note:", e);
    }
  },

  setupRealtime() {
    const client = getSupabase();
    if (!client || !isConfigured()) return;
    try {
      client
        .channel("public:internships_live")
        .on("postgres_changes", { event: "*", schema: "public", table: "internships" }, () => {
          this.fetchInternships();
        })
        .subscribe();
    } catch (e) {
      console.debug("Realtime note:", e);
    }
  },

  async fetchInternships() {
    const client = getSupabase();
    if (client && isConfigured()) {
      try {
        const { data, error } = await client
          .from("internships")
          .select("*")
          .eq("status", "open")
          .order("created_at", { ascending: false });

        if (!error && data && data.length > 0) {
          // Deduplicate by title + company_name if duplicate seeds exist
          const seen = new Set();
          this.allInternships = data.filter(item => {
            const key = `${(item.title || "").trim().toLowerCase()}-${(item.company_name || "").trim().toLowerCase()}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        } else {
          this.allInternships = this.fallbackListings;
        }
      } catch (err) {
        console.warn("Error fetching internships from Supabase:", err);
        this.allInternships = this.fallbackListings;
      }
    } else {
      this.allInternships = this.fallbackListings;
    }

    this.renderInternships(this.allInternships);
  },

  renderInternships(items) {
    const listContainer = document.getElementById("internshipList");
    const countElement = document.getElementById("resultCount");
    const emptyState = document.getElementById("emptyState");

    if (!listContainer) return;

    if (items.length === 0) {
      listContainer.innerHTML = "";
      if (emptyState) emptyState.classList.remove("d-none");
      if (countElement) countElement.textContent = "Showing 0 opportunities";
      return;
    }

    if (emptyState) emptyState.classList.add("d-none");
    if (countElement) {
      countElement.textContent = `Showing ${items.length} ${items.length === 1 ? "opportunity" : "opportunities"}`;
    }

    listContainer.innerHTML = items.map(item => {
      const skillsArray = SkillMatcher.parseSkills(item.required_skills);
      
      // Calculate real match score if profile exists
      let matchInfo = null;
      if (this.currentStudentProfile && this.currentStudentProfile.role === "student") {
        matchInfo = SkillMatcher.calculateMatch(
          this.currentStudentProfile.skills || "",
          item.required_skills,
          this.currentStudentProfile.programme || "",
          item.field || ""
        );
      }

      const avatarLetter = (item.company_name || "I")[0].toUpperCase();
      const avatarColors = ["", "avatar-green", "avatar-orange", "avatar-purple"];
      const colorClass = avatarColors[Math.abs(item.title.length) % avatarColors.length];

      const appliedStatus = this.appliedInternshipIds.get(item.id);

      return `
        <div class="col-lg-6 internship-item" data-id="${item.id}" data-field="${item.field}" data-location="${item.location}">
          <div class="listing-card h-100 d-flex flex-column justify-content-between">
            <div>
              <div class="d-flex gap-3">
                <div class="company-avatar ${colorClass}">${avatarLetter}</div>
                <div class="flex-grow-1">
                  <div class="d-flex justify-content-between align-items-center gap-2">
                    <span class="badge text-bg-success-subtle">Open</span>
                    ${matchInfo ? `<span class="badge rounded-pill text-bg-primary" title="${matchInfo.matchedSkills.length} skills matched">⚡ ${matchInfo.score}% match</span>` : `<span class="small text-secondary">${item.duration || "Active"}</span>`}
                  </div>
                  <h5 class="fw-bold mt-2 mb-1">${item.title}</h5>
                  <div class="text-secondary small">${item.company_name} · ${item.location}</div>
                </div>
              </div>
              <p class="text-secondary mt-3 mb-3">${item.description}</p>
              <div class="d-flex flex-wrap gap-2 mb-3">
                ${skillsArray.slice(0, 5).map(s => `<span class="skill-pill">${s}</span>`).join("")}
              </div>
            </div>
            <div class="d-flex justify-content-between align-items-center border-top pt-3 mt-2">
              <span class="small text-secondary">${item.duration} · ${item.field}</span>
              ${appliedStatus 
                ? `<span class="badge bg-success-subtle text-success border border-success-subtle py-2 px-3">✓ Applied (${appliedStatus.replace('_', ' ')})</span>`
                : `<button class="btn btn-outline-primary btn-sm view-apply-btn" onclick="InternshipService.openApplyModal('${item.id}')">
                    View & apply
                   </button>`
              }
            </div>
          </div>
        </div>
      `;
    }).join("");
  },

  setupFilters() {
    const filterForm = document.getElementById("filterForm");
    const searchInput = document.getElementById("searchInput");
    const fieldFilter = document.getElementById("fieldFilter");
    const locationFilter = document.getElementById("locationFilter");
    const clearBtn = document.getElementById("clearFilters");
    const sortSelect = document.querySelector(".sort-select");

    const apply = (e) => {
      if (e) e.preventDefault();
      const term = (searchInput?.value || "").trim().toLowerCase();
      const field = fieldFilter?.value || "";
      const loc = locationFilter?.value || "";

      let filtered = this.allInternships.filter(item => {
        const fullSearchable = `${item.title} ${item.company_name} ${item.field} ${item.location} ${item.required_skills} ${item.description}`.toLowerCase();
        const matchesTerm = !term || fullSearchable.includes(term);
        const itemField = (item.field || "").toLowerCase();
        const filterField = field.toLowerCase();
        const matchesField = !field || itemField === filterField || itemField.includes(filterField) || filterField.includes(itemField);
        const matchesLoc = !loc || item.location.toLowerCase().includes(loc.toLowerCase());
        return matchesTerm && matchesField && matchesLoc;
      });

      // Sorting
      if (sortSelect) {
        if (sortSelect.value === "Newest first") {
          filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        } else if (sortSelect.value === "Most relevant" && this.currentStudentProfile) {
          filtered.sort((a, b) => {
            const scoreA = SkillMatcher.calculateMatch(this.currentStudentProfile.skills, a.required_skills).score;
            const scoreB = SkillMatcher.calculateMatch(this.currentStudentProfile.skills, b.required_skills).score;
            return scoreB - scoreA;
          });
        }
      }

      this.renderInternships(filtered);
    };

    if (filterForm) filterForm.addEventListener("submit", apply);
    [searchInput, fieldFilter, locationFilter].forEach(el => el?.addEventListener("input", apply));
    if (sortSelect) sortSelect.addEventListener("change", apply);

    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        if (searchInput) searchInput.value = "";
        if (fieldFilter) fieldFilter.value = "";
        if (locationFilter) locationFilter.value = "";
        apply();
      });
    }
  },

  setupApplyModal() {
    // Create application modal if not exists
    if (!document.getElementById("applyModal")) {
      const modalHtml = `
        <div class="modal fade" id="applyModal" tabindex="-1" aria-labelledby="applyModalLabel" aria-hidden="true">
          <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable">
            <div class="modal-content">
              <div class="modal-header">
                <div>
                  <h5 class="modal-title fw-bold" id="applyModalTitle">Apply for Internship</h5>
                  <div class="text-secondary small" id="applyModalCompany">Company</div>
                </div>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
              </div>
              <div class="modal-body">
                <div id="applyModalMatch" class="p-3 mb-3 rounded" style="background:#f4f7ff;"></div>
                <div class="mb-3">
                  <label for="coverNote" class="form-label">Cover Note / Introduction</label>
                  <textarea id="coverNote" class="form-control" rows="4" placeholder="Briefly explain your interest and relevant experience..."></textarea>
                </div>
                <div id="applyResumeNotice" class="small text-secondary mb-3">
                  Your registered profile skills and academic details will be attached to this application.
                </div>
                <div id="applyModalAlert" class="alert d-none"></div>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>
                <button type="button" class="btn btn-primary" id="confirmApplyBtn">Submit Application</button>
              </div>
            </div>
          </div>
        </div>
      `;
      document.body.insertAdjacentHTML("beforeend", modalHtml);
    }
  },

  async openApplyModal(internshipId) {
    const item = this.allInternships.find(i => String(i.id) === String(internshipId));
    if (!item) return;

    const modalTitle = document.getElementById("applyModalTitle");
    const modalCompany = document.getElementById("applyModalCompany");
    const modalMatch = document.getElementById("applyModalMatch");
    const alertBox = document.getElementById("applyModalAlert");
    const confirmBtn = document.getElementById("confirmApplyBtn");
    const coverNote = document.getElementById("coverNote");

    if (alertBox) alertBox.classList.add("d-none");
    if (coverNote) coverNote.value = "";

    modalTitle.textContent = item.title;
    modalCompany.textContent = `${item.company_name} · ${item.location} · ${item.duration}`;

    // Compute match overview
    if (this.currentStudentProfile && this.currentStudentProfile.role === "student") {
      const match = SkillMatcher.calculateMatch(
        this.currentStudentProfile.skills || "",
        item.required_skills,
        this.currentStudentProfile.programme || "",
        item.field || ""
      );

      modalMatch.innerHTML = `
        <div class="d-flex justify-content-between align-items-center mb-1">
          <span class="fw-semibold">Your Match Score:</span>
          <span class="badge bg-primary fs-6">${match.score}%</span>
        </div>
        <div class="small text-secondary">
          <strong>Matched skills:</strong> ${match.matchedSkills.length > 0 ? match.matchedSkills.join(", ") : "None yet"}<br>
          ${match.missingSkills.length > 0 ? `<strong>Good to add:</strong> ${match.missingSkills.slice(0, 3).join(", ")}` : ""}
        </div>
      `;
    } else {
      modalMatch.innerHTML = `
        <div class="small text-secondary">
          <strong>Required skills:</strong> ${item.required_skills}
        </div>
      `;
    }

    confirmBtn.onclick = () => this.submitApplication(item.id);

    const modalEl = document.getElementById("applyModal");
    const modal = new bootstrap.Modal(modalEl);
    modal.show();
  },

  async submitApplication(internshipId) {
    const alertBox = document.getElementById("applyModalAlert");
    const confirmBtn = document.getElementById("confirmApplyBtn");
    const coverNote = document.getElementById("coverNote")?.value || "";

    if (!isConfigured()) {
      alertBox.className = "alert alert-warning";
      alertBox.textContent = "Supabase is not configured yet. Add credentials to assets/js/supabase-config.js to persist applications.";
      alertBox.classList.remove("d-none");
      return;
    }

    const client = getSupabase();
    const user = await AuthManager.getCurrentUser();

    if (!user) {
      alertBox.className = "alert alert-warning";
      alertBox.innerHTML = `Please <a href="login.html" class="alert-link">log in as a student</a> to submit your application.`;
      alertBox.classList.remove("d-none");
      return;
    }

    confirmBtn.disabled = true;
    confirmBtn.textContent = "Submitting...";

    try {
      const { data, error } = await client
        .from("applications")
        .insert({
          internship_id: internshipId,
          student_id: user.id,
          cover_note: coverNote,
          status: "submitted"
        });

      if (error) {
        if (error.code === "23505" || error.message.includes("unique")) {
          throw new Error("You have already applied for this internship position.");
        }
        throw error;
      }

      this.appliedInternshipIds.set(internshipId, "submitted");
      this.renderInternships(this.allInternships);

      alertBox.className = "alert alert-success";
      alertBox.textContent = "Application submitted successfully! Track your status on the Student Dashboard.";
      alertBox.classList.remove("d-none");

      setTimeout(() => {
        const modal = bootstrap.Modal.getInstance(document.getElementById("applyModal"));
        if (modal) modal.hide();
      }, 1500);
    } catch (err) {
      alertBox.className = "alert alert-danger";
      alertBox.textContent = err.message || "Failed to submit application.";
      alertBox.classList.remove("d-none");
    } finally {
      confirmBtn.disabled = false;
      confirmBtn.textContent = "Submit Application";
    }
  }
};

window.InternshipService = InternshipService;

document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("internshipList")) {
    InternshipService.init();
  }
});
