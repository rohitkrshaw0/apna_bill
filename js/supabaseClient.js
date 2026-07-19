// =====================================================================
// supabaseClient.js  (v4)
// Auth + Company/Firm session helpers.
//
// Model:
//   Company (top level, from Company List)
//     └── Firm(s) (billing entity — one default per company)
//
// Users are members of a COMPANY. Within a company they bill under a FIRM.
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL      = window.APNABILL_SUPABASE_URL      || 'https://ryshlliyyrxrfwyymggy.supabase.co';
const SUPABASE_ANON_KEY = window.APNABILL_SUPABASE_ANON_KEY || 'sb_publishable_kuH0ea-c1i_ms_t4Iwpeig_Mj0Nh1UD';

export const supa = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true }
});

// ---- Active Company + Firm (persisted in localStorage) --------------
const ACTIVE_CO_KEY   = 'apnabill.activeCompanyId';
const ACTIVE_FIRM_KEY = 'apnabill.activeFirmId';

export function getActiveCompanyId () { return localStorage.getItem(ACTIVE_CO_KEY); }
export function getActiveFirmId    () { return localStorage.getItem(ACTIVE_FIRM_KEY); }

export function setActiveCompany (id) {
  if (id) localStorage.setItem(ACTIVE_CO_KEY, id);
  else    localStorage.removeItem(ACTIVE_CO_KEY);
  // Clear firm when company changes; caller must re-pick
  localStorage.removeItem(ACTIVE_FIRM_KEY);
  window.dispatchEvent(new CustomEvent('apnabill:company-change', { detail: id }));
}
export function setActiveFirm (id) {
  if (id) localStorage.setItem(ACTIVE_FIRM_KEY, id);
  else    localStorage.removeItem(ACTIVE_FIRM_KEY);
  window.dispatchEvent(new CustomEvent('apnabill:firm-change', { detail: id }));
}

// ---- Auth -----------------------------------------------------------
export async function requireAuth (redirectTo = 'index.html') {
  const { data: { session } } = await supa.auth.getSession();
  if (!session) { window.location.href = redirectTo; return null; }
  return session;
}
export async function signIn  (email, password) { return supa.auth.signInWithPassword({ email, password }); }
export async function signUp  (email, password) { return supa.auth.signUp({ email, password }); }
export async function signOut () {
  setActiveCompany(null);
  return supa.auth.signOut();
}
export function onAuthChange (cb) { return supa.auth.onAuthStateChange(cb); }

// ---- Companies ------------------------------------------------------
export async function listMyCompanies () {
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return [];
  const { data, error } = await supa
    .from('company_members')
    .select('role, companies:company_id(id, name, fy_start_month, is_active, created_at)')
    .eq('user_id', user.id);
  if (error) throw error;
  return (data || [])
    .map(r => ({ role: r.role, ...r.companies }))
    .filter(c => c.is_active !== false);
}

export async function getActiveCompany () {
  const id = getActiveCompanyId();
  if (!id) return null;
  const { data, error } = await supa.from('companies').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

/** Create a new company + its first firm + defaults. Returns new company id. */
export async function createCompany (opts) {
  const { data, error } = await supa.rpc('create_company', {
    _name:       opts.name,
    _firm_name:  opts.firmName || opts.name,
    _is_gst:     !!opts.isGst,
    _gstin:      opts.gstin || null,
    _state_code: opts.stateCode || null,
    _address:    opts.address || null,
    _phone:      opts.phone || null,
    _email:      opts.email || null,
    _fy_start_month: opts.fyStartMonth || 4
  });
  if (error) throw error;
  return data;  // uuid
}

export async function renameCompany (companyId, newName) {
  const { error } = await supa.from('companies').update({ name: newName }).eq('id', companyId);
  if (error) throw error;
}

export async function deleteCompany (companyId) {
  const { error } = await supa.from('companies').delete().eq('id', companyId);
  if (error) throw error;
}

/** Last-activity date for a company card (for the Company List page). */
export async function lastCompanyActivity (companyId) {
  const { data, error } = await supa
    .from('invoices')
    .select('created_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data?.created_at || null;
}

// ---- Firms ----------------------------------------------------------
export async function listFirms (companyId) {
  const id = companyId || getActiveCompanyId();
  if (!id) return [];
  const { data, error } = await supa
    .from('firms')
    .select('*')
    .eq('company_id', id)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function getActiveFirm () {
  const fid = getActiveFirmId();
  const cid = getActiveCompanyId();
  if (!fid || !cid) return null;
  const { data, error } = await supa
    .from('firms').select('*').eq('id', fid).eq('company_id', cid).maybeSingle();
  if (error) throw error;
  return data;
}

export async function createFirm (opts) {
  const { data, error } = await supa.rpc('create_firm', {
    _company_id:   opts.companyId || getActiveCompanyId(),
    _name:         opts.name,
    _is_gst:       !!opts.isGst,
    _gstin:        opts.gstin || null,
    _state_code:   opts.stateCode || null,
    _address:      opts.address || null,
    _phone:        opts.phone || null,
    _email:        opts.email || null,
    _make_default: !!opts.makeDefault
  });
  if (error) throw error;
  return data;   // uuid of new firm
}
