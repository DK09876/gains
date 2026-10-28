/**
 * What Spot says. Each moment has a few lines in each tone, and a line used
 * recently is skipped - variety is what keeps a reminder from turning into
 * noise. Client-safe: Today and the summary pick lines too.
 *
 * Tone is the person's choice. Hype only encourages. Coach states the facts
 * with a nudge. Drill sergeant yells - but never about a planned rest day,
 * and a miss is met with "get back in", not a lecture.
 */

export const TONES = ['hype', 'coach', 'drill'] as const;
export type Tone = (typeof TONES)[number];
export const isTone = (x: unknown): x is Tone => TONES.includes(x as Tone);
export const TONE_LABELS: Record<Tone, string> = { hype: 'Hype', coach: 'Coach', drill: 'Drill sergeant' };
export const TONE_NOTES: Record<Tone, string> = {
  hype: 'All encouragement. Never mentions a miss.',
  coach: 'Plain facts and a nudge.',
  drill: 'Yells. Roasts a miss, never a rest day.',
};

export type Moment =
  | 'day' | 'comeback' | 'rest' | 'doneToday' | 'monday' | 'open'
  | 'friend' | 'best' | 'finish' | 'sent' | 'restUp';

type Lines = Record<Tone, string[]>;

/** {workout}, {friend}, {sender}, {mascot}, {n}, {done}, {planned}, {next}, {days} are filled in. */
const LINES: Record<Moment, Lines> = {
  day: {
    hype: ['{workout} day! Let\'s go get it.', '{workout} today. You\'ve got this.', 'It\'s {workout} day. Future you says thanks.', 'Time for {workout}. Make it a good one.'],
    coach: ['{workout} is on the plan today.', '{workout} today. Warm up first, then lift.', 'Today\'s plan: {workout}.', '{workout} day. Beat last time by one rep.'],
    drill: ['{WORKOUT} DAY. Move.', 'The bar isn\'t going to lift itself. {workout}. Now.', '{workout}. No excuses, no negotiating.', 'You planned {workout} for today. Plans are promises.'],
  },
  comeback: {
    hype: ['You\'re back! That\'s the hard part done.', 'Welcome back. One workout and you\'re rolling again.', 'Missed you. {workout} is a great way back in.'],
    coach: ['{days} days since your last workout. {workout} is next.', 'Picking up where you left off: {workout}.', 'A short session today beats a perfect one next week.'],
    drill: ['{days} days. I counted. {workout}. Now.', 'Break\'s over. {workout} today.', 'You took {days} days off. Today you take zero.'],
  },
  rest: {
    hype: ['Rest day. You earned it.', 'Rest day! Recovery is where the gains happen.', 'Day off. Eat well, sleep well.'],
    coach: ['Rest day. Recovery is part of the plan.', 'Nothing planned today. A walk wouldn\'t hurt.', 'Rest day. Tomorrow: {next}.'],
    drill: ['Rest day. Rest HARD.', 'Day off. Enjoy it. {next} won\'t be so kind.', 'Rest day. That\'s an order.'],
  },
  doneToday: {
    hype: ['Done for today. Great work.', 'Trained today. That\'s a win.', 'Today\'s in the bank. Nice.'],
    coach: ['Trained today. {done} of {planned} this week.', 'Done for today. Next up: {next}.', 'Logged. {done} of {planned} planned days this week.'],
    drill: ['Done. Don\'t get comfortable.', 'Acceptable. {next} next.', 'One down. {done} of {planned}. Keep it moving.'],
  },
  monday: {
    hype: ['New week! {first} first. Let\'s make it a big one.', 'Fresh week, fresh start. {first} today.', 'Last week: {done} of {planned}. This week: all of them?'],
    coach: ['New week. Last week: {done} of {planned}. {first} first.', 'Week starts with {first}. {planned} days planned.', 'Fresh start: {first} today.'],
    drill: ['NEW WEEK. Last week was {done} of {planned}. Do better. {first}.', 'Monday. {first}. Set the tone.', 'Clean slate. {first} first. Don\'t waste it.'],
  },
  open: {
    hype: ['Still at {workout}? Finish strong, or call it a day.', 'Your {workout} is still open. Wrap it up when you\'re done.'],
    coach: ['{workout} is still open. Finish it, or it closes itself in a few hours.', 'Done with {workout}? Tap Finish so it counts.'],
    drill: ['{workout} is still open. Finish it or let it go.', 'You left {workout} hanging. Close it out.'],
  },
  friend: {
    hype: ['{friend} just finished {workout}. Your turn!', '{friend} got {workout} done. Join the club.'],
    coach: ['{friend} finished {workout}.', '{friend} just logged {workout}.'],
    drill: ['{friend} is done with {workout}. Where are you?', '{friend} finished {workout}. You\'re on the couch.'],
  },
  best: {
    hype: ['{n} new best{s}. That\'s what I\'m talking about.', 'New best{s}! Look at you go.', '{n} new best{s} today. Huge.'],
    coach: ['{n} new best{s}. Raise the target if it felt solid.', 'Personal best{s}: {n}. Nice work.', '{n} new best{s} logged.'],
    drill: ['{n} new best{s}. Finally. Now do it again.', 'New best{s}. Don\'t let it go to your head.', '{n} best{s}. That\'s the standard now.'],
  },
  finish: {
    hype: ['Workout done. Proud of you.', 'Done! Every session counts.', 'That\'s a wrap. Great work.'],
    coach: ['Workout logged.', 'Done. Same again next time, a little heavier.', 'Logged. {done} of {planned} this week.'],
    drill: ['Done. That\'s the minimum.', 'Logged. Next time, more.', 'Finished. Rest up, then do it again.'],
  },
  sent: {
    hype: ['{sender} sent {mascot}: you\'ve got this!', '{sender} sent {mascot}. Let\'s go!'],
    coach: ['{sender} sent {mascot}: time for {workout}?', '{sender} sent {mascot} your way.'],
    drill: ['{sender} sent {mascot} after you. {WORKOUT}. NOW.', '{sender} sent {mascot}. Stop scrolling, start lifting.'],
  },
  restUp: {
    hype: ['Rest\'s up! {next}.', 'Go time: {next}.'],
    coach: ['Rest\'s up. {next}.', 'Time for {next}.'],
    drill: ['REST\'S UP. {next}. Move.', 'Up. {next}.'],
  },
};

export interface Line { id: string; text: string }

export function fill(text: string, vars: Record<string, string | number>): string {
  const n = Number(vars.n ?? 0);
  return text
    .replace(/\{s\}/g, n === 1 ? '' : 's')
    .replace(/\{WORKOUT\}/g, String(vars.workout ?? 'it').toUpperCase())
    .replace(/\{(\w+)\}/g, (m, key: string) => (vars[key] !== undefined ? String(vars[key]) : m));
}

/**
 * A line for this moment and tone, skipping any recently used. `seed` picks
 * where to start - a date makes Today's line stable through the day.
 */
export function pickLine(moment: Moment, tone: Tone, vars: Record<string, string | number>, recent: string[] = [], seed = 0): Line {
  const lines = LINES[moment][tone];
  const ids = lines.map((_, i) => `${moment}.${tone}.${i}`);
  const start = Math.abs(seed) % lines.length;
  const order = lines.map((_, i) => (start + i) % lines.length);
  const pick = order.find((i) => !recent.includes(ids[i])) ?? start;
  return { id: ids[pick], text: fill(lines[pick], vars) };
}

/** A stable number for a calendar day, for Today's line. */
export const daySeed = (d: Date) => d.getFullYear() * 400 + d.getMonth() * 31 + d.getDate();
