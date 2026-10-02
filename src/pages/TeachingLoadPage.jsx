/**
 * TeachingLoadPage.jsx
 * Class scheduling for the eSF7 "Daily Program" (DepEd Memorandum 052, s. 2023):
 * subjects taught, advisory class, and ancillary assignments per teacher.
 * Supabase tables: teaching_loads (schedule), org_chart (teachers)
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Topbar from "../components/Topbar";
import { usePrintPreview } from "../components/PrintPreview/PrintPreviewContext";
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

const GRADE_LEVELS = ["Kinder", "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6", "SNED", "ALS"];

// Elementary subjects as named and offered per grade in DepEd InSightED "Subjects Taught" (eSF7),
// so a period encoded here matches the subject picked there
const SPECIAL_SUBJECTS = ["Special Program in Science", "Madrasah Subjects"];
// ALIVE (Arabic Language and Islamic Values Education), offered from Grade 1 under the Madrasah
// Education Program (DepEd Order 41, s. 2017)
const ALIVE_SUBJECTS = ["Arabic Language", "Islamic Values Education"];
const SUBJECTS_BY_GRADE = {
  Kinder: ["Kinder Blocks of Time"],
  "Grade 1": ["Language", "Reading and Literacy", "Mathematics", "Makabansa", "GMRC", ...ALIVE_SUBJECTS, ...SPECIAL_SUBJECTS],
  "Grade 2": ["Filipino", "English", "Mathematics", "Makabansa", "GMRC", ...ALIVE_SUBJECTS, ...SPECIAL_SUBJECTS],
  "Grade 3": ["Filipino", "English", "Mathematics", "Science", "Makabansa", "GMRC", ...ALIVE_SUBJECTS, ...SPECIAL_SUBJECTS],
  "Grade 4": ["Filipino", "English", "Mathematics", "Science", "Araling Panlipunan", "MAPEH", "EPP/TLE", "TLE", "GMRC", ...ALIVE_SUBJECTS, ...SPECIAL_SUBJECTS],
  "Grade 5": ["Filipino", "English", "Mathematics", "Science", "Araling Panlipunan", "MAPEH", "EPP/TLE", "TLE", "GMRC", ...ALIVE_SUBJECTS, ...SPECIAL_SUBJECTS],
  "Grade 6": ["Filipino", "English", "Mathematics", "Science", "Araling Panlipunan", "MAPEH", "EPP/TLE", "TLE", "GMRC", ...ALIVE_SUBJECTS, ...SPECIAL_SUBJECTS],
  SNED: ["SNED Modified Subject"],
  ALS: [
    "ALS Learning Strand",
    "Communication Skills (English)",
    "Communication Skills (Filipino)",
    "Scientific and Critical Thinking Skills",
    "Mathematical and Problem Solving Skills",
    "Life and Career Skills",
    "Understanding the Self and Society",
    "Digital Citizenship",
  ],
};
// Names this page offered before it followed InSightED; a saved period takes the new name when edited
const RENAMED_SUBJECTS = {
  "Kindergarten (Blocks of Time)": "Kinder Blocks of Time",
  EPP: "EPP/TLE",
};
const PROGRAM_SUBJECTS = ["Homeroom Guidance Program", "National Reading Program", "National Mathematics Program"];
const ANCILLARY_SUGGESTIONS = [
  // Administrative tasks as named in the InSightED scheduler
  "Personnel Administration",
  "Property/Physical Facilities Custodianship",
  "General Administrative Support",
  "Financial Management",
  "Records Management",
  "Program Management",
  // Designations as named in InSightED "School Designation Management"
  "Guidance Designate",
  "Learner Information Officer (LIS)",
  "Key Stage Department Head",
  "ICT School Coordinator",
  "Reading / Literacy Coordinator",
  "Grade Level Chairperson",
  "Learning Area Chairperson",
  "Sports Programs Adviser",
  "Research Coordinator",
  "SNED Coordinator",
  "SELG / SSLG Adviser",
  // Other common school assignments
  "School Paper Adviser",
  "Canteen / Feeding Coordinator",
  "DRRM Coordinator",
  "Library In-charge",
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
const MAX_TEACHING_WEEK_MINUTES = 1800; // 30 hours a week
// Teaching beyond the regular load is paid teaching overload, at most 2 hours a day (DepEd Order 005, s. 2024)
const MAX_OVERLOAD_MINUTES = 120;
// The same order sets an 8-hour workday: 6 hours of teaching plus 2 hours for ancillary tasks
const MAX_WORKDAY_MINUTES = 480;
// Class advising counts as teaching load equivalent to one hour a day (DepEd Order 005, s. 2024)
const CLASS_ADVISORY = "Class Advisory";
// Teachers of the Special Science Class: its advanced subjects are extra teaching time, counted as teaching load
const SSC_TASK = "Special Science Class (SSC)";
// Assignments that count as teaching load instead of ancillary work
const TEACHING_TASKS = [CLASS_ADVISORY, SSC_TASK];
const DEFAULT_TASK_MINUTES = 60;
// A teacher whose daily average is this far from the school average is flagged as unevenly loaded
const BALANCE_TOLERANCE_MINUTES = 30;
const DEFAULT_PERIOD_MINUTES = 45;
// Quick choices for a period's length in the period form
const PERIOD_LENGTHS = [
  { minutes: 40, label: "40 min" },
  { minutes: 45, label: "45 min" },
  { minutes: 60, label: "1 hr" },
];

// Period length per subject as set in the DepEd InSightED scheduler (eSF7):
// these are locked at 40 minutes there; every other subject is a 1-hour period
const FORTY_MINUTE_SUBJECTS = ["language", "reading and literacy", "makabansa", "mathematics", "gmrc", "filipino", "english"];
const FORTY_MINUTES = 40;
const ONE_HOUR = 60;
const KINDER_BLOCK_MINUTES = 180;
const READING_MATH_PROGRAM_MINUTES = 30; // NRP / NMP: 30 minutes, 4 times a week
const FOUR_DAYS = ["M", "T", "W", "TH"];

// Periods follow the standard allotment (40 min / 1 hr); other lengths are set in the Time allotment tab
const PERIOD_OPTION = "standard";
const UNIFORM_GRADES = ["Grade 4", "Grade 5", "Grade 6"];
// Under a uniform schedule these meet 4 times a week; the other learning areas meet daily
const FOUR_TIMES_A_WEEK = ["filipino", "araling panlipunan", "mapeh", "epp/tle", "tle"];
const OTHER_SUBJECT = "__other__";

// Subjects the school adds in the Subjects tab, with the grades that offer them; kept on this computer
const CUSTOM_SUBJECTS_STORAGE_KEY = "tl-custom-subjects";

function readCustomSubjects() {
  try {
    const stored = JSON.parse(localStorage.getItem(CUSTOM_SUBJECTS_STORAGE_KEY) || "[]");
    return Array.isArray(stored)
      ? stored.filter((item) => item && typeof item.name === "string" && Array.isArray(item.grades))
      : [];
  } catch {
    return [];
  }
}

// Allotted minutes and days for a known subject; null when the subject is typed freely
function allotmentFor(gradeLevel, subject, periodOption, subjectMinutes) {
  const standard = standardAllotmentFor(gradeLevel, subject, periodOption);
  // Minutes set in the Time allotment tab replace the standard length; the days stay the same
  const custom = Number(subjectMinutes?.[gradeLevel]?.[subject]);
  return standard && custom > 0 ? { ...standard, minutes: custom } : standard;
}

function standardAllotmentFor(gradeLevel, subject, periodOption) {
  const name = String(subject || "").trim().toLowerCase();
  const known = [...(SUBJECTS_BY_GRADE[gradeLevel] || []), ...PROGRAM_SUBJECTS].some(
    (item) => item.toLowerCase() === name,
  );
  if (!known) return null;

  const uniform = periodOption !== "standard" && UNIFORM_GRADES.includes(gradeLevel) ? Number(periodOption) : null;
  if (name === "kinder blocks of time") return { minutes: KINDER_BLOCK_MINUTES, days: ALL_DAYS };
  if (name === "homeroom guidance program") return { minutes: uniform || 45, days: ["F"] };
  if (name === "national reading program" || name === "national mathematics program") {
    return { minutes: READING_MATH_PROGRAM_MINUTES, days: FOUR_DAYS };
  }
  // ALIVE: Arabic Language 3 times a week and Islamic Values Education twice, 40 minutes each
  if (name === "arabic language") return { minutes: FORTY_MINUTES, days: ["M", "W", "F"] };
  if (name === "islamic values education") return { minutes: FORTY_MINUTES, days: ["T", "TH"] };
  if (uniform) return { minutes: uniform, days: FOUR_TIMES_A_WEEK.includes(name) ? FOUR_DAYS : ALL_DAYS };
  return { minutes: FORTY_MINUTE_SUBJECTS.includes(name) ? FORTY_MINUTES : ONE_HOUR, days: ALL_DAYS };
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
  const perDayAncillary = Object.fromEntries(ALL_DAYS.map((code) => [code, 0]));
  list.forEach((entry) => {
    const minutes = duration(entry);
    const target = countsAsTeaching(entry) ? perDay : perDayAncillary;
    entry.days.forEach((day) => { if (day in target) target[day] += minutes; });
  });
  const weekly = ALL_DAYS.reduce((sum, code) => sum + perDay[code], 0);
  const ancillaryWeekly = ALL_DAYS.reduce((sum, code) => sum + perDayAncillary[code], 0);
  return {
    perDay,
    weekly,
    average: Math.round(weekly / ALL_DAYS.length),
    ancillaryWeekly,
    ancillaryAverage: Math.round(ancillaryWeekly / ALL_DAYS.length),
    // Teaching and ancillary work together, per day
    totalAverage: Math.round((weekly + ancillaryWeekly) / ALL_DAYS.length),
    overloaded: weekly > MAX_TEACHING_WEEK_MINUTES || ALL_DAYS.some((code) => perDay[code] > MAX_TEACHING_MINUTES),
    // Minutes past 6 hours on the heaviest day, and whether that is more than the allowed overload
    overloadMinutes: Math.max(0, ...ALL_DAYS.map((code) => perDay[code] - MAX_TEACHING_MINUTES)),
    overCap: ALL_DAYS.some((code) => perDay[code] > MAX_TEACHING_MINUTES + MAX_OVERLOAD_MINUTES),
    overWorkday: ALL_DAYS.some((code) => perDay[code] + perDayAncillary[code] > MAX_WORKDAY_MINUTES),
  };
}

// Class advisory and ancillary tasks that are not tied to a class period; they give way to classes
const isMovableTask = (entry) =>
  entry.load_type === "ancillary" || (entry.load_type === "advisory" && TEACHING_TASKS.includes(entry.subject));

// Latest time up to 5:00 PM, outside lunch, when the teacher is free on every school day for the given
// minutes, so that tasks sit after classes instead of taking class time
function findFreeSlot(list, minutes) {
  for (let start = 17 * 60 - minutes; start >= toMinutes("07:30"); start -= 5) {
    if (start < 13 * 60 && start + minutes > 12 * 60) continue;
    const slot = { days: ALL_DAYS, time_start: fromMinutes(start), time_end: fromMinutes(start + minutes) };
    if (!list.some((entry) => overlaps(slot, entry))) return slot;
  }
  return null;
}

const formatMinutes = (minutes) => {
  if (!minutes) return "0 min";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours} h${rest ? ` ${rest} min` : ""}` : `${rest} min`;
};

// ─── suggested schedule ──────────────────────────────────────────────────────
// Marks periods created by "Suggest schedule" so they can be cleared together; editing a period removes the mark
const SUGGESTED_REMARK = "Suggested schedule";
const SUGGESTED_GRADES = ["Kinder", "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6"];
const SUGGESTED_START = "07:30";
// Recess is 20 minutes; its start time is set on the toolbar and kept on this computer
const RECESS_MINUTES = 20;
const DEFAULT_RECESS_START = "09:30";
const RECESS_STORAGE_KEY = "tl-recess-start";

// Minutes per subject for each grade, set in the Time allotment tab and kept on this computer
const SUBJECT_MINUTES_STORAGE_KEY = "tl-subject-minutes";

function readSubjectMinutes() {
  try {
    const stored = JSON.parse(localStorage.getItem(SUBJECT_MINUTES_STORAGE_KEY) || "{}");
    return stored && typeof stored === "object" ? stored : {};
  } catch {
    return {};
  }
}

function readRecessStart() {
  try {
    const stored = localStorage.getItem(RECESS_STORAGE_KEY);
    return /^d{2}:d{2}$/.test(stored || "") ? stored : DEFAULT_RECESS_START;
  } catch {
    return DEFAULT_RECESS_START;
  }
}
const LUNCH_START = 12 * 60;
const LUNCH_END = 13 * 60;
// Lowest grade where teachers exchange classes by subject; below it the adviser teaches the class all day
const ROTATE_FROM = "Grade 4";

// Subject groups: Grade 4–6 teachers are placed under the subject they specialize in (table: teacher_specialties)
const SPECIALTY_TABLE = "teacher_specialties";
const SPECIALTY_SUBJECTS = [
  "Filipino",
  "English",
  "Mathematics",
  "Science",
  "Araling Panlipunan",
  "MAPEH",
  "EPP/TLE",
  "GMRC",
  "ALIVE",
];
// Subject groups cover Grades 4–6 only; the lower grades stay with their adviser
const SPECIALTY_GRADES = ["Grade 4", "Grade 5", "Grade 6"];
// The ALIVE group's teachers handle Arabic Language and Islamic Values Education from Grade 1
const ALIVE_GROUP = "ALIVE";
const ALIVE_GRADES = ["Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6"];
// Grade levels that can be added to a grouped teacher as ones they cover: Grades 4–6, or from Grade 1 for ALIVE
const groupGrades = (subject) => (subject === ALIVE_GROUP ? ALIVE_GRADES : SPECIALTY_GRADES);
// Grade 6 TLE is handled by the EPP/TLE group
const specialtyGroup = (subject) => (subject === "TLE" ? "EPP/TLE" : subject);

const KINDER_SESSIONS = [
  { label: "Morning", start: "07:30" },
  { label: "Afternoon", start: "13:00" },
];

// Part of the school but not of this page: they keep their own workload
const OWN_WORKLOAD = ["ALS"];
const teachingType = (teacher) => String(teacher.teaching_type || "").trim().toLowerCase();

// One learning area per period: Grades 4–5 take EPP/TLE, Grade 6 takes TLE; special programs are left to
// the school, and ALIVE is scheduled apart as class groups for the ALIVE teachers
function suggestedSubjects(grade) {
  const skip = [...SPECIAL_SUBJECTS, ...ALIVE_SUBJECTS, grade === "Grade 6" ? "EPP/TLE" : "TLE"];
  return (SUBJECTS_BY_GRADE[grade] || []).filter((subject) => !skip.includes(subject));
}

/**
 * Drafts a class program for every adviser's class that has no periods yet.
 * All sections of a grade share the same time slots, so no teacher or class is double-booked.
 * Below `rotateFrom` the adviser stays with the class all day; from that grade up, each subject
 * goes to one teacher of the grade (advisers and subject teachers) who takes it to every section,
 * preferring the teachers placed in that subject's group.
 * Loads are kept even and under the 6-hour limit wherever the staffing allows.
 */
