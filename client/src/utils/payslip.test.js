import { describe, it, expect } from 'vitest';
import { amountInWords, payslipsHtml } from './payslip.js';

describe('amountInWords', () => {
  it('writes rupees the Indian way', () => {
    expect(amountInWords(0)).toBe('Zero');
    expect(amountInWords(15)).toBe('Fifteen');
    expect(amountInWords(305)).toBe('Three Hundred Five');
    expect(amountInWords(13603)).toBe('Thirteen Thousand Six Hundred Three');
    expect(amountInWords(150000)).toBe('One Lakh Fifty Thousand');
    expect(amountInWords(12345678)).toBe('One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight');
  });
});

describe('payslipsHtml', () => {
  it('makes one page per person with net pay in words', () => {
    const line = {
      name: 'Ramesh <Joshi>', staffCode: 'STF-001', earnedBasic: 9000, earnedOther: 6500, overtime: 0, otherEarning: 0,
      pfApplicable: true, pfEmployee: 1080, esiApplicable: false, pt: 200, advanceRecovery: 0, otherDeduction: 0,
      gross: 15500, totalDeductions: 1280, netPay: 14220, daysInMonth: 31, paidDays: 30.5, unpaidDays: 0.5, paymentMode: 'bank', bankAccount: '001234567890',
    };
    const html = payslipsHtml([line, line], { label: 'Oct 2026', temple: { name: 'Mangal Grah Mandir', address: 'Amalner' } });
    expect(html.match(/class="page"/g)).toHaveLength(2);
    expect(html).toContain('Fourteen Thousand Two Hundred Twenty');
    expect(html).toContain('Ramesh &lt;Joshi&gt;');
    expect(html).toContain('•••• 7890');
    expect(html).toContain('30½');
    expect(html).toContain('<td>½</td>'); // half an unpaid day
  });
});
