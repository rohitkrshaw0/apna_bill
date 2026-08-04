// posting/postingFacade.js
// The Accounting Platform's single public posting API (Milestone 15B
// design decision #5 -- AccountingPlatform.post()/reverse(), not a
// voucher-specific API). Sales, Purchase, Manufacturing, and Import call
// exactly this; none of them ever touches postingProviderRegistry or a
// provider directly, and none of them learns which provider ran.
//
// ---------------------------------------------------------------------
// EVERYTHING IS INJECTED, NOTHING IS REACHED FOR
// ---------------------------------------------------------------------
// createPostingFacade() takes postingProviderRegistry as a parameter
// rather than importing the shared singleton from index.js -- importing
// it here would create index.js -> postingFacade.js -> index.js, a real
// import cycle. index.js constructs the singleton and wires it into this
// factory at the bottom of that file; this module never imports index.js.
//
// ---------------------------------------------------------------------
// PER-CALL RESOLUTION, NOT A CACHE (YET)
// ---------------------------------------------------------------------
// Each post()/reverse() call builds a fresh accountResolutionService
// (and, through it, a fresh chart-of-accounts load) scoped to the given
// company. There is no cross-call cache: posting is a low-frequency
// operation (one call per sale/purchase/manufacturing run), and a stale
// cached chart of accounts silently posting against a since-deactivated
// account would be a worse failure mode than one extra read per post. A
// future high-volume caller (bulk import replay) is exactly the "measured
// performance problem" the design review says should motivate a cache or
// the Background Job Platform (11D) -- not a default here.
//
// ---------------------------------------------------------------------
// THE JS-SIDE VALIDATOR DOES NOT CHECK FISCAL PERIOD POSTABILITY
// ---------------------------------------------------------------------
// validateJournalEntry() accepts a fiscalPeriodService collaborator to
// check PERIOD_NOT_OPEN/DATE_OUTSIDE_PERIOD, but that requires an
// in-memory service loaded from fiscal_periods first -- a second load
// this milestone does not add, because post_journal_entry() already
// performs the authoritative check server-side (it fails the whole RPC
// with a raised exception when no period covers the date or the period
// isn't open). Skipping the client-side pre-check trades one class of
// UX (a clearer error before the network round trip) for not building a
// second fiscal-period loader whose only purpose would be to duplicate a
// check the RPC already makes correctly. If that UX gap proves painful in
// practice, the fix is adding a loader here, not weakening the RPC check.

import { supa, getActiveCompanyId } from '../../../supabaseClient.js';
import { eventBus, EVENT_TYPES } from '../../events/index.js';
import { createJournalEntry } from '../contracts/journalContract.js';
import { validateJournalEntry } from '../validation/journalEntryValidator.js';
import { formatValidationErrors } from '../validation/validationResult.js';
import { createAccountResolutionService } from '../resolution/accountResolutionService.js';
import { AccountResolutionError } from '../resolution/accountResolutionContract.js';
import { POSTING_ERROR_CODES } from './postingErrorCodes.js';
import { createAccountingContext } from './accountingContext.js';

/**
 * @param {object} opts
 * @param {ReturnType<import('../registry/postingProviderRegistry.js').createPostingProviderRegistry>} opts.postingProviderRegistry
 *   the shared instance providers register onto -- see index.js
 * @param {object} [opts.supabaseClient] injectable for tests
 * @param {object} [opts.eventBusInstance] injectable for tests
 * @param {object} [opts.eventTypes] injectable for tests
 * @param {(opts: object) => ReturnType<typeof createAccountResolutionService>} [opts.buildResolver]
 *   injectable for tests -- defaults to a real createAccountResolutionService() call
 */
