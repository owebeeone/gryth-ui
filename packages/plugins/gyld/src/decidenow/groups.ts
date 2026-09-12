import type { DecideNowQuestion, GyldDecideNow } from '../contract';

// Reading the emitted decide-now list into the four groups a reader asks for.
//
// Every row goes into exactly one group, and which one is decided by that
// row's OWN emitted fields: `answerable_now` as Gyld wrote it, then its own
// `blocked_by`, then its own `gated_by`. Nothing is computed (spec section
// 6.7) and nothing is dropped, so the four groups together are the whole
// emitted list. Pure, so a test compares them against the file directly.

export interface Group {
  key: string;
  title: string;
  questions: DecideNowQuestion[];
}

export function groupQuestions(decideNow: GyldDecideNow): Group[] {
  const answerable: DecideNowQuestion[] = [];
  const blocked: DecideNowQuestion[] = [];
  const gated: DecideNowQuestion[] = [];
  const other: DecideNowQuestion[] = [];
  for (const question of decideNow.questions) {
    if (question.answerable_now) {
      answerable.push(question);
    } else if (question.blocked_by.length > 0) {
      blocked.push(question);
    } else if (question.gated_by.length > 0) {
      gated.push(question);
    } else {
      other.push(question);
    }
  }
  return [
    { key: 'answerable', title: 'answerable now', questions: answerable },
    { key: 'blocked', title: 'blocked by an open prerequisite', questions: blocked },
    { key: 'gated', title: 'gated by a trigger that has not occurred', questions: gated },
    {
      key: 'other',
      title: 'neither answerable, blocked nor gated, as emitted',
      questions: other,
    },
  ];
}
