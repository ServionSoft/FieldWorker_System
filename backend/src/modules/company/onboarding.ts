export function isCompanyProfileComplete(c: {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  timezone?: string | null;
}) {
  const filled = (v?: string | null) => Boolean(String(v ?? '').trim());
  return filled(c.name) && filled(c.email) && filled(c.phone) && filled(c.address) && filled(c.timezone);
}
