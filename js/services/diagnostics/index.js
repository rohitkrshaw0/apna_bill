// services/diagnostics/index.js
// Public barrel for the Diagnostics & Observability Platform (Milestone
// 11C). Depends only on events/ (its public barrel) -- nothing under
// dataExchange/ or any business file is imported anywhere in this
// platform, and nothing under dataExchange/ or any business file imports
// FROM this platform either (confirmed: no existing file was touched by
// this milestone).
//
// Importing this module has NO side effects -- `diagnosticsObserver`
// below is constructed but not started; nothing subscribes to the Event
// Bus until some caller explicitly calls `diagnosticsObserver.start()`.
// This milestone deliberately does not call start() anywhere itself (see
// docs/milestone-11c-diagnostics-design.md section "Deliberately not
// started anywhere") -- wiring a real bootstrap call is left to whichever
// future milestone actually wants live observation running.

import { createEventObserver } from './observer/eventObserver.js';

export { LOG_LEVELS, LOG_LEVEL_PRIORITY, createConsoleSink, createMemorySink, createStructuredLogger } from './logging/index.js';
export { createTraceContext, deriveTraceContextFromEvent } from './trace/traceContext.js';
export { ERROR_CATEGORIES, classifyError, describeError } from './errors/errorClassifier.js';
export { createExecutionTimeline } from './timeline/executionTimeline.js';
export { createMetricsRecorder } from './metrics/metricsRecorder.js';
export { createEventObserver } from './observer/eventObserver.js';
export { createDiagnosticReport } from './reports/diagnosticReportBuilder.js';

/** A ready-made observer bound to the shared application-wide eventBus. Construction alone has no effect -- call .start() to begin observing. */
export const diagnosticsObserver = createEventObserver();
