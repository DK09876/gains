/**
 * Reading a workout plan out of a Google Sheet exported as CSV.
 *
 * There is no fixed layout to rely on - it is a sheet laid out by eye - so
 * this reads it the way a person would:
 *
 *   Legs,,,                          a name in the first column starts a workout
 *   ,Squat-All glute regions,,       an exercise: the name, then notes after "-" or "("
 *   ,Before,,                        a label whose next line is indented further
 *   ,,15 Minute Walk,Low Intensity     is a section, and the lines under it are its exercises
 *   ,Hip Thruster,,,,95 lbs          a number with a unit is the target weight
 *   ,,MC Gillis 3,,https://...       any link is a clip for the exercise
 *
 * Nothing is dropped silently: a line that fits none of these is returned
 * in `skipped` so the import can say what it left out.
 */

export interface SheetExercise {
  name: string;
  section: string;
  notes: string;
  targetWeight: number | null;
  weightNote: string;
  urls: string[];
}

export interface SheetWorkout {
  name: string;
  exercises: SheetExercise[];
}

export interface ParsedSheet {
  workouts: SheetWorkout[];
  skipped: string[];
}

/** RFC 4180 CSV: quoted fields may hold commas, newlines and doubled quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const URL_RE = /https?:\/\/[^\s),]+/g;
const WEIGHT_RE = /^(\d+(?:\.\d+)?)\s*(?:lbs?|pb|pounds?)?\b[\s?.,!]*(.*)$/i;

const unwrap = (s: string) => s.trim().replace(/^\(([\s\S]*)\)$/, '$1').trim();
const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * "Walking lunges- All glute regions (12 steps...)" is a name and its notes.
 * The split is the first "-" or "(" - but not a hyphen between digits, so
 * "around the world 10-20 times" stays whole.
 */
export function splitName(text: string): { name: string; notes: string } {
  const hyphen = text.search(/(?<!\d)\s*-\s*(?!\d)/);
  const paren = text.indexOf('(');
  const cuts = [hyphen, paren].filter((i) => i > 0);
  if (!cuts.length) return { name: capitalise(text.trim()), notes: '' };
  const at = Math.min(...cuts);
  const rest = text.slice(at).trim().replace(/^-\s*/, '');
  return { name: capitalise(text.slice(0, at).trim()), notes: unwrap(rest) };
}

/** "10 lbs each" is 10 with the note "each"; "40 lb" is 40; "(Try leg press)" is not a weight. */
export function parseWeight(cell: string): { weight: number; note: string } | null {
  const match = WEIGHT_RE.exec(cell.trim());
  if (!match) return null;
  return { weight: Number(match[1]), note: match[2].trim() };
}

function exerciseFrom(text: string, extras: string[], section: string): SheetExercise {
  const urls = [...text.matchAll(URL_RE), ...extras.flatMap((e) => [...e.matchAll(URL_RE)])].map((m) => m[0]);
  const { name, notes } = splitName(unwrap(text.replace(URL_RE, '').replace(/\(\s*\)/g, '')));
  const exercise: SheetExercise = { name, section, notes, targetWeight: null, weightNote: '', urls };
  for (const raw of extras) {
    const cell = raw.replace(URL_RE, '').trim();
    if (!cell) continue;
    const weight = exercise.targetWeight === null ? parseWeight(cell) : null;
    if (weight) {
      exercise.targetWeight = weight.weight;
      exercise.weightNote = weight.note;
    } else {
      exercise.notes = [exercise.notes, unwrap(cell)].filter(Boolean).join('. ');
    }
  }
  return exercise;
}

export function parseSheet(csv: string): ParsedSheet {
  const rows = parseCsv(csv).map((r) => r.map((c) => c.trim()));
  const filled = rows.filter((r) => r.some(Boolean));
  const workouts: SheetWorkout[] = [];
  const skipped: string[] = [];
  let current: SheetWorkout | null = null;
  let section = '';

  filled.forEach((cells, i) => {
    const first = cells.findIndex(Boolean);
    const text = cells.filter(Boolean).join(' · ');
    if (first === 0) {
      current = { name: cells[0].replace(/:\s*$/, ''), exercises: [] };
      workouts.push(current);
      section = '';
      return;
    }
    if (!current) { skipped.push(text); return; }

    const label = cells[1];
    const deeper = cells.slice(2).some(Boolean);
    const next = filled[i + 1];
    const opensSection = label && !/https?:\/\//.test(label) && (
      // ",Any one of these,Sled" - a label with its first exercise beside it
      (deeper && !!cells[2])
      // ",After" then ",,Stair Master" - a label over indented lines
      || (!deeper && next && next.findIndex(Boolean) >= 2)
    );

    if (opensSection) {
      section = label;
      if (cells[2]) current.exercises.push(exerciseFrom(cells[2], cells.slice(3), section));
      return;
    }
    if (label) {
      // Back at the outer indent: whatever section was open has ended.
      section = '';
      current.exercises.push(exerciseFrom(label, cells.slice(2), ''));
      return;
    }
    current.exercises.push(exerciseFrom(cells[first], cells.slice(first + 1), section));
  });

  return { workouts: workouts.filter((w) => w.exercises.length || !skipped.push(w.name)), skipped };
}
