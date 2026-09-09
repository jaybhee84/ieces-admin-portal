import { useEffect, useMemo, useState } from "react";
import Topbar from "../components/Topbar";
import { supabase } from "../lib/supabase";
import { calcBMI, getBMIStatus, getHAZStatus, BAZ_META, HAZ_META } from "../lib/growth/bmi";
import educationSeal from "../image/deped-education-seal.png";
import depedLogo from "../image/deped-logo.gif";
import "./Form137Page.css";

const IECES_SCHOOL_ID = "126001";
const PAGE_SIZE = 1000;

const GRADES = [
  { key: "0", label: "Kinder" },
  { key: "1", label: "Grade 1" },
  { key: "2", label: "Grade 2" },
  { key: "3", label: "Grade 3" },
  { key: "4", label: "Grade 4" },
  { key: "5", label: "Grade 5" },
  { key: "6", label: "Grade 6" },
  { key: "SNED", label: "SNED" },
];

// ── SF10-ES form template (ported read-only from ieces-portal's Form137.jsx) ──

const SCHOOL_DEFAULTS = {
  school: "ISABELA EAST CENTRAL E/S",
  schoolId: "126001",
  district: "EAST 1",
  division: "ISABELA CITY",
  region: "IX",
};

const getCurrentSchoolYear = () => {
  const today = new Date();
  const year = today.getFullYear();
  const startYear = today.getMonth() >= 5 ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
};

const CURRENT_SCHOOL_YEAR = getCurrentSchoolYear();
const SCHOLASTIC_RECORD_SLOTS = 8;
const ELEMENTARY_GRADES = ["1", "2", "3", "4", "5", "6"];

const GRADE_ONE_SUBJECTS = [
  "Good Manners and Right Conduct (GMRC)",
  "Language",
  "Mathematics",
  "Reading and Literacy",
  "Makabansa",
  "",
  "",
  "",
  "",
  "*Arabic Language",
  "*Islamic Values Education",
];

const REGULAR_SUBJECTS = [
  "Mother Tongue",
  "Filipino",
  "English",
  "Mathematics",
  "Science",
  "Araling Panlipunan",
  "EPP / TLE",
  "MAPEH",
  "Music",
  "Arts",
  "Physical Education",
  "Health",
  "Eduk. sa Pagpapakatao",
  "*Arabic Language",
  "*Islamic Values Education",
];

const emptySubject = (name) => ({ name, q1: "", q2: "", q3: "", q4: "", final: "", remarks: "" });

const emptyRecord = (grade = "") => ({
  grade: String(grade),
  ...SCHOOL_DEFAULTS,
  section: "",
  schoolYear: "",
  adviser: "",
  signature: "",
  subjects: (String(grade) === "1" ? GRADE_ONE_SUBJECTS : REGULAR_SUBJECTS).map(emptySubject),
  generalAverage: "",
  remedialFrom: "",
  remedialTo: "",
  remedial: Array.from({ length: 2 }, () => ({ area: "", final: "", mark: "", recomputed: "", remarks: "" })),
});

const emptyCertification = () => ({ schoolName: SCHOOL_DEFAULTS.school, schoolId: SCHOOL_DEFAULTS.schoolId, division: SCHOOL_DEFAULTS.division, lastSchoolYear: "", grade: "", date: "", principal: "" });

const initialForm = () => ({
  learnerId: "",
  lastName: "",
  firstName: "",
  extension: "",
  middleName: "",
  lrn: "",
  birthdate: "",
  sex: "",
  credential: "kinder_progress",
  enrollmentSchool: SCHOOL_DEFAULTS.school,
  enrollmentSchoolId: SCHOOL_DEFAULTS.schoolId,
  enrollmentAddress: "EAST SIDE BARANGAY, ISABELA CITY",
  otherCredential: "",
  peptRating: "",
  assessmentDate: "",
  testingCenter: "",
  otherRemark: "",
  records: Array.from(
    { length: SCHOLASTIC_RECORD_SLOTS },
    (_, index) => emptyRecord(index < ELEMENTARY_GRADES.length ? index + 1 : ""),
  ),
  certifications: Array.from({ length: 3 }, emptyCertification),
});

