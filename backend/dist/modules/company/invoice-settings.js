import { z } from 'zod';
export const DEFAULT_INVOICE_SETTINGS = {
    showLogo: true,
    showAddress: true,
    showPhone: true,
    showEmail: true,
    showWebsite: true,
    showCustomerAddress: true,
    showDueDate: true,
    showStatus: true,
    showTax: true,
    showFooter: true,
    showBankDetails: false,
    showNotes: true,
    bankName: '',
    bankAccountName: '',
    bankAccountNumber: '',
    bankRoutingNumber: '',
    bankIban: '',
    bankSwift: '',
    paymentInstructions: '',
};
export const invoiceSettingsPatchSchema = z.object({
    showLogo: z.boolean().optional(),
    showAddress: z.boolean().optional(),
    showPhone: z.boolean().optional(),
    showEmail: z.boolean().optional(),
    showWebsite: z.boolean().optional(),
    showCustomerAddress: z.boolean().optional(),
    showDueDate: z.boolean().optional(),
    showStatus: z.boolean().optional(),
    showTax: z.boolean().optional(),
    showFooter: z.boolean().optional(),
    showBankDetails: z.boolean().optional(),
    showNotes: z.boolean().optional(),
    bankName: z.string().max(200).optional(),
    bankAccountName: z.string().max(200).optional(),
    bankAccountNumber: z.string().max(80).optional(),
    bankRoutingNumber: z.string().max(80).optional(),
    bankIban: z.string().max(80).optional(),
    bankSwift: z.string().max(40).optional(),
    paymentInstructions: z.string().max(2000).optional(),
});
function asBool(value, fallback) {
    return typeof value === 'boolean' ? value : fallback;
}
function asStr(value) {
    return value == null ? '' : String(value);
}
export function parseInvoiceSettings(raw) {
    const o = raw && typeof raw === 'object' && !Array.isArray(raw)
        ? raw
        : {};
    const d = DEFAULT_INVOICE_SETTINGS;
    return {
        showLogo: asBool(o.showLogo, d.showLogo),
        showAddress: asBool(o.showAddress, d.showAddress),
        showPhone: asBool(o.showPhone, d.showPhone),
        showEmail: asBool(o.showEmail, d.showEmail),
        showWebsite: asBool(o.showWebsite, d.showWebsite),
        showCustomerAddress: asBool(o.showCustomerAddress, d.showCustomerAddress),
        showDueDate: asBool(o.showDueDate, d.showDueDate),
        showStatus: asBool(o.showStatus, d.showStatus),
        showTax: asBool(o.showTax, d.showTax),
        showFooter: asBool(o.showFooter, d.showFooter),
        showBankDetails: asBool(o.showBankDetails, d.showBankDetails),
        showNotes: asBool(o.showNotes, d.showNotes),
        bankName: asStr(o.bankName),
        bankAccountName: asStr(o.bankAccountName),
        bankAccountNumber: asStr(o.bankAccountNumber),
        bankRoutingNumber: asStr(o.bankRoutingNumber),
        bankIban: asStr(o.bankIban),
        bankSwift: asStr(o.bankSwift),
        paymentInstructions: asStr(o.paymentInstructions),
    };
}
//# sourceMappingURL=invoice-settings.js.map