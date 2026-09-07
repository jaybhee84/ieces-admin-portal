/**
 * Dashboard.jsx — updated
 * Replaced "Recent MOOE" section with Org Chart module card.
 */
import Topbar from "../components/Topbar";
import "./Dashboard.css";

const MODULES = [
  {
    id: "enrollment",
    icon: "📋",
    label: "Enrollment",
    desc: "Monitor daily learner enrollment with grade-level, gender, and 4Ps breakdowns.",
    badge: "active",
    badgeText: "✅ Active",
  },
  {
    id: "mooe",
    icon: "📊",
    label: "MOOE Report",
    desc: "Encode monthly MOOE expenses and liquidation reports for budget transparency.",
    badge: "active",
    badgeText: "✅ Active",
  },
  {
    id: "orgchart",
    icon: "🏫",
    label: "Org Chart",
    desc: "Manage the school's organizational chart — add staff photos, positions, grade assignments, and substitutes.",
    badge: "active",
    badgeText: "✅ Active",
  },
  {
    id: "media-manager",
    icon: "📰",
    label: "IECES Media Manager",
    desc: "Review and approve submitted news articles before they appear on the school website.",
    badge: "active",
    badgeText: "✅ Active",
  },
  {
    id: "school-bulletin",
    icon: "📣",
    label: "School Bulletin",
    desc: "Publish class suspensions, office orders, and other official notices to the public website.",
    badge: "active",
    badgeText: "✅ Active",
  },
  {
    id: "form137",
    icon: "📄",
    label: "Form 137 & Learner Records",
    desc: "Search the full learner database, review a learner's complete record, and print their SF10-ES / Form 137 — for the school AO/Registrar.",
    badge: "active",
    badgeText: "✅ Active",
  },
];

export default function Dashboard({ user, onLogout, onNavigate, addToast, showConfirm }) {
  const handleCard = (id) => {
    onNavigate(id);
  };

  return (
    <div className="dash-root">
      <Topbar user={user} onLogout={onLogout} />
      <div className="dash-body">
        <div className="dash-welcome">
          <div>
            <div className="dw-title">Welcome back, {user?.name || "Admin"} 👋</div>
            <div className="dw-sub">Isabela East Central Elementary School</div>
          </div>
        </div>

        <div className="module-grid module-grid-3">
          {MODULES.map((m) => (
            <div
              key={m.id}
              className="module-card"
              onClick={() => handleCard(m.id)}
            >
              <div className="mc-icon">{m.icon}</div>
              <div className="mc-label">{m.label}</div>
              <div className="mc-desc">{m.desc}</div>
              <span className={`mc-badge badge-${m.badge}`}>{m.badgeText}</span>
            </div>
          ))}
        </div>

        {/* Quick tips */}
        <div className="dash-section">
          <div className="ds-header">
            <span className="ds-title">Quick Tips</span>
          </div>
          <div className="tips-grid">
            <div className="tip-card">
              <div className="tip-icon">🏫</div>
              <div className="tip-text">
                <strong>Org Chart:</strong> Add staff photos, assign grade levels, mark Grade Chairmen, and set substitute expiry dates. Expired substitutes auto-hide on the public website.
              </div>
            </div>
            <div className="tip-card">
              <div className="tip-icon">📊</div>
              <div className="tip-text">
                <strong>MOOE Report:</strong> Encode monthly liquidation entries. Upload official receipts for transparency and audit compliance.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
