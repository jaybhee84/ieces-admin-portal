import { useCallback, useEffect, useMemo, useState } from "react";
import Topbar from "../components/Topbar";
import { supabase } from "../lib/supabase";
import { calcBMI, getBMIStatus, getHAZStatus } from "../lib/growth/bmi";
import "./EnrollmentPage.css";

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

const IECES_SCHOOL_ID = "126001";
const PAGE_SIZE = 1000;
const preloadedTeacherPhotos = new Set();
let enrollmentCache = null;

const preloadTeacherPhotos = (teachers) => {
  if (typeof Image === "undefined") return;
  teachers.forEach((teacher) => {
    const url = teacher?.photo_url;
    if (!url || preloadedTeacherPhotos.has(url)) return;
    preloadedTeacherPhotos.add(url);
    const image = new Image();
    image.decoding = "async";
    image.src = url;
  });
};

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

const enrollmentTimestamp = (learner) =>
  learner.created_at || learner.enrolled_at || learner.enrollment_date || learner.date_enrolled;

const dateKey = (value) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(value));
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
};

const displayDate = (key) => new Intl.DateTimeFormat("en-PH", {
  year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Manila",
}).format(new Date(`${key}T00:00:00+08:00`));

const normalizedGender = (learner) => String(learner.gender || learner.sex || "").trim().toUpperCase();
const summarize = (learners) => ({
  total: learners.length,
  male: learners.filter((item) => ["M", "MALE", "BOY"].includes(normalizedGender(item))).length,
  female: learners.filter((item) => ["F", "FEMALE", "GIRL"].includes(normalizedGender(item))).length,
});

