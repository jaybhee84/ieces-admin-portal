/**
 * OrgChartPage.jsx
 * Electron admin page — manage IECES organizational chart.
 * Supabase table:  org_chart
 * Storage bucket:  org-photos
 */
import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import Topbar from "../components/Topbar";
import "./OrgChartPage.css";

// ─── constants ────────────────────────────────────────────────────────────────
const BUCKET = "org-photos";
const TABLE = "org_chart";

const ADMIN_POSITIONS = [
  "Public Schools District Supervisor (PSDS)",
  "Principal I",
  "Principal II",
  "Principal III",
  "Principal IV",
  "Assistant Principal",
  "Head Teacher I",
  "Head Teacher II",
  "Head Teacher III",
  "Head Teacher IV",
  "Head Teacher V",
  "Head Teacher VI",
  "ALS Coordinator",
  "Nurse II",
  "School Counselor Associate I (SCA I)",
  "School Counselor Associate II (SCA II)",
  "Administrative Officer II (AO II)",
  "Planning & Development Officer I (PDO I)",
  "Administrative Assistant III (Senior Bookkeeper)",
  "Administrative Assistant II (Disbursing Officer)",
  "Administrative Aide (Job Order)",
];

// Custom hierarchy rank order for Admin positions
const ADMIN_RANK_ORDER = [
  "Public Schools District Supervisor",
  "Principal",
  "Assistant Principal",
  "ALS Coordinator",
  "Head Teacher",
  "Nurse",
  "School Counselor Associate",
  "Administrative Officer",
  "Planning & Development Officer",
  "Administrative Assistant III",
  "Administrative Assistant II",
  "Administrative Aide",
];

// Positions that can be "designated" (acting, not permanent)
const DESIGNATABLE = [
  "Assistant Principal",
  "Assistant Principal I",
  "Assistant Principal II",
  "Principal I",
  "Principal II",
  "Principal III",
  "Principal IV",
  "Head Teacher I",
  "Head Teacher II",
  "Head Teacher III",
  "Head Teacher IV",
  "Head Teacher V",
  "Head Teacher VI",
];

const GRADE_LEVELS = [
  "SNED",
  "Kinder",
  "Grade 1",
  "Grade 2",
  "Grade 3",
  "Grade 4",
  "Grade 5",
  "Grade 6",
  "ALS",
  "ALIVE",
];

// DepEd official teaching position ladder (EO 174 / DO 019 s.2025)
const TEACHING_POSITIONS = [
  "Teacher I",
  "Teacher II",
  "Teacher III",
  "Teacher IV",
  "Teacher V",
  "Teacher VI",
  "Teacher VII",
  "Master Teacher I",
  "Master Teacher II",
  "Master Teacher III",
  "Master Teacher IV",
  "Master Teacher V",
  // Special Education Teacher (SPET) items
  "Special Education Teacher I",
  "Special Education Teacher II",
  "Special Education Teacher III",
  "Special Education Teacher IV",
  "Special Education Teacher V",
  // Head Teachers who still handle classes; those in school administration use the Administration category
  "Head Teacher I",
  "Head Teacher II",
  "Head Teacher III",
  "Head Teacher IV",
  "Head Teacher V",
  "Head Teacher VI",
];

const TEACHING_TYPES = ["Adviser", "Subject Teacher", "ALS", "ALIVE", "SNED"];
// Teacher types that are their own assignment: the grade level follows the type
const FIXED_ASSIGNMENT_TYPES = ["ALS", "ALIVE", "SNED"];

// Programs an administrator can head; the head sits beside the assistant principals on the chart
const HEADED_PROGRAMS = ["ALS", "ALIVE", "SNED"];
const headedProgram = (person) =>
  person.category === "admin" && HEADED_PROGRAMS.includes(person.grade_level) ? person.grade_level : "";

const JO_POSITIONS = [
  "Security Guard / Watchman",
  "Utility Worker",
  "Administrative Aide",
];

const SUPPORT_POSITIONS = [
  "Nurse II",
  "School Counselor Associate I (SCA I)",
  "School Counselor Associate II (SCA II)",
  "Administrative Officer II (AO II)",
  "Planning & Development Officer I (PDO I)",
  "Administrative Assistant III (Senior Bookkeeper)",
  "Administrative Assistant II (Disbursing Officer)",
  "Administrative Aide",
  "Security Guard / Watchman",
  "Utility Worker",
];