export function createPostingFacade ({
  postingProviderRegistry,
  supabaseClient = supa,
  eventBusInstance = eventBus,
  eventTypes = EVENT_TYPES,
  buildResolver = ({ companyId }) => createAccountResolutionService({ companyId, supabaseClient })
} = {}) {
  if (!postingProviderRegistry) {
    throw new TypeError('createPostingFacade: postingProviderRegistry is required');
  }

  /**
   * @param {object} params
   * @param {string} [params.companyId] defaults to getActiveCompanyId()
   * @param {string} params.voucherType a VOUCHER_TYPES value -- which document class this is
   * @param {object} params.sourceData whatever shape the resolved provider's buildJournalEntry expects
   * @param {{table: string, id: string}|null} [params.ref] the source document identity -- the
   *   idempotency key (see the design review's "Idempotency" section). null only for a future
   *   manual-entry caller (15C+) with no source document.
   * @param {string|null} [params.createdBy]
   * @returns {Promise<{success: true, journalEntryId: string, journalNo: string, wasDuplicate: boolean}
   *   | {success: false, errorCode: string, errors: object[]}>}
   */
  async function post ({ companyId = getActiveCompanyId(), voucherType, sourceData, ref = null, createdBy = null }) {
    if (!companyId) throw new TypeError('AccountingPlatform.post: no active company');
    if (!voucherType || typeof voucherType !== 'string') throw new TypeError('AccountingPlatform.post: voucherType is required');

    const context = createAccountingContext({ operationId: 'post', companyId });

    const providers = postingProviderRegistry.findProvidersForVoucherType(voucherType);
    if (providers.length === 0) {
      return { success: false, errorCode: POSTING_ERROR_CODES.PROVIDER_NOT_FOUND, errors: [{ message: `no posting provider is registered for voucherType "${voucherType}"` }] };
    }
    if (providers.length > 1) {
      return { success: false, errorCode: POSTING_ERROR_CODES.MULTIPLE_PROVIDERS_FOUND, errors: [{ message: `${providers.length} posting providers claim voucherType "${voucherType}" -- this is a configuration error, not a runtime choice` }] };
    }
    const provider = providers[0];

    const resolver = buildResolver({ companyId });
    await resolver.load();

    let built;
    try {
      built = provider.buildJournalEntry(sourceData, { resolver });
    } catch (error) {
      if (error instanceof AccountResolutionError) {
        context.logger.warn('account resolution failed while building journal entry', { role: error.role, code: error.code });
        return { success: false, errorCode: POSTING_ERROR_CODES.ACCOUNT_RESOLUTION_FAILED, errors: [{ code: error.code, role: error.role, message: error.message }] };
      }
      throw error;
    }

    // Hotfix (post-15C production readiness review): createJournalEntry()
    // throws (contract construction, ADR-0011) on a malformed field a
    // provider builds -- previously uncaught here, so it propagated past
    // AccountingPlatform.post() into the caller (e.g. purchases.js) as an
    // unhandled exception, surfacing as a false "Save failed" even though
    // the underlying sale/purchase/run had already committed. Reported
    // through the same VALIDATION_FAILED channel every other malformed-entry
    // case already uses, so no caller needs to change.
    let entry;
    try {
      entry = createJournalEntry({
        date: built.date,
        narration: built.narration ?? null,
        voucherType,
        postingSource: provider.sourceModule,
        reference: built.reference ?? null,
        createdBy,
        lines: built.lines,
        metadata: built.metadata ?? {}
      });
    } catch (error) {
      context.logger.warn('provider built a malformed journal entry', { message: error.message });
      return { success: false, errorCode: POSTING_ERROR_CODES.VALIDATION_FAILED, errors: [{ message: error.message }] };
    }

    const { isValid, errors } = validateJournalEntry(entry, { accountRegistry: resolver.getAccountRegistry() });
    if (!isValid) {
      context.logger.warn('journal entry failed validation', { errors: formatValidationErrors(errors) });
      return { success: false, errorCode: POSTING_ERROR_CODES.VALIDATION_FAILED, errors };
    }

    const payload = {
      company_id: companyId,
      entry_date: entry.date,
      voucher_type: entry.voucherType,
      posting_source: entry.postingSource,
      reference: entry.reference,
      narration: entry.narration,
      ref_table: ref?.table ?? null,
      ref_id: ref?.id ?? null,
      created_by: entry.createdBy,
      lines: entry.lines.map((line) => ({
        account_id: line.accountId,
        debit: line.debit,
        credit: line.credit,
        narration: line.narration,
        metadata: line.metadata
      }))
    };

    const { data, error } = await supabaseClient.rpc('post_journal_entry', { payload });
    if (error) {
      context.logger.error('post_journal_entry RPC failed', { error: error.message });
      return { success: false, errorCode: POSTING_ERROR_CODES.PERSIST_FAILED, errors: [{ message: error.message }] };
    }

    if (!data.was_duplicate) {
      eventBusInstance.publish(eventTypes.JOURNAL_ENTRY_POSTED, {
        aggregateId: data.journal_id,
        payload: { journalNo: data.journal_no, voucherType: entry.voucherType, postingSource: entry.postingSource, refTable: ref?.table ?? null, refId: ref?.id ?? null },
        context: { company: companyId, module: 'accounting' }
      });
    }

    return { success: true, journalEntryId: data.journal_id, journalNo: data.journal_no, wasDuplicate: data.was_duplicate };
  }

  /**
   * @param {object} params
   * @param {string} [params.companyId] defaults to getActiveCompanyId()
   * @param {string} params.journalEntryId
   * @param {string|null} [params.reason]
   * @returns {Promise<{success: true, journalEntryId: string, journalNo: string, reversesJournalId: string, wasDuplicate: boolean}
   *   | {success: false, errorCode: string, errors: object[]}>}
   */
  async function reverse ({ companyId = getActiveCompanyId(), journalEntryId, reason = null }) {
    if (!companyId) throw new TypeError('AccountingPlatform.reverse: no active company');
    if (!journalEntryId) throw new TypeError('AccountingPlatform.reverse: journalEntryId is required');

    const context = createAccountingContext({ operationId: 'reverse', companyId });

    const { data, error } = await supabaseClient.rpc('reverse_journal_entry', { _journal_id: journalEntryId, _reason: reason });
    if (error) {
      // reverse_journal_entry() raises plain exceptions -- there is no
      // permissions framework in this application to produce a typed
      // error from (the same limitation ADR-0003 already documents for
      // createdBy/requiredCapability), so the two operator-facing
      // outcomes are distinguished by message content.
      const message = error.message || '';
      context.logger.error('reverse_journal_entry RPC failed', { error: message });
      if (message.includes('only an owner/manager')) {
        return { success: false, errorCode: POSTING_ERROR_CODES.NOT_AUTHORIZED, errors: [{ message }] };
      }
      if (message.includes('not found')) {
        return { success: false, errorCode: POSTING_ERROR_CODES.JOURNAL_NOT_FOUND, errors: [{ message }] };
      }
      return { success: false, errorCode: POSTING_ERROR_CODES.PERSIST_FAILED, errors: [{ message }] };
    }

    if (!data.was_duplicate) {
      eventBusInstance.publish(eventTypes.JOURNAL_ENTRY_REVERSED, {
        aggregateId: data.journal_id,
        payload: { journalNo: data.journal_no, reversesJournalId: data.reverses_journal_id, reason },
        context: { company: companyId, module: 'accounting' }
      });
    }

    return { success: true, journalEntryId: data.journal_id, journalNo: data.journal_no, reversesJournalId: data.reverses_journal_id, wasDuplicate: data.was_duplicate };
  }

  return { post, reverse };
}
