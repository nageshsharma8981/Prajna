# AGENTS.md — rules for anyone (human or agent) changing Prajñā

1. **The ticket is the contract.** Costs, ceilings, plan steps, access classes and
   seat pricing are decided in `writeContract` and never re-decided at runtime.
   The runtime enforces the contract; it does not reinterpret it.
2. **Credits move only through reserve → settle → release** (`store.reserveCredits`,
   `settleFromReserve`, `releaseReserve`). `debitCredits` is for seed history only.
   `credits + reserved + spent` must always reconcile to the funded pool.
3. **Event ids are stable.** `council.*`, `step.*`, `cost`, `settlement`, `attention.*`
   are machine ids; rename user-facing labels in the client, never the ids.
4. **Every terminal or paused state still produces an artifact.** Kill, ceiling,
   void, skip — no path ends in nothing.
5. **Honesty over polish.** Scripted output is labeled `mode: scripted`; a live
   call that fails falls back visibly with the error on the tape. Never present
   a fake pass as a real-provider pass.
6. **Keys are never saved.** BYOK keys live only in server memory for the
   session (`store.state.keys`), are masked in every API response, never written
   to disk, and used only for a seat that sits on a panel.
7. **Vocabulary rule:** world-nouns stay (ticket, tape, panel, desk, credits);
   workflow-verbs go plain (mission, stamp & run, stop run, DONE / STOPPED).
8. **External steps always hold for approval.** `access: 'external'` implies
   `requiresConfirmation`; the decision and its justification go into provenance.
