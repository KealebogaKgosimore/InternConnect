document.addEventListener("DOMContentLoaded", () => {
  const filterForm = document.getElementById("filterForm");
  if (filterForm) {
    const searchInput = document.getElementById("searchInput");
    const fieldFilter = document.getElementById("fieldFilter");
    const locationFilter = document.getElementById("locationFilter");
    const cards = Array.from(document.querySelectorAll(".internship-item"));
    const resultCount = document.getElementById("resultCount");
    const emptyState = document.getElementById("emptyState");
    const applyFilters = (event) => {
      if (event) event.preventDefault();
      const term = searchInput.value.trim().toLowerCase();
      const field = fieldFilter.value;
      const location = locationFilter.value;
      let visible = 0;
      cards.forEach(card => {
        const searchable = (card.dataset.search + " " + card.textContent).toLowerCase();
        const matches = (!term || searchable.includes(term)) &&
          (!field || card.dataset.field === field) &&
          (!location || card.dataset.location === location);
        card.classList.toggle("d-none", !matches);
        if (matches) visible++;
      });
      resultCount.textContent = `Showing ${visible} example ${visible === 1 ? "opportunity" : "opportunities"}`;
      emptyState.classList.toggle("d-none", visible !== 0);
    };
    filterForm.addEventListener("submit", applyFilters);
    [searchInput, fieldFilter, locationFilter].forEach(el => el.addEventListener("input", applyFilters));
    document.getElementById("clearFilters").addEventListener("click", () => {
      searchInput.value = ""; fieldFilter.value = ""; locationFilter.value = ""; applyFilters();
    });
  }

  const loginForm = document.getElementById("loginForm");
  if (loginForm) {
    const params = new URLSearchParams(window.location.search);
    const requestedRole = params.get("role");
    if (requestedRole) document.getElementById("role").value = requestedRole;
    loginForm.addEventListener("submit", event => {
      event.preventDefault();
      const role = document.getElementById("role").value;
      document.getElementById("loginNotice").classList.remove("d-none");
      const destinations = {
        student: "student-dashboard.html",
        company: "company-dashboard.html",
        coordinator: "coordinator-dashboard.html",
        admin: "coordinator-dashboard.html"
      };
      const notice = document.getElementById("loginNotice");
      notice.innerHTML = `Demo mode: opening the sample ${role} dashboard. No credentials are checked or stored.`;
      window.setTimeout(() => { window.location.href = destinations[role] || "index.html"; }, 900);
    });
  }

  const registerForm = document.getElementById("registerForm");
  if (registerForm) {
    const params = new URLSearchParams(window.location.search);
    if (params.get("role")) document.getElementById("accountRole").value = params.get("role");
    registerForm.addEventListener("submit", event => {
      event.preventDefault();
      const password = document.getElementById("regPassword").value;
      const confirm = document.getElementById("confirmPassword").value;
      if (password !== confirm) {
        document.getElementById("confirmPassword").setCustomValidity("Passwords do not match.");
        document.getElementById("confirmPassword").reportValidity();
        document.getElementById("confirmPassword").addEventListener("input", () => document.getElementById("confirmPassword").setCustomValidity(""), { once: true });
        return;
      }
      document.getElementById("registerNotice").classList.remove("d-none");
      document.getElementById("registerNotice").textContent = "Demo only: your form passed front-end validation. No account was created or data saved.";
      document.getElementById("registerNotice").scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  const postForm = document.getElementById("postInternshipForm");
  if (postForm) postForm.addEventListener("submit", event => {
    event.preventDefault();
    alert("Demo only: the form passed front-end validation. No internship listing was saved.");
    const modal = bootstrap.Modal.getInstance(document.getElementById("postModal"));
    if (modal) modal.hide();
    postForm.reset();
  });
});