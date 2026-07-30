// shell/reportStates.js
// Loading / Empty / Error state wiring (Milestone 14A). A thin controller
// driven by lifecycle/reportLifecycle.js's REPORT_STATUS -- it invents no
// new visual component. LOADING renders js/ui/loadingState.js's own
// skeleton primitives; EMPTY and ERROR both render js/ui/emptyState.js's
// createEmptyState() (the exact precedent dashboard.html's own catch
// block already set in Milestone 13C -- an error IS presented through the
// empty-state factory, just with an error-flavored title/message, not a
// second component). LOADED-with-data delegates entirely to the caller's
// own `renderContent`, since this platform has no opinion about what a
// report's real content looks like.

import { renderSkeletonList } from '../../../ui/loadingState.js';
import { createEmptyState } from '../../../ui/emptyState.js';
import { REPORT_STATUS } from '../lifecycle/reportLifecycle.js';

/**
 * @param {object} opts
 * @param {HTMLElement} opts.container the report's own content slot (e.g. REPORT_SHELL_IDS.CONTENT)
 * @param {import('../lifecycle/reportLifecycle.js').ReportRun} opts.run
 * @param {(container: HTMLElement, data: *) => void} opts.renderContent called only when LOADED and not empty
 * @param {(data: *) => boolean} [opts.isEmpty] defaults to "falsy or a zero-length array"
 * @param {{title: string, message?: string}} [opts.emptyState]
 * @param {{title: string}} [opts.errorTitlePrefix] prefix before the run's own describeError() message
 * @param {number} [opts.skeletonCount]
 */
export function renderReportState ({
  container,
  run,
  renderContent,
  isEmpty = (data) => !data || (Array.isArray(data) && data.length === 0),
  emptyState = { title: 'No data', message: 'Nothing to show for the current filters.' },
  errorTitlePrefix = 'Could not load this report',
  skeletonCount = 3
}) {
  container.innerHTML = '';

  switch (run.status) {
    case REPORT_STATUS.IDLE:
      return;

    case REPORT_STATUS.LOADING:
      renderSkeletonList(container, { count: skeletonCount, kind: 'card' });
      return;

    case REPORT_STATUS.ERROR:
      container.innerHTML = createEmptyState({
        title: errorTitlePrefix,
        message: run.error?.message || 'Something went wrong.'
      });
      container.querySelector('.empty')?.classList.remove('hidden');
      return;

    case REPORT_STATUS.LOADED:
      if (isEmpty(run.data)) {
        container.innerHTML = createEmptyState({ title: emptyState.title, message: emptyState.message });
        container.querySelector('.empty')?.classList.remove('hidden');
        return;
      }
      renderContent(container, run.data);
      return;

    default:
      return;
  }
}
