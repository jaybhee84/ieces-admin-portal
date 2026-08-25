import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import iecesLogo from "../image/ieceslogo.png";
import "./LoginPage.css";

export default function LoginPage({ onLoginSuccess }) {
  const [view, setView] = useState("login"); // 'login' | 'register'
  const [appVersion, setAppVersion] = useState("");

  useEffect(() => {
    // Read app version via Electron preload bridge
    if (window?.ipc?.getVersion) {
      window.ipc.getVersion().then(setAppVersion).catch(() => {});
    }
  }, []);

  return (
    <div className="login-root">
      {/* Left panel — branding */}
      <div className="login-left">
        <div className="login-brand">
          {/* Logo with Glow & Pulsing Rings */}
          <div className="login-seal-wrapper">
            <div className="pulse-ring ring-1" />
            <div className="pulse-ring ring-2" />
            <div className="pulse-ring ring-3" />
            <div className="login-seal">
              <img src={iecesLogo} alt="IECES Logo" />
            </div>
          </div>

          <h1 className="login-school">
            Isabela East Central Elementary School
          </h1>
          <p className="login-sub">Division of Isabela City</p>

          <p className="login-tagline">
            Enrolment Reports
            <br />
            MOOE Reports for Transparency
          </p>
        </div>

        {/* Version badge — bottom of left panel */}
        {appVersion && (
          <div className="login-version">
            v{appVersion}
          </div>
        )}
      </div>

      {/* Right panel */}
      <div className="login-right">
        {view === "login" ? (
          <LoginForm
            onGoRegister={() => setView("register")}
            onLoginSuccess={onLoginSuccess}
          />
        ) : (
          <RegisterForm onGoLogin={() => setView("login")} />
        )}
      </div>
    </div>
  );
}

// ── Login Form ────────────────────────────────────────────────────────────────
function LoginForm({ onGoRegister, onLoginSuccess }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const identifier = username.trim().toLowerCase();
      let loginEmail = identifier;
      if (!identifier.includes("@")) {
        let { data: profile, error: profileErr } = await supabase
          .from("profiles")
          .select("email")
          .eq("username", identifier)
          .maybeSingle();
        if (!profile && identifier === "admin") {
          const { data: ownerEmail, error: ownerError } = await supabase.rpc(
            "dashboard_login_email",
            { candidate_username: identifier },
          );
          profile = ownerEmail ? { email: ownerEmail } : null;
          profileErr = ownerError;
        }
        if (profileErr || !profile) {
          setError("Username not found.");
          setLoading(false);
          return;
        }
        loginEmail = profile.email;
      }

      const { data: authData, error: authErr } =
        await supabase.auth.signInWithPassword({
          email: loginEmail,
          password,
        });

      if (authErr) {
        setError(authErr.message);
        setLoading(false);
        return;
      }

      const { error: ownerAccessError } = await supabase.rpc(
        "ensure_owner_app_access",
        { app_key: "report" },
      );
      if (ownerAccessError) {
        await supabase.auth.signOut();
        setError("Could not verify application access. Please try again.");
        return;
      }

      if (onLoginSuccess) {
        onLoginSuccess(authData.session);
      }
    } catch (err) {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-card">
      <div className="lc-header">
        <h1>Sign In</h1>
        <p>Enter your credentials to access reports</p>
      </div>

      <form onSubmit={handleLogin}>
        <div className="lf-group">
          <label>Username or email</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="your_username"
            required
          />
        </div>

        <div className="lf-group">
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
        </div>

        {error && <div className="lf-error">{error}</div>}

        <button type="submit" disabled={loading} className="lf-btn">
          {loading ? "Signing in…" : "Sign In"}
        </button>
      </form>

      <div className="lc-footer">
        <p>
          Don't have an account?{" "}
          <button
            type="button"
            onClick={onGoRegister}
            className="lc-footer-btn"
          >
            Register here
          </button>
        </p>
      </div>
    </div>
  );
}

