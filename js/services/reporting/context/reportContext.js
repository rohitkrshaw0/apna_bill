// context/reportContext.js
// Report Context (Milestone 14A "Report Context"). Reuses
// diagnostics/'s own already-exported factories verbatim -- exactly the
// reuse relationship jobs/dispatcher/jobDispatcher.js and
// audit/subscriber/auditSubscriber.js already have with diagnostics/
// (fresh instances, zero duplicated logic, nothing inside diagnostics/
// itself touched). There is no reportTraceContext.js and no second trace
// system, the same "no second context system" discipline
// audit-platform-architecture.md §11 documents for its own platform.
//
// `resolveActiveCompanyId` defaults to the real supabaseClient.js export
// every business screen already calls -- injectable so a test can supply
// its own resolver without touching localStorage.
//
// `permissions.requiredCapability` is carried straight through from the
// report's own ReportDefinition -- read-only, never checked against
// anything here (see contracts/reportContract.js's header comment and
// ADR-0003 for why no enforcement gate exists yet).

import { createStructuredLogger } from '../../diagnostics/logging/structuredLogger.js';
import { createTraceContext } from '../../diagnostics/trace/traceContext.js';
import { getActiveCompanyId } from '../../../supabaseClient.js';

/**
 * @param {object} opts
 * @param {string} opts.reportId
 * @param {import('../contracts/reportContract.js').ReportDefinition} [opts.definition] used only to read requiredCapability through, never validated here (the registry already validated it at register() time)
 * @param {object} [opts.filters] whatever a report's own filter bar resolved -- an opaque, caller-owned shape this context does not interpret
 * @param {() => string|null} [opts.resolveActiveCompanyId]
 * @param {object} [opts.traceOverrides] forwarded to createTraceContext()
 */
export function createReportContext ({
  reportId,
  definition = null,
  filters = {},
  resolveActiveCompanyId = getActiveCompanyId,
  traceOverrides = {}
} = {}) {
  if (!reportId || typeof reportId !== 'string') throw new TypeError('createReportContext: reportId is required');

  const trace = createTraceContext({ module: 'reporting', ...traceOverrides });
  const logger = createStructuredLogger({ name: `report.${reportId}` }).withTrace(trace);
  const companyId = resolveActiveCompanyId();

  return {
    reportId,
    companyId,
    filters,
    logger,
    trace,
    permissions: { requiredCapability: definition?.requiredCapability ?? null }
  };
}
