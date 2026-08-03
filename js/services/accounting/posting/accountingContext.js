// posting/accountingContext.js
// Accounting Context (Milestone 15B), following reporting/context/reportContext.js's
// exact shape -- 15A's own architecture doc named this file and this
// moment for it (§12: "Milestone 15B's posting pipeline is the right
// place to add one"). Reuses diagnostics/'s already-exported factories
// verbatim, the same "no second context system" discipline reportContext.js
// itself documents.
//
// This is the first file under js/services/accounting/** allowed to
// import outside the directory -- 15A's zero-external-import claim was
// explicitly scoped to the foundation milestone (see index.js's own
// header and the architecture doc §12); the posting pipeline is where
// that boundary was always meant to move.

import { createStructuredLogger } from '../../diagnostics/logging/structuredLogger.js';
import { createTraceContext } from '../../diagnostics/trace/traceContext.js';
import { getActiveCompanyId } from '../../../supabaseClient.js';

/**
 * @param {object} opts
 * @param {string} opts.operationId e.g. 'post', 'reverse'
 * @param {string} [opts.companyId] defaults to resolveActiveCompanyId()
 * @param {() => string|null} [opts.resolveActiveCompanyId]
 * @param {object} [opts.traceOverrides] forwarded to createTraceContext()
 */
export function createAccountingContext ({
  operationId,
  companyId = null,
  resolveActiveCompanyId = getActiveCompanyId,
  traceOverrides = {}
} = {}) {
  if (!operationId || typeof operationId !== 'string') {
    throw new TypeError('createAccountingContext: operationId is required');
  }

  const trace = createTraceContext({ module: 'accounting', ...traceOverrides });
  const logger = createStructuredLogger({ name: `accounting.${operationId}` }).withTrace(trace);
  const resolvedCompanyId = companyId || resolveActiveCompanyId();

  return { operationId, companyId: resolvedCompanyId, logger, trace };
}
