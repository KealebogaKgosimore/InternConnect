/**
 * InternConnect - Supabase Configuration & Client Initialization
 * 
 * Replace YOUR_SUPABASE_URL and YOUR_SUPABASE_ANON_KEY with your project credentials
 * from: Supabase Dashboard -> Project Settings -> API
 */

const SUPABASE_CONFIG = {
  url: "https://pwrofmwdjgyebldrxfew.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB3cm9mbXdkamd5ZWJsZHJ4ZmV3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE4Njk2MzMsImV4cCI6MjEwNzQ0NTYzM30.gkwazm5vlBaF4OWr-6UpeHE_AEvHF_HhHi9enjSVfaI"
};

// Global Supabase client instance
let _supabase = null;

function isConfigured() {
  return (
    SUPABASE_CONFIG.url &&
    SUPABASE_CONFIG.anonKey &&
    !SUPABASE_CONFIG.url.includes("YOUR_PROJECT_ID") &&
    !SUPABASE_CONFIG.anonKey.includes("YOUR_SUPABASE_ANON_KEY")
  );
}

function getSupabase() {
  if (!_supabase) {
    if (!window.supabase) {
      console.error("Supabase JS library not loaded. Ensure the CDN script is included.");
      return null;
    }
    _supabase = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
  }
  return _supabase;
}

// Display a helpful config notice if credentials are not yet pasted
function showConfigBannerIfNeeded() {
  if (isConfigured()) return;

  const existing = document.getElementById("supabase-config-notice");
  if (existing) return;

  const notice = document.createElement("div");
  notice.id = "supabase-config-notice";
  notice.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    max-width: 420px;
    z-index: 9999;
    background: #17233d;
    color: #fff;
    padding: 18px 22px;
    border-radius: 14px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.25);
    font-size: 0.88rem;
    line-height: 1.5;
    border-left: 4px solid #3157d5;
  `;
  notice.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:8px;">
      <strong style="color:#6aa2ff; font-size:0.95rem;">Supabase Connection</strong>
      <button onclick="this.parentElement.parentElement.remove()" style="background:none; border:none; color:#889bb8; cursor:pointer; font-size:1.1rem; line-height:1;">&times;</button>
    </div>
    <p style="margin:0 0 8px 0; color:#d1dbee;">
      Ready to connect! Update your <code>url</code> and <code>anonKey</code> in <code>assets/js/supabase-config.js</code> to link live data.
    </p>
    <small style="color:#889bb8;">Found in: Supabase Dashboard &rarr; Project Settings &rarr; API</small>
  `;
  document.body.appendChild(notice);
}

document.addEventListener("DOMContentLoaded", () => {
  showConfigBannerIfNeeded();
});
