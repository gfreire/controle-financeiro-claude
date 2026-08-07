/** Mirrors gen_random_uuid() (UUID v4) for records created client-side before insert. */
export function generateId(): string {
  return crypto.randomUUID();
}
