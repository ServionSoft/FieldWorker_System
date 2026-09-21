export function isCompanyProfileComplete(c) {
    const filled = (v) => Boolean(String(v ?? '').trim());
    return filled(c.name) && filled(c.email) && filled(c.phone) && filled(c.address) && filled(c.timezone);
}
//# sourceMappingURL=onboarding.js.map