// ── Register Form ─────────────────────────────────────────────────────────────
function RegisterForm({ onGoLogin }) {
  const [form, setForm] = useState({
    familyName: "",
    firstName: "",
    middleInitial: "",
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const set = (field) => (e) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");

    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (form.password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);

    const normalizedEmail = form.email.trim().toLowerCase();

    // 1. Check report_allowed_users (set by Dashboard Manager)
    const { data: allowed } = await supabase.rpc("is_app_email_allowed", {
      app_key: "report",
      candidate_email: normalizedEmail,
    });

    if (!allowed) {
      setError("Email not authorized to register. Contact your administrator.");
      setLoading(false);
      return;
    }

    // 2. Check username uniqueness in profiles
    const { data: existingUser } = await supabase
      .from("profiles")
      .select("username")
      .eq("username", form.username.trim())
      .maybeSingle();

    if (existingUser) {
      setError("Username is already taken.");
      setLoading(false);
      return;
    }

    // 3. Register via edge function — handles email already in auth (shared
    //    across apps) by reusing the existing auth.users record.
    const { data: fnData, error: fnErr } = await supabase.functions.invoke(
      "report-register",
      {
        body: {
          email: normalizedEmail,
          password: form.password,
          username: form.username.trim(),
          family_name: form.familyName.trim(),
          first_name: form.firstName.trim(),
          middle_initial: form.middleInitial.trim() || null,
        },
      }
    );

    if (fnErr || fnData?.error) {
      setError(fnData?.error || fnErr?.message || "Registration failed.");
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
  };

  if (success) {
    return (
      <div className="login-card" style={{ textAlign: "center" }}>
        <h1
          style={{ fontSize: "1.2rem", color: "#7b1a1a", marginBottom: "8px" }}
        >
          Account Created!
        </h1>
        <p
          style={{ fontSize: "0.8rem", color: "#7a6060", marginBottom: "20px" }}
        >
          You can now sign in with your account.
        </p>
        <button type="button" onClick={onGoLogin} className="lf-btn">
          Go to Sign In
        </button>
      </div>
    );
  }

  return (
    <div className="login-card">
      <div className="lc-header">
        <h1>Create Account</h1>
        <p>Email must be pre-approved by administrator</p>
      </div>

      <form onSubmit={handleRegister}>
        <div className="lf-row">
          <div className="lf-group">
            <label>Family Name *</label>
            <input
              type="text"
              value={form.familyName}
              onChange={set("familyName")}
              placeholder="Dela Cruz"
              required
            />
          </div>
          <div className="lf-group">
            <label>First Name *</label>
            <input
              type="text"
              value={form.firstName}
              onChange={set("firstName")}
              placeholder="Juan"
              required
            />
          </div>
        </div>

        <div className="lf-group">
          <label>Middle Initial</label>
          <input
            type="text"
            value={form.middleInitial}
            onChange={set("middleInitial")}
            placeholder="B."
            maxLength={3}
          />
        </div>

        <div className="lf-group">
          <label>Username *</label>
          <input
            type="text"
            value={form.username}
            onChange={set("username")}
            placeholder="juan_delacruz"
            required
          />
        </div>

        <div className="lf-group">
          <label>Email *</label>
          <input
            type="email"
            value={form.email}
            onChange={set("email")}
            placeholder="you@deped.gov.ph"
            required
          />
        </div>

        <div className="lf-group">
          <label>Password *</label>
          <input
            type="password"
            value={form.password}
            onChange={set("password")}
            placeholder="Min. 6 characters"
            required
          />
        </div>

        <div className="lf-group">
          <label>Confirm Password *</label>
          <input
            type="password"
            value={form.confirmPassword}
            onChange={set("confirmPassword")}
            placeholder="Re-enter password"
            required
          />
        </div>

        {error && <div className="lf-error">{error}</div>}

        <button type="submit" disabled={loading} className="lf-btn">
          {loading ? "Registering…" : "Create Account"}
        </button>
      </form>

      <div className="lc-footer">
        <p>
          Already have an account?{" "}
          <button type="button" onClick={onGoLogin} className="lc-footer-btn">
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
}