const formDate = (value) => {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[2]}/${match[3]}/${match[1]}` : value;
};

const separateMiddleInitial = (firstName, middleName) => {
  const currentFirstName = String(firstName || "").trim();
  const currentMiddleName = String(middleName || "").trim();
  if (currentMiddleName) {
    return { firstName: currentFirstName, middleName: currentMiddleName };
  }

  const match = currentFirstName.match(/^(.*?)\s+([A-Z])\.?$/i);
  return match
    ? { firstName: match[1].trim(), middleName: `${match[2].toUpperCase()}.` }
    : { firstName: currentFirstName, middleName: "" };
};

const normalizeFormData = (savedData, learnerId) => {
  const base = initialForm();
  const saved = savedData && typeof savedData === "object" ? savedData : {};
  const names = separateMiddleInitial(saved.firstName, saved.middleName);
  const savedRecords = Array.isArray(saved.records) ? saved.records : [];
  const savedCertifications = Array.isArray(saved.certifications) ? saved.certifications : [];

  return {
    ...base,
    ...saved,
    ...names,
    learnerId,
    records: base.records.map((fallback, index) => {
      const record = savedRecords[index];
      if (!record || typeof record !== "object") return fallback;
      const savedGrade = String(record.grade || "");
      return {
        ...fallback,
        ...record,
        grade: ELEMENTARY_GRADES.includes(savedGrade) ? savedGrade : fallback.grade,
        subjects: Array.isArray(record.subjects) ? record.subjects : fallback.subjects,
        remedial: Array.isArray(record.remedial) ? record.remedial : fallback.remedial,
      };
    }),
    certifications: base.certifications.map((fallback, index) => ({
      ...fallback,
      ...(savedCertifications[index] || {}),
    })),
  };
};

const printedValue = (value) => <span className="f137-line-value">{value || " "}</span>;

function RecordBlock({ record }) {
  return (
    <section className="f137-record">
      <div className="f137-record-meta">
        <div>School: {printedValue(record.school)}</div><div>School ID: {printedValue(record.schoolId)}</div>
        <div>District: {printedValue(record.district)} Division: {printedValue(record.division)}</div><div>Region: {printedValue(record.region)}</div>
        <div>Classified as Grade: {printedValue(record.grade)} &nbsp; Section: {printedValue(record.section)}</div><div>School Year: {printedValue(record.schoolYear)}</div>
        <div>Name of Adviser/Teacher: {printedValue(record.adviser)}</div><div>Signature: {printedValue(record.signature)}</div>
      </div>
      <table className="f137-grade-table">
        <thead><tr><th rowSpan="2">LEARNING AREAS</th><th colSpan="4">Quarterly Rating</th><th rowSpan="2">Final<br />Rating</th><th rowSpan="2">Remarks</th></tr><tr><th>1</th><th>2</th><th>3</th><th>4</th></tr></thead>
        <tbody>
          {record.subjects.map((subject, index) => (
            <tr key={`${subject.name}-${index}`} className={index >= 8 && index <= 11 && record.grade !== "1" ? "f137-subject-child" : ""}>
              <td>{subject.name || " "}</td><td>{subject.q1}</td><td>{subject.q2}</td><td>{subject.q3}</td><td>{subject.q4}</td><td>{subject.final}</td><td>{subject.remarks}</td>
            </tr>
          ))}
          <tr className="f137-average"><td>General Average</td><td colSpan="4" /><td>{record.generalAverage}</td><td /></tr>
        </tbody>
      </table>
      <table className="f137-remedial">
        <thead><tr><th>Remedial Classes</th><th colSpan="2">Conducted from: {record.remedialFrom}</th><th colSpan="2">to {record.remedialTo}</th></tr><tr><th>Learning Areas</th><th>Final Rating</th><th>Remedial Class Mark</th><th>Recomputed Final Grade</th><th>Remarks</th></tr></thead>
        <tbody>{record.remedial.map((row, index) => <tr key={index}><td>{row.area}</td><td>{row.final}</td><td>{row.mark}</td><td>{row.recomputed}</td><td>{row.remarks}</td></tr>)}</tbody>
      </table>
    </section>
  );
}

function CertificationBlock({ form, item }) {
  return (
    <section className="f137-certification">
      <div className="f137-section-title">CERTIFICATION</div>
      <p><strong>I CERTIFY</strong> that this is a true record of {printedValue(`${form.firstName} ${form.middleName} ${form.lastName}`.trim())} with LRN {printedValue(form.lrn)} and that he/she is eligible for admission to Grade {printedValue(item.grade)}.</p>
      <p>School Name: {printedValue(item.schoolName)} School ID {printedValue(item.schoolId)} Division: {printedValue(item.division)} Last School Year Attended: {printedValue(item.lastSchoolYear)}</p>
      <div className="f137-cert-sign"><span>{printedValue(formDate(item.date))}<small>Date</small></span><span>{printedValue(item.principal)}<small>Signature of Principal/School Head over Printed Name</small></span><span><small>(Affix School Seal here)</small></span></div>
    </section>
  );
}

function FormPages({ form }) {
  return (
    <div className="f137-pages">
      <article className="f137-page">
        <header className="f137-form-header">
          <span className="f137-code">SF10-ES</span><img src={educationSeal} alt="Department of Education seal" />
          <div><p>Republic of the Philippines<br />Department of Education</p><h1>Learner Permanent Record for Elementary School (SF10-ES)</h1><em>(Formerly Form 137)</em></div>
          <img src={depedLogo} alt="DepEd" className="f137-deped-logo" />
        </header>
        <div className="f137-section-title">LEARNER'S PERSONAL INFORMATION</div>
        <div className="f137-personal-grid">
          <div>LAST NAME: {printedValue(form.lastName)}</div><div>FIRST NAME: {printedValue(form.firstName)}</div><div>NAME EXTN. (Jr.,II,III): {printedValue(form.extension)}</div><div>MIDDLE NAME: {printedValue(form.middleName)}</div>
          <div className="f137-span-2">Learner Reference Number (LRN): {printedValue(form.lrn)}</div><div>Birthdate (mm/dd/yyyy): {printedValue(formDate(form.birthdate))}</div><div>Sex: {printedValue(form.sex)}</div>
        </div>
        <div className="f137-section-title">ELIGIBILITY FOR ELEMENTARY SCHOOL ENROLLMENT</div>
        <div className="f137-enrollment-preview">
          <div>Credential Presented for Grade 1: <span>{form.credential === "kinder_progress" ? "☑" : "☐"} Kinder Progress Report</span><span>{form.credential === "eccd" ? "☑" : "☐"} ECCD Checklist</span><span>{form.credential === "kinder_certificate" ? "☑" : "☐"} Kindergarten Certificate of Completion</span></div>
          <div>Name of School: {printedValue(form.enrollmentSchool)} School ID: {printedValue(form.enrollmentSchoolId)} Address of School: {printedValue(form.enrollmentAddress)}</div>
          <div>Other Credential Presented: {printedValue(form.otherCredential)} PEPT Passer Rating: {printedValue(form.peptRating)} Date of Examination/Assessment: {printedValue(formDate(form.assessmentDate))}</div>
          <div>Name and Address of Testing Center: {printedValue(form.testingCenter)} Remark: {printedValue(form.otherRemark)}</div>
        </div>
        <div className="f137-section-title">SCHOLASTIC RECORD</div>
        <div className="f137-record-grid">{form.records.slice(0, 4).map((record, index) => <RecordBlock key={`front-${index}`} record={record} />)}</div>
        <span className="f137-revision">SFRT 2017</span>
      </article>
      <article className="f137-page f137-page-back">
        <div className="f137-back-top"><strong>SF10-ES</strong><span>Page 2 of ______</span></div>
        <div className="f137-section-title">SCHOLASTIC RECORD</div>
        <div className="f137-record-grid">{form.records.slice(4, 8).map((record, index) => <RecordBlock key={`back-${index}`} record={record} />)}</div>
        <strong className="f137-transfer-label">For Transfer Out / Elementary School Completer Only</strong>
        {form.certifications.map((item, index) => <CertificationBlock key={index} form={form} item={item} />)}
        <span className="f137-revision">SFRT Revised 2017</span>
      </article>
    </div>
  );
}

// ── Learner data + search helpers ──

const fetchAllSchoolLearners = async () => {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("students")
      .select("*")
      .eq("school_id", IECES_SCHOOL_ID)
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) return { data: null, error };
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) return { data: rows, error: null };
  }
};

const learnerName = (learner) => {
  if (learner.family_name || learner.first_name) {
    const givenNames = [learner.first_name, learner.middle_name, learner.suffix || learner.name_suffix].filter(Boolean).join(" ");
    return [learner.family_name, givenNames].filter(Boolean).join(", ");
  }
  return learner.name || "Unnamed learner";
};

const normalizedGender = (learner) => {
  const value = String(learner.gender || learner.sex || "").trim().toUpperCase();
  if (["M", "MALE", "BOY"].includes(value)) return "MALE";
  if (["F", "FEMALE", "GIRL"].includes(value)) return "FEMALE";
  return value;
};

const displayBirthdate = (value) => {
  if (!value) return "—";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
};

const learnerAge = (learner) => {
  if (learner.age !== null && learner.age !== undefined && learner.age !== "") return learner.age;
  if (!learner.birthdate) return "—";
  const birthdate = new Date(learner.birthdate);
  if (Number.isNaN(birthdate.getTime())) return "—";
  const today = new Date();
  let age = today.getFullYear() - birthdate.getFullYear();
  if (today < new Date(today.getFullYear(), birthdate.getMonth(), birthdate.getDate())) age--;
  return age >= 0 ? age : "—";
};

const barangayOf = (learner) => {
  if (learner.barangay) return learner.barangay;
  const match = String(learner.address || "").match(/Brgy\.\s*([^,]+)/i);
  return match?.[1]?.trim() || learner.address || "—";
};

const adviserGradeKey = (value) => {
  const grade = String(value ?? "").toUpperCase().trim();
  if (grade === "0" || grade.startsWith("KINDER")) return "0";
  if (grade.startsWith("SNED") || grade.startsWith("SPED")) return "SNED";
  const number = grade.match(/[1-6]/)?.[0];
  return number || grade;
};
const learnerGradeKey = (learner) => adviserGradeKey(learner.grade_level || learner.grade || learner.gradeLevel || learner.section);
const learnerGradeLabel = (learner) => GRADES.find((grade) => grade.key === learnerGradeKey(learner))?.label || "—";

// ── Adviser resolution (mirrors EnrollmentPage.jsx — students rarely have adviser_name
// populated directly, so the real adviser is matched from the org chart / profile tables) ──

const normalizedText = (value) => String(value || "")
  .normalize("NFD")
  .replace(/[̀-ͯ]/g, "")
  .toUpperCase();
const normalizedName = (value) => normalizedText(value).replace(/[^A-Z0-9]/g, "");
const significantNameTokens = (value) => normalizedText(value)
  .split(/[^A-Z0-9]+/)
  .filter((token) => token.length > 1);
const namesLikelyMatch = (left, right) => {
  if (!left || !right) return false;
  if (normalizedName(left) === normalizedName(right)) return true;
  const leftTokens = significantNameTokens(left);
  const rightTokens = significantNameTokens(right);
  const smaller = leftTokens.length <= rightTokens.length ? leftTokens : rightTokens;
  const larger = leftTokens.length <= rightTokens.length ? rightTokens : leftTokens;
  return smaller.length >= 2 && smaller.every((token) => larger.includes(token));
};
const personNameKey = (person) => normalizedName(
  person?.first_name && person?.family_name
    ? `${person.first_name}${person.family_name}`
    : person?.full_name || person?.name,
);
const orgTeacherName = (teacher) =>
  [teacher.first_name, teacher.middle_name, teacher.family_name].filter(Boolean).join(" ") || teacher.name || "Unnamed adviser";
const abbreviatedAdviserName = (adviser) => {
  const firstName = String(adviser?.first_name || "").trim();
  const middleName = String(adviser?.middle_name || "").trim();
  const familyName = String(adviser?.family_name || adviser?.last_name || "").trim();
  const suffix = String(adviser?.suffix || "").trim();
  if (firstName && familyName) {
    const middleInitial = middleName ? `${middleName.charAt(0).toUpperCase()}.` : "";
    return [firstName, middleInitial, familyName, suffix].filter(Boolean).join(" ");
  }
  const storedName = String(adviser?.full_name || adviser?.name || adviser?.username || "Unnamed adviser").trim();
  const parts = storedName.split(/\s+/).filter(Boolean);
  if (parts.length < 3) return storedName;
  return `${parts[0]} ${parts[1].charAt(0).toUpperCase()}. ${parts.at(-1)}`;
};
const baselineTeacherName = (learner) => {
  if (learner.adviser_id || !learner.section) return "";
  const section = String(learner.section).trim();
  const kinder = section.match(/^KINDER(?:GARTEN)?\s*[-–—]\s*(.+?)(?:\s*[-–—]\s*(?:MORNING|AFTERNOON))?$/i);
  if (kinder) return kinder[1].trim();
  const graded = section.match(/^(?:GRADE\s*[1-6]|SNED|SPED)\s*[-–—]\s*(.+)$/i);
  return graded?.[1]?.trim() || "";
};

// Sections are often stored as "Grade 4 - Poliquit"; strip the leading grade/kinder
// prefix for a compact badge so it doesn't repeat the grade label shown beside it.
const sectionShortLabel = (learner) => {
  const section = String(learner.section || "").trim();
  if (!section) return "";
  const stripped = section.replace(/^(?:GRADE\s*[1-6]|KINDER(?:GARTEN)?|SNED|SPED)\s*[-–—]\s*/i, "").trim();
  return stripped || section;
};

const fetchAdviserSources = async () => {
  const [profileResult, orgResult, portalResult] = await Promise.all([
    supabase.from("profiles").select("*"),
    supabase.from("org_chart").select("*"),
    supabase.from("portal_profile").select("*"),
  ]);
  const advisers = (profileResult.data || []).filter((profile) =>
    profile.role === "adviser" || profile.section_assigned || profile.grade_level_assigned != null);
  const orgAdvisers = (orgResult.data || []).filter((person) =>
    person.category === "teaching" && (String(person.teaching_type).toLowerCase() === "adviser" || person.is_grade_chairman));
  const portalAdvisers = (portalResult.data || []).filter((profile) =>
    profile.role === "adviser" || profile.role === "grade_chairman" || profile.section_assigned || profile.grade_level_assigned != null);

  const advisorySources = orgAdvisers.length ? orgAdvisers.map((teacher) => {
    const teacherName = orgTeacherName(teacher);
    const profile = advisers.find((candidate) => personNameKey(candidate) === personNameKey(teacher));
    const portalProfile = portalAdvisers.find((candidate) => personNameKey(candidate) === personNameKey(teacher));
    return {
      ...teacher,
      assignment_ids: [teacher.id, profile?.id, portalProfile?.id].filter(Boolean),
      full_name: teacherName,
      grade_level_assigned: teacher.grade_level || portalProfile?.grade_level_assigned || profile?.grade_level_assigned,
      section_assigned: portalProfile?.section_assigned || profile?.section_assigned || teacher.section || teacher.section_assigned,
    };
  }) : (portalAdvisers.length ? portalAdvisers : advisers).map((profile) => ({ ...profile, assignment_ids: [profile.id] }));

  return advisorySources;
};

const resolveLearnerAdviser = (learner, advisorySources) => {
  if (learner.adviser_id) {
    const byId = advisorySources.find((adviser) =>
      (adviser.assignment_ids || [adviser.id]).map(String).includes(String(learner.adviser_id)));
    if (byId) return byId;
  }
  const learnerGrade = learnerGradeKey(learner);
  const bmiTeacher = baselineTeacherName(learner);
  return advisorySources.find((adviser) => {
    if (adviserGradeKey(adviser.grade_level_assigned) !== learnerGrade) return false;
    const adviserName = adviser.full_name || adviser.name || orgTeacherName(adviser);
    if (bmiTeacher) {
      const adviserFamilyName = adviser.family_name || significantNameTokens(adviserName).at(-1) || "";
      return normalizedName(bmiTeacher) === normalizedName(adviserFamilyName) || namesLikelyMatch(bmiTeacher, adviserName);
    }
    const adviserSection = normalizedName(adviser.section_assigned);
    return !learner.adviser_id && Boolean(adviserSection) && normalizedName(learner.section || learner.section_assigned) === adviserSection;
  }) || null;
};

const learnerAdviserName = (learner, advisorySources) => {
  if (learner.adviser_name?.trim()) return learner.adviser_name.trim();
  const adviser = resolveLearnerAdviser(learner, advisorySources);
  return adviser ? abbreviatedAdviserName(adviser) : "";
};

const normalizedRecords = (value) => {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  if (typeof value === "object") return [value];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : parsed && typeof parsed === "object" ? [parsed] : [];
  } catch {
    return [];
  }
};

const QUARTER_LABELS = ["Baseline", "Midline", "Endline"];

const measurementRecords = (learner) => {
  const records = normalizedRecords(learner.records).filter((record) => record?.weight || record?.height);
  if (!records.length && (learner.weight || learner.height)) return [learner];
  return records;
};

const recordQuarterLabel = (record) => {
  const raw = String(record?.quarter || record?.period || record?.term || record?.stage || "").trim().toLowerCase();
  return QUARTER_LABELS.find((label) => label.toLowerCase() === raw) || "";
};

const statusForRecord = (learner, record) => {
  const sex = normalizedGender(learner).startsWith("F") ? "F" : "M";
  const fallbackMonths = Number(learner.age) > 0 ? Number(learner.age) * 12 : undefined;
  const bmiValue = calcBMI(record.weight, record.height);
  const computedBmi = getBMIStatus(bmiValue, sex, learner.birthdate, record.date, fallbackMonths)?.label;
  const computedHfa = getHAZStatus(record.height, sex, learner.birthdate, record.date, fallbackMonths)?.label;
  return {
    bmi: record.bmi_status || record.status?.label || record.baz?.label || computedBmi || "—",
    hfa: record.hfa_status || record.haz_status || record.haz?.label || computedHfa || "—",
  };
};

// Groups a learner's growth records into the DepEd Baseline / Midline / Endline
// cycle. Uses an explicit quarter tag on the record when the BMI Baseline Entry
// app provides one; otherwise falls back to chronological order (earliest → Baseline).
const quarterlyNutritionalStatus = (learner) => {
  const records = measurementRecords(learner)
    .slice()
    .sort((left, right) => String(left.date || "").localeCompare(String(right.date || "")));
  if (!records.length) return QUARTER_LABELS.map((label) => ({ label, status: null }));

  const tagged = records.map((record) => ({ record, label: recordQuarterLabel(record) }));
  if (tagged.some((entry) => entry.label)) {
    return QUARTER_LABELS.map((label) => {
      const entry = tagged.filter((item) => item.label === label).at(-1);
      return { label, status: entry ? statusForRecord(learner, entry.record) : null };
    });
  }

  const latestThree = records.slice(-3);
  return QUARTER_LABELS.map((label, index) => ({
    label,
    status: latestThree[index] ? statusForRecord(learner, latestThree[index]) : null,
  }));
};

const fieldValue = (value) => (value === null || value === undefined || String(value).trim() === "" ? "—" : String(value));
const yesNo = (value) => {
  const text = String(value ?? "").trim().toUpperCase();
  if (["Y", "YES", "TRUE"].includes(text)) return "Yes";
  if (["N", "NO", "FALSE"].includes(text)) return "No";
  return "—";
};

function StatusPill({ label, meta }) {
  if (!label || label === "—") return <strong className="f137p-status-pill f137p-status-pill-neutral">—</strong>;
  return <strong className="f137p-status-pill" style={{ color: meta?.color, background: meta?.bg }}>{label}</strong>;
}

const savedForm137Years = (learner) => {
  const records = learner.form_137_records;
  if (!records || typeof records !== "object" || Array.isArray(records)) return [];
  return Object.keys(records).filter((key) => /^\d{4}-\d{4}$/.test(key)).sort();
};

const schoolYearOptionsFromLearners = (learners) => {
  const years = new Set([CURRENT_SCHOOL_YEAR]);
  learners.forEach((learner) => savedForm137Years(learner).forEach((year) => years.add(year)));
  return Array.from(years).sort().reverse();
};

const buildFreshForm = (learner, advisorySources) => {
  const names = separateMiddleInitial(learner.first_name, learner.middle_name);
  const gradeNumber = Number(String(learner.grade_level || learner.grade || "").match(/\d+/)?.[0]);
  const freshForm = initialForm();
  const sex = normalizedGender(learner);
  return {
    ...freshForm,
    learnerId: String(learner.id),
    lastName: learner.family_name || "",
    ...names,
    extension: learner.suffix || learner.name_suffix || "",
    lrn: /^\d{12}$/.test(String(learner.lrn || "")) ? String(learner.lrn) : "",
    birthdate: learner.birthdate ? String(learner.birthdate).slice(0, 10) : "",
    sex: sex === "MALE" || sex === "FEMALE" ? sex : "",
    records: freshForm.records.map((record, index) => ({
      ...record,
      adviser: learnerAdviserName(learner, advisorySources),
      ...(index === gradeNumber - 1
        ? { schoolYear: CURRENT_SCHOOL_YEAR, section: learner.section || "" }
        : {}),
    })),
  };
};

const resolveFormData = (learner, preferredYear, advisorySources) => {
  const years = savedForm137Years(learner);
  if (years.length) {
    const activeYear = years.includes(preferredYear) ? preferredYear : (years.includes(CURRENT_SCHOOL_YEAR) ? CURRENT_SCHOOL_YEAR : years.at(-1));
    const entry = learner.form_137_records[activeYear];
    if (entry?.data) {
      return { form: normalizeFormData(entry.data, String(learner.id)), years, activeYear, source: "saved" };
    }
  }
  return { form: buildFreshForm(learner, advisorySources), years, activeYear: null, source: "fresh" };
};

// ── Page ──

const DETAIL_TABS = ["Profile", "Form 137"];

export default function Form137Page({ user, onLogout, onBack }) {
  const [learners, setLearners] = useState([]);
  const [advisorySources, setAdvisorySources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchText, setSearchText] = useState("");
  const [syFilter, setSyFilter] = useState("");
  const [gradeFilter, setGradeFilter] = useState("");
  const [adviserFilter, setAdviserFilter] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [activeTab, setActiveTab] = useState(DETAIL_TABS[0]);
  const [selectedYear, setSelectedYear] = useState("");
  const [previewZoom, setPreviewZoom] = useState(0.62);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([fetchAllSchoolLearners(), fetchAdviserSources()]).then(([result, advisers]) => {
      if (!active) return;
      if (result.error) setError(result.error.message);
      else setLearners(result.data || []);
      setAdvisorySources(advisers);
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const schoolYearOptions = useMemo(() => schoolYearOptionsFromLearners(learners), [learners]);

  const syFilteredLearners = useMemo(() => {
    if (!syFilter || syFilter === CURRENT_SCHOOL_YEAR) return learners;
    return learners.filter((learner) => savedForm137Years(learner).includes(syFilter));
  }, [learners, syFilter]);

  const gradeFilteredLearners = useMemo(
    () => syFilteredLearners.filter((learner) => !gradeFilter || learnerGradeKey(learner) === gradeFilter),
    [syFilteredLearners, gradeFilter],
  );

  const adviserOptions = useMemo(() => {
    const names = new Set(gradeFilteredLearners.map((learner) => learnerAdviserName(learner, advisorySources)));
    return Array.from(names).sort((left, right) => left.localeCompare(right));
  }, [gradeFilteredLearners, advisorySources]);

  const filteredLearners = useMemo(() => {
    const query = searchText.trim().toUpperCase();
    return gradeFilteredLearners
      .filter((learner) => !adviserFilter || learnerAdviserName(learner, advisorySources) === adviserFilter)
      .filter((learner) => {
        if (!query) return true;
        const haystack = [learnerName(learner), learner.lrn, learner.registry_no].filter(Boolean).join(" ").toUpperCase();
        return haystack.includes(query);
      })
      .sort((left, right) => learnerName(left).localeCompare(learnerName(right)));
  }, [gradeFilteredLearners, adviserFilter, searchText, advisorySources]);

  const handleSyChange = (value) => {
    setSyFilter(value);
    setGradeFilter("");
    setAdviserFilter("");
  };
  const handleGradeChange = (value) => {
    setGradeFilter(value);
    setAdviserFilter("");
  };

  const selectedLearner = useMemo(() => learners.find((learner) => String(learner.id) === selectedId) || null, [learners, selectedId]);
  const selectLearner = (learner) => {
    setSelectedId(String(learner.id));
    setSelectedYear("");
    setActiveTab("Profile");
  };

  const formResult = useMemo(
    () => selectedLearner ? resolveFormData(selectedLearner, selectedYear, advisorySources) : null,
    [selectedLearner, selectedYear, advisorySources],
  );
  const quarterlyStatus = useMemo(
    () => selectedLearner ? quarterlyNutritionalStatus(selectedLearner) : QUARTER_LABELS.map((label) => ({ label, status: null })),
    [selectedLearner],
  );

  const changeZoom = (direction) => setPreviewZoom((current) => {
    const next = Math.round((current + direction * 0.1) * 10) / 10;
    return Math.min(1.5, Math.max(0.4, next));
  });
  const handlePreviewWheel = (event) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    changeZoom(event.deltaY < 0 ? 1 : -1);
  };

  return (
    <div className="f137p-root">
      <Topbar user={user} onLogout={onLogout} onBack={onBack} title="Form 137 & Learner Records" />
      <main className="f137p-body">
        <div className="f137p-heading">
          <div>
            <h1>Learner Records &amp; Form 137</h1>
            <p>Search the complete learner database, review a learner's full record, and print their SF10-ES / Form 137.</p>
          </div>
        </div>

        {error && <div className="f137p-message error">{error}</div>}

        <div className="f137p-layout">
          <section className="f137p-panel f137p-search-panel">
            <div className="f137p-search-controls">
              <div className="f137p-search-input-wrap">
                <input
                  type="text"
                  className="f137p-search-input"
                  placeholder="Search by name or LRN…"
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                />
                {searchText && (
                  <button
                    type="button"
                    className="f137p-search-clear"
                    aria-label="Clear search"
                    onClick={() => setSearchText("")}
                  >
                    ×
                  </button>
                )}
              </div>
              <select value={syFilter} onChange={(event) => handleSyChange(event.target.value)}>
                <option value="">All School Years</option>
                {schoolYearOptions.map((year) => <option key={year} value={year}>{year}</option>)}
              </select>
              <select value={gradeFilter} onChange={(event) => handleGradeChange(event.target.value)} disabled={!syFilter}>
                <option value="">All Grades</option>
                {GRADES.map((grade) => <option key={grade.key} value={grade.key}>{grade.label}</option>)}
              </select>
              <select value={adviserFilter} onChange={(event) => setAdviserFilter(event.target.value)} disabled={!gradeFilter}>
                <option value="">All Advisers</option>
                {adviserOptions.map((name) => <option key={name || "unassigned"} value={name}>{name || "No Adviser Assigned"}</option>)}
              </select>
            </div>
            <div className="f137p-result-count">
              {loading ? "Loading learner database…" : `${filteredLearners.length} of ${learners.length} learners`}
            </div>
            <div className="f137p-list">
              {!loading && filteredLearners.length === 0 && (
                <div className="f137p-empty">No learners match this search.</div>
              )}
              {filteredLearners.map((learner) => (
                <button
                  type="button"
                  key={learner.id}
                  className={`f137p-list-row ${selectedId === String(learner.id) ? "active" : ""}`}
                  onClick={() => selectLearner(learner)}
                >
                  <span className="f137p-list-name">{learnerName(learner)}</span>
                  <span className="f137p-list-meta">{learnerGradeLabel(learner)}{learner.section ? ` • ${learner.section}` : ""} • LRN {fieldValue(learner.lrn)}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="f137p-panel f137p-detail-panel">
            {!selectedLearner ? (
              <div className="f137p-placeholder">
                <span>🗂️</span>
                <p>Select a learner from the list to view their full record or print their Form 137.</p>
              </div>
            ) : (
              <>
                <div className="f137p-detail-heading">
                  <div className="f137p-detail-identity">
                    {selectedLearner.photo_url ? <img src={selectedLearner.photo_url} alt="" /> : <div className="f137p-avatar">👤</div>}
                    <div>
                      <h2>{learnerName(selectedLearner)}</h2>
                      <span>{learnerGradeLabel(selectedLearner)}{sectionShortLabel(selectedLearner) ? ` • ${sectionShortLabel(selectedLearner)}` : ""} • LRN {fieldValue(selectedLearner.lrn)}</span>
                    </div>
                  </div>
                  <div className="f137p-detail-tabs" role="tablist">
                    {DETAIL_TABS.map((tab) => (
                      <button key={tab} type="button" className={activeTab === tab ? "active" : ""} onClick={() => setActiveTab(tab)}>{tab}</button>
                    ))}
                  </div>
                </div>

                {activeTab === "Profile" && (
                  <div className="f137p-profile">
                    <div className="f137p-field-group">
                      <h3><span className="f137p-section-icon" aria-hidden="true">🧑</span>Personal Information</h3>
                      <div className="f137p-field-grid">
                        <div><span>Full Name</span><strong>{learnerName(selectedLearner)}</strong></div>
                        <div><span>LRN</span><strong>{fieldValue(selectedLearner.lrn)}</strong></div>
                        <div><span>Registry No.</span><strong>{fieldValue(selectedLearner.registry_no)}</strong></div>
                        <div><span>Sex</span><strong>{fieldValue(normalizedGender(selectedLearner))}</strong></div>
                        <div><span>Birthdate</span><strong>{displayBirthdate(selectedLearner.birthdate)}</strong></div>
                        <div><span>Age</span><strong>{learnerAge(selectedLearner)}</strong></div>
                        <div><span>Religion</span><strong>{fieldValue(selectedLearner.religion)}</strong></div>
                        <div><span>Tribe</span><strong>{fieldValue(selectedLearner.tribe)}</strong></div>
                      </div>
                    </div>

                    <div className="f137p-profile-section-label"><span>School Information &amp; Details</span></div>

                    <div className="f137p-field-group">
                      <h3><span className="f137p-section-icon" aria-hidden="true">🎓</span>Academic</h3>
                      <div className="f137p-field-grid">
                        <div><span>Grade Level</span><strong>{learnerGradeLabel(selectedLearner)}</strong></div>
                        <div><span>Section</span><strong>{fieldValue(selectedLearner.section)}</strong></div>
                        <div><span>Adviser</span><strong>{fieldValue(learnerAdviserName(selectedLearner, advisorySources))}</strong></div>
                        <div><span>School</span><strong>{fieldValue(selectedLearner.school_name) !== "—" ? selectedLearner.school_name : SCHOOL_DEFAULTS.school}</strong></div>
                        <div><span>School ID</span><strong>{fieldValue(selectedLearner.school_id)}</strong></div>
                        <div><span>4Ps Beneficiary</span><strong>{yesNo(selectedLearner.is_4ps ?? selectedLearner.member_4ps)}</strong></div>
                        <div><span>Enrollment Date</span><strong>{displayBirthdate(selectedLearner.enrolled_at || selectedLearner.enrollment_date || selectedLearner.date_enrolled || selectedLearner.created_at)}</strong></div>
                      </div>
                    </div>

                    <div className="f137p-field-group">
                      <h3><span className="f137p-section-icon" aria-hidden="true">👪</span>Family &amp; Guardian</h3>
                      <div className="f137p-field-grid">
                        <div><span>Father's Name</span><strong>{fieldValue(selectedLearner.father_name)}</strong></div>
                        <div><span>Mother's Name</span><strong>{fieldValue(selectedLearner.mother_name)}</strong></div>
                        <div><span>Guardian Name</span><strong>{fieldValue(selectedLearner.guardian_name)}</strong></div>
                        <div><span>Guardian Type</span><strong>{fieldValue(selectedLearner.guardian_type)}</strong></div>
                        <div><span>Parent Consent</span><strong>{yesNo(selectedLearner.parent_consent)}</strong></div>
                      </div>
                    </div>

                    <div className="f137p-field-group">
                      <h3><span className="f137p-section-icon" aria-hidden="true">📍</span>Address &amp; Contact</h3>
                      <div className="f137p-field-grid">
                        <div className="f137p-span-2"><span>Address</span><strong>{fieldValue(selectedLearner.address)}</strong></div>
                        <div><span>Barangay</span><strong>{fieldValue(barangayOf(selectedLearner))}</strong></div>
                        <div><span>Contact Number</span><strong>{fieldValue(selectedLearner.contact_number)}</strong></div>
                      </div>
                    </div>

                    <div className="f137p-field-group">
                      <h3><span className="f137p-section-icon" aria-hidden="true">⚕️</span>Health &amp; Nutrition</h3>
                      <div className="f137p-quarters">
                        {quarterlyStatus
                          .filter((quarter) => quarter.label !== "Midline" || quarter.status)
                          .map((quarter) => (
                            <div className="f137p-quarter-card" key={quarter.label}>
                              <span className="f137p-quarter-label">{quarter.label}</span>
                              {quarter.status ? (
                                <div className="f137p-quarter-pills">
                                  <div><span>BMI Status</span><StatusPill label={quarter.status.bmi} meta={BAZ_META[quarter.status.bmi]} /></div>
                                  <div><span>Height-for-Age</span><StatusPill label={quarter.status.hfa} meta={HAZ_META[quarter.status.hfa]} /></div>
                                </div>
                              ) : (
                                <p className="f137p-quarter-empty">No measurement recorded</p>
                              )}
                            </div>
                          ))}
                      </div>
                    </div>

                    <div className="f137p-field-group">
                      <h3><span className="f137p-section-icon" aria-hidden="true">🗂️</span>Form 137 Records</h3>
                      {formResult.years.length === 0 ? (
                        <p className="f137p-note">No Form 137 has been saved for this learner yet. Opening the Form 137 tab will show a blank SF10-ES pre-filled from enrollment data.</p>
                      ) : (
                        <ul className="f137p-year-list">
                          {formResult.years.map((year) => <li key={year}>SY {year}</li>)}
                        </ul>
                      )}
                    </div>
                  </div>
                )}

                {activeTab === "Form 137" && formResult && (
                  <div className="f137p-form137">
                    <div className="f137p-form137-toolbar">
                      <div className="f137p-form137-toolbar-left">
                        {formResult.years.length > 0 && (
                          <label className="f137p-year-select">
                            <span>School Year</span>
                            <select value={formResult.activeYear || ""} onChange={(event) => setSelectedYear(event.target.value)}>
                              {formResult.years.map((year) => <option key={year} value={year}>{year}</option>)}
                            </select>
                          </label>
                        )}
                        {formResult.source === "fresh" && <span className="f137p-fresh-note">No saved record — showing enrollment-based preview</span>}
                      </div>
                      <div className="f137p-zoom-controls" aria-label="Preview zoom controls">
                        <button type="button" title="Zoom out" onClick={() => changeZoom(-1)} disabled={previewZoom <= 0.4}>−</button>
                        <button type="button" className="f137p-zoom-value" title="Reset zoom" onClick={() => setPreviewZoom(0.62)}>{Math.round(previewZoom * 100)}%</button>
                        <button type="button" title="Zoom in" onClick={() => changeZoom(1)} disabled={previewZoom >= 1.5}>+</button>
                      </div>
                      <button type="button" className="f137p-print-btn" onClick={() => window.print()}>🖨 Print</button>
                    </div>
                    <div className="f137p-preview-scroll" onWheel={handlePreviewWheel}>
                      <div className="f137p-print-target">
                        <div className="f137-zoom-stage" style={{ zoom: previewZoom }}>
                          <FormPages form={formResult.form} />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
