// services/reporting/index.js
// Public barrel for the Reporting Platform Foundation (Milestone 14A).
// Depends only on diagnostics/ (its public factories, reused verbatim)
// and js/ui/**'s existing exports (composed, never modified) -- nothing
// under businessIntelligence/, events/, jobs/, audit/, extensions/, or
// dataExchange/ is imported anywhere in this platform.
//
// A new, sixth sibling of events/, diagnostics/, jobs/, audit/,
// extensions/, and businessIntelligence/ under js/services/:
//
//   ERP -> Business Intelligence -> BusinessSnapshot -> Executive Command Center
//   ERP -> Infrastructure (Events/Diagnostics/Jobs/Audit/Extensions)
//   ERP -> Reporting Platform (this platform) -> (14B+) real reports
//
// Importing this module has NO side effects beyond constructing one
// empty, shared `reportRegistry` -- the same "constructed, nothing
// registered" precedent extensionRuntime/diagnosticsObserver/
// auditSubscriber all already established. Nothing registers a report
// here; the only report definition anywhere in this codebase is the one
// demonstration definition reportingPlatform.test.html registers on its
// own, isolated registry instance, exercised solely by that suite --
// mirroring extensions/sampleExtension.js's own precedent one layer up.

import { createReportRegistry } from './registry/reportRegistry.js';

export {
  createReportDefinition, assertValidReportDefinition,
  REPORT_CATEGORIES, REPORT_DATA_SOURCES, REPORT_FILTER_KEYS, REPORT_EXPORT_FORMATS
} from './contracts/reportContract.js';
export { createReportRegistry } from './registry/reportRegistry.js';
export {
  REPORT_STATUS, createReportRun, toLoading, toLoaded, toError, toIdle
} from './lifecycle/reportLifecycle.js';
export { createReportContext } from './context/reportContext.js';
export { DATE_RANGE_PRESETS, resolveDateRangePreset } from './filters/dateRangePresets.js';
export {
  REPORT_SHELL_IDS, renderReportPageHeader, initReportShell, renderReportShellSlots
} from './shell/reportPageLayout.js';
export { createReportToolbar } from './shell/reportToolbar.js';
export { createReportFilterBar } from './shell/reportFilterBar.js';
export { renderReportState } from './shell/reportStates.js';
export { rowsToCsv, downloadCsv } from './export/csvExport.js';
export { triggerPrint } from './export/printExport.js';

/** The application-wide report registry. Empty until a future report definition is registered. */
export const reportRegistry = createReportRegistry();
