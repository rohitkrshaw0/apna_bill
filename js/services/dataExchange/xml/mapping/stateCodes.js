// xml/mapping/stateCodes.js
// Static GST state-name <-> 2-digit-code lookup (the published state/UT list).
// Tally's <REMOTECMPSTATE>/<LEDSTATENAME> give a state *name* ("West Bengal");
// ApnaBill's firms.state_code/parties.state_code columns want the GST code.
//
// One source-of-truth list (canonically-cased name + code), both lookup
// directions derived from it -- so the export direction (codeToStateName,
// added in Milestone 9C) never duplicates this table.

const STATE_LIST = [
  ['Jammu and Kashmir', '01'],
  ['Himachal Pradesh', '02'],
  ['Punjab', '03'],
  ['Chandigarh', '04'],
  ['Uttarakhand', '05'],
  ['Haryana', '06'],
  ['Delhi', '07'],
  ['Rajasthan', '08'],
  ['Uttar Pradesh', '09'],
  ['Bihar', '10'],
  ['Sikkim', '11'],
  ['Arunachal Pradesh', '12'],
  ['Nagaland', '13'],
  ['Manipur', '14'],
  ['Mizoram', '15'],
  ['Tripura', '16'],
  ['Meghalaya', '17'],
  ['Assam', '18'],
  ['West Bengal', '19'],
  ['Jharkhand', '20'],
  ['Odisha', '21'],
  ['Chhattisgarh', '22'],
  ['Madhya Pradesh', '23'],
  ['Gujarat', '24'],
  ['Dadra and Nagar Haveli and Daman and Diu', '26'],
  ['Maharashtra', '27'],
  ['Karnataka', '29'],
  ['Goa', '30'],
  ['Lakshadweep', '31'],
  ['Kerala', '32'],
  ['Tamil Nadu', '33'],
  ['Puducherry', '34'],
  ['Andaman and Nicobar Islands', '35'],
  ['Telangana', '36'],
  ['Andhra Pradesh', '37'],
  ['Ladakh', '38'],
  ['Other Territory', '97'],
  ['Centre Jurisdiction', '99']
];

const NAME_TO_CODE = new Map(STATE_LIST.map(([name, code]) => [name.toLowerCase(), code]));
const CODE_TO_NAME = new Map(STATE_LIST.map(([name, code]) => [code, name]));

/** @returns {string|null} the 2-digit GST code, or null if the name isn't recognized */
export function stateNameToCode (stateName) {
  if (typeof stateName !== 'string') return null;
  return NAME_TO_CODE.get(stateName.trim().toLowerCase()) || null;
}

/** @returns {string|null} the canonically-cased state name, or null if the code isn't recognized */
export function codeToStateName (code) {
  if (typeof code !== 'string' && typeof code !== 'number') return null;
  return CODE_TO_NAME.get(String(code).trim()) || null;
}
