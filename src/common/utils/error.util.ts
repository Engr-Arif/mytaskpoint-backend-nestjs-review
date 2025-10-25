export function getErrorMessage(err: unknown): string {
  if (!err) return String(err);
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  try {
    const anyErr = err as { message?: unknown };
    if (anyErr && typeof anyErr.message === 'string') return anyErr.message;
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
