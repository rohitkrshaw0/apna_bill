// The GST-rate field used across the app's item forms — a
// quickPickNumberField pre-configured with India's standard GST slabs.
//
// This file exists purely so every call site asking for "the GST field"
// gets the same picks/label/defaults automatically, without repeating
// `[0, 5, 12, 18, 28]` at every call site. For any OTHER percentage field
// (discount, margin, commission, service charge, ...), call
// quickPickNumberField directly with its own `picks` array — don't add
// another thin wrapper like this one unless that specific field is also
// used from several places with the same fixed configuration.
import { quickPickNumberField } from './quickPickNumberField.js';

const GST_RATE_PICKS = [0, 5, 12, 18, 28];

export function gstRateField ({
  id, label = 'GST rate %', value = 0,
  required = false, disabled = false, readonly = false,
  helpText = '', error = '', className = '', onChange
} = {}) {
  return quickPickNumberField({
    id, label, value, picks: GST_RATE_PICKS,
    required, disabled, readonly, helpText, error, className, onChange
  });
}
