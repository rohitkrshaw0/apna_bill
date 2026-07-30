// filters/dateRangePresets.js
// Shared Date Range Infrastructure (Milestone 14A). Pure presentation-
// layer plumbing: translates a friendly preset label into a concrete
// {from, to} ISO date pair. This is NOT a new backend calculation and
// queries no data source -- it is the same kind of pure date/format
// helper dashboard.html's own fmtDate()/fmtDateTime() already are
// (Milestone 13C), just reusable across every future report's filter bar
// instead of hand-written per screen. No report exists yet that actually
// filters data by the range this produces -- that wiring belongs to
// whichever future report needs it.
//
// Every returned `from`/`to` is a plain "YYYY-MM-DD" date string (this
// app's own existing date convention -- see suppliers.html's fmtDate()
// parsing `d + 'T00:00:00'`), inclusive on both ends.

export const DATE_RANGE_PRESETS = Object.freeze({
  TODAY: 'today',
  YESTERDAY: 'yesterday',
  THIS_WEEK: 'thisWeek',
  THIS_MONTH: 'thisMonth',
  LAST_MONTH: 'lastMonth',
  CUSTOM: 'custom'
});

function toDateStr (d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function startOfWeek (d) {
  const copy = new Date(d);
  const day = copy.getDay(); // 0 (Sun) .. 6 (Sat)
  copy.setDate(copy.getDate() - day);
  return copy;
}

/**
 * @param {string} preset one of DATE_RANGE_PRESETS (except CUSTOM, which has no computed range)
 * @param {Date} [referenceDate] injectable for deterministic tests; defaults to now
 * @returns {{from: string, to: string}}
 */
export function resolveDateRangePreset (preset, referenceDate = new Date()) {
  const today = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());

  switch (preset) {
    case DATE_RANGE_PRESETS.TODAY:
      return { from: toDateStr(today), to: toDateStr(today) };

    case DATE_RANGE_PRESETS.YESTERDAY: {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      return { from: toDateStr(y), to: toDateStr(y) };
    }

    case DATE_RANGE_PRESETS.THIS_WEEK: {
      const start = startOfWeek(today);
      return { from: toDateStr(start), to: toDateStr(today) };
    }

    case DATE_RANGE_PRESETS.THIS_MONTH: {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: toDateStr(start), to: toDateStr(today) };
    }

    case DATE_RANGE_PRESETS.LAST_MONTH: {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 0);
      return { from: toDateStr(start), to: toDateStr(end) };
    }

    default:
      throw new TypeError(`resolveDateRangePreset: unknown preset "${preset}" (CUSTOM has no computed range -- read the caller's own from/to inputs instead)`);
  }
}
