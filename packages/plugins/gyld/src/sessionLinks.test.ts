import { describe, expect, it } from 'vitest';
import { gyldLinkFields } from './sessionLinks';
import { LegendPanel } from './lens/legendPanel';

function field(tool: string, name: string) {
  return gyldLinkFields(tool).find((f) => f.grip.key.endsWith(name))!;
}
describe('SS-06 Gyld tab destination codecs', () => {
  it('covers the ten Gyld destination grips without camera or draft state', () => {
    const tools = ['gyld.browser', 'gyld.detail', 'gyld.decidenow', 'gyld.streams', 'gyld.decide', 'gyld.compare', 'gyld.ask', 'gyld.diff'];
    const names = new Set(tools.flatMap((tool) => gyldLinkFields(tool).map((f) => f.grip.key)));
    expect(names.size).toBe(10);
    expect([...names].some((name) => /Camera|Draft|Hover/.test(name))).toBe(false);
  });
  it('round-trips legend behavior and the conversation slot, not just its id', () => {
    const legend = field('gyld.browser', 'Gyld.Tab.Legend');
    expect(legend.read({ legend: 'help' })).toBe(LegendPanel.HELP);
    expect(legend.write(LegendPanel.OPEN)).toEqual({ legend: 'open' });
    const conversation = field('gyld.ask', 'Gyld.Tab.Ask.Conversation');
    expect(conversation.read({ conversation: 'c1', conversationSlot: 'q2' })).toEqual({ id: 'c1', slot: 'q2' });
    expect(conversation.write({ id: 'c2', slot: 'q3' })).toEqual({ conversation: 'c2', conversationSlot: 'q3' });
  });
  it('uses the existing question/ref/focus aliases and rejects non-string destinations', () => {
    const ref = field('gyld.decide', 'Gyld.Dest.Ref');
    expect(ref.read({ question: 'q1' })).toBe('q1');
    expect(ref.read({ ref: 'q2' })).toBe('q2');
    expect(ref.read({ focus: 'q3' })).toBe('q3');
    expect(ref.read({ ref: 42 })).toBe('');
    expect(ref.inherited).toBe(true);
  });
});
