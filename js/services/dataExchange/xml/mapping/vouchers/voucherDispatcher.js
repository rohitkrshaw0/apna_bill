// xml/mapping/vouchers/voucherDispatcher.js
// VCHTYPE string -> handler registry (plan decision 4). Only "Sales" is
// registered today (the only VCHTYPE present in the supplied voucher.xml,
// per docs/milestone-9b-xml-mapping.md section 7.4) -- Purchase/Manufacturing/
// Payment/Receipt/Journal can be added later by registering a new handler,
// never by modifying this dispatcher or the core importer.

export function createVoucherDispatcher () {
  const handlers = new Map();

  function register (vchType, handler) {
    handlers.set(vchType, handler);
  }

  function has (vchType) {
    return handlers.has(vchType);
  }

  function dispatch (vchType, record, context) {
    const handler = handlers.get(vchType);
    if (!handler) {
      return { supported: false, vchType };
    }
    return { supported: true, vchType, ...handler(record, context) };
  }

  return { register, has, dispatch };
}
