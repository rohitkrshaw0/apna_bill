// xml/writers/openingBalanceWriter.js
// NEW, additive: sets parties.opening_balance + current_balance -- only at
// party-creation time (never on an existing/conflict-resolved party). No
// existing function writes this column (see plan's "New SQL" section), and
// this is a single-column value set once, so it's a plain client-side
// update, not an RPC.
//
// supabaseClient.js is imported dynamically (not at module top-level) so
// that nothing in xml/ requires network access to the Supabase CDN just to
// be *loaded* -- only actually calling this function pays that cost. Keeps
// xmlImport.test.html fully offline, as its own header comment promises.

export async function writeOpeningBalance (partyId, openingBalance) {
  const amount = Number(openingBalance) || 0;
  if (amount === 0) return { updated: false };
  const { supa } = await import('../../../../supabaseClient.js');
  const { error } = await supa.from('parties')
    .update({ opening_balance: amount, current_balance: amount })
    .eq('id', partyId);
  if (error) throw error;
  return { updated: true, amount };
}
