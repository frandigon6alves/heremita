import { afterEach, describe, expect, it } from 'vitest';
import { clearDrafts, readDraft, writeDraft } from './session-drafts';

afterEach(() => {
  window.sessionStorage.clear();
});

describe('session drafts', () => {
  it('reads_back_a_written_draft_until_it_is_forgotten', () => {
    writeDraft('note:1', 'Go early');
    expect(readDraft('note:1')).toBe('Go early');

    writeDraft('note:1', null);

    expect(readDraft('note:1')).toBeNull();
  });

  it('clears_every_draft_and_leaves_other_session_entries', () => {
    writeDraft('note:1', 'Go early');
    writeDraft('note:2', 'Tickets');
    window.sessionStorage.setItem('hm-other', 'kept');

    clearDrafts();

    expect(readDraft('note:1')).toBeNull();
    expect(readDraft('note:2')).toBeNull();
    expect(window.sessionStorage.getItem('hm-other')).toBe('kept');
  });
});
