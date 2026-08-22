export function postAuthPath(user?: { role?: string } | null, company?: { onboardingRequired?: boolean; onboardingComplete?: boolean } | null) {
  if (user?.role === 'super_admin') return '/super-admin';
  if (user?.role === 'field_worker') return '/worker';
  if (company?.onboardingRequired || company?.onboardingComplete === false) return '/onboarding';
  return '/admin';
}