function buildSuggestedSchedule(teachers, entries, periodOption, rotateFrom, specialtiesByTeacher = {}, recessStart = DEFAULT_RECESS_START, subjectMinutes = {}) {
  const recessFrom = toMinutes(recessStart);
  const recessTo = recessFrom + RECESS_MINUTES;
  const planned = [];
  const busy = {};
  entries.forEach((entry) => { (busy[entry.teacher_id] ||= []).push(entry); });
  const scheduledClasses = new Set(entries.filter((entry) => entry.grade_level).map(classKey));
  const stats = { classes: 0, skippedClasses: 0, unassigned: 0, aliveClasses: 0, sscClasses: 0 };

  // A teacher's day counts everything they are given: classes, class advisory, and ancillary roles.
  // A role therefore takes the place of teaching time instead of being added on top of a full load.
  const dayLoad = (id, day) =>
    (busy[id] || []).reduce((sum, entry) => sum + (entry.days.includes(day) ? duration(entry) : 0), 0);
  const weeklyLoad = (id) => ALL_DAYS.reduce((sum, day) => sum + dayLoad(id, day), 0);
  const clashes = (id, period) => (busy[id] || []).some((entry) => overlaps(period, entry));
  const fitsLimits = (id, period) => {
    const minutes = duration(period);
    return (
      period.days.every((day) => dayLoad(id, day) + minutes <= MAX_TEACHING_MINUTES) &&
      weeklyLoad(id) + minutes * period.days.length <= MAX_TEACHING_WEEK_MINUTES
    );
  };
  // Every adviser has class advisory, one hour a day of teaching load. It is reserved here so that class
  // periods only fill the remaining hours.
  const hasAdvisory = (id) =>
    (busy[id] || []).some((entry) => entry.load_type === "advisory" && entry.subject === CLASS_ADVISORY);
  teachers
    .filter((teacher) => SUGGESTED_GRADES.includes(teacher.grade_level) && teachingType(teacher) === "adviser")
    .forEach((teacher) => {
      const id = String(teacher.id);
      if (hasAdvisory(id)) return;
      (busy[id] ||= []).push({
        teacher_id: id,
        load_type: "advisory",
        subject: CLASS_ADVISORY,
        days: ALL_DAYS,
        time_start: "00:00",
        time_end: fromMinutes(DEFAULT_TASK_MINUTES),
        reserved: true,
      });
    });
  const advisersScheduled = new Set();
  const advisories = [];

  // Class advisory and ancillary roles are given their time first, at the end of the day working backwards
  // (advisory last), so classes are then scheduled around them and nothing overlaps. Kinder advisers keep
  // both session blocks free. A role already saved at another time is moved.
  const moves = [];
  teachers
    .filter((teacher) => SUGGESTED_GRADES.includes(teacher.grade_level))
    .forEach((teacher) => {
      const id = String(teacher.id);
      const tasks = (busy[id] || []).filter(isMovableTask);
      if (!tasks.length) return;
      const placed = (busy[id] || []).filter((entry) => !isMovableTask(entry));
      const keepFree =
        teacher.grade_level === "Kinder" && teachingType(teacher) === "adviser"
          ? KINDER_SESSIONS.map((session) => ({
              days: ALL_DAYS,
              time_start: session.start,
              time_end: fromMinutes(toMinutes(session.start) + KINDER_BLOCK_MINUTES),
            }))
          : [];
      [...tasks]
        .sort((a, b) => Number(b.load_type === "advisory") - Number(a.load_type === "advisory"))
        .forEach((task) => {
          const slot = findFreeSlot([...placed, ...keepFree], duration(task));
          if (slot) {
            if (task.id && (slot.time_start !== task.time_start || slot.time_end !== task.time_end)) {
              moves.push({ id: task.id, time_start: slot.time_start, time_end: slot.time_end });
            }
            task = Object.assign(task.reserved ? task : { ...task }, { time_start: slot.time_start, time_end: slot.time_end, placedAt: true });
          }
          placed.push(task);
        });
      busy[id] = placed;
    });

  // Advisers and subject teachers drawn on when a grade's own teachers are full. They come only from the
  // same key stage (Kinder–Grade 3, or Grades 4–6): a lower-grade adviser is never sent to an upper-grade class.
  const keyStage = (grade) => (SPECIALTY_GRADES.includes(grade) ? 2 : 1);
  const reserveFor = (grade) =>
    teachers.filter(
      (teacher) =>
        SUGGESTED_GRADES.includes(teacher.grade_level) &&
        keyStage(teacher.grade_level) === keyStage(grade) &&
        ["adviser", "subject teacher"].includes(teachingType(teacher)),
    );

  SUGGESTED_GRADES.forEach((grade) => {
    const gradeTeachers = teachers.filter((teacher) => teacher.grade_level === grade);
    const pool = gradeTeachers.filter((teacher) => ["adviser", "subject teacher"].includes(teachingType(teacher)));
    const advisers = gradeTeachers.filter((teacher) => teachingType(teacher) === "adviser");
    const surname = (teacher) => String(teacher.family_name || teacher.name || "").trim();
    // Sections are named after the adviser's surname. When advisers share one, the first name, then the
    // middle initial, then a number is added so that no two classes end up with the same name.
    const sectionName = (adviser) => {
      const first = String(adviser.first_name || "").trim();
      const middle = String(adviser.middle_name || "").trim();
      const labels = [
        surname(adviser),
        [surname(adviser), first].filter(Boolean).join(", "),
        `${[surname(adviser), first].filter(Boolean).join(", ")}${middle ? ` ${middle.charAt(0)}.` : ""}`,
      ];
      const labelsOf = (other) => {
        const otherFirst = String(other.first_name || "").trim();
        const otherMiddle = String(other.middle_name || "").trim();
        return [
          surname(other),
          [surname(other), otherFirst].filter(Boolean).join(", "),
          `${[surname(other), otherFirst].filter(Boolean).join(", ")}${otherMiddle ? ` ${otherMiddle.charAt(0)}.` : ""}`,
        ];
      };
      for (let level = 0; level < labels.length; level += 1) {
        const same = advisers.filter((other) => labelsOf(other)[level].toUpperCase() === labels[level].toUpperCase());
        if (same.length === 1) return labels[level];
        if (level === labels.length - 1) return `${labels[level]} (${same.indexOf(adviser) + 1})`;
      }
      return labels[0];
    };
    const sections = advisers
      .map((adviser) => ({
        adviserId: String(adviser.id),
        grade_level: grade,
        section: sectionName(adviser),
      }))
      .filter((item) => item.section)
      // A Kinder adviser handles two classes: a morning session and an afternoon session
      .flatMap((item) =>
        grade === "Kinder"
          ? KINDER_SESSIONS.map((session) => ({ ...item, section: `${item.section} - ${session.label}`, start: session.start }))
          : [item],
      )
      .filter((item) => {
        if (!scheduledClasses.has(classKey(item))) return true;
        stats.skippedClasses += 1;
        return false;
      });
    if (!sections.length) return;
    stats.classes += sections.length;
    sections.forEach((item) => advisersScheduled.add(item.adviserId));

    if (grade === "Kinder") {
      sections.forEach((item) => {
        const period = {
          days: ALL_DAYS,
          time_start: item.start,
          time_end: fromMinutes(toMinutes(item.start) + KINDER_BLOCK_MINUTES),
        };
        // Both Kinder sessions stay with their adviser: the two blocks are exactly 6 hours of class teaching,
        // so the adviser's single class advisory is not allowed to push the afternoon session out
        const classMinutes = (busy[item.adviserId] || [])
          .filter((entry) => countsAsTeaching(entry) && !isMovableTask(entry) && !entry.reserved)
          .reduce((most, entry, _, list) => Math.max(most, ...entry.days.map((day) =>
            list.reduce((sum, other) => sum + (other.days.includes(day) ? duration(other) : 0), 0))), 0);
        if (clashes(item.adviserId, period) || classMinutes + KINDER_BLOCK_MINUTES > MAX_TEACHING_MINUTES) {
          stats.unassigned += 1;
          return;
        }
        const entry = {
          teacher_id: item.adviserId,
          load_type: "teaching",
          subject: SUBJECTS_BY_GRADE.Kinder[0],
          grade_level: grade,
          section: item.section,
          ...period,
          remarks: SUGGESTED_REMARK,
        };
        planned.push(entry);
        (busy[entry.teacher_id] ||= []).push(entry);
      });
      return;
    }

    const subjects = suggestedSubjects(grade)
      .map((subject) => ({ subject, allotment: allotmentFor(grade, subject, periodOption, subjectMinutes) }))
      .filter((item) => item.allotment);
    // From the chosen grade up, teachers handle a subject across sections instead of staying with one class.
    // Subjects of the same length and days trade time slots between sections, so one teacher can cover them all.
    const rotates =
      rotateFrom !== "none" &&
      sections.length > 1 &&
      SUGGESTED_GRADES.indexOf(grade) >= SUGGESTED_GRADES.indexOf(rotateFrom);
    const slotKind = (allotment) => `${allotment.minutes}|${allotment.days.join("")}`;
    const sameKind = {};
    subjects.forEach((item) => { (sameKind[slotKind(item.allotment)] ||= []).push(item.subject); });
    const kindPosition = {};

    let cursor = toMinutes(SUGGESTED_START);
    subjects.forEach(({ subject: slotSubject, allotment }) => {
      const kind = slotKind(allotment);
      const position = (kindPosition[kind] = (kindPosition[kind] ?? -1) + 1);
      // No period runs through recess: one that would is started right after it
      if (cursor < recessTo && cursor + allotment.minutes > recessFrom) cursor = recessTo;
      if (cursor < LUNCH_START && cursor + allotment.minutes > LUNCH_START) cursor = LUNCH_END;
      const period = {
        days: allotment.days,
        time_start: fromMinutes(cursor),
        time_end: fromMinutes(cursor + allotment.minutes),
      };
      cursor += allotment.minutes;

      sections.forEach((item, sectionIndex) => {
        const subject = rotates ? sameKind[kind][(position + sectionIndex) % sameKind[kind].length] : slotSubject;
        const available = (teacher) =>
          !clashes(String(teacher.id), period) && fitsLimits(String(teacher.id), period);
        const teachesIt = (teacher) =>
          rotates && (busy[String(teacher.id)] || []).some((entry) => entry.grade_level === grade && entry.subject === subject);
        // A teacher in this subject's group comes first; one grouped only under other subjects comes last
        const specialtyRank = (teacher) => {
          const groups = SPECIALTY_GRADES.includes(grade) ? specialtiesByTeacher[String(teacher.id)] : null;
          if (!groups?.size) return 1;
          if (!groups.has(specialtyGroup(subject))) return 2;
          // Grades picked for the teacher in Subject groups limit where they take the subject
          const grades = groups.get(specialtyGroup(subject));
          return !grades?.length || grades.includes(grade) ? 0 : 2;
        };
        // Teachers of another grade who were set to handle this subject in this grade as well
        const crossGrade = SPECIALTY_GRADES.includes(grade)
          ? teachers.filter(
              (candidate) =>
                !pool.includes(candidate) &&
                ["adviser", "subject teacher"].includes(teachingType(candidate)) &&
                specialtiesByTeacher[String(candidate.id)]?.get(specialtyGroup(subject))?.includes(grade),
            )
          : [];
        const isAdviser = (teacher) => String(teacher.id) === item.adviserId;
        const lighter = (a, b) => weeklyLoad(String(a.id)) - weeklyLoad(String(b.id));
        // Nobody is taken past 6 hours a day or 30 hours a week: when the grade's own teachers are full,
        // a free teacher from another grade of the same key stage is used, and failing that the period is left without a teacher
        const ownGrade = [...pool, ...crossGrade].filter(available);
        const candidates = ownGrade.length ? ownGrade : reserveFor(grade).filter((candidate) => !pool.includes(candidate) && available(candidate));
        // A teacher keeps a subject across sections only while that leaves them no more than about
        // one period a day heavier than the lightest free teacher, so loads stay even
        const lightest = Math.min(...candidates.map((candidate) => weeklyLoad(String(candidate.id))));
        const keepsIt = (teacher) =>
          teachesIt(teacher) && weeklyLoad(String(teacher.id)) - lightest <= ONE_HOUR * ALL_DAYS.length;
        // In the first period of the day the section's own adviser comes right after the teachers grouped
        // under the subject, so advisers start their day with a class
        const firstPeriod = period.time_start === SUGGESTED_START;
        const startsDay = (teacher) => firstPeriod && (specialtyRank(teacher) === 0 || isAdviser(teacher));
        const [teacher] = candidates
          .sort((a, b) =>
            rotates
              ? Number(startsDay(b)) - Number(startsDay(a)) || specialtyRank(a) - specialtyRank(b) || Number(keepsIt(b)) - Number(keepsIt(a)) || lighter(a, b) || Number(isAdviser(b)) - Number(isAdviser(a))
              : Number(isAdviser(b)) - Number(isAdviser(a)) || lighter(a, b),
          );
        if (!teacher) {
          stats.unassigned += 1;
          return;
        }
        const entry = {
          teacher_id: String(teacher.id),
          load_type: "teaching",
          subject,
          grade_level: grade,
          section: item.section,
          ...period,
          remarks: SUGGESTED_REMARK,
        };
        planned.push(entry);
        (busy[entry.teacher_id] ||= []).push(entry);
      });
    });

    // A section whose adviser is listed under Special Science Class is an SSC class: its SSC period is put
    // right after the class's last subject, with the adviser, so it shows in the class program.
    sections.forEach((item) => {
      const list = busy[item.adviserId] || [];
      const index = list.findIndex((entry) => entry.id && entry.load_type === "advisory" && entry.subject === SSC_TASK);
      if (index === -1) return;
      const task = list[index];
      const minutes = duration(task);
      const others = list.filter((_, position) => position !== index);
      for (let start = cursor; start + minutes <= 17 * 60; start += 5) {
        if (start < recessTo && start + minutes > recessFrom) continue;
        if (start < LUNCH_END && start + minutes > LUNCH_START) continue;
        const period = { days: task.days, time_start: fromMinutes(start), time_end: fromMinutes(start + minutes) };
        if (others.some((entry) => overlaps(period, entry))) continue;
        list[index] = { ...task, ...period, grade_level: grade, section: item.section };
        moves.push({ id: task.id, time_start: period.time_start, time_end: period.time_end, grade_level: grade, section: item.section });
        stats.sscClasses += 1;
        return;
      }
    });
  });

  // ALIVE: the school's ALIVE teachers are filled to a full teaching day (6 hours) with ALIVE class groups
  // ("ALIVE A", "ALIVE B", …), taking the grades they cover in turn so every grade gets its share. A group has
  // Arabic Language and Islamic Values Education at the same time, as the two meet on different days.
  const aliveSections = new Set(scheduledClasses);
  // The turn carries over from one teacher to the next, so the grades end up with the same number of groups
  let aliveTurn = 0;
  teachers.forEach((teacher) => {
    const id = String(teacher.id);
    // An ALIVE teacher covers Grades 1–6 unless grade boxes were set for them in the ALIVE subject group
    const picked = specialtiesByTeacher[id]?.get(ALIVE_GROUP);
    const grades = picked?.length
      ? ALIVE_GRADES.filter((grade) => picked.includes(grade))
      : teachingType(teacher) === "alive" ? ALIVE_GRADES : [];
    let misses = 0;
    while (misses < grades.length) {
      const grade = grades[aliveTurn % grades.length];
      aliveTurn += 1;
      const subjects = ALIVE_SUBJECTS
        .map((subject) => ({ subject, allotment: allotmentFor(grade, subject, periodOption, subjectMinutes) }))
        .filter((item) => item.allotment);
      const longest = Math.max(0, ...subjects.map((item) => item.allotment.minutes));
      let periods = null;
      for (let start = toMinutes(SUGGESTED_START); longest && !periods && start + longest <= 17 * 60; start += 5) {
        if (start < LUNCH_END && start + longest > LUNCH_START) continue;
        if (start < recessTo && start + longest > recessFrom) continue;
        const tryPeriods = subjects.map(({ subject, allotment }) => ({
          subject,
          days: allotment.days,
          time_start: fromMinutes(start),
          time_end: fromMinutes(start + allotment.minutes),
        }));
        if (tryPeriods.every((period) => !clashes(id, period) && fitsLimits(id, period))) periods = tryPeriods;
      }
      if (!periods) {
        misses += 1;
        continue;
      }
      misses = 0;
      let letter = 1;
      while (aliveSections.has(`${grade}|${ALIVE_GROUP} ${String.fromCharCode(64 + letter)}`)) letter += 1;
      const section = `${ALIVE_GROUP} ${String.fromCharCode(64 + letter)}`;
      aliveSections.add(`${grade}|${section}`);
      periods.forEach((period) => {
        const entry = { teacher_id: id, load_type: "teaching", grade_level: grade, section, ...period, remarks: SUGGESTED_REMARK };
        planned.push(entry);
        (busy[id] ||= []).push(entry);
      });
      stats.aliveClasses += 1;
    }
  });

  // The reserved class advisory of an adviser whose class was scheduled becomes a real period
  advisersScheduled.forEach((id) => {
    (busy[id] || [])
      .filter((entry) => entry.reserved && entry.placedAt)
      .forEach((task) => {
        advisories.push({
          teacher_id: id,
          load_type: "advisory",
          subject: CLASS_ADVISORY,
          days: task.days,
          time_start: task.time_start,
          time_end: task.time_end,
          remarks: SUGGESTED_REMARK,
        });
      });
  });

  return { planned, advisories, moves, ...stats, teachers: new Set(planned.map((entry) => entry.teacher_id)).size };
}

