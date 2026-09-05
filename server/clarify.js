// A goal too thin to price. The house writes a contract for whatever it is
// asked, and a contract for "help me with marketing" is a contract for
// nothing: the plan is the same shape, the price means as little as the goal.
// This asks first, deterministically, and never refuses: the questions are a
// courtesy, not a gate, and anyone may stamp a thin ticket anyway.
const FILLER = new Set(['about', 'some', 'thing', 'things', 'stuff', 'help', 'need', 'want', 'make', 'give', 'please', 'quick', 'good', 'nice', 'better', 'best', 'more', 'with', 'that', 'this', 'from', 'into', 'over', 'just', 'like', 'really', 'very', 'something', 'anything', 'everything', 'idea', 'ideas', 'plan', 'work', 'project', 'business', 'company', 'strategy', 'marketing', 'growth', 'stuff']);
const words = (s) => String(s || '').toLowerCase().match(/[a-z][a-z'-]+/g) || [];
export function distinctiveWords(goal) { return [...new Set(words(goal))].filter((w) => w.length >= 4 && !FILLER.has(w)); }

const QUESTIONS = {
  brief: ['What decision does this brief have to serve, and who takes it?', 'What is the subject precisely: which market, product or place?', 'What would change your mind?'],
  deck: ['Who is in the room, and what do you want them to do after it?', 'What is the one sentence the deck has to land?', 'What proof do you already have that belongs in it?'],
  site: ['Who is the page for, and what should they do on it?', 'What is the offer, in your own words?', 'What makes it different from the obvious alternative?'],
  mobile: ['Who uses this app, and what task does it finish for them?', 'What are the two or three screens that matter?', 'What does the first minute look like?'],
  analysis: ['Which numbers, and where do they come from?', 'What question should the analysis answer?', 'What would a bad answer look like, so we know a good one?'],
};

// Thin means: too few distinctive words, or a goal that names no subject at
// all. Deliberately forgiving, because a false question is an insult.
export function clarify(goal, deskId = 'brief') {
  const text = String(goal || '').trim();
  const distinct = distinctiveWords(text);
  const tooShort = text.split(/\s+/).filter(Boolean).length < 5;
  const tooThin = distinct.length < 3;
  if (!tooShort && !tooThin) return { thin: false, distinct: distinct.length };
  return {
    thin: true,
    distinct: distinct.length,
    why: tooShort
      ? 'That is a handful of words. The house will write a plan and a price for it, but both will be about as specific as the ask.'
      : 'Most of those words could be about anything. The house will write a plan and a price for it, but both will be about as specific as the ask.',
    questions: (QUESTIONS[deskId] || QUESTIONS.brief).slice(0, 3),
    note: 'Answer what you can, or stamp it as it stands: a thin ticket is allowed, it is just worth less.',
  };
}
