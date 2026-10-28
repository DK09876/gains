/**
 * Runs once when the server starts: begins the once-a-minute reminder check.
 * Node only - the edge runtime has no database.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startReminders } = await import('./lib/reminders');
    startReminders();
  }
}