// ─── page ────────────────────────────────────────────────────────────────────
export default function TeachingLoadPage({ user, onLogout, onBack, addToast, showConfirm }) {
  const { requestPrint } = usePrintPreview();
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
  const [suggesting, setSuggesting] = useState(false);
  const rotateFrom = ROTATE_FROM;
  const [recessStart, setRecessStart] = useState(readRecessStart);
  const [subjectMinutes, setSubjectMinutes] = useState(readSubjectMinutes);
  const [specialties, setSpecialties] = useState([]);
  const [specialtyNotice, setSpecialtyNotice] = useState("");
  const [taskMinutes, setTaskMinutes] = useState({});
  const lastMinutes = useRef(DEFAULT_PERIOD_MINUTES);
  const [openConflictId, setOpenConflictId] = useState(null);
  const periodOption = PERIOD_OPTION;
  const [customSubject, setCustomSubject] = useState(false);
  const [customSubjects, setCustomSubjects] = useState(readCustomSubjects);
  const [newSubject, setNewSubject] = useState("");
  const [newSubjectGrades, setNewSubjectGrades] = useState(SUGGESTED_GRADES);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    const [teacherResult, entryResult, specialtyResult] = await Promise.all([
      supabase.from("org_chart").select("*").eq("category", "teaching"),
      supabase.from(TABLE).select("*").eq("school_year", schoolYear),
      supabase.from(SPECIALTY_TABLE).select("*"),
    ]);

    // Subject groups are optional: scheduling still works without them
    if (specialtyResult.error) {
      setSpecialties([]);
      setSpecialtyNotice(
        ["42P01", "PGRST205"].includes(specialtyResult.error.code)
          ? "Subject groups are not ready. Run supabase-teacher-specialties.sql in the Supabase SQL Editor."
          : specialtyResult.error.message || "Could not load the subject groups.",
      );
    } else {
      setSpecialties((specialtyResult.data || []).map((row) => ({ ...row, teacher_id: String(row.teacher_id) })));
      setSpecialtyNotice("");
    }

    if (teacherResult.error) {
      setError(teacherResult.error.message || "Could not load the teacher list.");
    } else {
      const gradeOrder = (teacher) => {
        const index = GRADE_LEVELS.indexOf(teacher.grade_level === "SPED" ? "SNED" : teacher.grade_level);
        return index === -1 ? 99 : index;
      };
      setTeachers(
        // ALS teachers follow their own workload and are kept out of this page
        (teacherResult.data || []).filter((teacher) => !OWN_WORKLOAD.includes(String(teacher.grade_level || "").toUpperCase()) && !OWN_WORKLOAD.includes(teachingType(teacher).toUpperCase())).sort(
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
      : mode === "class"
        ? entries.filter((entry) => entry.grade_level && classKey(entry) === activeKey)
        : [],
  );
  const summary = loadSummary(visibleEntries);

  // The program table always shows recess in its place, and says so when a period runs through it
  const recess = {
    recess: true,
    id: "recess",
    days: ALL_DAYS,
    time_start: recessStart,
    time_end: fromMinutes(toMinutes(recessStart) + RECESS_MINUTES),
  };
  const recessOverlapped = visibleEntries.filter((entry) => overlaps(recess, entry));
  const programRows = visibleEntries.length ? sortEntries([...visibleEntries, recess]) : visibleEntries;

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

  // Each conflicting period, with what it overlaps, so the tag can say why
  const entryConflicts = useMemo(() => {
    const flagged = new Map();
    const describe = (other, sameTeacher) =>
      `${other.subject}${classLabel(other) ? ` (${classLabel(other)})` : ""}, ${formatTime(other.time_start)}–${formatTime(other.time_end)}${
        sameTeacher ? "" : ` with ${teacherName(teacherById[other.teacher_id])}`
      }`;
    const flag = (entry, other, sameTeacher) => {
      if (!flagged.has(entry.id)) flagged.set(entry.id, []);
      flagged.get(entry.id).push(describe(other, sameTeacher));
    };
    entries.forEach((a, index) => {
      entries.slice(index + 1).forEach((b) => {
        if (!overlaps(a, b)) return;
        const sameTeacher = a.teacher_id === b.teacher_id;
        const sameClass =
          a.load_type !== "ancillary" && b.load_type !== "ancillary" && a.grade_level && classKey(a) === classKey(b);
        if (sameTeacher || sameClass) {
          flag(a, b, sameTeacher);
          flag(b, a, sameTeacher);
        }
      });
    });
    return flagged;
  }, [entries, teacherById]);

  // Every teacher's load side by side, heaviest first, to spot overload, conflicts, and uneven loads
  const workloadRows = teachers
    .map((teacher) => {
      const list = entriesByTeacher[String(teacher.id)] || [];
      return {
        teacher,
        key: String(teacher.id),
        summary: loadSummary(list),
        conflicts: list.filter((entry) => entryConflicts.has(entry.id)).length,
      };
    })
    .sort((a, b) => b.summary.totalAverage - a.summary.totalAverage);
  // Ancillary assignments are part of the workload, so loads are compared on teaching plus ancillary
  const loadedRows = workloadRows.filter((row) => row.summary.totalAverage > 0);
  const schoolAverage = loadedRows.length
    ? Math.round(loadedRows.reduce((sum, row) => sum + row.summary.totalAverage, 0) / loadedRows.length)
    : 0;
  const workloadCounts = {
    overloaded: workloadRows.filter((row) => row.summary.overloaded || row.summary.overWorkday).length,
    conflicts: workloadRows.filter((row) => row.conflicts > 0).length,
    noLoad: workloadRows.length - loadedRows.length,
    uneven: loadedRows.filter((row) => Math.abs(row.summary.totalAverage - schoolAverage) > BALANCE_TOLERANCE_MINUTES).length,
  };

  // A teacher belongs to one subject group: once placed, they are no longer offered for the other subjects
  const groupedTeacherIds = new Set(
    specialties.filter((row) => SPECIALTY_SUBJECTS.includes(row.subject)).map((row) => row.teacher_id),
  );

  // Assignments tab: class advisory and ancillary tasks, plus any task typed in by hand
  const assignmentTasks = [
    CLASS_ADVISORY,
    SSC_TASK,
    ...new Set([
      ...ANCILLARY_SUGGESTIONS,
      ...entries.filter((entry) => entry.load_type === "ancillary").map((entry) => entry.subject),
    ]),
  ];
  const taskEntries = (task) =>
    entries.filter((entry) =>
      TEACHING_TASKS.includes(task)
        ? entry.load_type === "advisory" && entry.subject === task
        : entry.load_type === "ancillary" && entry.subject === task,
    );
  // Assigned teachers listed under their grade level, in grade order then by name
  const taskGradeGroups = (assigned) => {
    const groups = new Map();
    assigned.forEach((entry) => {
      const raw = entry.grade_level || teacherById[entry.teacher_id]?.grade_level || "";
      const grade = raw === "SPED" ? "SNED" : raw || "No grade level";
      if (!groups.has(grade)) groups.set(grade, []);
      groups.get(grade).push(entry);
    });
    const order = (grade) => (GRADE_LEVELS.includes(grade) ? GRADE_LEVELS.indexOf(grade) : 99);
    return [...groups.entries()]
      .sort(([a], [b]) => order(a) - order(b) || a.localeCompare(b))
      .map(([grade, list]) => ({
        grade,
        entries: list.sort((a, b) =>
          teacherName(teacherById[a.teacher_id]).localeCompare(teacherName(teacherById[b.teacher_id])),
        ),
      }));
  };

  // SSC teachers: everyone listed, with their SSC time block when one was given
  const sscItems = () => {
    const loads = taskEntries(SSC_TASK);
    const tags = specialties.filter((row) => row.subject === SSC_TASK);
    const items = tags.map((tag) => {
      const load = loads.find((entry) => entry.teacher_id === tag.teacher_id) || null;
      return { id: `ssc-${tag.id}`, teacher_id: tag.teacher_id, tag, load, grade_level: load?.grade_level, section: load?.section };
    });
    loads
      .filter((entry) => !tags.some((tag) => tag.teacher_id === entry.teacher_id))
      .forEach((entry) => items.push({ ...entry, tag: null, load: entry }));
    return items;
  };

  const openTeacher = (key) => {
    setMode("teacher");
    setSearch("");
    setSelectedKey(key);
    closeForm();
  };

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
      subject: RENAMED_SUBJECTS[entry.subject] || entry.subject || "",
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
    // "To" follows "From": the end time is always the new start plus the period's length.
    // The length is remembered, so it survives the start time being cleared while it is retyped.
    setForm((current) => ({
      ...current,
      time_start: value,
      time_end: value ? fromMinutes(toMinutes(value) + lastMinutes.current) : current.time_end,
    }));
  };

  // Picking a subject or grade sets the end time from the official time allotment
  const changeSubjectOrGrade = (field, value) => {
    setForm((current) => {
      const next = { ...current, [field]: value };
      // A listed subject that the newly chosen grade does not offer is cleared
      if (field === "grade_level" && !isCustomSubject && next.load_type !== "ancillary") {
        const offered = subjectsOffered(value);
        if (!offered.includes(next.subject)) next.subject = "";
      }
      if (next.load_type === "ancillary" || !next.time_start) return next;
      const allotment = allotmentFor(next.grade_level, next.subject, periodOption, subjectMinutes);
      return allotment
        ? { ...next, days: allotment.days, time_end: fromMinutes(toMinutes(next.time_start) + allotment.minutes) }
        : next;
    });
  };

  const saveSubjectMinutes = (next) => {
    setSubjectMinutes(next);
    try {
      localStorage.setItem(SUBJECT_MINUTES_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // The values still apply for this session
    }
  };

  // An empty box goes back to the standard length for that subject
  const changeSubjectMinutes = (grade, subject, value) => {
    const minutes = Math.min(Math.max(Math.round(Number(value)), 0), 240);
    const gradeValues = { ...(subjectMinutes[grade] || {}) };
    if (value === "" || !minutes) delete gradeValues[subject];
    else gradeValues[subject] = minutes;
    saveSubjectMinutes({ ...subjectMinutes, [grade]: gradeValues });
  };

  const changeRecessStart = (value) => {
    if (!value) return;
    setRecessStart(value);
    try {
      localStorage.setItem(RECESS_STORAGE_KEY, value);
    } catch {
      // The choice still applies for this session
    }
  };

  const saveCustomSubjects = (next) => {
    setCustomSubjects(next);
    try {
      localStorage.setItem(CUSTOM_SUBJECTS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // The subjects still apply for this session
    }
  };

  const addCustomSubject = (event) => {
    event.preventDefault();
    const name = newSubject.trim().replace(/\s+/g, " ");
    if (!name) return addToast("Type the name of the subject.", "warning");
    if (!newSubjectGrades.length) return addToast("Tick at least one grade level for the subject.", "warning");
    const taken = [...Object.values(SUBJECTS_BY_GRADE).flat(), ...PROGRAM_SUBJECTS, ...customSubjects.map((item) => item.name)];
    if (taken.some((item) => item.toLowerCase() === name.toLowerCase())) {
      return addToast(`${name} is already in the subject list.`, "warning");
    }
    saveCustomSubjects([...customSubjects, { name, grades: GRADE_LEVELS.filter((grade) => newSubjectGrades.includes(grade)) }]);
    setNewSubject("");
    addToast(`${name} added to the subject list.`, "success");
  };

  const toggleCustomSubjectGrade = (name, grade) =>
    saveCustomSubjects(
      customSubjects.map((item) =>
        item.name !== name
          ? item
          : { ...item, grades: item.grades.includes(grade) ? item.grades.filter((value) => value !== grade) : [...item.grades, grade] },
      ),
    );

  // Subjects a grade offers: the official list, the program subjects, then the school's own
  const subjectsOffered = (grade) => [
    ...(SUBJECTS_BY_GRADE[grade] || []),
    ...PROGRAM_SUBJECTS,
    ...customSubjects.filter((item) => item.grades.includes(grade)).map((item) => item.name),
  ];

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
      // A suggested period that has been reviewed and saved by hand is no longer a suggestion
      remarks: form.remarks.trim() === SUGGESTED_REMARK ? null : form.remarks.trim() || null,
      updated_at: new Date().toISOString(),
    };

    const conflicts = conflictsFor(payload, editingId);
    if (conflicts.length) {
      const proceed = await showConfirm(`Schedule conflict:\n\n${conflicts.slice(0, 4).join("\n")}\n\nSave this period anyway?`);
      if (!proceed) return;
    }

    if (countsAsTeaching(payload)) {
      const others = (entriesByTeacher[payload.teacher_id] || []).filter((entry) => entry.id !== editingId);
      const before = loadSummary(others);
      const after = loadSummary([...others, payload]);
      if (after.overloaded && !before.overloaded) {
        const proceed = await showConfirm(
          `${teacherName(teacherById[payload.teacher_id])} would go over the teaching limit of 6 hours a day or 30 hours a week (${formatMinutes(Math.max(...ALL_DAYS.map((code) => after.perDay[code])))} on the heaviest day, ${formatMinutes(after.weekly)} a week).\n\nSave this period anyway?`,
        );
        if (!proceed) return;
      }
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

  const suggestedCount = entries.filter((entry) => entry.remarks === SUGGESTED_REMARK).length;

  const suggestSchedule = async () => {
    const specialtiesByTeacher = {};
    // Subject → grades the teacher takes it in (empty: no grade picked, so any Grade 4–6 class)
    specialties.filter((row) => SPECIALTY_SUBJECTS.includes(row.subject)).forEach((row) => {
      (specialtiesByTeacher[row.teacher_id] ||= new Map()).set(row.subject, row.grade_levels || []);
    });
    const plan = buildSuggestedSchedule(teachers, entries, periodOption, rotateFrom, specialtiesByTeacher, recessStart, subjectMinutes);
    if (!plan.planned.length) {
      addToast(
        plan.skippedClasses
          ? "Every adviser's class already has periods. Remove them first to get a new suggestion."
          : "No advisers found for Kinder to Grade 6. Set each teacher's grade level and type in Organizational Chart.",
        "warning",
        6000,
      );
      return;
    }
    const proceed = await showConfirm(
      `Suggest a schedule for SY ${schoolYear}?\n\n` +
        `${plan.planned.length} periods will be added for ${plan.classes} class${plan.classes === 1 ? "" : "es"} and ${plan.teachers} teacher${plan.teachers === 1 ? "" : "s"}, starting ${formatTime(SUGGESTED_START)}.` +
        (plan.skippedClasses ? `\n${plan.skippedClasses} class${plan.skippedClasses === 1 ? "" : "es"} already scheduled will be left as is.` : "") +
        (plan.aliveClasses ? `\nALIVE (Arabic Language and Islamic Values Education) will be added as ${plan.aliveClasses} class group${plan.aliveClasses === 1 ? "" : "s"}, filling each ALIVE teacher up to 6 hours a day.` : "") +
        (plan.sscClasses ? `
The Special Science Class period will be placed after the last subject of ${plan.sscClasses} SSC class${plan.sscClasses === 1 ? "" : "es"}, with the adviser.` : "") +
        (plan.advisories.length ? `\nClass Advisory, one hour a day counted as teaching load, will be added for ${plan.advisories.length} adviser${plan.advisories.length === 1 ? "" : "s"}.` : "") +
        (plan.moves.length ? `
${plan.moves.length} class advisory or ancillary assignment${plan.moves.length === 1 ? "" : "s"} will be moved to the end of the day.` : "") +
        (plan.unassigned ? `\n${plan.unassigned} period${plan.unassigned === 1 ? "" : "s"} could not be given a teacher without going over 6 hours a day or 30 hours a week, and will be left out.` : "") +
        `\n\nYou can edit or remove any period afterwards.`,
    );
    if (!proceed) return;

    setSuggesting(true);
    const rows = [...plan.planned, ...plan.advisories].map((entry) => ({ ...entry, school_year: schoolYear, created_by: user?.email || null }));
    let failure = null;
    for (let index = 0; index < rows.length && !failure; index += 200) {
      const { error: insertError } = await supabase.from(TABLE).insert(rows.slice(index, index + 200));
      failure = insertError;
    }
    for (let index = 0; index < plan.moves.length && !failure; index += 1) {
      const { id, ...times } = plan.moves[index];
      const { error: moveError } = await supabase.from(TABLE).update({ ...times, updated_at: new Date().toISOString() }).eq("id", id);
      failure = moveError;
    }
    setSuggesting(false);

    if (failure) addToast(failure.message || "Could not save the suggested schedule.", "error", 6000);
    else addToast(`Suggested schedule added: ${rows.length} periods.`, "success");
    closeForm();
    setMode("summary");
    await loadData();
  };

  // Gives a task to a teacher at their latest free time, after classes; the time can be changed from the teacher's program
  const assignTask = async (task, teacherId) => {
    // SSC: the teacher is listed (kept in teacher_specialties) with no load of their own; a time block is
    // added as teaching load only when minutes are entered for it
    if (task === SSC_TASK) {
      if (!specialties.some((row) => row.subject === SSC_TASK && row.teacher_id === teacherId)) {
        const { data, error: tagError } = await supabase
          .from(SPECIALTY_TABLE)
          .insert({ teacher_id: teacherId, subject: SSC_TASK, created_by: user?.email || null })
          .select()
          .single();
        if (tagError) {
          addToast(tagError.message || `Could not add ${teacherName(teacherById[teacherId])} to ${task}.`, "error", 5000);
          return;
        }
        setSpecialties((current) => [...current, { ...data, teacher_id: String(data.teacher_id) }]);
      }
      if (!(Number(taskMinutes[task]) > 0)) {
        addToast(`${teacherName(teacherById[teacherId])} added to ${task}.`, "success");
        return;
      }
    }
    const minutes = Math.min(Math.max(Number(taskMinutes[task]) || DEFAULT_TASK_MINUTES, 5), 240);
    // Class advisory and SSC are teaching load: past 6 hours a day it becomes teaching overload, capped at 2 hours
    if (TEACHING_TASKS.includes(task)) {
      const after = loadSummary([
        ...(entriesByTeacher[teacherId] || []),
        { load_type: "advisory", days: ALL_DAYS, time_start: "00:00", time_end: fromMinutes(minutes) },
      ]);
      if (after.overCap) {
        addToast(`${teacherName(teacherById[teacherId])} would go over 8 hours of teaching a day with ${task}. Lighten their teaching load first.`, "warning", 6000);
        return;
      }
      if (after.overloaded) {
        const proceed = await showConfirm(
          `${teacherName(teacherById[teacherId])} already teaches the full load. With ${task} they will have ${after.overloadMinutes} minutes of teaching overload a day (DepEd allows up to 2 hours, paid as overload).

Assign it anyway?`,
        );
        if (!proceed) return;
      }
    }
    const slot = findFreeSlot(entriesByTeacher[teacherId] || [], minutes);
    if (!slot) {
      addToast(`${teacherName(teacherById[teacherId])} has no free ${minutes} minutes between 7:30 AM and 5:00 PM. Add the task from the teacher's program instead.`, "warning", 6000);
      return;
    }
    const { error: insertError } = await supabase.from(TABLE).insert({
      school_year: schoolYear,
      teacher_id: teacherId,
      load_type: TEACHING_TASKS.includes(task) ? "advisory" : "ancillary",
      subject: task,
      ...slot,
      created_by: user?.email || null,
    });
    if (insertError) {
      addToast(insertError.message || `Could not assign ${task}.`, "error", 5000);
      return;
    }
    addToast(`${task} assigned to ${teacherName(teacherById[teacherId])}, ${formatTime(slot.time_start)}–${formatTime(slot.time_end)}.`, "success");
    await loadData();
  };

  // Removes a teacher from SSC: their listing and, if minutes were given, the SSC time block
  const removeSsc = async (item) => {
    const confirmed = await showConfirm(`Remove ${teacherName(teacherById[item.teacher_id])} from ${SSC_TASK}?`);
    if (!confirmed) return;
    if (item.tag) {
      const { error: tagError } = await supabase.from(SPECIALTY_TABLE).delete().eq("id", item.tag.id);
      if (tagError) return addToast(tagError.message || "Could not remove the teacher.", "error", 5000);
      setSpecialties((current) => current.filter((row) => row.id !== item.tag.id));
    }
    if (item.load) {
      const { error: loadError } = await supabase.from(TABLE).delete().eq("id", item.load.id);
      if (loadError) return addToast(loadError.message || "Could not remove the SSC time.", "error", 5000);
      await loadData();
    }
    addToast(`${teacherName(teacherById[item.teacher_id])} removed from ${SSC_TASK}.`, "success");
  };

  const addSpecialty = async (subject, teacherId) => {
    const { data, error: insertError } = await supabase
      .from(SPECIALTY_TABLE)
      .insert({ teacher_id: teacherId, subject, created_by: user?.email || null })
      .select()
      .single();
    if (insertError) {
      addToast(insertError.message || `Could not add the teacher to ${subject}.`, "error", 5000);
      return;
    }
    setSpecialties((current) => [...current, { ...data, teacher_id: String(data.teacher_id) }]);
  };

  // Grades a grouped teacher handles the subject in; their own grade until others are picked
  const specialtyGrades = (row) => {
    const allowed = groupGrades(row.subject);
    const picked = allowed.filter((grade) => (row.grade_levels || []).includes(grade));
    if (picked.length) return picked;
    const own = teacherById[row.teacher_id]?.grade_level;
    return allowed.includes(own) ? [own] : [];
  };

  // Who can be added to a subject group: Grade 4–6 advisers and every subject teacher; ALIVE teachers for ALIVE
  const canJoinGroup = (teacher, subject) =>
    subject === ALIVE_GROUP
      ? teachingType(teacher) === "alive"
      : teachingType(teacher) === "subject teacher" ||
        (teachingType(teacher) === "adviser" && SPECIALTY_GRADES.includes(teacher.grade_level));

  const toggleSpecialtyGrade = async (row, grade) => {
    const current = specialtyGrades(row);
    const next = current.includes(grade) ? current.filter((value) => value !== grade) : [...current, grade];
    if (!next.length) {
      return addToast("A teacher needs at least one grade level. Use × to remove them from the subject.", "warning");
    }
    const gradeLevels = groupGrades(row.subject).filter((value) => next.includes(value));
    const { data, error: updateError } = await supabase
      .from(SPECIALTY_TABLE)
      .update({ grade_levels: gradeLevels })
      .eq("id", row.id)
      .select()
      .maybeSingle();
    if (updateError || !data) {
      addToast(
        !data || ["42703", "PGRST204", "42501"].includes(updateError?.code)
          ? "Grade levels per teacher are not ready. Run supabase-teacher-specialties-grade-levels.sql in the Supabase SQL Editor."
          : updateError.message || "Could not save the grade levels.",
        "error",
        6000,
      );
      return;
    }
    setSpecialties((list) => list.map((item) => (item.id === row.id ? { ...item, grade_levels: gradeLevels } : item)));
  };

  const removeSpecialty = async (row) => {
    const { error: deleteError } = await supabase.from(SPECIALTY_TABLE).delete().eq("id", row.id);
    if (deleteError) {
      addToast(deleteError.message || `Could not remove the teacher from ${row.subject}.`, "error", 5000);
      return;
    }
    setSpecialties((current) => current.filter((item) => item.id !== row.id));
  };

  const clearSuggested = async () => {
    const confirmed = await showConfirm(
      `Remove the ${suggestedCount} suggested period${suggestedCount === 1 ? "" : "s"} for SY ${schoolYear}? Periods you added or edited yourself are kept. This cannot be undone.`,
    );
    if (!confirmed) return;
    setSuggesting(true);
    const { error: deleteError } = await supabase.from(TABLE).delete().eq("school_year", schoolYear).eq("remarks", SUGGESTED_REMARK);
    setSuggesting(false);
    if (deleteError) {
      addToast(deleteError.message || "Could not remove the suggested periods.", "error", 5000);
      return;
    }
    addToast("Suggested periods removed.", "success");
    closeForm();
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
      : subjectsOffered(form.grade_level);
  // A saved subject that is not in the list (typed earlier) also shows as "Other"
  const isCustomSubject = customSubject || Boolean(form.subject && !subjectOptions.includes(form.subject));

  const formMinutes = form.time_start && form.time_end ? duration(form) : 0;
  useEffect(() => {
    if (formMinutes > 0) lastMinutes.current = formMinutes;
  }, [formMinutes]);

  const formAllotment =
    form.load_type === "ancillary" ? null : allotmentFor(form.grade_level, form.subject, periodOption, subjectMinutes);

  const heading = mode === "teacher" ? teacherName(selectedTeacher) : selectedClass ? classLabel(selectedClass) : "";
  const hasSelection = Boolean(selectedTeacher || selectedClass);
  const tableReady = !error || teachers.length > 0;
  // Summary and subject groups use the full width, without the teacher/class list
  const wide = mode === "summary" || mode === "groups" || mode === "tasks" || mode === "minutes" || mode === "subjects";

  return (
    <div className="tl-root">
      <Topbar user={user} onLogout={onLogout} onBack={onBack} title="Teaching Load" />

      <div className="tl-toolbar">
        <div className="tl-segment" role="tablist" aria-label="View schedule by">
          <button type="button" className={mode === "teacher" ? "active" : ""} onClick={() => switchMode("teacher")}>By teacher</button>
          <button type="button" className={mode === "class" ? "active" : ""} onClick={() => switchMode("class")}>By class</button>
          <button type="button" className={mode === "summary" ? "active" : ""} onClick={() => switchMode("summary")}>Workload summary</button>
          <button type="button" className={mode === "groups" ? "active" : ""} onClick={() => switchMode("groups")}>Subject groups</button>
          <button type="button" className={mode === "tasks" ? "active" : ""} onClick={() => switchMode("tasks")}>Assignments</button>
          <button type="button" className={mode === "minutes" ? "active" : ""} onClick={() => switchMode("minutes")}>Time allotment</button>
          <button type="button" className={mode === "subjects" ? "active" : ""} onClick={() => switchMode("subjects")}>Subjects</button>
        </div>
        <div className="tl-toolbar-spacer" />
        <button type="button" className="tl-button" onClick={loadData} disabled={loading}>Refresh</button>
        <button type="button" className="tl-button" onClick={() => requestPrint()} disabled={mode === "summary" ? !teachers.length : !visibleEntries.length}>Print</button>
        {suggestedCount > 0 && (
          <button type="button" className="tl-button" onClick={clearSuggested} disabled={loading || suggesting}>Clear suggested ({suggestedCount})</button>
        )}
        <button
          type="button"
          className="tl-button"
          onClick={suggestSchedule}
          disabled={loading || suggesting || !teachers.length}
          title="Drafts a class program for every adviser's class that has no periods yet"
        >
          {suggesting ? "Working…" : "Suggest schedule"}
        </button>
        <button type="button" className="tl-button primary" onClick={openAdd} disabled={loading || !teachers.length}>+ Add period</button>
      </div>

      {/* Settings that shape the schedule, on their own row so the toolbar never wraps */}
      <div className="tl-options">
        <label className="tl-sy">
          <span>School Year</span>
          <select value={schoolYear} onChange={(event) => { setSchoolYear(event.target.value); closeForm(); }}>
            {schoolYearOptions().map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
        </label>
        <label className="tl-sy" title="Recess is 20 minutes. It is shown in every class program, and Suggest schedule keeps periods out of it.">
          <span>Recess starts</span>
          <input type="time" value={recessStart} onChange={(event) => changeRecessStart(event.target.value)} />
          <span className="tl-sy-note">ends {formatTime(fromMinutes(toMinutes(recessStart) + RECESS_MINUTES))} · 20 min</span>
        </label>
      </div>

      {error && <div className="tl-error">{error}</div>}

      <div className={`tl-body${wide ? " summary" : ""}`}>
        {!wide && <aside className="tl-list">
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
        </aside>}

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
              <label className="tl-field tl-field-wide">
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
                <span>Length</span>
                <select
                  value={PERIOD_LENGTHS.some((option) => option.minutes === formMinutes) ? String(formMinutes) : ""}
                  onChange={(event) => {
                    const minutes = Number(event.target.value);
                    if (!minutes) return;
                    lastMinutes.current = minutes;
                    if (form.time_start) updateField("time_end", fromMinutes(toMinutes(form.time_start) + minutes));
                  }}
                >
                  {!PERIOD_LENGTHS.some((option) => option.minutes === formMinutes) && (
                    <option value="">{formMinutes > 0 ? `Other (${formMinutes} min)` : "Other"}</option>
                  )}
                  {PERIOD_LENGTHS.map((option) => <option key={option.minutes} value={option.minutes}>{option.label}</option>)}
                </select>
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
            <section className="tl-sheet" data-print-root data-print-paper="A4" data-print-margins="0.5 0.5 0.5 0.5">
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
                    {programRows.map((entry) => entry.recess ? (
                      <tr key="recess" className="tl-recess">
                        <td className="nowrap">{formatTime(entry.time_start)} – {formatTime(entry.time_end)}</td>
                        <td className="num">{RECESS_MINUTES}</td>
                        <td className="nowrap">Daily</td>
                        <td colSpan={5}>
                          Recess
                          {recessOverlapped.length > 0 && (
                            <span className="tl-recess-note">
                              {recessOverlapped.map((item) => item.subject).join(", ")} runs through recess
                            </span>
                          )}
                        </td>
                      </tr>
                    ) : (
                      <Fragment key={entry.id}>
                      <tr className={entryConflicts.has(entry.id) ? "conflict" : ""}>
                        <td className="nowrap">{formatTime(entry.time_start)} – {formatTime(entry.time_end)}</td>
                        <td className="num">{duration(entry)}</td>
                        <td className="nowrap">{formatDays(entry.days)}</td>
                        <td>
                          {entry.subject}
                          {entryConflicts.has(entry.id) && (
                            <button
                              type="button"
                              className="tl-conflict-tag"
                              aria-expanded={openConflictId === entry.id}
                              title="Show what this period overlaps"
                              onClick={() => setOpenConflictId((current) => (current === entry.id ? null : entry.id))}
                            >
                              Conflict {openConflictId === entry.id ? "▴" : "▾"}
                            </button>
                          )}
                        </td>
                        <td>{mode === "teacher" ? classLabel(entry) || "—" : teacherName(teacherById[entry.teacher_id])}</td>
                        <td><span className={`tl-type ${entry.load_type}`}>{LOAD_TYPE_LABEL[entry.load_type] || entry.load_type}</span></td>
                        <td>{entry.remarks || ""}</td>
                        <td className="tl-col-actions">
                          <button type="button" onClick={() => openEdit(entry)}>Edit</button>
                          <button type="button" className="danger" onClick={() => deleteEntry(entry)}>Remove</button>
                        </td>
                      </tr>
                      {openConflictId === entry.id && entryConflicts.has(entry.id) && (
                        <tr className="tl-conflict-detail">
                          <td colSpan={8}>
                            <strong>
                              {entry.subject}, {formatTime(entry.time_start)}–{formatTime(entry.time_end)}, is at the same time as:
                            </strong>
                            <ul>
                              {entryConflicts.get(entry.id).map((reason) => <li key={reason}>{reason}</li>)}
                            </ul>
                            <span>Change the time, days, or teacher of one of them so they no longer overlap.</span>
                          </td>
                        </tr>
                      )}
                      </Fragment>
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

          {!loading && tableReady && mode === "summary" && (
            <section className="tl-sheet" data-print-root data-print-paper="A4" data-print-orientation="landscape" data-print-margins="0.5 0.5 0.5 0.5">
              <div className="tl-print-header">
                <strong>{SCHOOL_NAME}</strong>
                <span>Summary of Teaching Loads · School Year {schoolYear}</span>
              </div>
              <header className="tl-sheet-heading">
                <div>
                  <h1>Workload summary</h1>
                  <p>Minutes per day for every teacher, heaviest first. The regular teaching load is 6 hours (360 min) a day or 30 hours a week, with class advisory counted as one of those hours. Anything beyond is teaching overload, at most 2 hours a day. The workday is 8 hours (480 min) including ancillary tasks.</p>
                </div>
                <dl className="tl-stats">
                  <div><dt>School avg. / day</dt><dd>{schoolAverage} min</dd></div>
                  <div><dt>Overloaded</dt><dd className={workloadCounts.overloaded ? "warn" : ""}>{workloadCounts.overloaded}</dd></div>
                  <div><dt>With conflicts</dt><dd className={workloadCounts.conflicts ? "warn" : ""}>{workloadCounts.conflicts}</dd></div>
                  <div><dt>Uneven load</dt><dd>{workloadCounts.uneven}</dd></div>
                  <div><dt>No load yet</dt><dd>{workloadCounts.noLoad}</dd></div>
                </dl>
              </header>

              {workloadRows.length === 0 ? (
                <div className="tl-empty">
                  <strong>No teaching personnel yet</strong>
                  <span>Add teachers in Organizational Chart to build their teaching loads.</span>
                </div>
              ) : (
                <table className="tl-table tl-summary">
                  <thead>
                    <tr>
                      <th>Teacher</th>
                      {DAYS.map((day) => <th key={day.code} className="num">{day.label}</th>)}
                      <th className="num">Teaching / day</th>
                      <th className="tl-col-bar">Of 6 hours</th>
                      <th className="num">Ancillary / day</th>
                      <th className="num">Total / day</th>
                      <th className="num">vs. school avg.</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workloadRows.map((row) => {
                      const loaded = row.summary.totalAverage > 0;
                      const difference = row.summary.totalAverage - schoolAverage;
                      const over = row.summary.overloaded || row.summary.overWorkday;
                      const uneven = loaded && Math.abs(difference) > BALANCE_TOLERANCE_MINUTES;
                      return (
                        <tr key={row.key} className="tl-summary-row" onClick={() => openTeacher(row.key)} title="Open this teacher's class program">
                          <td>
                            <strong>{teacherName(row.teacher)}</strong>
                            <small>{[row.teacher.teaching_position, row.teacher.grade_level].filter(Boolean).join(" · ")}</small>
                          </td>
                          {DAYS.map((day) => (
                            <td key={day.code} className={`num${row.summary.perDay[day.code] > MAX_TEACHING_MINUTES ? " warn" : ""}`}>
                              {row.summary.perDay[day.code] || "—"}
                            </td>
                          ))}
                          <td className="num">{row.summary.weekly ? row.summary.average : "—"}</td>
                          <td className="tl-col-bar">
                            <span className="tl-bar">
                              <span
                                className={row.summary.overloaded ? "warn" : ""}
                                style={{ width: `${Math.min(row.summary.average / MAX_TEACHING_MINUTES, 1) * 100}%` }}
                              />
                            </span>
                          </td>
                          <td className="num">{row.summary.ancillaryWeekly ? row.summary.ancillaryAverage : "—"}</td>
                          <td className={`num${row.summary.overWorkday ? " warn" : ""}`}><strong>{loaded ? row.summary.totalAverage : "—"}</strong></td>
                          <td className="num">{loaded ? `${difference > 0 ? "+" : ""}${difference}` : "—"}</td>
                          <td className="nowrap">
                            {row.summary.overloaded && (
                              <span className="tl-status over" title="Teaching past 6 hours a day is teaching overload; DepEd allows at most 2 hours a day">
                                {row.summary.overCap ? "Over 8 h teaching" : `Overload +${row.summary.overloadMinutes} min`}
                              </span>
                            )}
                            {row.summary.overWorkday && <span className="tl-status over">Over 8 h workday</span>}
                            {row.conflicts > 0 && <span className="tl-status over">{row.conflicts} in conflict</span>}
                            {!loaded && <span className="tl-status none">No load</span>}
                            {uneven && !over && (
                              <span className="tl-status uneven">{difference > 0 ? "Above average" : "Below average"}</span>
                            )}
                            {loaded && !uneven && !over && !row.conflicts && <span className="tl-status ok">Balanced</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}

              <div className="tl-signatures">
                <div><span /><small>Prepared by</small></div>
                <div><span /><small>School Head</small></div>
              </div>
            </section>
          )}

          {!loading && tableReady && mode === "groups" && (
            <section className="tl-sheet">
              <header className="tl-sheet-heading">
                <div>
                  <h1>Subject groups</h1>
                  <p>Put each teacher under the subject they specialize in, then click the grade boxes to mark every grade level they cover. Suggest schedule gives a Grade 4–6 subject to its group; Kinder to Grade 3 stay with their adviser. ALIVE covers Arabic Language and Islamic Values Education from Grade 1: Suggest schedule fills each ALIVE teacher to 6 hours a day with ALIVE class groups across the grades they cover; add them to the ALIVE row only to limit those grades.</p>
                </div>
                <dl className="tl-stats">
                  <div><dt>Teachers grouped</dt><dd>{new Set(specialties.filter((row) => SPECIALTY_SUBJECTS.includes(row.subject)).map((row) => row.teacher_id)).size} of {teachers.filter((teacher) => SPECIALTY_SUBJECTS.some((subject) => canJoinGroup(teacher, subject))).length}</dd></div>
                </dl>
              </header>
              {specialtyNotice && <div className="tl-warning">{specialtyNotice}</div>}
              <table className="tl-table tl-groups tl-tasks">
                <thead>
                  <tr>
                    <th>Subject</th>
                    <th>Teachers</th>
                    <th className="tl-col-add">Add teacher</th>
                  </tr>
                </thead>
                <tbody>
                  {SPECIALTY_SUBJECTS.map((subject) => {
                    const members = specialties.filter((row) => row.subject === subject);
                    // A teacher is listed once, under their own grade level; the grade boxes show every grade they cover
                    const listed = members;
                    return (
                      <tr key={subject}>
                        <td className="nowrap"><strong>{subject}</strong></td>
                        <td>
                          {members.length === 0 && <span className="tl-muted">No teacher assigned</span>}
                          {taskGradeGroups(listed).map((group) => (
                            <div className="tl-task-group" key={group.grade}>
                              <div className="tl-task-grade">
                                {group.grade}
                                <small>{group.entries.length}</small>
                              </div>
                              <ul className="tl-task-list">
                                {group.entries.map((row) => (
                                  <li key={row.id}>
                                    <span className="tl-task-name" title={teacherName(teacherById[row.teacher_id])}>{teacherName(teacherById[row.teacher_id])}</span>
                                    {teacherById[row.teacher_id]?.teaching_position && <small>{teacherById[row.teacher_id].teaching_position}</small>}
                                    <span className="tl-grade-pick" role="group" aria-label={`Grade levels ${teacherName(teacherById[row.teacher_id])} covers for ${subject}`}>
                                      {groupGrades(subject).map((grade) => {
                                        const on = specialtyGrades(row).includes(grade);
                                        return (
                                          <button
                                            type="button"
                                            key={grade}
                                            className={on ? "on" : ""}
                                            aria-pressed={on}
                                            title={on ? `Covers ${grade}. Click to remove this grade.` : `Add ${grade} to the grades this teacher covers`}
                                            onClick={() => toggleSpecialtyGrade(row, grade)}
                                          >
                                            {grade.replace("Grade ", "G")}
                                          </button>
                                        );
                                      })}
                                    </span>
                                    <button type="button" aria-label={`Remove ${teacherName(teacherById[row.teacher_id])} from ${subject}`} title="Remove from this subject" onClick={() => removeSpecialty(row)}>×</button>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </td>
                        <td className="tl-col-add">
                          <select
                            aria-label={`Add teacher to ${subject}`}
                            value=""
                            disabled={Boolean(specialtyNotice)}
                            onChange={(event) => event.target.value && addSpecialty(subject, event.target.value)}
                          >
                            <option value="">Add teacher…</option>
                            {teachers.filter((teacher) => canJoinGroup(teacher, subject) && !groupedTeacherIds.has(String(teacher.id))).map((teacher) => (
                              <option key={teacher.id} value={String(teacher.id)}>
                                {[teacherName(teacher), teacher.teaching_type, teacher.grade_level !== teacher.teaching_type && teacher.grade_level].filter(Boolean).join(" · ")}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          )}

          {!loading && tableReady && mode === "minutes" && (
            <section className="tl-sheet">
              <header className="tl-sheet-heading">
                <div>
                  <h1>Time allotment</h1>
                  <p>Minutes per subject for each grade. Suggest schedule and the period form use these. A blank box uses the standard length shown in grey.</p>
                </div>
                <button
                  type="button"
                  className="tl-button"
                  onClick={() => saveSubjectMinutes({})}
                  disabled={!Object.values(subjectMinutes).some((values) => Object.keys(values || {}).length)}
                >
                  Reset to standard
                </button>
              </header>
              <table className="tl-table tl-minutes-table">
                <thead>
                  <tr>
                    <th>Subject</th>
                    {SUGGESTED_GRADES.map((grade) => <th key={grade} className="num">{grade}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {[...new Set(SUGGESTED_GRADES.flatMap((grade) => SUBJECTS_BY_GRADE[grade]))].map((subject) => (
                    <tr key={subject}>
                      <td><strong>{subject}</strong></td>
                      {SUGGESTED_GRADES.map((grade) => {
                        const standard = standardAllotmentFor(grade, subject, periodOption);
                        return (
                          <td key={grade} className="num">
                            {standard ? (
                              <input
                                className={`tl-minutes${subjectMinutes[grade]?.[subject] ? " set" : ""}`}
                                type="number"
                                min={5}
                                max={240}
                                step={5}
                                aria-label={`${subject} minutes for ${grade}`}
                                placeholder={standard.minutes}
                                value={subjectMinutes[grade]?.[subject] ?? ""}
                                onChange={(event) => changeSubjectMinutes(grade, subject, event.target.value)}
                              />
                            ) : (
                              <span className="tl-muted">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Class minutes per day</td>
                    {SUGGESTED_GRADES.map((grade) => (
                      <td key={grade} className="num">
                        <strong>
                          {suggestedSubjects(grade).reduce(
                            (sum, subject) => sum + (allotmentFor(grade, subject, periodOption, subjectMinutes)?.minutes || 0),
                            0,
                          )}
                        </strong>
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </section>
          )}

          {!loading && tableReady && mode === "subjects" && (
            <section className="tl-sheet">
              <header className="tl-sheet-heading">
                <div>
                  <h1>Subjects</h1>
                  <p>Every subject you can pick when adding a period, and the grades that offer it. Add the school's own subjects here; tick or untick a grade to change where a custom subject is offered.</p>
                </div>
              </header>
              <form className="tl-subject-add" onSubmit={addCustomSubject}>
                <input
                  value={newSubject}
                  maxLength={120}
                  onChange={(event) => setNewSubject(event.target.value)}
                  placeholder="Custom subject name"
                  aria-label="Custom subject name"
                />
                <div className="tl-subject-grades" role="group" aria-label="Grades that offer the subject">
                  {GRADE_LEVELS.map((grade) => (
                    <label key={grade}>
                      <input
                        type="checkbox"
                        checked={newSubjectGrades.includes(grade)}
                        onChange={() =>
                          setNewSubjectGrades((current) =>
                            current.includes(grade) ? current.filter((value) => value !== grade) : [...current, grade],
                          )
                        }
                      />
                      {grade}
                    </label>
                  ))}
                </div>
                <button type="submit" className="tl-button primary">+ Add subject</button>
              </form>
              <table className="tl-table tl-minutes-table tl-subjects">
                <thead>
                  <tr>
                    <th>Subject</th>
                    {GRADE_LEVELS.map((grade) => <th key={grade} className="num">{grade}</th>)}
                    <th className="tl-col-actions" />
                  </tr>
                </thead>
                <tbody>
                  {[...new Set(GRADE_LEVELS.flatMap((grade) => SUBJECTS_BY_GRADE[grade] || []))].map((subject) => (
                    <tr key={subject}>
                      <td><strong>{subject}</strong></td>
                      {GRADE_LEVELS.map((grade) => (
                        <td key={grade} className="num">
                          {(SUBJECTS_BY_GRADE[grade] || []).includes(subject) ? <span className="tl-offered">✓</span> : <span className="tl-muted">—</span>}
                        </td>
                      ))}
                      <td className="tl-col-actions" />
                    </tr>
                  ))}
                  {PROGRAM_SUBJECTS.map((subject) => (
                    <tr key={subject}>
                      <td><strong>{subject}</strong><small className="tl-muted"> · program</small></td>
                      {GRADE_LEVELS.map((grade) => <td key={grade} className="num"><span className="tl-offered">✓</span></td>)}
                      <td className="tl-col-actions" />
                    </tr>
                  ))}
                  {customSubjects.map((item) => (
                    <tr key={item.name}>
                      <td><strong>{item.name}</strong><small className="tl-muted"> · custom</small></td>
                      {GRADE_LEVELS.map((grade) => (
                        <td key={grade} className="num">
                          <input
                            type="checkbox"
                            aria-label={`${item.name} offered in ${grade}`}
                            checked={item.grades.includes(grade)}
                            onChange={() => toggleCustomSubjectGrade(item.name, grade)}
                          />
                        </td>
                      ))}
                      <td className="tl-col-actions">
                        <button
                          type="button"
                          className="danger"
                          title="Remove from the subject list. Periods already saved with this subject are kept."
                          onClick={() => saveCustomSubjects(customSubjects.filter((value) => value.name !== item.name))}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {!loading && tableReady && mode === "tasks" && (
            <section className="tl-sheet">
              <header className="tl-sheet-heading">
                <div>
                  <h1>Assignments</h1>
                  <p>Class advisory and ancillary tasks for SY {schoolYear}. Each is placed after the teacher's classes, at their latest free time before 5:00 PM, and counted in their workload. Class advisory counts as teaching load, one hour a day. Special Science Class (SSC) lists its teachers with no added load. Enter minutes per day only if the school gives SSC extra time: it is then added as teaching load, and Suggest schedule puts it in the adviser's class right after its last subject.</p>
                </div>
              </header>
              <table className="tl-table tl-groups tl-tasks">
                <thead>
                  <tr>
                    <th>Assignment</th>
                    <th>Teachers</th>
                    <th className="num">Min / day</th>
                    <th className="tl-col-add">Assign teacher</th>
                  </tr>
                </thead>
                <tbody>
                  {assignmentTasks.map((task) => {
                    const assigned = task === SSC_TASK ? sscItems() : taskEntries(task);
                    const assignedIds = new Set(assigned.map((entry) => entry.teacher_id));
                    return (
                      <tr key={task}>
                        <td>
                          <strong>{task}</strong>
                          {TEACHING_TASKS.includes(task) && <small className="tl-muted"> · teaching load</small>}
                        </td>
                        <td>
                          {assigned.length === 0 && <span className="tl-muted">No teacher assigned</span>}
                          {taskGradeGroups(assigned).map((group) => (
                            <div className="tl-task-group" key={group.grade}>
                              <div className="tl-task-grade">
                                {group.grade}
                                <small>{group.entries.length}</small>
                              </div>
                              <ul className="tl-task-list">
                                {group.entries.map((entry) => (
                                  <li key={entry.id}>
                                    <span className="tl-task-name" title={teacherName(teacherById[entry.teacher_id])}>{teacherName(teacherById[entry.teacher_id])}</span>
                                    {(() => {
                                      const load = task === SSC_TASK ? entry.load : entry;
                                      return <small>{load ? [load.section, `${duration(load)} min`, formatDays(load.days), formatTime(load.time_start)].filter(Boolean).join(" · ") : "No added load"}</small>;
                                    })()}
                                    <button type="button" aria-label={`Remove ${task} from ${teacherName(teacherById[entry.teacher_id])}`} title="Remove this assignment" onClick={() => (task === SSC_TASK ? removeSsc(entry) : deleteEntry(entry))}>×</button>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </td>
                        <td className="num">
                          <input
                            className="tl-minutes"
                            type="number"
                            min={5}
                            max={240}
                            step={5}
                            aria-label={`Minutes per day for ${task}`}
                            placeholder={task === SSC_TASK ? "—" : undefined}
                            value={taskMinutes[task] ?? (task === SSC_TASK ? "" : DEFAULT_TASK_MINUTES)}
                            onChange={(event) => setTaskMinutes((current) => ({ ...current, [task]: event.target.value }))}
                          />
                        </td>
                        <td className="tl-col-add">
                          <select aria-label={`Assign ${task} to a teacher`} value="" onChange={(event) => event.target.value && assignTask(task, event.target.value)}>
                            <option value="">Assign teacher…</option>
                            {teachers.filter((teacher) => !assignedIds.has(String(teacher.id))).map((teacher) => {
                              const load = loadSummary(entriesByTeacher[String(teacher.id)] || []);
                              return (
                                <option key={teacher.id} value={String(teacher.id)}>
                                  {teacherName(teacher)} · {load.totalAverage} min/day
                                </option>
                              );
                            })}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          )}

          {!loading && tableReady && !wide && !hasSelection && !showForm && (
            <div className="tl-message">
              {mode === "teacher" ? "Select a teacher to view their class program." : "No class programs yet. Add a period to get started."}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
