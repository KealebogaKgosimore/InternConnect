/**
 * InternConnect - Authentication & Session Management with Supabase
 */

const AuthManager = {
  async getSession() {
    const client = getSupabase();
    if (!client) return null;
    const { data: { session }, error } = await client.auth.getSession();
    if (error || !session) return null;
    return session;
  },

  async getCurrentUser() {
    const session = await this.getSession();
    return session ? session.user : null;
  },

  async getCurrentProfile() {
    const user = await this.getCurrentUser();
    if (!user) return null;

    const client = getSupabase();
    if (!client) return null;

    const { data, error } = await client
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (error || !data) {
      // Fallback to metadata
      const profileData = {
        id: user.id,
        email: user.email,
        full_name: user.user_metadata?.full_name || "User",
        role: user.user_metadata?.role || "student",
        organisation: user.user_metadata?.organisation || "",
        skills: user.user_metadata?.skills || "",
        programme: user.user_metadata?.programme || ""
      };
      try {
        await client.from("profiles").upsert(profileData);
      } catch (e) {
        console.warn("Auto-upsert profile note:", e);
      }
      return profileData;
    }
    return data;
  },

  async register({ email, password, fullName, role, phone, organisation }) {
    const client = getSupabase();
    if (!client) throw new Error("Supabase is not configured. Please check assets/js/supabase-config.js");

    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          role,
          phone,
          organisation
        }
      }
    });

    if (error) throw error;

    // Ensure profile is immediately available in profiles table (in case trigger is delayed)
    if (data.user) {
      try {
        await client.from("profiles").upsert({
          id: data.user.id,
          email,
          full_name: fullName,
          role,
          phone,
          organisation,
          updated_at: new Date().toISOString()
        });
      } catch (upsertErr) {
        console.warn("Profile handled by database trigger or note:", upsertErr);
      }
    }

    return data;
  },

  async login({ email, password }) {
    const client = getSupabase();
    if (!client) throw new Error("Supabase is not configured. Please check assets/js/supabase-config.js");

    const { data, error } = await client.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    // Fetch user profile to know their role
    const profile = await this.getCurrentProfile();
    return { user: data.user, profile };
  },

  async logout() {
    const client = getSupabase();
    if (client) {
      await client.auth.signOut();
    }
    window.location.href = "login.html";
  },

  /**
   * Route guard to enforce role-based access on dashboards
   */
  async requireAuth(allowedRoles = []) {
    if (!isConfigured()) {
      console.warn("Supabase credentials not yet configured. Operating in preview mode.");
      return null;
    }

    const session = await this.getSession();
    if (!session) {
      window.location.href = `login.html?redirect=${encodeURIComponent(window.location.pathname)}`;
      return null;
    }

    const profile = await this.getCurrentProfile();
    if (!profile) return null;

    if (allowedRoles.length > 0 && !allowedRoles.includes(profile.role)) {
      alert(`Access restricted. Your account role is "${profile.role}". Redirecting to your dashboard.`);
      const redirects = {
        student: "student-dashboard.html",
        company: "company-dashboard.html",
        coordinator: "coordinator-dashboard.html",
        admin: "coordinator-dashboard.html"
      };
      window.location.href = redirects[profile.role] || "index.html";
      return null;
    }

    return profile;
  }
};

window.AuthManager = AuthManager;

