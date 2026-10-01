/**
 * TeachingLoadPage.jsx
 * Class scheduling for the eSF7 "Daily Program" (DepEd Memorandum 052, s. 2023):
 * subjects taught, advisory class, and ancillary assignments per teacher.
 * Supabase tables: teaching_loads (schedule), org_chart (teachers)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Topbar from "../components/Topbar";
import { supabase } from "../lib/supabase";
import "./TeachingLoadPage.css";

const TABLE = "teaching_loads";
const SCHOOL_NAME = "Isabela East Central Elementary School";

const DAYS = [
  { code: "M", label: "Mon" },
  { code: "T", label: "Tue" },
  { code: "W", label: "Wed" },
  { code: "TH", label: "Thu" },
  { code: "F", label: "Fri" },
];
const ALL_DAYS = DAYS.map((day) => day.code);

const GRADE_LEVELS = ["Kinder", "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6", "SNED"];

// Elementary learning areas under the MATATAG Curriculum (DepEd Order 010, s. 2024, as amended)
const SUBJECTS_BY_GRADE = {
  Kinder: ["Kindergarten (Blocks of Time)"],
  "Grade 1": ["Language", "Reading and Literacy", "Mathematics", "Makabansa", "GMRC"],
  "Grade 2": ["Filipino", "English", "Mathematics", "Makabansa", "GMRC"],
  "Grade 3": ["Filipino", "English", "Mathematics", "Science", "Makabansa", "GMRC"],
  "Grade 4": ["Filipino", "English", "Mathematics", "Science", "Araling Panlipunan", "MAPEH", "EPP", "GMRC"],
  "Grade 5": ["Filipino", "English", "Mathematics", "Science", "Araling Panlipunan", "MAPEH", "EPP", "GMRC"],
  "Grade 6": ["Filipino", "English", "Mathematics", "Science", "Araling Panlipunan", "MAPEH", "TLE", "GMRC"],
  SNED: [],
};
const PROGRAM_SUBJECTS = ["Homeroom Guidance Program", "National Reading Program", "National Mathematics Program"];
const ANCILLARY_SUGGESTIONS = [
  "Grade Level Chairman",
  "Subject Coordinator",
  "School Paper Adviser",
  "Canteen / Feeding Coordinator",
  "DRRM Coordinator",
  "Library In-charge",
  "LIS / ICT Coordinator",
  "Remediation / Intervention",
];

const LOAD_TYPES = [
  { value: "teaching", label: "Teaching" },
  { value: "advisory", label: "Advisory / Homeroom" },
  { value: "ancillary", label: "Ancillary" },
];
const LOAD_TYPE_LABEL = Object.fromEntries(LOAD_TYPES.map((type) => [type.value, type.label]));

// DepEd Order 005, s. 2024: at most 6 hours of actual classroom teaching per day
const MAX_TEACHING_MINUTES = 360;
const DEFAULT_PERIOD_MINUTES = 45;

// Daily time allotment per learning area (DepEd Order 010, s. 2024, as amended)
const PERIOD_MINUTES_BY_GRADE = {
  "Grade 1": 40,
  "Grade 2": 40,
  "Grade 3": 45,
  "Grade 4": 45,
  "Grade 5": 45,
  "Grade 6": 45,
};
const KINDER_BLOCK_MINUTES = 180;
const READING_MATH_PROGRAM_MINUTES = 30; // NRP / NMP: 30 minutes, 4 times a week
const FOUR_DAYS = ["M", "T", "W", "TH"];

// Uniform period lengths a school may adopt instead of the standard allotment (Grades 4–6)
const PERIOD_OPTIONS = [
  { value: "standard", label: "Standard (40 / 45 min)" },
  { value: "50", label: "Uniform 50 min" },
  { value: "55", label: "Uniform 55 min" },
  { value: "60", label: "Uniform 60 min" },
];
const UNIFORM_GRADES = ["Grade 4", "Grade 5", "Grade 6"];
// Under a uniform schedule these meet 4 times a week; the other learning areas meet daily
const FOUR_TIMES_A_WEEK = ["filipino", "araling panlipunan", "mapeh", "epp", "tle"];
const PERIOD_OPTION_STORAGE_KEY = "tl-period-option";
const OTHER_SUBJECT = "__other__";

function readPeriodOption() {
  try {
    const stored = localStorage.getItem(PERIOD_OPTION_STORAGE_KEY);
    return PERIOD_OPTIONS.some((option) => option.value === stored) ? stored : "standard";
  } catch {
    return "standard";
  }
}

// Allotted minutes and days for a known subject; null when the subject is typed freely
function allotmentFor(gradeLevel, subject, periodOption) {
  const name = String(subject || "").trim().toLowerCase();
  const known = [...(SUBJECTS_BY_GRADE[gradeLevel] || []), ...PROGRAM_SUBJECTS].some(
    (item) => item.toLowerCase() === name,
  );
  if (!known) return null;

  const uniform = periodOption !== "standard" && UNIFORM_GRADES.includes(gradeLevel) ? Number(periodOption) : null;
  if (name === "kindergarten (blocks of time)") return { minutes: KINDER_BLOCK_MINUTES, days: ALL_DAYS };
  if (name === "homeroom guidance program") return { minutes: uniform || 45, days: ["F"] };
  if (name === "national reading program" || name === "national mathematics program") {
    return { minutes: READING_MATH_PROGRAM_MINUTES, days: FOUR_DAYS };
  }
  if (uniform) return { minutes: uniform, days: FOUR_TIMES_A_WEEK.includes(name) ? FOUR_DAYS : ALL_DAYS };
  return { minutes: PERIOD_MINUTES_BY_GRADE[gradeLevel] || DEFAULT_PERIOD_MINUTES, days: ALL_DAYS };
}

const EMPTY_FORM = {
  teacher_id: "",
  load_type: "teaching",
  subject: "",
  grade_level: "Grade 1",
  section: "",
  days: ALL_DAYS,
  time_start: "07:30",
  time_end: "08:15",
  remarks: "",
};

// ─── helpers ─────────────────────────────────────────────────────────────────
function currentSchoolYear() {
  const now = new Date();
  const start = now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1;
  return `${start}-${start + 1}`;
}

function schoolYearOptions() {
  const start = Number(currentSchoolYear().slice(0, 4));
  return [start + 1, start, start - 1].map((year) => `${year}-${year + 1}`);
}

const toMinutes = (time) => {
  const [hours, minutes] = String(time || "0:0").split(":").map(Number);
  return hours * 60 + minutes;
};

const fromMinutes = (total) => {
  const clamped = Math.max(0, Math.min(total, 23 * 60 + 59));
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
};

const formatTime = (time) => {
  const total = toMinutes(time);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
};

const duration = (entry) => toMinutes(entry.time_end) - toMinutes(entry.time_start);
const countsAsTeaching = (entry) => entry.load_type !== "ancillary";

const formatDays = (days) => {
  const ordered = ALL_DAYS.filter((code) => days?.includes(code));
  if (ordered.length === ALL_DAYS.length) return "Daily";
  return ordered.join(" ");
};

const teacherName = (teacher) => {
  if (!teacher) return "Unknown teacher";
  const family = (teacher.family_name || "").trim();
  const first = (teacher.first_name || "").trim();
  const middle = (teacher.middle_name || "").trim();
  if (!family && !first) return (teacher.name || "Unnamed teacher").trim();
  return `${family}, ${first}${middle ? ` ${middle.charAt(0)}.` : ""}`;
};

const classLabel = (entry) => [entry.grade_level, entry.section].filter(Boolean).join(" – ");
const classKey = (entry) => `${entry.grade_level || ""}|${(entry.section || "").trim().toUpperCase()}`;

const overlaps = (a, b) =>
  a.days.some((day) => b.days.includes(day)) &&
  toMinutes(a.time_start) < toMinutes(b.time_end) &&
  toMinutes(b.time_start) < toMinutes(a.time_end);

const sortEntries = (list) =>
  [...list].sort(
    (a, b) =>
      toMinutes(a.time_start) - toMinutes(b.time_start) ||
      ALL_DAYS.indexOf(a.days[0]) - ALL_DAYS.indexOf(b.days[0]),
  );

// Teaching minutes for each weekday, plus the weekly average per day
function loadSummary(list) {
  const perDay = Object.fromEntries(ALL_DAYS.map((code) => [code, 0]));
  let ancillaryWeekly = 0;
  list.forEach((entry) => {
    const minutes = duration(entry);
    if (countsAsTeaching(entry)) entry.days.forEach((day) => { perDay[day] += minutes; });
    else ancillaryWeekly += minutes * entry.days.length;
  });
  const weekly = ALL_DAYS.reduce((sum, code) => sum + perDay[code], 0);
  return {
    perDay,
    weekly,
    average: Math.round(weekly / ALL_DAYS.length),
    ancillaryWeekly,
    overloaded: ALL_DAYS.some((code) => perDay[code] > MAX_TEACHING_MINUTES),
  };
}

const formatMinutes = (minutes) => {
  if (!minutes) return "0 min";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours} h${rest ? ` ${rest} min` : ""}` : `${rest} min`;
};

// ─── page ────────────────────────────────────────────────────────────────────
export default function TeachingLoadPage({ user, onLogout, onBack, addToast, showConfirm }) {
  const [schoolYear, setSchoolYear] = useState(currentSchoolYear);
  const [teachers, setTeachers] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mode, setMode] = useState("teacher"); // teacher | class
  const [selectedKey, setSelectedKey] = useState("");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [periodOption, setPeriodOption] = useState(readPeriodOption);
  const [customSubject, setCustomSubject] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    const [teacherResult, entryResult] = await Promise.all([
      supabase.from("org_chart").select("*").eq("category", "teaching"),
      supabase.from(TABLE).select("*").eq("school_year", schoolYear),
    ]);

    if (teacherResult.error) {
      setError(teacherResult.error.message || "Could not load the teacher list.");
    } else {
      const gradeOrder = (teacher) => {
        const index = GRADE_LEVELS.indexOf(teacher.grade_level === "SPED" ? "SNED" : teacher.grade_level);
        return index === -1 ? 99 : index;
      };
      setTeachers(
        [...(teacherResult.data || [])].sort(
          (a, b) => gradeOrder(a) - gradeOrder(b) || teacherName(a).localeCompare(teacherName(b)),
        ),
      );
    }

    if (entryResult.error) {
      const missingTable = ["42P01", "PGRST205"].includes(entryResult.error.code);
      setError(
        missingTable
          ? "The teaching load table is not ready. Run supabase-teaching-loads.sql in the Supabase SQL Editor."
          : entryResult.error.message || "Could not load the class schedule.",
      );
      setEntries([]);
    } else {
      setEntries(
        (entryResult.data || []).map((entry) => ({
          ...entry,
          teacher_id: String(entry.teacher_id),
          time_start: String(entry.time_start).slice(0, 5),
          time_end: String(entry.time_end).slice(0, 5),
          days: entry.days || [],
        })),
      );
    }
    setLoading(false);
  }, [schoolYear]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const teacherById = useMemo(
    () => Object.fromEntries(teachers.map((teacher) => [String(teacher.id), teacher])),
    [teachers],
  );

  const entriesByTeacher = useMemo(() => {
    const map = {};
    entries.forEach((entry) => { (map[entry.teacher_id] ||= []).push(entry); });
    return map;
  }, [entries]);

  // Classes that already have at least one scheduled period
  const classes = useMemo(() => {
    const map = new Map();
    entries.forEach((entry) => {
      if (!entry.grade_level) return;
      const key = classKey(entry);
      if (!map.has(key)) map.set(key, { key, grade_level: entry.grade_level, section: (entry.section || "").trim(), count: 0 });
      map.get(key).count += 1;
    });
    return [...map.values()].sort(
      (a, b) =>
        GRADE_LEVELS.indexOf(a.grade_level) - GRADE_LEVELS.indexOf(b.grade_level) ||
        a.section.localeCompare(b.section),
    );
  }, [entries]);

  const knownSections = useMemo(
    () => [...new Set(entries.map((entry) => (entry.section || "").trim()).filter(Boolean))].sort(),
    [entries],
  );

  const query = search.trim().toLowerCase();
  const listItems =
    mode === "teacher"
      ? teachers
          .filter((teacher) => !query || teacherName(teacher).toLowerCase().includes(query))
          .map((teacher) => {
            const summary = loadSummary(entriesByTeacher[String(teacher.id)] || []);
            return {
              key: String(teacher.id),
              title: teacherName(teacher),
              sub: [teacher.teaching_position, teacher.grade_level, teacher.teaching_type].filter(Boolean).join(" · "),
              stat: summary.weekly ? `${summary.average} min/day` : "No load",
              empty: !summary.weekly,
              warn: summary.overloaded,
            };
          })
      : classes
          .filter((item) => !query || classLabel(item).toLowerCase().includes(query))
          .map((item) => ({
            key: item.key,
            title: classLabel(item),
            sub: "",
            stat: `${item.count} period${item.count === 1 ? "" : "s"}`,
          }));

  // Keep a valid selection as the list, mode, or school year changes
  const activeKey = listItems.some((item) => item.key === selectedKey) ? selectedKey : listItems[0]?.key || "";

  const selectedTeacher = mode === "teacher" ? teacherById[activeKey] : null;
  const selectedClass = mode === "class" ? classes.find((item) => item.key === activeKey) : null;
  const visibleEntries = sortEntries(
    mode === "teacher"
      ? entriesByTeacher[activeKey] || []
      : entries.filter((entry) => entry.grade_level && classKey(entry) === activeKey),
  );
  const summary = loadSummary(visibleEntries);

  const conflictsFor = (candidate, ignoreId) => {
    const others = entries.filter((entry) => entry.id !== ignoreId);
    const messages = [];
    others.forEach((entry) => {
      if (!overlaps(candidate, entry)) return;
      const when = `${formatDays(entry.days)} ${formatTime(entry.time_start)}–${formatTime(entry.time_end)}`;
      if (entry.teacher_id === candidate.teacher_id) {
        messages.push(`${teacherName(teacherById[entry.teacher_id])} already has ${entry.subject}${classLabel(entry) ? ` (${classLabel(entry)})` : ""}, ${when}.`);
      } else if (
        candidate.load_type !== "ancillary" &&
        entry.load_type !== "ancillary" &&
        candidate.grade_level &&
        classKey(entry) === classKey(candidate)
      ) {
        messages.push(`${classLabel(entry)} already has ${entry.subject} with ${teacherName(teacherById[entry.teacher_id])}, ${when}.`);
      }
    });
    return messages;
  };

  const entryConflicts = useMemo(() => {
    const flagged = new Set();
    entries.forEach((a, index) => {
      entries.slice(index + 1).forEach((b) => {
        if (!overlaps(a, b)) return;
        const sameTeacher = a.teacher_id === b.teacher_id;
        const sameClass =
          a.load_type !== "ancillary" && b.load_type !== "ancillary" && a.grade_level && classKey(a) === classKey(b);
        if (sameTeacher || sameClass) {
          flagged.add(a.id);
          flagged.add(b.id);
        }
      });
    });
    return flagged;
  }, [entries]);

  // ── form ────────────────────────────────────────────────────────────────────
  const updateField = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const openAdd = () => {
    const last = visibleEntries.at(-1);
    const start = last ? last.time_end : EMPTY_FORM.time_start;
    setForm({
      ...EMPTY_FORM,
      teacher_id: selectedTeacher ? String(selectedTeacher.id) : "",
      grade_level: selectedClass?.grade_level
        || (GRADE_LEVELS.includes(selectedTeacher?.grade_level) ? selectedTeacher.grade_level : last?.grade_level || "Grade 1"),
      section: selectedClass?.section || last?.section || "",
      time_start: start,
      time_end: fromMinutes(toMinutes(start) + DEFAULT_PERIOD_MINUTES),
    });
    // openAdd's default length is replaced by the subject's allotment once a subject is picked
    setEditingId(null);
    setCustomSubject(false);
    setShowForm(true);
  };

  const openEdit = (entry) => {
    setForm({
      teacher_id: entry.teacher_id,
      load_type: entry.load_type || "teaching",
      subject: entry.subject || "",
      grade_level: entry.grade_level || "",
      section: entry.section || "",
      days: entry.days,
      time_start: entry.time_start,
      time_end: entry.time_end,
      remarks: entry.remarks || "",
    });
    setEditingId(entry.id);
    setCustomSubject(false);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
  };

  const changeStart = (value) => {
    // Keep the period length when the start time moves
    setForm((current) => {
      const length = Math.max(toMinutes(current.time_end) - toMinutes(current.time_start), 0) || DEFAULT_PERIOD_MINUTES;
      return { ...current, time_start: value, time_end: value ? fromMinutes(toMinutes(value) + length) : current.time_end };
    });
  };

  // Picking a subject or grade sets the end time from the official time allotment
  const changeSubjectOrGrade = (field, value) => {
    setForm((current) => {
      const next = { ...current, [field]: value };
      // A listed subject that the newly chosen grade does not offer is cleared
      if (field === "grade_level" && !isCustomSubject && next.load_type !== "ancillary") {
        const offered = [...(SUBJECTS_BY_GRADE[value] || []), ...PROGRAM_SUBJECTS];
        if (!offered.includes(next.subject)) next.subject = "";
      }
      if (next.load_type === "ancillary" || !next.time_start) return next;
      const allotment = allotmentFor(next.grade_level, next.subject, periodOption);
      return allotment
        ? { ...next, days: allotment.days, time_end: fromMinutes(toMinutes(next.time_start) + allotment.minutes) }
        : next;
    });
  };

  const changePeriodOption = (value) => {
    setPeriodOption(value);
    try {
      localStorage.setItem(PERIOD_OPTION_STORAGE_KEY, value);
    } catch {
      // The choice still applies for this session
    }
  };

  const toggleDay = (code) =>
    setForm((current) => ({
      ...current,
      days: current.days.includes(code) ? current.days.filter((day) => day !== code) : [...current.days, code],
    }));

  const saveEntry = async (event) => {
    event.preventDefault();
    const isAncillary = form.load_type === "ancillary";
    const subject = form.subject.trim();

    if (!form.teacher_id) return addToast("Select a teacher.", "warning");
    if (!subject) return addToast(isAncillary ? "Enter the ancillary assignment." : "Enter the subject.", "warning");
    if (!isAncillary && !form.grade_level) return addToast("Select the grade level of the class.", "warning");
    if (!form.days.length) return addToast("Select at least one day.", "warning");
    if (!form.time_start || !form.time_end || toMinutes(form.time_end) <= toMinutes(form.time_start)) {
      return addToast("The end time must be later than the start time.", "warning");
    }

    const payload = {
      school_year: schoolYear,
      teacher_id: form.teacher_id,
      load_type: form.load_type,
      subject,
      grade_level: form.grade_level || null,
      section: form.section.trim() || null,
      days: ALL_DAYS.filter((code) => form.days.includes(code)),
      time_start: form.time_start,
      time_end: form.time_end,
      remarks: form.remarks.trim() || null,
      updated_at: new Date().toISOString(),
    };

    const conflicts = conflictsFor(payload, editingId);
    if (conflicts.length) {
      const proceed = await showConfirm(`Schedule conflict:\n\n${conflicts.slice(0, 4).join("\n")}\n\nSave this period anyway?`);
      if (!proceed) return;
    }

    setSaving(true);
    const result = editingId
      ? await supabase.from(TABLE).update(payload).eq("id", editingId)
      : await supabase.from(TABLE).insert({ ...payload, created_by: user?.email || null });
    setSaving(false);

    if (result.error) {
      addToast(result.error.message || "Could not save the period.", "error", 5000);
      return;
    }
    addToast(editingId ? "Period updated." : "Period added.", "success");
    closeForm();
    await loadData();
  };

  const deleteEntry = async (entry) => {
    const confirmed = await showConfirm(
      `Remove ${entry.subject}${classLabel(entry) ? ` (${classLabel(entry)})` : ""}, ${formatTime(entry.time_start)}–${formatTime(entry.time_end)}? This cannot be undone.`,
    );
    if (!confirmed) return;
    const { error: deleteError } = await supabase.from(TABLE).delete().eq("id", entry.id);
    if (deleteError) {
      addToast(deleteError.message || "Could not remove the period.", "error", 5000);
      return;
    }
    addToast("Period removed.", "success");
    if (editingId === entry.id) closeForm();
    await loadData();
  };

  const switchMode = (next) => {
    setMode(next);
    setSearch("");
    closeForm();
  };

  const subjectOptions =
    form.load_type === "ancillary"
      ? ANCILLARY_SUGGESTIONS
      : [...(SUBJECTS_BY_GRADE[form.grade_level] || []), ...PROGRAM_SUBJECTS];
  // A saved subject that is not in the list (typed earlier) also shows as "Other"
  const isCustomSubject = customSubject || Boolean(form.subject && !subjectOptions.includes(form.subject));

  const formAllotment =
    form.load_type === "ancillary" ? null : allotmentFor(form.grade_level, form.subject, periodOption);

  const heading = mode === "teacher" ? teacherName(selectedTeacher) : selectedClass ? classLabel(selectedClass) : "";
  const hasSelection = Boolean(selectedTeacher || selectedClass);
  const tableReady = !error || teachers.length > 0;

  return (
    <div className="tl-root">
      <Topbar user={user} onLogout={onLogout} onBack={onBack} title="Teaching Load" />

      <div className="tl-toolbar">
        <div className="tl-segment" role="tablist" aria-label="View schedule by">
          <button type="button" className={mode === "teacher" ? "active" : ""} onClick={() => switchMode("teacher")}>By teacher</button>
          <button type="button" className={mode === "class" ? "active" : ""} onClick={() => switchMode("class")}>By class</button>
        </div>
        <label className="tl-sy">
          <span>School Year</span>
          <select value={schoolYear} onChange={(event) => { setSchoolYear(event.target.value); closeForm(); }}>
            {schoolYearOptions().map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
        </label>
        <label className="tl-sy" title="Sets the time and days filled in when you pick a subject. Uniform lengths apply to Grades 4–6.">
          <span>Period length</span>
          <select value={periodOption} onChange={(event) => changePeriodOption(event.target.value)}>
            {PERIOD_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <div className="tl-toolbar-spacer" />
        <button type="button" className="tl-button" onClick={loadData} disabled={loading}>Refresh</button>
        <button type="button" className="tl-button" onClick={() => window.print()} disabled={!visibleEntries.length}>Print</button>
        <button type="button" className="tl-button primary" onClick={openAdd} disabled={loading || !teachers.length}>+ Add period</button>
      </div>

      {error && <div className="tl-error">{error}</div>}

      <div className="tl-body">
        <aside className="tl-list">
          <input
            className="tl-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={mode === "teacher" ? "Search teacher" : "Search class"}
          />
          <div className="tl-list-items">
            {listItems.map((item) => (
              <button
                type="button"
                key={item.key}
                className={`tl-list-item${item.key === activeKey ? " active" : ""}`}
                onClick={() => { setSelectedKey(item.key); closeForm(); }}
              >
                <span className="tl-list-main">
                  <strong>{item.title}</strong>
                  {item.sub && <small>{item.sub}</small>}
                </span>
                <span className={`tl-list-stat${item.warn ? " warn" : ""}${item.empty ? " empty" : ""}`}>{item.stat}</span>
              </button>
            ))}
            {!loading && listItems.length === 0 && (
              <div className="tl-list-empty">
                {mode === "teacher"
                  ? query ? "No teacher matches the search." : "No teaching personnel yet. Add teachers in Organizational Chart."
                  : query ? "No class matches the search." : "No classes scheduled yet. Add a period to start a class program."}
              </div>
            )}
          </div>
        </aside>

        <main className="tl-main">
          {loading && <div className="tl-message">Loading class schedule…</div>}

          {!loading && tableReady && showForm && (
            <form className="tl-form" onSubmit={saveEntry}>
              <div className="tl-form-heading">
                <strong>{editingId ? "Edit period" : "New period"}</strong>
                <span>School Year {schoolYear}</span>
              </div>
              <label className="tl-field span-2">
                <span>Teacher</span>
                <select value={form.teacher_id} onChange={(event) => updateField("teacher_id", event.target.value)} required>
                  <option value="">Select teacher</option>
                  {teachers.map((teacher) => (
                    <option key={teacher.id} value={String(teacher.id)}>{teacherName(teacher)}</option>
                  ))}
                </select>
              </label>
              <label className="tl-field">
                <span>Type</span>
                <select value={form.load_type} onChange={(event) => { setCustomSubject(false); setForm((current) => ({ ...current, load_type: event.target.value, subject: "" })); }}>
                  {LOAD_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                </select>
              </label>
              <label className="tl-field">
                <span>Grade level{form.load_type === "ancillary" ? " (optional)" : ""}</span>
                <select value={form.grade_level} onChange={(event) => changeSubjectOrGrade("grade_level", event.target.value)}>
                  {form.load_type === "ancillary" && <option value="">—</option>}
                  {GRADE_LEVELS.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
                </select>
              </label>
              <label className="tl-field">
                <span>Section</span>
                <input list="tl-sections" value={form.section} maxLength={60} onChange={(event) => updateField("section", event.target.value)} placeholder="e.g. Sampaguita" />
                <datalist id="tl-sections">{knownSections.map((section) => <option key={section} value={section} />)}</datalist>
              </label>
              <div className="tl-field">
                <span>{form.load_type === "ancillary" ? "Assignment" : "Subject"}</span>
                <select
                  aria-label={form.load_type === "ancillary" ? "Assignment" : "Subject"}
                  value={isCustomSubject ? OTHER_SUBJECT : form.subject}
                  onChange={(event) => {
                    const other = event.target.value === OTHER_SUBJECT;
                    setCustomSubject(other);
                    changeSubjectOrGrade("subject", other ? "" : event.target.value);
                  }}
                >
                  <option value="">{form.load_type === "ancillary" ? "Select assignment" : "Select subject"}</option>
                  {subjectOptions.map((subject) => <option key={subject} value={subject}>{subject}</option>)}
                  <option value={OTHER_SUBJECT}>Other (type it)…</option>
                </select>
                {isCustomSubject && (
                  <input
                    autoFocus
                    value={form.subject}
                    maxLength={120}
                    onChange={(event) => updateField("subject", event.target.value)}
                    placeholder={form.load_type === "ancillary" ? "Type the assignment" : "Type the subject"}
                  />
                )}
              </div>
              <label className="tl-field">
                <span>From</span>
                <input type="time" value={form.time_start} onChange={(event) => changeStart(event.target.value)} required />
              </label>
              <label className="tl-field">
                <span>To</span>
                <input type="time" value={form.time_end} onChange={(event) => updateField("time_end", event.target.value)} required />
              </label>
              <div className="tl-field">
                <span>Days</span>
                <div className="tl-days">
                  {DAYS.map((day) => (
                    <button type="button" key={day.code} className={form.days.includes(day.code) ? "active" : ""} aria-pressed={form.days.includes(day.code)} onClick={() => toggleDay(day.code)}>{day.label}</button>
                  ))}
                </div>
              </div>
              <label className="tl-field span-3">
                <span>Remarks (optional)</span>
                <input value={form.remarks} maxLength={200} onChange={(event) => updateField("remarks", event.target.value)} />
              </label>
              <div className="tl-form-actions">
                <span className="tl-form-hint">
                  {toMinutes(form.time_end) > toMinutes(form.time_start)
                    ? `${duration(form)} min × ${form.days.length} day${form.days.length === 1 ? "" : "s"} · ${form.load_type === "ancillary" ? "not counted as teaching load" : "counted as teaching load"}${formAllotment ? ` · allotment ${formAllotment.minutes} min, ${formAllotment.days.length}× a week` : ""}`
                    : "Set a valid time range"}
                </span>
                <button type="button" className="tl-button" onClick={closeForm}>Cancel</button>
                <button type="submit" className="tl-button primary" disabled={saving}>{saving ? "Saving…" : editingId ? "Save changes" : "Add period"}</button>
              </div>
            </form>
          )}

          {!loading && tableReady && hasSelection && (
            <section className="tl-sheet">
              <div className="tl-print-header">
                <strong>{SCHOOL_NAME}</strong>
                <span>{mode === "teacher" ? "Teacher's Class Program and Teaching Load" : "Class Program"} · School Year {schoolYear}</span>
              </div>
              <header className="tl-sheet-heading">
                <div>
                  <h1>{heading}</h1>
                  {selectedTeacher && (
                    <p>{[selectedTeacher.teaching_position, selectedTeacher.grade_level, selectedTeacher.teaching_type].filter(Boolean).join(" · ")}</p>
                  )}
                </div>
                {mode === "teacher" && (
                  <dl className="tl-stats">
                    <div><dt>Avg. teaching / day</dt><dd className={summary.overloaded ? "warn" : ""}>{summary.average} min</dd></div>
                    <div><dt>Teaching / week</dt><dd>{formatMinutes(summary.weekly)}</dd></div>
                    <div><dt>Ancillary / week</dt><dd>{formatMinutes(summary.ancillaryWeekly)}</dd></div>
                  </dl>
                )}
              </header>

              {summary.overloaded && mode === "teacher" && (
                <div className="tl-warning">
                  Over 6 hours of teaching on {ALL_DAYS.filter((code) => summary.perDay[code] > MAX_TEACHING_MINUTES).map((code) => `${DAYS.find((day) => day.code === code).label} (${summary.perDay[code]} min)`).join(", ")}. DepEd Order 005, s. 2024 limits actual classroom teaching to 6 hours a day.
                </div>
              )}

              {visibleEntries.length === 0 ? (
                <div className="tl-empty">
                  <strong>No periods scheduled</strong>
                  <span>Use “Add period” to build this {mode === "teacher" ? "teacher's" : "class's"} program for SY {schoolYear}.</span>
                </div>
              ) : (
                <table className="tl-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th className="num">Min</th>
                      <th>Days</th>
                      <th>Subject / Assignment</th>
                      <th>{mode === "teacher" ? "Grade & Section" : "Teacher"}</th>
                      <th>Type</th>
                      <th>Remarks</th>
                      <th className="tl-col-actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {visibleEntries.map((entry) => (
                      <tr key={entry.id} className={entryConflicts.has(entry.id) ? "conflict" : ""}>
                        <td className="nowrap">{formatTime(entry.time_start)} – {formatTime(entry.time_end)}</td>
                        <td className="num">{duration(entry)}</td>
                        <td className="nowrap">{formatDays(entry.days)}</td>
                        <td>
                          {entry.subject}
                          {entryConflicts.has(entry.id) && <span className="tl-conflict-tag" title="Overlaps another period for the same teacher or class">Conflict</span>}
                        </td>
                        <td>{mode === "teacher" ? classLabel(entry) || "—" : teacherName(teacherById[entry.teacher_id])}</td>
                        <td><span className={`tl-type ${entry.load_type}`}>{LOAD_TYPE_LABEL[entry.load_type] || entry.load_type}</span></td>
                        <td>{entry.remarks || ""}</td>
                        <td className="tl-col-actions">
                          <button type="button" onClick={() => openEdit(entry)}>Edit</button>
                          <button type="button" className="danger" onClick={() => deleteEntry(entry)}>Remove</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {mode === "teacher" && (
                    <tfoot>
                      <tr>
                        <td colSpan={8}>
                          Teaching minutes per day —{" "}
                          {DAYS.map((day) => (
                            <span key={day.code} className={summary.perDay[day.code] > MAX_TEACHING_MINUTES ? "warn" : ""}>
                              {day.label} {summary.perDay[day.code]}
                            </span>
                          ))}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              )}

              <div className="tl-signatures">
                <div><span /><small>{mode === "teacher" ? "Teacher" : "Class Adviser"}</small></div>
                <div><span /><small>School Head</small></div>
              </div>
            </section>
          )}

          {!loading && tableReady && !hasSelection && !showForm && (
            <div className="tl-message">
              {mode === "teacher" ? "Select a teacher to view their class program." : "No class programs yet. Add a period to get started."}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