const countBy = (learners, getValue) => Object.entries(
  learners.reduce((counts, learner) => {
    const value = getValue(learner)?.toString().trim() || "Not specified";
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {}),
).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

const barangayOf = (learner) => {
  if (learner.barangay) return learner.barangay;
  const match = learner.address?.match(/Brgy\.\s*([^,]+)/i);
  return match?.[1] || learner.address;
};

function BreakdownCard({ title, rows }) {
  return <div className="demographic-card">
    <h3>{title}</h3>
    {rows.map(([label, count]) => <div className="demographic-row" key={label}>
      <span>{label}</span><strong>{count}</strong>
    </div>)}
  </div>;
}

const normalizedText = (value) => String(value || "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
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
    : person?.full_name || person?.name
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
const adviserGradeKey = (value) => {
  const grade = String(value ?? "").toUpperCase().trim();
  if (grade === "0" || grade.startsWith("KINDER")) return "0";
  if (grade.startsWith("SNED") || grade.startsWith("SPED")) return "SNED";
  const number = grade.match(/[1-6]/)?.[0];
  return number || grade;
};
const learnerGradeKey = (learner) => adviserGradeKey(
  learner.grade_level || learner.grade || learner.gradeLevel || learner.section
);
const baselineTeacherName = (learner) => {
  if (learner.adviser_id || !learner.section) return "";
  const section = String(learner.section).trim();
  const kinder = section.match(/^KINDER(?:GARTEN)?\s*[-–—]\s*(.+?)(?:\s*[-–—]\s*(?:MORNING|AFTERNOON))?$/i);
  if (kinder) return kinder[1].trim();
  const graded = section.match(/^(?:GRADE\s*[1-6]|SNED|SPED)\s*[-–—]\s*(.+)$/i);
  return graded?.[1]?.trim() || "";
};
const learnerSession = (learner) => {
  const value = normalizedText(learner.session || learner.class_session || learner.session_assigned || learner.section);
  if (value.includes("MORNING")) return "Morning";
  if (value.includes("AFTERNOON")) return "Afternoon";
  return "";
};

export default function EnrollmentPage({ user, onLogout, onBack }) {
  const [learners, setLearners] = useState(() => enrollmentCache?.learners || []);
  const [advisers, setAdvisers] = useState(() => enrollmentCache?.advisers || []);
  const [orgAdvisers, setOrgAdvisers] = useState(() => enrollmentCache?.orgAdvisers || []);
  const [portalAdvisers, setPortalAdvisers] = useState(() => enrollmentCache?.portalAdvisers || []);
  const [loading, setLoading] = useState(() => !enrollmentCache);
  const [error, setError] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedAdviser, setSelectedAdviser] = useState(null);
  const [selectedKinderSession, setSelectedKinderSession] = useState("");

  const fetchLearners = useCallback(async () => {
    if (!enrollmentCache) setLoading(true);
    setError("");
    const [studentResult, profileResult, orgResult, portalResult] = await Promise.all([
      fetchAllSchoolLearners(),
      supabase.from("profiles").select("*"),
      supabase.from("org_chart").select("*"),
      supabase.from("portal_profile").select("*"),
    ]);
    if (studentResult.error) {
      if (!enrollmentCache) setError(studentResult.error.message);
    }
    else if (orgResult.error) {
      if (!enrollmentCache) setError(orgResult.error.message);
    }
    else {
      const nextLearners = studentResult.data || [];
      const nextAdvisers = (profileResult.data || []).filter((profile) =>
        profile.role === "adviser" || profile.section_assigned || profile.grade_level_assigned != null
      );
      const nextOrgAdvisers = (orgResult.data || []).filter((person) =>
        person.category === "teaching" && (String(person.teaching_type).toLowerCase() === "adviser" || person.is_grade_chairman)
      );
      const nextPortalAdvisers = (portalResult.data || []).filter((profile) =>
        profile.role === "adviser" || profile.role === "grade_chairman" || profile.section_assigned || profile.grade_level_assigned != null
      );
      preloadTeacherPhotos(nextOrgAdvisers);
      enrollmentCache = {
        learners: nextLearners,
        advisers: nextAdvisers,
        orgAdvisers: nextOrgAdvisers,
        portalAdvisers: nextPortalAdvisers,
      };
      setLearners(nextLearners);
      setAdvisers(nextAdvisers);
      setOrgAdvisers(nextOrgAdvisers);
      setPortalAdvisers(nextPortalAdvisers);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchLearners();
    const channel = supabase
      .channel("dashboard:enrollment")
      .on("postgres_changes", { event: "*", schema: "public", table: "students" }, fetchLearners)
      .subscribe();
    const profileChannel = supabase
      .channel("dashboard:advisers")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, fetchLearners)
      .subscribe();
    const orgChannel = supabase
      .channel("dashboard:org-advisers")
      .on("postgres_changes", { event: "*", schema: "public", table: "org_chart" }, fetchLearners)
      .subscribe();
    const portalProfileChannel = supabase
      .channel("dashboard:portal-advisers")
      .on("postgres_changes", { event: "*", schema: "public", table: "portal_profile" }, fetchLearners)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(profileChannel);
      supabase.removeChannel(orgChannel);
      supabase.removeChannel(portalProfileChannel);
    };
  }, [fetchLearners]);

  const dailyRows = useMemo(() => {
    const grouped = learners.reduce((result, learner) => {
      const timestamp = enrollmentTimestamp(learner);
      if (!timestamp || Number.isNaN(new Date(timestamp).getTime())) return result;
      const key = dateKey(timestamp);
      if (!result[key]) result[key] = [];
      result[key].push(learner);
      return result;
    }, {});
    return Object.entries(grouped)
      .map(([date, items]) => ({ date, items, ...summarize(items) }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [learners]);

  useEffect(() => {
    if (!selectedDate && dailyRows.length) setSelectedDate(dailyRows[0].date);
  }, [dailyRows, selectedDate]);

  const totals = useMemo(() => summarize(learners), [learners]);
  const today = dateKey(new Date());
  const todayTotal = dailyRows.find((row) => row.date === today)?.total || 0;
  const selectedLearners = dailyRows.find((row) => row.date === selectedDate)?.items || [];

  const selectedGradeRows = GRADES.map((grade) => {
    const items = selectedLearners.filter((learner) => learnerGradeKey(learner) === grade.key);
    return { ...grade, ...summarize(items) };
  });
  const overallGradeRows = GRADES.map((grade) => {
    const items = learners.filter((learner) => learnerGradeKey(learner) === grade.key);
    return { ...grade, ...summarize(items) };
  });
  const readingCategories = ["Non-Reader", "Frustration", "Instructional", "Independent"];
  const readingGrades = GRADES.filter((grade) => Number(grade.key) >= 1 && Number(grade.key) <= 6);
  const readingCount = (category, gradeKey) => learners.filter((learner) => {
    const readingLevel = learner.reading_level || (learner.gender ? "Non-Reader" : "");
    return learnerGradeKey(learner) === gradeKey && readingLevel === category;
  }).length;
  const demographicRows = {
    religion: countBy(selectedLearners, (learner) => learner.religion),
    tribe: countBy(selectedLearners, (learner) => learner.tribe),
    barangay: countBy(selectedLearners, barangayOf),
  };
  const advisorySources = orgAdvisers.length ? orgAdvisers.map((teacher) => {
    const teacherName = orgTeacherName(teacher);
    const profile = advisers.find((candidate) => personNameKey(candidate) === personNameKey(teacher));
    const portalProfile = portalAdvisers.find((candidate) => personNameKey(candidate) === personNameKey(teacher));
    return {
      ...teacher,
      profile_id: profile?.id,
      portal_profile_id: portalProfile?.id,
      assignment_ids: [teacher.id, profile?.id, portalProfile?.id].filter(Boolean),
      full_name: teacherName,
      grade_level_assigned: teacher.grade_level || portalProfile?.grade_level_assigned || profile?.grade_level_assigned,
      section_assigned: portalProfile?.section_assigned || profile?.section_assigned || teacher.section || teacher.section_assigned,
      portal_profile: portalProfile,
    };
  }) : (portalAdvisers.length ? portalAdvisers : advisers).map((profile) => ({
    ...profile,
    assignment_ids: [profile.id],
  }));

  const advisoryRows = advisorySources.map((adviser) => {
    const assignmentIds = (adviser.assignment_ids || [adviser.id]).map(String);
    const adviserGrade = adviserGradeKey(adviser.grade_level_assigned);
    const adviserSection = normalizedName(adviser.section_assigned);
    const adviserName = adviser.full_name || adviser.name || orgTeacherName(adviser);
    const adviserFamilyName = adviser.family_name || significantNameTokens(adviserName).at(-1) || "";
    const items = learners.filter((learner) => {
      if (learner.adviser_id && assignmentIds.includes(String(learner.adviser_id))) return true;
      const bmiTeacher = baselineTeacherName(learner);
      if (bmiTeacher) {
        const surnameMatch = normalizedName(bmiTeacher) === normalizedName(adviserFamilyName);
        return learnerGradeKey(learner) === adviserGrade && (surnameMatch || namesLikelyMatch(bmiTeacher, adviserName));
      }
      return !learner.adviser_id
        && Boolean(adviserSection)
        && learnerGradeKey(learner) === adviserGrade
        && normalizedName(learner.section || learner.section_assigned) === adviserSection;
    });
    return { adviser, learners: items, ...summarize(items) };
  }).sort((a, b) =>
    String(adviserGradeKey(a.adviser.grade_level_assigned)).localeCompare(String(adviserGradeKey(b.adviser.grade_level_assigned)), undefined, { numeric: true }) ||
    String(a.adviser.section_assigned || "").localeCompare(String(b.adviser.section_assigned || ""))
  );
  const advisoryGradeGroups = GRADES.map((grade) => ({
    ...grade,
    rows: advisoryRows
      .filter((row) => adviserGradeKey(row.adviser.grade_level_assigned) === grade.key)
      .sort((a, b) => Number(Boolean(b.adviser.is_grade_chairman)) - Number(Boolean(a.adviser.is_grade_chairman))),
  }));
  const openAdviser = (row) => {
    setSelectedAdviser(row);
    setSelectedKinderSession("");
  };
  const closeAdviser = () => {
    setSelectedAdviser(null);
    setSelectedKinderSession("");
  };

  return (
    <div className="enrollment-root">
      <Topbar user={user} onLogout={onLogout} onBack={onBack} title="Enrollment Monitoring" />
      <main className="enrollment-body">
        <div className="enrollment-heading">
          <div>
            <h1>Learner Enrollment</h1>
            <p>Shared learner data for School ID {IECES_SCHOOL_ID} from the IECES Portal and BMI Baseline Entry.</p>
          </div>
          <button onClick={fetchLearners} disabled={loading}>Refresh</button>
        </div>

        {error && <div className="enrollment-message error">{error}</div>}
        {loading && <div className="enrollment-message">Loading enrollment data…</div>}

        {!loading && !error && <>
          <section className="enrollment-stats">
            <div><span>Total Learners</span><strong>{totals.total}</strong></div>
            <div><span>Enrolled Today</span><strong>{todayTotal}</strong></div>
            <div><span>Male</span><strong>{totals.male}</strong></div>
            <div><span>Female</span><strong>{totals.female}</strong></div>
          </section>

          <section className="enrollment-panel">
            <div className="panel-title"><div><h2>Enrollment by Grade Level</h2><p>Live school-wide totals from Kinder through Grade 6 and SNED.</p></div></div>
            <div className="grade-live-grid">{overallGradeRows.map((row) => <div className="grade-live-card" key={row.key}>
              <span>{row.label}</span><strong>{row.total}</strong><small>{row.male} Male · {row.female} Female</small>
            </div>)}</div>
          </section>

          <section className="enrollment-panel advisory-highlight">
            <div className="panel-title"><div><h2>Advisory Classes</h2><p>Click an adviser to view the complete learner roster.</p></div></div>
            {advisoryRows.length === 0 ? <div className="enrollment-empty">No advisory class data is visible. Apply supabase-enrollment-dashboard-access.sql if advisers exist in the portal.</div> :
              <div className="advisory-groups">{advisoryGradeGroups.map((group) => <section className="advisory-grade-group" key={group.key}>
                <div className="advisory-grade-heading"><h3>{group.label}</h3><span>{group.rows.reduce((total, row) => total + row.total, 0)} learners</span></div>
                <div className="adviser-list">{group.rows.length === 0 ? <div className="adviser-empty">No adviser assigned</div> : group.rows.map((row) => {
                  const fullName = abbreviatedAdviserName(row.adviser);
                  return <div className={`adviser-row ${row.adviser.is_grade_chairman ? "chairman" : ""}`} key={row.adviser.id} onClick={() => openAdviser(row)} title="Click to view learners" role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") openAdviser(row); }}>
                    {row.adviser.photo_url ? <img src={row.adviser.photo_url} alt="" loading="eager" decoding="async" /> : <div className="adviser-avatar">👤</div>}
                    <div className="adviser-identity">
                      <div className="adviser-name-line">
                        <strong>{fullName}</strong>
                        <div className="adviser-total"><strong>{row.total}</strong><span>Learners</span></div>
                      </div>
                      {row.adviser.is_grade_chairman && <span className="chairman-badge">★ Chairman</span>}
                      {row.adviser.section_assigned && <small>Section {row.adviser.section_assigned}</small>}
                      <div className="adviser-sex-counts"><span>Male: <strong>{row.male}</strong></span><span>Female: <strong>{row.female}</strong></span></div>
                    </div>
                  </div>;
                })}</div>
              </section>)}</div>}
          </section>

          <section className="enrollment-panel">
            <div className="panel-title"><div><h2>Reading Level Assessment</h2><p>Reader classification for Grades 1–6, matching the IECES Portal.</p></div></div>
            <div className="daily-table-wrap"><table className="enrollment-table">
              <thead><tr><th>Reading Category</th>{readingGrades.map((grade) => <th key={grade.key}>{grade.label}</th>)}<th>Total</th></tr></thead>
              <tbody>{readingCategories.map((category) => <tr key={category}>
                <td><strong>{category}</strong></td>
                {readingGrades.map((grade) => <td key={grade.key}>{readingCount(category, grade.key)}</td>)}
                <td><strong>{readingGrades.reduce((total, grade) => total + readingCount(category, grade.key), 0)}</strong></td>
              </tr>)}</tbody>
              <tfoot><tr><th>Grand Total</th>{readingGrades.map((grade) => <th key={grade.key}>{overallGradeRows.find((row) => row.key === grade.key)?.total || 0}</th>)}<th>{readingGrades.reduce((total, grade) => total + (overallGradeRows.find((row) => row.key === grade.key)?.total || 0), 0)}</th></tr></tfoot>
            </table></div>
          </section>

          <section className="enrollment-panel">
            <div className="panel-title"><div><h2>Daily Enrollment</h2><p>Select a date to view its grade breakdown.</p></div></div>
            {dailyRows.length === 0 ? <div className="enrollment-empty">
              {learners.length
                ? "Existing learner records have no enrollment date. Run supabase-enrollment-dates.sql so future submissions are recorded by date."
                : "No learner enrollment has been recorded yet."}
            </div> : (
              <div className="daily-table-wrap"><table className="enrollment-table daily-table">
                <thead><tr><th>Date Enrolled</th><th>Male</th><th>Female</th><th>Total</th></tr></thead>
                <tbody>{dailyRows.map((row) => <tr key={row.date} className={selectedDate === row.date ? "selected" : ""} onClick={() => setSelectedDate(row.date)}>
                  <td>{displayDate(row.date)}</td><td>{row.male}</td><td>{row.female}</td><td><strong>{row.total}</strong></td>
                </tr>)}</tbody>
              </table></div>
            )}
          </section>

          {selectedDate && <section className="enrollment-panel">
            <div className="panel-title"><div><h2>Breakdown for {displayDate(selectedDate)}</h2><p>{selectedLearners.length} learner{selectedLearners.length === 1 ? "" : "s"} enrolled on this date.</p></div></div>
            <div className="daily-table-wrap"><table className="enrollment-table">
              <thead><tr><th>Grade Level</th><th>Male</th><th>Female</th><th>Total</th></tr></thead>
              <tbody>{selectedGradeRows.map((row) => <tr key={row.key}><td>{row.label}</td><td>{row.male}</td><td>{row.female}</td><td><strong>{row.total}</strong></td></tr>)}</tbody>
              <tfoot><tr><th>All Grades</th><th>{summarize(selectedLearners).male}</th><th>{summarize(selectedLearners).female}</th><th>{selectedLearners.length}</th></tr></tfoot>
            </table></div>
            <div className="demographic-grid">
              <BreakdownCard title="Religion" rows={demographicRows.religion} />
              <BreakdownCard title="Tribe" rows={demographicRows.tribe} />
              <BreakdownCard title="Barangay" rows={demographicRows.barangay} />
            </div>
          </section>}
        </>}
      </main>
      {selectedAdviser && adviserGradeKey(selectedAdviser.adviser.grade_level_assigned) === "0" && !selectedKinderSession && (
        <KinderSessionPicker row={selectedAdviser} onSelect={setSelectedKinderSession} onClose={closeAdviser} />
      )}
      {selectedAdviser && (adviserGradeKey(selectedAdviser.adviser.grade_level_assigned) !== "0" || selectedKinderSession) && (
        <AdvisoryRoster
          row={selectedKinderSession
            ? { ...selectedAdviser, learners: selectedAdviser.learners.filter((learner) => learnerSession(learner) === selectedKinderSession) }
            : selectedAdviser}
          session={selectedKinderSession}
          onClose={closeAdviser}
        />
      )}
    </div>
  );
}

const learnerName = (learner) => {
  if (learner.family_name || learner.first_name) {
    const givenNames = [learner.first_name, learner.middle_name, learner.suffix].filter(Boolean).join(" ");
    return [learner.family_name, givenNames].filter(Boolean).join(", ");
  }
  return learner.name || "Unnamed learner";
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

const latestMeasurement = (learner) => {
  const records = normalizedRecords(learner.records).filter((record) => record?.weight || record?.height);
  if (!records.length && (learner.weight || learner.height)) return learner;
  return records.sort((left, right) => String(left.date || "").localeCompare(String(right.date || ""))).at(-1) || null;
};

const nutritionalStatus = (learner) => {
  const record = latestMeasurement(learner);
  if (!record) return { bmi: "—", hfa: "—" };
  const sex = normalizedGender(learner).startsWith("F") ? "F" : "M";
  const fallbackMonths = Number(learner.age) > 0 ? Number(learner.age) * 12 : undefined;
  const bmiValue = calcBMI(record.weight, record.height);
  const computedBmi = getBMIStatus(bmiValue, sex, learner.birthdate, record.date, fallbackMonths)?.label;
  const computedHfa = getHAZStatus(record.height, sex, learner.birthdate, record.date, fallbackMonths)?.label;
  return {
    bmi: learner.bmi_status || record.bmi_status || record.status?.label || record.baz?.label || computedBmi || "—",
    hfa: learner.hfa_status || learner.haz_status || record.hfa_status || record.haz_status || record.haz?.label || computedHfa || "—",
  };
};

const nutritionClass = (status) => {
  const value = String(status || "").toLowerCase();
  if (value === "severely wasted") return "severely-wasted";
  if (value === "wasted") return "wasted";
  if (value === "—") return "unavailable";
  return "standard";
};

function KinderSessionPicker({ row, onSelect, onClose }) {
  const adviserName = abbreviatedAdviserName(row.adviser);
  const sessions = ["Morning", "Afternoon"].map((session) => ({
    session,
    count: row.learners.filter((learner) => learnerSession(learner) === session).length,
  }));
  return <div className="roster-overlay" onClick={onClose}>
    <div className="kinder-session-modal" onClick={(event) => event.stopPropagation()}>
      <header>
        <div>
          <span>Kinder advisory classes</span>
          <h2>{adviserName}</h2>
          <p>Select the class session to view its learner roster.</p>
        </div>
        <button onClick={onClose} aria-label="Close session selection">✕</button>
      </header>
      <div className="kinder-session-grid">
        {sessions.map(({ session, count }) => <button type="button" className={`kinder-session-card ${session.toLowerCase()}`} key={session} onClick={() => onSelect(session)}>
          <span aria-hidden="true">{session === "Morning" ? "☀️" : "🌤️"}</span>
          <strong>{session}</strong>
          <small>Session</small>
          <b>{count} learner{count === 1 ? "" : "s"}</b>
        </button>)}
      </div>
    </div>
  </div>;
}

function AdvisoryRoster({ row, session, onClose }) {
  const adviserName = abbreviatedAdviserName(row.adviser);
  const sortedLearners = [...row.learners].sort((left, right) => learnerName(left).localeCompare(learnerName(right)));
  return <div className="roster-overlay" onClick={onClose}>
    <div className="roster-modal" onClick={(event) => event.stopPropagation()}>
      <header>
        <div className="roster-adviser-heading">
          {row.adviser.photo_url ? <img src={row.adviser.photo_url} alt={`${adviserName} profile`} loading="eager" decoding="async" /> : <div className="roster-adviser-avatar" aria-hidden="true">👤</div>}
          <div><h2>{adviserName}</h2><p>{session ? `${session} Session` : row.adviser.section_assigned || "Advisory Class"} · {row.learners.length} learner{row.learners.length === 1 ? "" : "s"}</p></div>
        </div>
        <div className="roster-header-actions">
          <button className="roster-print" onClick={() => window.print()}>🖨 Print</button>
          <button className="roster-close" onClick={onClose} aria-label="Close learner roster">✕</button>
        </div>
      </header>
      <div className="roster-body">
        {row.learners.length === 0 ? <div className="enrollment-empty">No learners are assigned to this adviser.</div> : <div className="roster-table-wrap"><table className="roster-table">
          <thead><tr><th>No.</th><th>Photo</th><th>LRN</th><th>Full Name</th><th>Birthdate</th><th>Age</th><th>Religion</th><th>Tribe</th><th>Barangay</th><th>BMI Status</th><th>HFA Status</th></tr></thead>
          <tbody>{sortedLearners.map((learner, index) => {
            const status = nutritionalStatus(learner);
            return <tr key={learner.id}>
              <td className="roster-number">{index + 1}</td>
              <td className="roster-photo-cell">{(learner.photo_url || learner.photo) ? <img src={learner.photo_url || learner.photo} alt="" loading="eager" decoding="async" /> : null}</td>
              <td>{learner.lrn && learner.lrn !== "—" ? learner.lrn : learner.registry_no || learner.registryNo || "—"}</td>
              <td><strong>{learnerName(learner)}</strong></td>
              <td>{displayBirthdate(learner.birthdate)}</td>
              <td>{learnerAge(learner)}</td>
              <td>{learner.religion || "—"}</td>
              <td>{learner.tribe || "—"}</td>
              <td>{barangayOf(learner) || "—"}</td>
              <td><span className={`nutrition-label ${nutritionClass(status.bmi)}`}>{status.bmi}</span></td>
              <td><span className={`nutrition-label ${nutritionClass(status.hfa)}`}>{status.hfa}</span></td>
            </tr>;
          })}</tbody>
          <tfoot><tr><th colSpan="11">Total Learners: {sortedLearners.length}</th></tr></tfoot>
        </table></div>}
      </div>
    </div>
  </div>;
}
