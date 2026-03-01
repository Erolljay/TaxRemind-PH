import { format, addDays, isSameDay, startOfMonth, endOfMonth, setDate, getMonth, getYear } from 'date-fns';

export enum TaxType {
  PERCENTAGE_TAX = 'Percentage Tax',
  VAT = 'Value Added Tax',
  WITHHOLDING_COMPENSATION = 'Withholding Tax - Compensation',
  WITHHOLDING_EXPANDED = 'Withholding Tax - Expanded',
  INCOME_TAX = 'Income Tax'
}

export enum TaxpayerType {
  INDIVIDUAL = 'Individual',
  CORPORATE = 'Non-Individual (Corporate)'
}

export interface TaxDeadline {
  taxType: TaxType;
  deadline: Date;
  frequency: 'monthly' | 'quarterly' | 'annual';
  form: string;
  attachments?: string[];
}

export const FILING_INSTRUCTIONS: Record<TaxType, string> = {
  [TaxType.PERCENTAGE_TAX]: `
*Percentage Tax (BIR Form 2551Q)*
1. Filed Quarterly.
2. Log in to eBIRForms or use the manual form.
3. Fill out Form 2551Q.
4. Compute 3% (or current rate) of your gross quarterly sales/receipts.
5. Submit and pay via authorized agent banks or online channels.
`,
  [TaxType.VAT]: `
*Value Added Tax (BIR Form 2550Q)*
1. Filed Quarterly.
2. Use BIR Form 2550Q.
3. Input total sales and purchases.
4. Attach Summary List of Sales (SLS) and Summary List of Purchases (SLP).
5. Submit via eBIRForms/eFPS and pay the balance.
`,
  [TaxType.WITHHOLDING_COMPENSATION]: `
*Withholding Tax on Compensation*
- *Monthly (1601-C)*: Filed by the 10th of the following month.
- *Annual (1604-C)*: Filed by Jan 31 of the following year.
- *Alphalist*: Must be submitted along with the annual return.
`,
  [TaxType.WITHHOLDING_EXPANDED]: `
*Expanded Withholding Tax*
- *Monthly (0619-E)*: Remittance form for the first two months of the quarter.
- *Quarterly (1601-EQ)*: Filed on the last month of the quarter.
- *QAP*: Quarterly Alphalist of Payees must be attached to 1601-EQ.
- *Annual (1604-E)*: Filed by March 1 of the following year.
`,
  [TaxType.INCOME_TAX]: `
*Income Tax (BIR Form 1701Q / 1701 / 1702)*
1. Quarterly (1701Q/1702Q) and Annual (1701/1702).
2. Declare your gross income and allowable deductions.
3. For Annual: Deadline is April 15.
4. For Quarterly (Individual): Q1 (May 15), Q2 (Aug 15), Q3 (Nov 15).
5. For Quarterly (Corporate): 60 days after quarter close (May 30, Aug 29, Nov 29).
`
};

/**
 * Calculates deadlines occurring in a specific month/year.
 * month: 0-11
 */
