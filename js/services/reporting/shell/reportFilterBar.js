// shell/reportFilterBar.js
// Shared Filter Infrastructure (Milestone 14A "Shared Filter
// Infrastructure" / "Filter Experience"). Renders only the filter
// controls a report's own ReportDefinition.filters declares support for
// (contracts/reportContract.js's REPORT_FILTER_KEYS) -- never a custom,
// per-report filter implementation.
//
// SEARCH reuses js/ui/searchInput.js's createSearchInput() verbatim (the
// same factory items.html/suppliers.html already use). DATE_RANGE is
// built from filters/dateRangePresets.js's presets plus two native
// `<input type="date">` elements for the Custom Range case -- the same
// native-date-input convention sale.html/purchase.html's own topbar date
// chips already use (no Form Framework date field exists in this app; see
// Milestone 14A's own architecture doc for why one wasn't invented here).
// CATEGORY/STATUS/SUPPLIER/CUSTOMER are generic native `<select>`
// elements populated from caller-supplied options -- this platform has no
// idea what suppliers/customers/categories a future report needs; that is
// entirely the future report's own data to inject.
//
// Every control is a plain, page-local-CSS-styled native element (the
// same "hand-built select, not the Form Framework" convention
// suppliers.html's own #sort-select already uses for a non-data-entry
// filter/sort control) -- no new shared component, no new token.

import { createSearchInput } from '../../../ui/searchInput.js';
import { debounce } from '../../../ui/debounce.js';
import { REPORT_FILTER_KEYS } from '../contracts/reportContract.js';
import { DATE_RANGE_PRESETS, resolveDateRangePreset } from '../filters/dateRangePresets.js';

const DATE_RANGE_PRESET_LABELS = {
  [DATE_RANGE_PRESETS.TODAY]: 'Today',
  [DATE_RANGE_PRESETS.YESTERDAY]: 'Yesterday',
  [DATE_RANGE_PRESETS.THIS_WEEK]: 'This Week',
  [DATE_RANGE_PRESETS.THIS_MONTH]: 'This Month',
  [DATE_RANGE_PRESETS.LAST_MONTH]: 'Last Month',
  [DATE_RANGE_PRESETS.CUSTOM]: 'Custom Range'
};

/**
 * @param {object} opts
 * @param {string[]} opts.filters which REPORT_FILTER_KEYS to render, in order
 * @param {object} [opts.selectOptions] { [filterKey]: Array<string|{value,label}> } for CATEGORY/STATUS/SUPPLIER/CUSTOMER
 * @param {(state: object) => void} [opts.onChange] called with the full resolved filter state on any control change
 * @returns {{el: HTMLElement, getState: () => object}}
 */
export function createReportFilterBar ({ filters = [], selectOptions = {}, onChange } = {}) {
  const el = document.createElement('div');
  el.className = 'report-filter-bar';

  const state = {};
  const emit = () => onChange && onChange({ ...state });

  for (const key of filters) {
    switch (key) {
      case REPORT_FILTER_KEYS.SEARCH: {
        const wrap = document.createElement('div');
        wrap.innerHTML = createSearchInput({ id: 'report-filter-search', placeholder: 'Search…' });
        const input = wrap.querySelector('input');
        state.search = '';
        input.addEventListener('input', debounce(() => { state.search = input.value; emit(); }, 220));
        el.appendChild(wrap.firstElementChild);
        break;
      }

      case REPORT_FILTER_KEYS.DATE_RANGE: {
        const group = document.createElement('div');
        group.className = 'report-filter-daterange';

        const select = document.createElement('select');
        select.setAttribute('aria-label', 'Date range');
        for (const preset of Object.values(DATE_RANGE_PRESETS)) {
          const opt = document.createElement('option');
          opt.value = preset;
          opt.textContent = DATE_RANGE_PRESET_LABELS[preset];
          select.appendChild(opt);
        }
        select.value = DATE_RANGE_PRESETS.THIS_MONTH;

        const fromInput = document.createElement('input');
        fromInput.type = 'date';
        fromInput.setAttribute('aria-label', 'From date');
        fromInput.hidden = true;

        const toInput = document.createElement('input');
        toInput.type = 'date';
        toInput.setAttribute('aria-label', 'To date');
        toInput.hidden = true;

        function applyPreset () {
          const isCustom = select.value === DATE_RANGE_PRESETS.CUSTOM;
          fromInput.hidden = !isCustom;
          toInput.hidden = !isCustom;
          if (isCustom) {
            state.dateRange = { preset: select.value, from: fromInput.value || null, to: toInput.value || null };
          } else {
            state.dateRange = { preset: select.value, ...resolveDateRangePreset(select.value) };
          }
          emit();
        }

        select.addEventListener('change', applyPreset);
        fromInput.addEventListener('change', applyPreset);
        toInput.addEventListener('change', applyPreset);
        applyPreset();

        group.appendChild(select);
        group.appendChild(fromInput);
        group.appendChild(toInput);
        el.appendChild(group);
        break;
      }

      case REPORT_FILTER_KEYS.CATEGORY:
      case REPORT_FILTER_KEYS.STATUS:
      case REPORT_FILTER_KEYS.SUPPLIER:
      case REPORT_FILTER_KEYS.CUSTOMER:
      case REPORT_FILTER_KEYS.PAYMENT_STATUS:
      case REPORT_FILTER_KEYS.ITEM: {
        const select = document.createElement('select');
        select.setAttribute('aria-label', key);
        const allOpt = document.createElement('option');
        allOpt.value = '';
        allOpt.textContent = 'All';
        select.appendChild(allOpt);
        for (const option of selectOptions[key] || []) {
          const value = typeof option === 'string' ? option : option.value;
          const label = typeof option === 'string' ? option : option.label;
          const opt = document.createElement('option');
          opt.value = value;
          opt.textContent = label; // textContent auto-escapes; no HTML-string escaping needed here
          select.appendChild(opt);
        }
        state[key] = '';
        select.addEventListener('change', () => { state[key] = select.value; emit(); });
        el.appendChild(select);
        break;
      }

      default:
        // An unknown filter key is a report author's mistake, not this
        // shared bar's problem to solve -- skip it rather than throw, the
        // same "log and continue" tolerance the Audit Registry shows an
        // unregistered event type (audit-platform-architecture.md §6).
        break;
    }
  }

  return { el, getState: () => ({ ...state }) };
}
