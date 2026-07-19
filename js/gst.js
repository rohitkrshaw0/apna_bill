// =====================================================================
// gst.js  (unchanged from v3 — pure tax math)
// =====================================================================

const R = (n, d = 2) => {
  if (n == null || isNaN(n)) return 0;
  const p = Math.pow(10, d);
  return Math.round(n * p) / p;
};

export function computeLine (line, isInterstate) {
  const qtyPaid = +line.qty_paid || 0;
  const qtyFree = +line.qty_free || 0;
  const rate    = +line.rate || 0;
  const gstRate = +line.gst_rate || 0;
  const cessRate = +line.cess_rate || 0;
  const inclusive = !!line.is_inclusive;

  const gross = qtyPaid * rate;
  let discAmt = 0;
  if (+line.discount_pct) discAmt = gross * (+line.discount_pct) / 100;
  else if (+line.discount_amt) discAmt = +line.discount_amt;

  const grossAfterDisc = gross - discAmt;
  let taxable, cgst = 0, sgst = 0, igst = 0, cess = 0;
  if (inclusive) {
    const factor = 1 + (gstRate + cessRate) / 100;
    taxable = grossAfterDisc / factor;
    if (isInterstate) igst = taxable * gstRate / 100;
    else { cgst = taxable * gstRate / 200; sgst = taxable * gstRate / 200; }
    cess = taxable * cessRate / 100;
  } else {
    taxable = grossAfterDisc;
    if (isInterstate) igst = taxable * gstRate / 100;
    else { cgst = taxable * gstRate / 200; sgst = taxable * gstRate / 200; }
    cess = taxable * cessRate / 100;
  }
  const lineTotal = taxable + cgst + sgst + igst + cess;

  return {
    ...line,
    qty_paid: qtyPaid, qty_free: qtyFree, rate,
    is_inclusive: inclusive,
    discount_pct: +line.discount_pct || 0,
    discount_amt: R(discAmt),
    taxable_value: R(taxable),
    gst_rate: gstRate,
    cgst_amt: R(cgst), sgst_amt: R(sgst), igst_amt: R(igst),
    cess_rate: cessRate, cess_amt: R(cess),
    line_total: R(lineTotal)
  };
}

export function buildInvoiceMath (rawLines, opts = {}) {
  const isInter = !!opts.isInterstate;
  const roundMode = opts.roundOff || 'nearest';
  const lines = rawLines.map(l => computeLine(l, isInter));
  const totals = {
    subtotal: 0, discount_total: 0,
    cgst_total: 0, sgst_total: 0, igst_total: 0, cess_total: 0,
    grand_total: 0
  };
  for (const l of lines) {
    totals.subtotal       += l.taxable_value;
    totals.discount_total += l.discount_amt;
    totals.cgst_total     += l.cgst_amt;
    totals.sgst_total     += l.sgst_amt;
    totals.igst_total     += l.igst_amt;
    totals.cess_total     += l.cess_amt;
  }
  const preRound = totals.subtotal + totals.cgst_total + totals.sgst_total + totals.igst_total + totals.cess_total;
  let grand, roundOff;
  switch (roundMode) {
    case 'up':      grand = Math.ceil(preRound);  break;
    case 'down':    grand = Math.floor(preRound); break;
    case 'none':    grand = preRound;             break;
    case 'nearest':
    default:        grand = Math.round(preRound); break;
  }
  roundOff = R(grand - preRound);
  for (const k of Object.keys(totals)) totals[k] = R(totals[k]);
  totals.grand_total = R(grand);
  return { lines, totals, round_off: roundOff };
}

export function isInterstate (sellerStateCode, buyerStateCode) {
  if (!sellerStateCode || !buyerStateCode) return false;
  return String(sellerStateCode).trim() !== String(buyerStateCode).trim();
}

const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine',
              'Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen',
              'Seventeen','Eighteen','Nineteen'];
const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
function twoDigits (n) {
  if (n < 20) return ones[n];
  const t = Math.floor(n / 10), o = n % 10;
  return tens[t] + (o ? ' ' + ones[o] : '');
}
function threeDigits (n) {
  const h = Math.floor(n / 100), r = n % 100;
  return (h ? ones[h] + ' Hundred ' : '') + (r ? twoDigits(r) : '');
}
export function amountInWords (amount) {
  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);
  if (rupees === 0 && paise === 0) return 'Zero Rupees Only';
  const cr = Math.floor(rupees / 10000000);
  const lk = Math.floor((rupees % 10000000) / 100000);
  const th = Math.floor((rupees % 100000) / 1000);
  const hn = rupees % 1000;
  let s = '';
  if (cr) s += twoDigits(cr) + ' Crore ';
  if (lk) s += twoDigits(lk) + ' Lakh ';
  if (th) s += twoDigits(th) + ' Thousand ';
  if (hn) s += threeDigits(hn);
  s = s.trim() + ' Rupees';
  if (paise) s += ' and ' + twoDigits(paise) + ' Paise';
  return s + ' Only';
}
