import { BMI_TABLE_BOYS, BMI_TABLE_GIRLS } from './bmiTable';
import { HAZ_TABLE_BOYS, HAZ_TABLE_GIRLS } from './hazTable';

// ══════════════════════════════════════════════════════════════════════════
// DepEd Official Nutritional Status Computation
// Source: IECES_BMI_BLANK.xlsx (WHO Growth Reference)
//
// Two indicators:
//  1. BMI-for-Age  (BAZ) → Severely Wasted / Wasted / Normal / Overweight / Obese
//  2. Height-for-Age (HAZ) → Severely Stunted / Stunted / Normal / Tall
//
// Both require: age in months + sex ('M' or 'F')
// ══════════════════════════════════════════════════════════════════════════

// ── Status display metadata ───────────────────────────────────────────────

export const BAZ_META = {
  'Severely Wasted': { color: '#A32D2D', bg: '#FCEBEB' },
  'Wasted':          { color: '#BA7517', bg: '#FAEEDA' },
  'Normal':          { color: '#3B6D11', bg: '#EAF3DE' },
  'Overweight':      { color: '#BA7517', bg: '#FAEEDA' },
  'Obese':           { color: '#A32D2D', bg: '#FCEBEB' },
};

export const HAZ_META = {
  'Severely Stunted': { color: '#7C2D12', bg: '#FEE2E2' },
  'Stunted':          { color: '#BA7517', bg: '#FAEEDA' },
  'Normal':           { color: '#3B6D11', bg: '#EAF3DE' },
  'Tall':             { color: '#1E40AF', bg: '#DBEAFE' },
};

// For Settings reference display
export const BMI_CLASSIFICATIONS = Object.entries(BAZ_META).map(([label, meta]) => ({
  label, ...meta,
}));

export const HAZ_CLASSIFICATIONS = Object.entries(HAZ_META).map(([label, meta]) => ({
  label, ...meta,
}));

// ── Basic calculations ────────────────────────────────────────────────────

export function normalizeHeightCm(height) {
  const value = parseFloat(height);
  if (!value || value <= 0) return null;
  // Learner height is stored in centimetres. Support older/imported records
  // that were entered in metres (for example, 1.28 instead of 128).
  return value <= 3 ? value * 100 : value;
}

// Canonical height unit used by forms, records, and CSV files.
// Values above 3 are treated as legacy centimetre values.
export function normalizeHeightMeters(height) {
  const value = parseFloat(height);
  if (!value || value <= 0) return null;
  return value > 3 ? value / 100 : value;
}

export function formatHeightMeters(height) {
  const value = normalizeHeightMeters(height);
  if (value == null) return "—";
  return Number(value.toFixed(3)).toString();
}

export function calcBMI(weight, height) {
  const h = normalizeHeightMeters(height);
  const w = parseFloat(weight);
  if (!h || !w || h <= 0 || w <= 0) return null;
  return w / (h * h);
}

function validDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? new Date(value) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function ageInMonths(birthdate, referenceDate = new Date()) {
  if (!birthdate) return null;
  const birth = validDate(birthdate);
  const measured = validDate(referenceDate);
  if (!birth || !measured) return null;
  let months = (measured.getFullYear() - birth.getFullYear()) * 12
             + (measured.getMonth()    - birth.getMonth());
  if (measured.getDate() < birth.getDate()) months--;
  return months >= 0 ? months : null;
}

export function ageInYears(birthdate, referenceDate = new Date()) {
  if (!birthdate) return '';
  const birth = validDate(birthdate);
  const measured = validDate(referenceDate);
  if (!birth || !measured) return '';
  let age = measured.getFullYear() - birth.getFullYear();
  const m = measured.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && measured.getDate() < birth.getDate())) age--;
  return age >= 0 ? age : '';
}

// ── BMI-for-Age (BAZ) ─────────────────────────────────────────────────────
// Returns: { label, color, bg } | null

export function getBMIStatus(
  bmi,
  sex,
  birthdate,
  measurementDate,
  fallbackMonths,
) {
  if (bmi == null) return null;

  const legacyFallbackMonths =
    typeof measurementDate === 'number' ? measurementDate : fallbackMonths;
  const measuredOn =
    typeof measurementDate === 'number' ? null : measurementDate;
  const months = birthdate
    ? measuredOn
      ? ageInMonths(birthdate, measuredOn)
      : null
    : legacyFallbackMonths;
  if (months == null) return null;

  const table       = sex === 'F' ? BMI_TABLE_GIRLS : BMI_TABLE_BOYS;
  const clampMonths = Math.max(72, Math.min(228, months));
  const row         = table[clampMonths];

  if (row) {
    if (bmi <= row.sw_max)                      return { label: 'Severely Wasted', ...BAZ_META['Severely Wasted'] };
    if (bmi >= row.w_from  && bmi <= row.w_to)  return { label: 'Wasted',          ...BAZ_META['Wasted']          };
    if (bmi >= row.n_from  && bmi <= row.n_to)  return { label: 'Normal',           ...BAZ_META['Normal']          };
    if (bmi >= row.ow_from && bmi <= row.ow_to) return { label: 'Overweight',       ...BAZ_META['Overweight']      };
    if (bmi >= row.ob_min)                      return { label: 'Obese',            ...BAZ_META['Obese']           };
  }

  // Fallback for age < 72 months (Kinder) — simplified thresholds
  if (bmi < 14)  return { label: 'Severely Wasted', ...BAZ_META['Severely Wasted'] };
  if (bmi < 16)  return { label: 'Wasted',          ...BAZ_META['Wasted']          };
  if (bmi < 23)  return { label: 'Normal',          ...BAZ_META['Normal']          };
  if (bmi < 27)  return { label: 'Overweight',      ...BAZ_META['Overweight']      };
  return               { label: 'Obese',            ...BAZ_META['Obese']           };
}

