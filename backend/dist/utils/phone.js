export function digitsOnly(phone) {
    return String(phone ?? '').replace(/\D/g, '');
}
export function last10(phone) {
    const d = digitsOnly(phone);
    return d.slice(-10);
}
export function toE164(phone) {
    const d = digitsOnly(phone);
    if (!d)
        return '';
    if (d.length === 10)
        return `+1${d}`;
    if (d.length === 11 && d.startsWith('1'))
        return `+${d}`;
    if (String(phone ?? '').trim().startsWith('+'))
        return `+${d}`;
    return `+${d}`;
}
//# sourceMappingURL=phone.js.map