// Wire up auth forms when present
document.addEventListener("DOMContentLoaded", () => {
  // Handle Register Form
  const registerForm = document.getElementById("registerForm");
  if (registerForm) {
    const notice = document.getElementById("registerNotice");
    registerForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const fullName = document.getElementById("fullName").value.trim();
      const role = document.getElementById("accountRole").value;
      const email = document.getElementById("regEmail").value.trim();
      const phone = document.getElementById("phone").value.trim();
      const organisation = document.getElementById("organisation").value.trim();
      const password = document.getElementById("regPassword").value;
      const confirm = document.getElementById("confirmPassword").value;

      if (password !== confirm) {
        document.getElementById("confirmPassword").setCustomValidity("Passwords do not match.");
        document.getElementById("confirmPassword").reportValidity();
        return;
      }

      if (!isConfigured()) {
        notice.classList.remove("d-none", "alert-info", "alert-danger");
        notice.classList.add("alert-warning");
        notice.innerHTML = `<strong>Supabase not configured yet:</strong> Please add your project URL and Anon Key in <code>assets/js/supabase-config.js</code>.`;
        return;
      }

      const submitBtn = registerForm.querySelector("button[type='submit']");
      submitBtn.disabled = true;
      submitBtn.textContent = "Creating account...";

      try {
        await AuthManager.register({ email, password, fullName, role, phone, organisation });
        notice.classList.remove("d-none", "alert-warning", "alert-danger");
        notice.classList.add("alert-success");
        notice.innerHTML = `<strong>Account created successfully!</strong> Check your email if verification is required, or <a href="login.html" class="alert-link">log in now</a>.`;
        registerForm.reset();
        setTimeout(() => {
          window.location.href = "login.html";
        }, 1800);
      } catch (err) {
        notice.classList.remove("d-none", "alert-warning", "alert-success");
        notice.classList.add("alert-danger");
        notice.textContent = err.message || "Failed to create account. Please try again.";
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Create account";
      }
    });
  }

  // Handle Login Form
  const loginForm = document.getElementById("loginForm");
  if (loginForm) {
    const notice = document.getElementById("loginNotice");
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const email = document.getElementById("email").value.trim();
      const password = document.getElementById("password").value;
      const selectedRole = document.getElementById("role").value;

      if (!isConfigured()) {
        notice.classList.remove("d-none", "alert-info", "alert-danger");
        notice.classList.add("alert-warning");
        notice.innerHTML = `<strong>Supabase not configured yet:</strong> Set your project credentials in <code>assets/js/supabase-config.js</code> to enable live authentication.`;
        return;
      }

      const submitBtn = loginForm.querySelector("button[type='submit']");
      submitBtn.disabled = true;
      submitBtn.textContent = "Authenticating...";

      try {
        const { profile } = await AuthManager.login({ email, password });
        notice.classList.remove("d-none", "alert-warning", "alert-danger");
        notice.classList.add("alert-success");
        notice.textContent = `Welcome back, ${profile?.full_name || "User"}! Directing to dashboard...`;

        const userRole = profile?.role || selectedRole || "student";
        const destinations = {
          student: "student-dashboard.html",
          company: "company-dashboard.html",
          coordinator: "coordinator-dashboard.html",
          admin: "coordinator-dashboard.html"
        };

        setTimeout(() => {
          window.location.href = destinations[userRole] || "student-dashboard.html";
        }, 900);
      } catch (err) {
        notice.classList.remove("d-none", "alert-warning", "alert-success");
        notice.classList.add("alert-danger");
        notice.textContent = err.message || "Invalid email or password.";
        submitBtn.disabled = false;
        submitBtn.textContent = "Log in";
      }
    });

    // Handle redirect parameter notice on login page
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("redirect")) {
      const notice = document.getElementById("loginNotice");
      if (notice) {
        notice.className = "alert alert-warning";
        notice.textContent = "Please sign in to access your protected dashboard.";
        notice.classList.remove("d-none");
      }
    }
  }

  // Handle Log Out Buttons everywhere
  document.querySelectorAll("[data-action='logout'], a[href='login.html'].btn-outline-primary.btn-sm").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      AuthManager.logout();
    });
  });

  // Sync navigation bar if logged in on public pages
  AuthManager.syncNavbarState();
});

// Update public navigation bar with live user session
AuthManager.syncNavbarState = async function() {
  if (!isConfigured()) return;
  try {
    const profile = await AuthManager.getCurrentProfile();
    if (!profile) return;

    const navList = document.querySelector(".navbar-nav");
    if (!navList) return;

    // Remove old login/register links
    const loginLi = navList.querySelector("a[href='login.html']");
    const regLi = navList.querySelector("a[href='register.html']");
    if (loginLi && loginLi.parentElement) loginLi.parentElement.remove();
    if (regLi && regLi.parentElement) regLi.parentElement.remove();

    const destinations = {
      student: "student-dashboard.html",
      company: "company-dashboard.html",
      coordinator: "coordinator-dashboard.html",
      admin: "coordinator-dashboard.html"
    };

    const targetDashboard = destinations[profile.role] || "student-dashboard.html";
    const displayName = (profile.full_name || "Account").split(" ")[0];

    const userHtml = `
      <li class="nav-item ms-lg-2 dropdown">
        <a class="btn btn-outline-primary px-3 d-flex align-items-center gap-2" href="${targetDashboard}">
          <span>Dashboard (${displayName})</span>
        </a>
      </li>
      <li class="nav-item">
        <button class="btn btn-sm btn-outline-secondary px-3 py-2 ms-lg-1" data-action="logout">Log out</button>
      </li>
    `;

    navList.insertAdjacentHTML("beforeend", userHtml);

    // Wire up new logout button
    const newLogout = navList.querySelector("[data-action='logout']");
    if (newLogout) {
      newLogout.addEventListener("click", (e) => {
        e.preventDefault();
        AuthManager.logout();
      });
    }
  } catch (err) {
    console.debug("Navbar sync error:", err);
  }
};

