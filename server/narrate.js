// The run narrative: plain words, written by the house from the tape, so a
// reader who never opened the run view still knows what happened and why.
// Deterministic: nothing here is asked of a model, and every sentence is
// backed by an event on the ledger.
const n = (x) => Number(x || 0).toFixed(1);
const list = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

export function narrateRun(m) {
  const ev = m.events || [];
  const plan = m.contract?.plan || [];
  const out = [];
  const desk = (m.deskName || 'desk').replace(' desk', '').toLowerCase();
  out.push(`${m.serial} was a ${desk} mission: “${m.goal}”. The ticket had ${plan.length} steps, estimated at ${m.contract.estimate} credits with a ceiling of ${m.contract.ceiling}${m.contract.edited ? `, after the owner edited the plan before stamping it` : ''}.`);

  const done = plan.filter((p) => p.status === 'FILLED').length;
  const skipped = plan.filter((p) => p.status === 'SKIPPED').map((p) => p.title);
  if (m.status === 'KILLED') out.push(`The run was stopped after ${done} of ${plan.length} steps${m.partial ? ' and a partial artifact was kept' : ''}.`);

  if (m.retrieval) {
    const engines = Object.entries(m.retrieval.engines || {}).filter(([, e]) => e.ok).map(([k, e]) => `${e.count} from ${k === 'brave' ? 'the web' : k === 'wikipedia' ? 'the encyclopedia' : k}`);
    const owned = (m.sources || []).filter((s) => s.engine === 'attachment').length;
    out.push(m.retrieval.ok
      ? (m.retrieval.count ? `The sweep put ${m.retrieval.count} source${m.retrieval.count === 1 ? '' : 's'} on the table${engines.length ? ` (${list(engines)})` : ''}${owned ? `, plus ${owned} the owner attached` : ''}.` : `The sweep found nothing to put on the table${owned ? `; the ${owned} source${owned === 1 ? '' : 's'} the owner attached stood alone` : ''}.`)
      : `Retrieval failed (${m.retrieval.error}); no sources were on the table.`);
  } else if ((m.sources || []).length) out.push(`The owner attached ${m.sources.length} source${m.sources.length === 1 ? '' : 's'}, and the panel and author worked from them.`);

  const positions = ev.filter((e) => e.type === 'council.position');
  if (positions.length) {
    const live = positions.filter((e) => e.live).map((e) => e.model);
    out.push(`The panel of ${m.councilNames.length} stated positions${live.length ? `; ${list(live)} spoke live on your own key${live.length < positions.length ? ', the rest in the house voice' : ''}` : ', all in the house voice'}.`);
    const dissent = ev.find((e) => e.dissent);
    if (dissent) out.push(`${dissent.dissent.model} dissented, and the dissent went into the deliverable rather than a footnote.`);
  }

  if (m.authored?.live) out.push(`${m.authored.model} wrote the substance itself on your key${m.authored.revisions ? `, and revised it ${m.authored.revisions} time${m.authored.revisions === 1 ? '' : 's'}` : ''}.`);
  else if (m.authored) out.push(`${m.authored.model} could not author (${m.authored.error}); the house-scripted substance stood in and the record says so.`);
  else out.push('No live model was loaded, so the substance is house-scripted sample material, labelled as such.');

  const critiques = m.critiques || [];
  if (critiques.length) {
    const revise = critiques.filter((c) => c.verdict === 'revise');
    out.push(revise.length ? `${list(revise.map((c) => c.model))} asked for a revision before the gate, ${list(revise.flatMap((c) => c.issues || []).slice(0, 3).map((x) => x.toLowerCase().replace(/\.$/, '')))}, and the lead rewrote the draft against it.` : `${list(critiques.map((c) => c.model))} read the draft and passed it.`);
  }

  const gates = ev.filter((e) => e.type === 'gate');
  if (gates.length) {
    const first = gates[0];
    if (first.cleared) out.push(`Both validator lanes sealed all ${first.sealed.length} assertions on the first round.`);
    else {
      const failed = [...(first.failed || []), ...(first.dissenting || [])];
      const decisions = (m.attention || []).filter((a) => a.kind === 'gate' && a.decision);
      const how = decisions.map((d) => `${d.decision.replace('-', ' ')} (“${d.justification}”)`);
      const last = gates.at(-1);
      out.push(`The gate refused ${list(failed)} on the first round${how.length ? `; the owner chose to ${list(how)}` : ''}. After ${gates.length} round${gates.length === 1 ? '' : 's'} it ${last.cleared ? `cleared with ${last.sealed.length} sealed` : 'still did not clear'}${(m.acceptedRisks || []).length ? `, ${m.acceptedRisks.length} carried as accepted risk` : ''}.`);
    }
  }

  const ceilings = (m.attention || []).filter((a) => a.kind === 'ceiling' && a.decision);
  if (ceilings.length) out.push(`Spend hit the ceiling ${ceilings.length === 1 ? 'once' : `${ceilings.length} times`}; the owner ${list(ceilings.map((c) => `${c.decision === 'raise-ceiling' ? 'raised it' : 'took the partial artifact'} (“${c.justification}”)`))}.`);
  const approvals = (m.attention || []).filter((a) => a.kind === 'approval' && a.decision);
  if (approvals.length) out.push(`${approvals.length} external step${approvals.length === 1 ? ' was' : 's were'} ${list(approvals.map((a) => a.decision === 'approve-step' ? 'approved' : 'skipped'))} at the checkpoint.`);
  if (skipped.length) out.push(`Skipped on the record: ${list(skipped)}.`);

  if (m.review) {
    const gap = (m.attention || []).find((a) => a.kind === 'review-gap' && a.decision);
    out.push(m.review.verdict === 'pass' ? 'A reviewer who saw only the goal and the artifact found no gaps.' : `A reviewer who saw only the goal and the artifact found ${m.review.gaps.length} gap${m.review.gaps.length === 1 ? '' : 's'}${gap ? `; the owner chose to ${gap.decision.replace('-', ' ')} (“${gap.justification}”)` : ''}.`);
  }

  if (m.settlement) out.push(`Settlement: ${m.settlement.reserved} credits were reserved, ${n(m.settlement.settled)} settled${m.settlement.settled > m.contract.estimate ? ` (${n(m.settlement.settled - m.contract.estimate)} over the estimate)` : m.settlement.settled < m.contract.estimate ? ` (${n(m.contract.estimate - m.settlement.settled)} under the estimate)` : ' (on the estimate)'}, ${n(m.settlement.released)} released.`);
  if (m.artifactId) out.push(`Delivered: ${m.deliverable}${m.lineage ? `, version ${m.lineage.version}, superseding ${m.lineage.parentSerial}${(m.lineage.feedback || []).length ? ` and written against ${m.lineage.feedback.length} owner note${m.lineage.feedback.length === 1 ? '' : 's'}` : ''}` : ''}.`);
  return out.join(' ');
}
