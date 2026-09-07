/**
 * App.jsx — updated
 * Added auto-updater notifications and listeners.
 */
import { useState, useEffect } from "react";
import { supabase } from "./lib/supabase";
import LoginPage from "./pages/LoginPage";
import Dashboard from "./pages/Dashboard";
import MooePage from "./pages/MooePage";
import OrgChartPage from "./pages/OrgChartPage";
import MediaManagerPage from "./pages/MediaManagerPage";
import EnrollmentPage from "./pages/EnrollmentPage";
import SchoolBulletinPage from "./pages/SchoolBulletinPage";
import Form137Page from "./pages/Form137Page";
import SplashScreen from "./components/SplashScreen";
import "./App.css";

async function setPresence(session, status) {
  if (!session?.user?.id) return;
  await supabase.from("user_presence").upsert(
    {
      user_id: session.user.id,
      app_id: "report",
      email: session.user.email || null,
      status,
      last_seen: new Date().toISOString(),
    },
    { onConflict: "user_id,app_id" },
  );
}

// ── Toast Notification ──
function Toast({ toasts, removeToast }) {
  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          <span className="toast-icon">
            {t.type === "success" && "✓"}
            {t.type === "error" && "✕"}
            {t.type === "info" && "ℹ"}
            {t.type === "warning" && "⚠"}
          </span>
          <span className="toast-message">{t.message}</span>
          <button className="toast-close" onClick={() => removeToast(t.id)}>
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Confirm Dialog ──
function ConfirmDialog({ confirm, onConfirm, onCancel }) {
  if (!confirm) return null;
  return (
    <div className="confirm-overlay">
      <div className="confirm-box">
        <div className="confirm-icon">🚪</div>
        <p className="confirm-title">Confirm Action</p>
        <p className="confirm-message">{confirm.message}</p>
        <div className="confirm-actions">
          <button className="confirm-btn confirm-btn-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="confirm-btn confirm-btn-confirm"
            onClick={onConfirm}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [page, setPage] = useState("login");
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState([]);
  const [confirm, setConfirm] = useState(null);

  const removeToast = (id) =>
    setToasts((prev) => prev.filter((t) => t.id !== id));

  const addToast = (message, type = "info", duration = 3000) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => removeToast(id), duration);
  };

  const showConfirm = (message) =>
    new Promise((resolve) => {
      setConfirm({ message, resolve });
    });

  const handleConfirm = () => {
    confirm?.resolve(true);
    setConfirm(null);
  };
  const handleCancel = () => {
    confirm?.resolve(false);
    setConfirm(null);
  };

  // ── Auto Updater Listener Setup ──
  useEffect(() => {
    if (!window.ipc?.updater) return;

    window.ipc.updater.onChecking(() => {
      addToast("Checking for updates...", "info");
    });

    window.ipc.updater.onUpdateAvailable((info) => {
      addToast(
        `New update v${info.version} found! Downloading in background...`,
        "info",
        5000,
      );
    });

    window.ipc.updater.onUpdateNotAvailable(() => {
      addToast("You are using the latest version.", "success");
    });

    window.ipc.updater.onUpdateDownloaded(async (info) => {
      const ok = await showConfirm(
        `Version ${info.version} has been downloaded.\n\nWould you like to restart and install the update now?`,
      );
      if (ok) {
        window.ipc.updater.quitAndInstall();
      }
    });

    window.ipc.updater.onError((error) => {
      addToast(`Update error: ${error}`, "error", 4000);
    });
  }, []);

  useEffect(() => {
    if (!session) return undefined;
    setPresence(session, "online");
    const heartbeat = setInterval(() => setPresence(session, "online"), 60000);
    const updateVisibility = () =>
      setPresence(session, document.hidden ? "offline" : "online");
    document.addEventListener("visibilitychange", updateVisibility);
    return () => {
      clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", updateVisibility);
      setPresence(session, "offline");
    };
  }, [session]);

  // ── Auth Listener Setup ──
  useEffect(() => {
    supabase.auth.signOut().then(() => {
      setSession(null);
      setPage("login");
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        setPage((prev) => (prev === "login" ? "dashboard" : prev));
      } else {
        setPage("login");
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLoginSuccess = (userSession) => {
    setSession(userSession);
    setPage("dashboard");
  };

  const handleLogout = async () => {
    const ok = await showConfirm("Are you sure you want to logout?");
    if (!ok) return;
    await supabase.auth.signOut();
    setSession(null);
    setPage("login");
    addToast("Logged out successfully", "info");
  };

  if (loading) return <SplashScreen />;

  const sharedProps = { addToast, showConfirm };

  return (
    <>
      <Toast toasts={toasts} removeToast={removeToast} />
      <ConfirmDialog
        confirm={confirm}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />

      {(page === "login" || !session) && (
        <LoginPage onLoginSuccess={handleLoginSuccess} addToast={addToast} />
      )}

      {page === "dashboard" && session && (
        <Dashboard
          user={session?.user}
          session={session}
          onLogout={handleLogout}
          onNavigate={setPage}
          {...sharedProps}
        />
      )}

      {page === "mooe" && session && (
        <MooePage
          onBack={() => setPage("dashboard")}
          onLogout={handleLogout}
          user={session?.user}
          {...sharedProps}
        />
      )}

      {page === "orgchart" && session && (
        <OrgChartPage
          onBack={() => setPage("dashboard")}
          onLogout={handleLogout}
          user={session?.user}
          {...sharedProps}
        />
      )}

      {page === "enrollment" && session && (
        <EnrollmentPage
          onBack={() => setPage("dashboard")}
          onLogout={handleLogout}
          user={session?.user}
          {...sharedProps}
        />
      )}

      {page === "media-manager" && session && (
        <MediaManagerPage
          onBack={() => setPage("dashboard")}
          onLogout={handleLogout}
          user={session?.user}
          {...sharedProps}
        />
      )}
      {page === "school-bulletin" && session && (
        <SchoolBulletinPage
          onBack={() => setPage("dashboard")}
          onLogout={handleLogout}
          user={session?.user}
          {...sharedProps}
        />
      )}
      {page === "form137" && session && (
        <Form137Page
          onBack={() => setPage("dashboard")}
          onLogout={handleLogout}
          user={session?.user}
          {...sharedProps}
        />
      )}
    </>
  );
}
