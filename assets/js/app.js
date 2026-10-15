/**
 * InternConnect - Home Page & Live Platform Utilities
 * Connects the public landing page to live Supabase data for featured opportunities
 * and live opportunity counts.
 */

document.addEventListener("DOMContentLoaded", async () => {
  if (document.querySelector(".hero-section")) {
    await loadHomeLiveData();
  }
});

async function loadHomeLiveData() {
  if (typeof isConfigured !== "function" || !isConfigured()) return;
  const client = typeof getSupabase === "function" ? getSupabase() : null;
  if (!client) return;

  try {
    // 1. Fetch the latest live internship opportunity for the hero card
    const { data: latestOpps, error } = await client
      .from("internships")
      .select("*")
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(1);

    if (!error && latestOpps && latestOpps.length > 0) {
      const opp = latestOpps[0];
      const card = document.querySelector(".opportunity-card");
      if (card) {
        const titleEl = card.querySelector("h5");
        const companyEl = card.querySelector(".fw-semibold");
        const locEl = card.querySelector(".small.text-secondary");
        const skillsContainer = card.querySelector(".d-flex.flex-wrap.gap-2");
        const avatarEl = card.querySelector(".company-avatar");
        const noteEl = card.querySelector(".small.text-secondary.text-center");

        if (titleEl) titleEl.textContent = opp.title;
        if (companyEl) companyEl.textContent = opp.company_name;
        if (locEl) locEl.textContent = `${opp.location} · ${opp.duration}`;
        if (avatarEl) avatarEl.textContent = (opp.company_name || "I")[0].toUpperCase();
        if (noteEl) {
          noteEl.innerHTML = `<span class="badge bg-success-subtle text-success border border-success-subtle me-1">● Live</span> Latest opportunity from Supabase`;
        }

        // Display skills
        if (skillsContainer && opp.required_skills && window.SkillMatcher) {
          const skills = SkillMatcher.parseSkills(opp.required_skills);
          skillsContainer.innerHTML = skills.slice(0, 4).map(s => `<span class="skill-pill">${s}</span>`).join("");
        }

        // If a student is logged in, compute real match percentage
        if (window.AuthManager) {
          try {
            const profile = await AuthManager.getCurrentProfile();
            if (profile && profile.role === "student" && window.SkillMatcher) {
              const match = SkillMatcher.calculateMatch(
                profile.skills || "",
                opp.required_skills,
                profile.programme || "",
                opp.field || ""
              );
              const meterStrong = card.querySelector(".match-meter strong");
              const progBar = card.querySelector(".progress-bar");
              if (meterStrong) meterStrong.textContent = `${match.score}%`;
              if (progBar) progBar.style.width = `${match.score}%`;
            }
          } catch (e) {
            console.debug("Home profile match note:", e);
          }
        }
      }
    }

    // 2. Update button with live opportunities count
    const { count: liveCount } = await client
      .from("internships")
      .select("id", { count: "exact", head: true })
      .eq("status", "open");

    if (liveCount !== null && liveCount > 0) {
      const exploreBtn = document.querySelector(".hero-section .btn-outline-dark");
      if (exploreBtn) {
        exploreBtn.textContent = `Explore ${liveCount} internships`;
      }
    }
  } catch (err) {
    console.debug("loadHomeLiveData note:", err);
  }
}

window.loadHomeLiveData = loadHomeLiveData;