export function getDeadlinesForMonth(month: number, year: number, taxpayerType: TaxpayerType = TaxpayerType.INDIVIDUAL): TaxDeadline[] {
  const deadlines: TaxDeadline[] = [];
  const targetMonthDate = new Date(year, month, 1);

  // --- Withholding Tax - Compensation ---
  // Monthly 1601-C (10th of the month for previous month's taxes)
  deadlines.push({
    taxType: TaxType.WITHHOLDING_COMPENSATION,
    deadline: new Date(year, month, 10),
    frequency: 'monthly',
    form: '1601-C'
  });
  // Annual 1604-C (Jan 31)
  if (month === 0) {
    deadlines.push({
      taxType: TaxType.WITHHOLDING_COMPENSATION,
      deadline: new Date(year, 0, 31),
      frequency: 'annual',
      form: '1604-C',
      attachments: ['Alphalist (1604-C)']
    });
  }

  // --- Withholding Tax - Expanded ---
  // Monthly 0619-E (10th of the month, except for the month following a quarter end)
  // Quarters end in Mar(2), Jun(5), Sep(8), Dec(11).
  // 1601-EQ is filed in Apr(3), Jul(6), Oct(9), Jan(0).
  const isQuarterlyFilingMonth = [0, 3, 6, 9].includes(month);
  
  if (!isQuarterlyFilingMonth) {
    deadlines.push({
      taxType: TaxType.WITHHOLDING_EXPANDED,
      deadline: new Date(year, month, 10),
      frequency: 'monthly',
      form: '0619-E'
    });
  } else {
    // Quarterly 1601-EQ (Last day of the month following the close of the quarter)
    deadlines.push({
      taxType: TaxType.WITHHOLDING_EXPANDED,
      deadline: endOfMonth(targetMonthDate),
      frequency: 'quarterly',
      form: '1601-EQ',
      attachments: ['QAP (Quarterly Alphalist of Payees)']
    });
  }
  // Annual 1604-E (March 1)
  if (month === 2) { // March
    deadlines.push({
      taxType: TaxType.WITHHOLDING_EXPANDED,
      deadline: new Date(year, 2, 1),
      frequency: 'annual',
      form: '1604-E'
    });
  }

  // --- VAT (2550Q Quarterly) ---
  // Deadline: 25th of the month following the close of the quarter (Apr, Jul, Oct, Jan)
  if (isQuarterlyFilingMonth) {
    deadlines.push({
      taxType: TaxType.VAT,
      deadline: new Date(year, month, 25),
      frequency: 'quarterly',
      form: '2550Q',
      attachments: ['SLS (Summary List of Sales)', 'SLP (Summary List of Purchases)']
    });
  }

  // --- Percentage Tax (2551Q Quarterly) ---
  // Same as VAT
  if (isQuarterlyFilingMonth) {
    deadlines.push({
      taxType: TaxType.PERCENTAGE_TAX,
      deadline: new Date(year, month, 25),
      frequency: 'quarterly',
      form: '2551Q'
    });
  }

  // --- Income Tax ---
  // Annual: April 15
  if (month === 3) { // April
     deadlines.push({
       taxType: TaxType.INCOME_TAX,
       deadline: new Date(year, 3, 15),
       frequency: 'annual',
       form: taxpayerType === TaxpayerType.INDIVIDUAL ? '1701' : '1702'
     });
  }

  // Quarterly
  if (taxpayerType === TaxpayerType.INDIVIDUAL) {
    // Individual: Q1 (May 15), Q2 (Aug 15), Q3 (Nov 15)
    if (month === 4) deadlines.push({ taxType: TaxType.INCOME_TAX, deadline: new Date(year, 4, 15), frequency: 'quarterly', form: '1701Q' });
    if (month === 7) deadlines.push({ taxType: TaxType.INCOME_TAX, deadline: new Date(year, 7, 15), frequency: 'quarterly', form: '1701Q' });
    if (month === 10) deadlines.push({ taxType: TaxType.INCOME_TAX, deadline: new Date(year, 10, 15), frequency: 'quarterly', form: '1701Q' });
  } else {
    // Corporate: 60 days after quarter close
    // Q1 (ends Mar 31) -> May 30
    if (month === 4) deadlines.push({ taxType: TaxType.INCOME_TAX, deadline: new Date(year, 4, 30), frequency: 'quarterly', form: '1702Q' });
    // Q2 (ends Jun 30) -> Aug 29
    if (month === 7) deadlines.push({ taxType: TaxType.INCOME_TAX, deadline: new Date(year, 7, 29), frequency: 'quarterly', form: '1702Q' });
    // Q3 (ends Sep 30) -> Nov 29
    if (month === 10) deadlines.push({ taxType: TaxType.INCOME_TAX, deadline: new Date(year, 10, 29), frequency: 'quarterly', form: '1702Q' });
  }

  return deadlines;
}
