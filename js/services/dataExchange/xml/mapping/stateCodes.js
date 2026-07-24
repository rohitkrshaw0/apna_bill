// xml/mapping/stateCodes.js
// Static GST state-name -> 2-digit-code lookup (the published state/UT list).
// Tally's <REMOTECMPSTATE>/<LEDSTATENAME> give a state *name* ("West Bengal");
// ApnaBill's firms.state_code/parties.state_code columns want the GST code.

const STATE_CODES = {
  'jammu and kashmir': '01',
  'himachal pradesh': '02',
  'punjab': '03',
  'chandigarh': '04',
  'uttarakhand': '05',
  'haryana': '06',
  'delhi': '07',
  'rajasthan': '08',
  'uttar pradesh': '09',
  'bihar': '10',
  'sikkim': '11',
  'arunachal pradesh': '12',
  'nagaland': '13',
  'manipur': '14',
  'mizoram': '15',
  'tripura': '16',
  'meghalaya': '17',
  'assam': '18',
  'west bengal': '19',
  'jharkhand': '20',
  'odisha': '21',
  'chhattisgarh': '22',
  'madhya pradesh': '23',
  'gujarat': '24',
  'dadra and nagar haveli and daman and diu': '26',
  'maharashtra': '27',
  'karnataka': '29',
  'goa': '30',
  'lakshadweep': '31',
  'kerala': '32',
  'tamil nadu': '33',
  'puducherry': '34',
  'andaman and nicobar islands': '35',
  'telangana': '36',
  'andhra pradesh': '37',
  'ladakh': '38',
  'other territory': '97',
  'centre jurisdiction': '99'
};

/** @returns {string|null} the 2-digit GST code, or null if the name isn't recognized */
export function stateNameToCode (stateName) {
  if (typeof stateName !== 'string') return null;
  const key = stateName.trim().toLowerCase();
  return STATE_CODES[key] || null;
}