// ── Height-for-Age (HAZ) ──────────────────────────────────────────────────
// Returns: { label, color, bg } | null

export function getHAZStatus(
  heightCm,
  sex,
  birthdate,
  measurementDate,
  fallbackMonths,
) {
  if (!heightCm) return null;

  const legacyFallbackMonths =
    typeof measurementDate === 'number' ? measurementDate : fallbackMonths;
  const measuredOn =
    typeof measurementDate === 'number' ? null : measurementDate;
  const months = birthdate
    ? measuredOn
      ? ageInMonths(birthdate, measuredOn)
      : null
    : legacyFallbackMonths;
  if (months == null) return null;

  const h           = normalizeHeightCm(heightCm);
  const table       = sex === 'F' ? HAZ_TABLE_GIRLS : HAZ_TABLE_BOYS;
  const clampMonths = Math.max(36, Math.min(228, months));
  const row         = table[clampMonths];

  if (!row) return null;

  if (h <= row.ss_max)                    return { label: 'Severely Stunted', ...HAZ_META['Severely Stunted'] };
  if (h >= row.s_from  && h <= row.s_to)  return { label: 'Stunted',          ...HAZ_META['Stunted']          };
  if (h >= row.n_from  && h <= row.n_to)  return { label: 'Normal',           ...HAZ_META['Normal']           };
  if (h >= row.tall_min)                  return { label: 'Tall',             ...HAZ_META['Tall']             };

  return null;
}

// ── Combined nutritional status (both indicators) ─────────────────────────
// Returns: { baz: {...}, haz: {...} }

export function getNutritionalStatus(
  weight,
  height,
  sex,
  birthdate,
  measurementDate,
) {
  const bmi    = calcBMI(weight, height);
  const baz    = getBMIStatus(bmi, sex, birthdate, measurementDate);
  const haz    = getHAZStatus(height, sex, birthdate, measurementDate);
  return { bmi, baz, haz };
}

// ── App constants ─────────────────────────────────────────────────────────

export const GRADE_LEVELS = [
  'Kinder', 'Grade 1', 'Grade 2', 'Grade 3',
  'Grade 4', 'Grade 5', 'Grade 6', 'SNED',
];

// Reports retain SPED for older records while SNED is the current supported
// grade level. Keep the report order in one place so every report stays aligned.
export const REPORT_GRADE_LEVELS = [...GRADE_LEVELS, 'SPED'];

export function getLearnerGradeLevel(student) {
  if (!student) return '';

  const candidates = [
    student.grade,
    student.grade_level,
    student.gradeLevel,
    student.section,
  ];

  for (const candidate of candidates) {
    const value = String(candidate || '').trim();
    if (!value) continue;

    const upper = value.toUpperCase();
    if (
      upper.includes('SNED') ||
      upper.includes('SPECIAL NEEDS EDUCATION') ||
      upper.includes('SPECIAL NEEDS ED')
    ) {
      return 'SNED';
    }
    if (
      upper.includes('SPED') ||
      upper.includes('SPECIAL EDUCATION') ||
      upper.includes('SPECIAL ED')
    ) {
      return 'SPED';
    }

    const matched = GRADE_LEVELS.find(
      (grade) => value === grade || value.startsWith(`${grade} - `),
    );
    if (matched) return matched;
  }

  return '';
}

export const SECTIONS = [
  'Kinder', 'Grade 1', 'Grade 2', 'Grade 3',
  'Grade 4', 'Grade 5', 'Grade 6', 'SNED',
];

export function getCurrentSchoolYear() {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;

  // School year starts in June
  if (month >= 6) {
    return `${year}–${year + 1}`;
  }

  return `${year - 1}–${year}`;
}

// Automatically generates the current school year and the next 3 future years
export function getSchoolYears() {
  const currentSY = getCurrentSchoolYear();
  const startYear = parseInt(currentSY.split('–')[0]);

  const years = [];
  for (let i = 0; i < 4; i++) {
    const start = startYear + i;
    const end = start + 1;
    years.push(`${start}–${end}`);
  }
  return years;
}

export const SCHOOL_YEARS = getSchoolYears();

export const QUARTERS = ['Baseline', 'Midline', 'Endline'];
export const SESSIONS = ['Morning', 'Afternoon'];