// ─── helpers ──────────────────────────────────────────────────────────────────
function isSubExpired(person) {
  if (person.status !== "substitute" || !person.sub_expiry_end) return false;
  const expiry = new Date(person.sub_expiry_end);
  expiry.setHours(23, 59, 59, 999);
  return new Date() > expiry;
}

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// Helper to parse existing / legacy names cleanly
function parsePersonName(person) {
  let family = (person.family_name || "").trim();
  let first = (person.first_name || "").trim();
  let middle = (person.middle_name || "").trim();

  // Fallback parser if columns were empty or structured differently
  if (!first || !family) {
    const rawName = person.name || "";

    if (rawName.includes(",")) {
      // Legacy format: "FAMILY, FIRST MIDDLE"
      const parts = rawName.split(",");
      family = parts[0].trim();
      const rest = (parts[1] || "").trim().split(/\s+/);
      first = rest[0] || "";
      middle = rest.slice(1).join(" ") || "";
    } else {
      // Format: "FIRST MIDDLE FAMILY"
      const parts = rawName.trim().split(/\s+/);
      if (parts.length === 1) {
        first = parts[0];
      } else if (parts.length === 2) {
        first = parts[0];
        family = parts[1];
      } else if (parts.length > 2) {
        first = parts[0];
        middle = parts.slice(1, -1).join(" ");
        family = parts[parts.length - 1];
      }
    }
  }

  return {
    family: family.toUpperCase(),
    first: first.toUpperCase(),
    middle: middle.toUpperCase(),
  };
}

// Format full name as FIRST MIDDLE FAMILY
function getDisplayName(person) {
  const { first, middle, family } = parsePersonName(person);
  return `${first}${middle ? " " + middle : ""} ${family}`.trim();
}

// Initials shown when a person has no photo
function getInitials(person) {
  const { first, family } = parsePersonName(person);
  return `${first.charAt(0)}${family.charAt(0)}` || "?";
}

// Returns ★ badges based on admin position rank
function getAdminStars(position) {
  if (!position) return null;
  if (
    position.startsWith("Principal") &&
    !position.startsWith("Assistant Principal")
  ) {
    return "★★★";
  }
  if (position.startsWith("Assistant Principal")) return "★★";
  if (position.startsWith("Head Teacher")) return "★";
  return null;
}

// Helper to determine numerical hierarchy rank for sorting
function getAdminRank(position) {
  if (!position) return 999;
  const index = ADMIN_RANK_ORDER.findIndex((prefix) =>
    position.startsWith(prefix),
  );
  return index !== -1 ? index : 999;
}

function normalizedRole(person) {
  return `${person.teaching_type || ""} ${person.admin_position || ""}`
    .trim()
    .toLowerCase();
}

function hasRole(person, terms) {
  const role = normalizedRole(person);
  return terms.some((term) => role.includes(term));
}

// ─── chart zoom ───────────────────────────────────────────────────────────────
const ZOOM_MIN = 0.3;
const ZOOM_MAX = 1.6;
const ZOOM_STEP = 0.1;
const ZOOM_STORAGE_KEY = "oc-zoom";
const clampZoom = (value) => Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value)) * 100) / 100;

function hasSavedZoom() {
  try {
    return localStorage.getItem(ZOOM_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

function readZoom() {
  try {
    const stored = Number(localStorage.getItem(ZOOM_STORAGE_KEY));
    return stored ? clampZoom(stored) : 1;
  } catch {
    return 1;
  }
}

// ─── empty form ───────────────────────────────────────────────────────────────
const EMPTY = {
  family_name: "",
  first_name: "",
  middle_name: "",
  category: "teaching", // admin | teaching | non-teaching | job-order
  admin_position: "",
  is_designated: false,
  teaching_position: "Teacher I",
  teaching_type: "Adviser",
  grade_level: "Grade 1",
  is_grade_chairman: false,
  heads_program: "", // admin only: ALS | ALIVE | SNED
  status: "alive", // alive | contractual | substitute
  sub_expiry_start: "",
  sub_expiry_end: "",
  photo_url: "",
};

// ─── StaffNode ───────────────────────────────────────────────────────────────
// One person in the chart. "lead" and "node" are the boxes of the upper levels;
// "leaf" is the compact row used inside a group column.
function StaffNode({ person, variant = "leaf", detail, onEdit, onDelete }) {
  const expired = isSubExpired(person);
  const displayName = getDisplayName(person);
  const stars = person.category === "admin" ? getAdminStars(person.admin_position) : null;
  const position =
    detail ??
    (person.category === "admin"
      ? person.is_designated
        ? `Designated ${person.admin_position}`
        : person.admin_position
      : person.category === "teaching"
        ? person.teaching_position || ""
        : person.admin_position || (person.category === "job-order" ? "Job Order" : ""));

  return (
    <div
      className={`oc-node oc-node-${variant}${expired ? " oc-expired" : ""}${person.is_grade_chairman ? " oc-chairman" : ""}`}
    >
      <div className="oc-node-photo">
        {person.photo_url ? (
          <img src={person.photo_url} alt="" />
        ) : (
          <div className="oc-initials" aria-hidden="true">{getInitials(person)}</div>
        )}
      </div>
      <div className="oc-node-info">
        <div className="oc-node-name" title={displayName}>{displayName}</div>
        <div className="oc-node-pos">
          {stars && <span className="oc-stars">{stars}</span>}
          {position}
        </div>
        {person.is_grade_chairman && <div className="oc-node-tag chairman">Grade Chairman</div>}
        {person.status === "contractual" && <div className="oc-node-tag">Contractual</div>}
        {person.status === "substitute" && (
          <div className="oc-node-tag">
            {expired ? "Expired · " : ""}
            {formatDate(person.sub_expiry_start)} – {formatDate(person.sub_expiry_end)}
          </div>
        )}
      </div>
      <div className="oc-node-actions">
        <button type="button" aria-label={`Edit ${displayName}`} title="Edit" onClick={() => onEdit(person)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        </button>
        <button type="button" className="danger" aria-label={`Remove ${displayName}`} title="Remove" onClick={() => onDelete(person)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 6h18" />
            <path d="M8 6V4h8v2" />
            <path d="M19 6l-1 14H6L5 6" />
            <path d="M10 11v6M14 11v6" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function OrgChartPage({
  onBack,
  onLogout,
  user,
  addToast,
  showConfirm,
}) {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const fileRef = useRef();
  const bodyRef = useRef(null);
  const chartRef = useRef(null);
  const scrollRef = useRef(null);
  const [zoom, setZoom] = useState(readZoom);

  const changeZoom = (next) => {
    const value = clampZoom(typeof next === "function" ? next(zoom) : next);
    setZoom(value);
    try {
      localStorage.setItem(ZOOM_STORAGE_KEY, String(value));
    } catch {
      // The zoom still applies for this session
    }
  };

  // Fit the whole chart's width inside the window
  const fitZoom = () => {
    const chart = chartRef.current;
    const body = bodyRef.current;
    if (!chart || !body) return;
    const shownWidth = chart.getBoundingClientRect().width;
    const available = body.clientWidth - 56;
    if (shownWidth > 0) changeZoom(Math.floor(((zoom * available) / shownWidth) * 20) / 20);
  };

  // On opening, a chart with no saved zoom is fitted to the window; otherwise it starts centered on the head
  useEffect(() => {
    if (loading || !chartRef.current) return;
    if (!hasSavedZoom()) fitZoom();
    const scroller = scrollRef.current;
    if (scroller) scroller.scrollLeft = (scroller.scrollWidth - scroller.clientWidth) / 2;
    // Runs once, when the staff list first appears
  }, [loading]);

  // Drag the chart with the mouse to pan: sideways in the chart, up and down in the page
  const panStart = useRef(null);
  const [panning, setPanning] = useState(false);

  const startPan = (event) => {
    if (event.button !== 0 || event.target.closest("button")) return;
    panStart.current = {
      x: event.clientX,
      y: event.clientY,
      left: scrollRef.current.scrollLeft,
      top: bodyRef.current.scrollTop,
    };
  };

  const movePan = (event) => {
    const start = panStart.current;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    // A small movement is still a click, not a drag
    if (!panning && Math.abs(dx) + Math.abs(dy) < 4) return;
    if (!panning) {
      setPanning(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    scrollRef.current.scrollLeft = start.left - dx;
    bodyRef.current.scrollTop = start.top - dy;
  };

  const endPan = () => {
    panStart.current = null;
    setPanning(false);
  };

  // Ctrl + mouse wheel zooms the chart; a plain wheel still scrolls
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return undefined;
    const onWheel = (event) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      setZoom((current) => {
        const value = clampZoom(current + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP));
        try {
          localStorage.setItem(ZOOM_STORAGE_KEY, String(value));
        } catch {
          // The zoom still applies for this session
        }
        return value;
      });
    };
    body.addEventListener("wheel", onWheel, { passive: false });
    return () => body.removeEventListener("wheel", onWheel);
  }, []);

  // ── fetch ──────────────────────────────────────────────────────────────────
  const fetchStaff = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .order("created_at", { ascending: true });
    if (error) {
      addToast("Failed to load staff: " + error.message, "error");
    } else setStaff(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchStaff();
  }, []);

  // ── open modal ─────────────────────────────────────────────────────────────
  const openAdd = () => {
    setForm(EMPTY);
    setEditId(null);
    setPhotoFile(null);
    setPhotoPreview("");
    setShowModal(true);
  };

  const openEdit = (person) => {
    const parsed = parsePersonName(person);

    setForm({
      family_name: parsed.family,
      first_name: parsed.first,
      middle_name: parsed.middle,
      category: person.category || "teaching",
      admin_position: person.admin_position || "",
      is_designated: person.is_designated || false,
      teaching_position: person.teaching_position || "Teacher I",
      teaching_type: person.teaching_type || "Adviser",
      grade_level:
        person.grade_level === "SPED"
          ? "SNED"
          : person.grade_level || "Grade 1",
      is_grade_chairman: person.is_grade_chairman || false,
      heads_program: headedProgram(person),
      status: person.status || "alive",
      sub_expiry_start: person.sub_expiry_start || "",
      sub_expiry_end: person.sub_expiry_end || "",
      photo_url: person.photo_url || "",
    });
    setEditId(person.id);
    setPhotoFile(null);
    setPhotoPreview(person.photo_url || "");
    setShowModal(true);
  };

  // ── photo pick ─────────────────────────────────────────────────────────────
  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  // ── save ───────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.family_name.trim()) {
      addToast("Family Name (Last Name) is required.", "warning");
      return;
    }
    if (!form.first_name.trim()) {
      addToast("First Name is required.", "warning");
      return;
    }
    // Contractual staff hold no plantilla position
    const contractual = form.status === "contractual" && form.category !== "job-order";
    if (!contractual && form.category === "admin" && !form.admin_position) {
      addToast("Select an admin position.", "warning");
      return;
    }
    if (
      !contractual &&
      (form.category === "job-order" || form.category === "non-teaching") &&
      !form.admin_position
    ) {
      addToast("Select a support staff position.", "warning");
      return;
    }
    if (
      form.status === "substitute" &&
      form.category !== "job-order" &&
      !form.sub_expiry_end
    ) {
      addToast("Set a substitute expiry date.", "warning");
      return;
    }

    setSaving(true);

    const family = form.family_name.trim().toUpperCase();
    const first = form.first_name.trim().toUpperCase();
    const middle = form.middle_name.trim().toUpperCase();

    let photo_url = form.photo_url;

    // upload photo if new file chosen
    if (photoFile) {
      const ext = photoFile.name.split(".").pop();
      const path = `staff/${Date.now()}_${family.replace(/\s+/g, "_")}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, photoFile, { upsert: true });
      if (upErr) {
        addToast("Photo upload failed: " + upErr.message, "error");
        setSaving(false);
        return;
      }
      const { data: urlData } = supabase.storage
        .from(BUCKET)
        .getPublicUrl(path);
      photo_url = urlData.publicUrl;
    }

    const payload = {
      family_name: family,
      first_name: first,
      middle_name: middle || null,
      category: form.category,
      admin_position: form.category !== "teaching" && !contractual ? form.admin_position : null,
      is_designated:
        form.category === "admin" && !contractual && DESIGNATABLE.includes(form.admin_position)
          ? form.is_designated
          : false,
      teaching_position:
        form.category === "teaching" && !contractual ? form.teaching_position : null,
      teaching_type: form.category === "teaching" ? form.teaching_type : null,
      // For an administrator the grade level column holds the program they head
      grade_level:
        form.category === "teaching"
          ? form.grade_level
          : form.category === "admin" && form.heads_program
            ? form.heads_program
            : null,
      is_grade_chairman:
        form.category === "teaching" &&
        form.grade_level !== "SNED" &&
        form.teaching_type !== "ALS" &&
        form.teaching_type !== "Subject Teacher"
          ? form.is_grade_chairman
          : false,
      status: form.category === "job-order" ? "alive" : form.status,
      sub_expiry_start:
        form.status === "substitute" && form.category !== "job-order"
          ? form.sub_expiry_start || null
          : null,
      sub_expiry_end:
        form.status === "substitute" && form.category !== "job-order"
          ? form.sub_expiry_end || null
          : null,
      photo_url,
    };

    let error;
    if (editId) {
      ({ error } = await supabase.from(TABLE).update(payload).eq("id", editId));
    } else {
      ({ error } = await supabase.from(TABLE).insert(payload));
    }

    if (error) {
      addToast("Save failed: " + error.message, "error");
    } else {
      addToast(editId ? "Staff updated!" : "Staff added!", "success");
      setShowModal(false);
      fetchStaff();
    }
    setSaving(false);
  };

  // ── delete ─────────────────────────────────────────────────────────────────
  const handleDelete = async (person) => {
    const displayName = getDisplayName(person);
    const ok = await showConfirm(
      `Remove "${displayName}" from the org chart?\n\nTheir photo and data will be kept in storage but removed from the chart.`,
    );
    if (!ok) return;
    const { error } = await supabase.from(TABLE).delete().eq("id", person.id);
    if (error) addToast("Delete failed: " + error.message, "error");
    else {
      addToast(`${displayName} removed.`, "info");
      fetchStaff();
    }
  };

  // ── grouped & sorted views ────────────────────────────────────────────────
  const substitutes = staff.filter((s) => s.status === "substitute");
  const activeStaff = staff.filter((s) => s.status !== "substitute");
  const districtSupervisors = activeStaff.filter((s) =>
    hasRole(s, ["psds", "public schools district supervisor", "public school district supervisor"]),
  );
  const alsCoordinators = activeStaff.filter((s) =>
    hasRole(s, ["als coordinator", "alternative learning system coordinator"]),
  );
  const specialRoleIds = new Set([
    ...districtSupervisors.map((s) => s.id),
    ...alsCoordinators.map((s) => s.id),
  ]);
  const adminStaff = activeStaff
    .filter((s) => s.category === "admin" && !specialRoleIds.has(s.id))
    .sort(
      (a, b) => getAdminRank(a.admin_position) - getAdminRank(b.admin_position),
    );

  const teachingStaff = activeStaff.filter(
    (s) => s.category === "teaching" && !specialRoleIds.has(s.id),
  );
  const teachingAdvisers = teachingStaff.filter(
    (s) => !hasRole(s, ["als", "alive", "subject"]),
  );
  const subjectTeachers = teachingStaff.filter((s) =>
    hasRole(s, ["subject"]),
  );
  const alsTeachers = teachingStaff.filter((s) => hasRole(s, ["als"]));
  const aliveTeachers = teachingStaff.filter((s) => hasRole(s, ["alive"]));
  const supportStaff = activeStaff.filter(
    (s) => s.category === "job-order" || s.category === "non-teaching",
  );
  const watchmenAndUtility = supportStaff.filter((s) =>
    hasRole(s, ["watchman", "watchmen", "security", "utility", "janitor", "custodian"]),
  );
  const otherSupport = supportStaff.filter(
    (s) => !watchmenAndUtility.some((person) => person.id === s.id),
  );

  // ── chart levels: district → school head → administration → groups ───────
  const [schoolHead, ...belowHead] = adminStaff;
  // Assistant principals sit directly under the school head; the rest of the administration is under them
  const isAssistantHead = (p) => String(p.admin_position || "").startsWith("Assistant Principal");
  // A program head (e.g. Head of ALS) stands on the same level, right above the column of the program they
  // head. Without that column on the chart they join the row of assistant principals instead.
  const programHeads = belowHead.filter((p) => !isAssistantHead(p) && headedProgram(p));
  const hasProgramGroup = (program) =>
    program === "ALS" ? alsCoordinators.length + alsTeachers.length > 0
      : program === "ALIVE" ? aliveTeachers.length > 0
        : teachingAdvisers.some((t) => ["SNED", "SPED"].includes(t.grade_level));
  const groupLeads = (label) => programHeads.filter((p) => headedProgram(p) === label && hasProgramGroup(label));
  const assistantHeads = [
    ...belowHead.filter(isAssistantHead),
    ...programHeads.filter((p) => !hasProgramGroup(headedProgram(p))),
  ];
  const otherAdmin = belowHead.filter((p) => !isAssistantHead(p) && !headedProgram(p));
  const chairmanFirst = (list) =>
    [...list].sort((a, b) => Number(Boolean(b.is_grade_chairman)) - Number(Boolean(a.is_grade_chairman)));
  const teachingDetail = (p) => [p.teaching_position, p.grade_level].filter(Boolean).join(" · ");
  const chartGroups = [
    ...GRADE_LEVELS.filter((gl) => gl !== "ALS" && gl !== "ALIVE").map((gl) => ({
      label: gl,
      people: chairmanFirst(
        teachingAdvisers.filter((t) => t.grade_level === gl || (gl === "SNED" && t.grade_level === "SPED")),
      ),
    })),
    { label: "ALIVE", people: chairmanFirst(aliveTeachers) },
    { label: "Subject Teachers", people: subjectTeachers, detail: teachingDetail },
    { label: "ALS", people: [...alsCoordinators, ...alsTeachers.filter((t) => !alsCoordinators.includes(t))] },
    {
      label: "Substitutes",
      people: substitutes,
      detail: (p) => (p.category === "teaching" ? teachingDetail(p) : p.admin_position || ""),
    },
    { label: "Support Staff", people: otherSupport },
    { label: "Watchmen & Utility", people: watchmenAndUtility },
  ].filter((group) => group.people.length > 0);

  // How far a program head is lifted above their column to stand level with the assistant principals:
  // the connector below the administration row, plus that row when there is one
  const leadRise = 14 + (otherAdmin.length > 0 ? 160 : 0);

  const f = form;
  // Contractual staff hold no plantilla position, so the position boxes are switched off
  const noPosition = f.status === "contractual" && f.category !== "job-order";
  const set = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));

  // ─── render ────────────────────────────────────────────────────────────────
  return (
    <div className="oc-root">
      <Topbar
        user={user}
        onLogout={onLogout}
        onBack={onBack}
        title="Organizational Chart"
      />

      <div className="oc-body" ref={bodyRef}>
        {/* Header row */}
        <div className="oc-page-hdr">
          <div>
            <div className="oc-page-title">Staff & Organizational Chart</div>
            <div className="oc-page-sub">
              {staff.length} staff member{staff.length !== 1 ? "s" : ""} ·
              Isabela East Central Elementary School
            </div>
          </div>
          <div className="oc-hdr-actions">
            <div className="oc-zoom" role="group" aria-label="Chart zoom" title="Ctrl + mouse wheel also zooms">
              <button type="button" aria-label="Zoom out" onClick={() => changeZoom((value) => value - ZOOM_STEP)} disabled={zoom <= ZOOM_MIN}>−</button>
              <button type="button" className="oc-zoom-value" title="Reset to 100%" onClick={() => changeZoom(1)}>{Math.round(zoom * 100)}%</button>
              <button type="button" aria-label="Zoom in" onClick={() => changeZoom((value) => value + ZOOM_STEP)} disabled={zoom >= ZOOM_MAX}>+</button>
              <button type="button" className="oc-zoom-fit" title="Fit the chart to the window width" onClick={fitZoom}>Fit</button>
            </div>
            <button className="oc-add-btn" onClick={openAdd}>
              + Add Staff
            </button>
          </div>
        </div>

        {loading ? (
          <div className="oc-loading">Loading staff…</div>
        ) : staff.length === 0 ? (
          <div className="oc-empty">No staff added yet. Use “Add Staff” to start the chart.</div>
        ) : (
          <div
            className={`oc-chart-scroll${panning ? " panning" : ""}`}
            ref={scrollRef}
            onPointerDown={startPan}
            onPointerMove={movePan}
            onPointerUp={endPan}
            onPointerCancel={endPan}
          >
            <div className="oc-chart" ref={chartRef} style={{ zoom }}>
              {districtSupervisors.length > 0 && (
                <>
                  <div className="oc-level">
                    {districtSupervisors.map((p) => (
                      <StaffNode key={p.id} person={p} variant="lead" onEdit={openEdit} onDelete={handleDelete} />
                    ))}
                  </div>
                  {(schoolHead || chartGroups.length > 0) && <div className="oc-link" />}
                </>
              )}

              {schoolHead && (
                <div className="oc-level">
                  <StaffNode person={schoolHead} variant="lead" onEdit={openEdit} onDelete={handleDelete} />
                </div>
              )}

              {assistantHeads.length > 0 && (
                <>
                  <div className="oc-link" />
                  <div className="oc-branches">
                    {assistantHeads.map((p) => (
                      <div className="oc-branch" key={p.id}>
                        <StaffNode person={p} variant="lead" onEdit={openEdit} onDelete={handleDelete} />
                      </div>
                    ))}
                  </div>
                </>
              )}

              {otherAdmin.length > 0 && (
                <>
                  <div className="oc-link" />
                  <div className="oc-branches">
                    {otherAdmin.map((p) => (
                      <div className="oc-branch" key={p.id}>
                        <StaffNode person={p} variant="node" onEdit={openEdit} onDelete={handleDelete} />
                      </div>
                    ))}
                  </div>
                </>
              )}

              {chartGroups.length > 0 && (
                <>
                  {adminStaff.length > 0 && <div className="oc-link" />}
                  <div className="oc-branches oc-groups">
                    {chartGroups.map((group) => (
                      <div className="oc-branch" key={group.label}>
                        {groupLeads(group.label).length > 0 && (
                          <div className="oc-group-lead" style={{ "--oc-rise": `${leadRise}px` }}>
                            {groupLeads(group.label).map((p) => (
                              <StaffNode key={p.id} person={p} variant="lead" onEdit={openEdit} onDelete={handleDelete} />
                            ))}
                          </div>
                        )}
                        <div className="oc-group-head">
                          <strong>{group.label}</strong>
                          <span>{group.people.length}</span>
                        </div>
                        <div className="oc-group-list">
                          {group.people.map((p) => (
                            <StaffNode
                              key={p.id}
                              person={p}
                              detail={group.detail?.(p)}
                              onEdit={openEdit}
                              onDelete={handleDelete}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Add/Edit Modal ─────────────────────────────────────────────────── */}
      {showModal && (
        // Clicking outside does not close the form, so typed details are not lost by a stray click
        <div className="modal-overlay">
          <div className="modal-box oc-modal">
            <div className="modal-hdr">
              <span>{editId ? "✏️ Edit Staff" : "➕ Add Staff"}</span>
              <button onClick={() => !saving && setShowModal(false)}>✕</button>
            </div>

            <div className="oc-form-body">
              {/* Photo */}
              <div className="oc-photo-section">
                <div
                  className="oc-photo-preview"
                  onClick={() => fileRef.current.click()}
                >
                  {photoPreview ? (
                    <img src={photoPreview} alt="preview" />
                  ) : (
                    <div className="oc-photo-placeholder">
                      📷
                      <br />
                      Click to upload photo
                    </div>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={handlePhotoChange}
                />
                <button
                  className="oc-change-photo"
                  onClick={() => fileRef.current.click()}
                >
                  {photoPreview ? "Change Photo" : "Upload Photo"}
                </button>
              </div>

              {/* Name Fields */}
              <div className="oc-field">
                <label>First Name *</label>
                <input
                  type="text"
                  placeholder="e.g. JOCELYN"
                  value={f.first_name}
                  onChange={(e) =>
                    set("first_name", e.target.value.toUpperCase())
                  }
                />
              </div>

              <div className="oc-field">
                <label>Middle Name / Initial</label>
                <input
                  type="text"
                  placeholder="e.g. R."
                  value={f.middle_name}
                  onChange={(e) =>
                    set("middle_name", e.target.value.toUpperCase())
                  }
                />
              </div>

              <div className="oc-field">
                <label>Family Name (Last Name) *</label>
                <input
                  type="text"
                  placeholder="e.g. BUENAVENTURA"
                  value={f.family_name}
                  onChange={(e) =>
                    set("family_name", e.target.value.toUpperCase())
                  }
                />
              </div>

              {/* Category */}
              <div className="oc-field">
                <label>Category *</label>
                <select
                  value={f.category}
                  onChange={(e) => set("category", e.target.value)}
                >
                  <option value="admin">Administration</option>
                  <option value="teaching">Teaching</option>
                  <option value="non-teaching">Non-Teaching / Support Staff</option>
                  <option value="job-order">Job Order</option>
                </select>
              </div>

              {/* Admin Position */}
              {(f.category === "admin" ||
                f.category === "non-teaching" ||
                f.category === "job-order") && (
                <div className="oc-field">
                  <label>{noPosition ? "Position" : "Position *"}</label>
                  {f.category === "admin" ? (
                    <select
                      value={noPosition ? "" : f.admin_position}
                      onChange={(e) => set("admin_position", e.target.value)}
                      disabled={noPosition}
                    >
                      <option value="">{noPosition ? "— None (contractual) —" : "— Select position —"}</option>
                      {ADMIN_POSITIONS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <select
                      value={noPosition ? "" : f.admin_position}
                      onChange={(e) => set("admin_position", e.target.value)}
                      disabled={noPosition}
                    >
                      <option value="">{noPosition ? "— None (contractual) —" : "— Select position —"}</option>
                      {(f.category === "non-teaching" ? SUPPORT_POSITIONS : JO_POSITIONS).map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* Program headed */}
              {f.category === "admin" && (
                <div className="oc-field">
                  <label>Heads Program</label>
                  <select
                    value={f.heads_program}
                    onChange={(e) => set("heads_program", e.target.value)}
                  >
                    <option value="">— None —</option>
                    {HEADED_PROGRAMS.map((program) => (
                      <option key={program} value={program}>
                        Head of {program}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Designated toggle */}
              {f.category === "admin" &&
                !noPosition &&
                DESIGNATABLE.includes(f.admin_position) && (
                  <div className="oc-field oc-checkbox-field">
                    <label className="oc-checkbox-label">
                      <input
                        type="checkbox"
                        checked={f.is_designated}
                        onChange={(e) => set("is_designated", e.target.checked)}
                      />
                      <span>Designated (Acting) only</span>
                    </label>
                    <div className="oc-field-hint">
                      Check if this person is designated to the position
                      temporarily, not permanently appointed. Position will
                      display as "Designated {f.admin_position}".
                    </div>
                  </div>
                )}

              {/* Teaching fields */}
              {f.category === "teaching" && (
                <>
                  <div className="oc-field">
                    <label>{noPosition ? "DepEd Position" : "DepEd Position *"}</label>
                    <select
                      value={noPosition ? "" : f.teaching_position}
                      onChange={(e) => set("teaching_position", e.target.value)}
                      disabled={noPosition}
                    >
                      {noPosition && <option value="">— None (contractual) —</option>}
                      {TEACHING_POSITIONS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="oc-field">
                    <label>Teacher Type</label>
                    <select
                      value={f.teaching_type}
                      onChange={(e) => {
                        const type = e.target.value;
                        setForm((prev) => ({
                          ...prev,
                          teaching_type: type,
                          grade_level: FIXED_ASSIGNMENT_TYPES.includes(type) ? type : prev.grade_level,
                          is_grade_chairman:
                            (FIXED_ASSIGNMENT_TYPES.includes(type) && type !== "ALIVE") || type === "Subject Teacher"
                              ? false
                              : prev.is_grade_chairman,
                        }));
                      }}
                    >
                      {TEACHING_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="oc-field">
                    <label>Grade Level / Assignment</label>
                    <select
                      value={f.grade_level}
                      onChange={(e) => set("grade_level", e.target.value)}
                      disabled={FIXED_ASSIGNMENT_TYPES.includes(f.teaching_type)}
                    >
                      {GRADE_LEVELS.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </div>

                  {f.grade_level !== "SNED" &&
                    f.teaching_type !== "ALS" &&
                    f.teaching_type !== "Subject Teacher" && (
                    <div className="oc-field oc-checkbox-field">
                      <label className="oc-checkbox-label">
                        <input
                          type="checkbox"
                          checked={f.is_grade_chairman}
                          onChange={(e) =>
                            set("is_grade_chairman", e.target.checked)
                          }
                        />
                        <span>⭐ Grade Chairman for {f.grade_level}</span>
                      </label>
                      <div className="oc-field-hint">
                        The Grade Chairman is the head/leader for this grade
                        level.
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Status */}
              {f.category !== "job-order" && (
                <div className="oc-field oc-field-full">
                  <label>Status</label>
                  <div className="oc-radio-group">
                    <label
                      className={`oc-radio ${f.status === "alive" ? "active" : ""}`}
                    >
                      <input
                        type="radio"
                        name="status"
                        value="alive"
                        checked={f.status === "alive"}
                        onChange={() => set("status", "alive")}
                      />
                      Regular / Active
                    </label>
                    <label
                      className={`oc-radio ${f.status === "contractual" ? "active" : ""}`}
                    >
                      <input
                        type="radio"
                        name="status"
                        value="contractual"
                        checked={f.status === "contractual"}
                        onChange={() => set("status", "contractual")}
                      />
                      Contractual
                    </label>
                    <label
                      className={`oc-radio ${f.status === "substitute" ? "active" : ""}`}
                    >
                      <input
                        type="radio"
                        name="status"
                        value="substitute"
                        checked={f.status === "substitute"}
                        onChange={() => set("status", "substitute")}
                      />
                      Substitute
                    </label>
                  </div>
                </div>
              )}

              {/* Substitute dates */}
              {f.status === "substitute" && f.category !== "job-order" && (
                <div className="oc-sub-dates">
                  <div className="oc-field">
                    <label>Substitute From</label>
                    <input
                      type="date"
                      value={f.sub_expiry_start}
                      onChange={(e) => set("sub_expiry_start", e.target.value)}
                    />
                  </div>
                  <div className="oc-field">
                    <label>Substitute Until *</label>
                    <input
                      type="date"
                      value={f.sub_expiry_end}
                      onChange={(e) => set("sub_expiry_end", e.target.value)}
                    />
                    <div className="oc-field-hint">
                      After this date, this substitute will be automatically
                      hidden from the public org chart. Their data and photo
                      will still be kept.
                    </div>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="oc-form-actions">
                <button
                  className="oc-btn-cancel"
                  onClick={() => setShowModal(false)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  className="oc-btn-save"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? "Saving…" : editId ? "Update Staff" : "Add Staff"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
