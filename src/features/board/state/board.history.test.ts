import { describe, expect, it } from 'vitest';
import { createEmptyBoard } from './board.reducer';
import {
  boardHistoryReducer,
  createBoardHistory,
} from './board.history';
import type { BoardAction, BoardState, KanbanItem } from './board.types';

const rick = {
  id: '1',
  name: 'Rick Sanchez',
  image: 'https://example.com/rick.jpeg',
};

function item(id: string): KanbanItem {
  return {
    id,
    title: 'Task ' + id,
    assignee: rick,
  };
}

function board(overrides: Partial<BoardState> = {}): BoardState {
  return {
    todo: [],
    doing: [],
    done: [],
    ...overrides,
  };
}

function commit(
  history: ReturnType<typeof createBoardHistory>,
  action: BoardAction,
) {
  return boardHistoryReducer(history, {
    type: 'boardActionCommitted',
    action,
  });
}

describe('boardHistoryReducer', () => {
  it('returns the current history when there is nothing to undo', () => {
    const history = createBoardHistory(createEmptyBoard());

    expect(
      boardHistoryReducer(history, { type: 'historyUndone' }),
    ).toBe(history);
  });

  it('stores immutable snapshots and undoes them newest first', () => {
    const base = createEmptyBoard();
    const createA: BoardAction = { type: 'itemCreated', item: item('a') };
    const createB: BoardAction = { type: 'itemCreated', item: item('b') };
    let history = createBoardHistory(base);

    history = commit(history, createA);
    const afterA = history.committed;
    history = commit(history, createB);

    expect(history.past).toEqual([base, afterA]);
    expect(history.preview).toBeNull();

    history = boardHistoryReducer(history, { type: 'historyUndone' });
    expect(history.committed).toBe(afterA);
    expect(history.past).toEqual([base]);

    history = boardHistoryReducer(history, { type: 'historyUndone' });
    expect(history.committed).toBe(base);
    expect(history.past).toEqual([]);
  });

  it('bounds retained snapshots to keep memory predictable', () => {
    let history = createBoardHistory(createEmptyBoard());

    for (let index = 0; index < 51; index += 1) {
      history = commit(history, {
        type: 'itemCreated',
        item: item(String(index)),
      });
    }

    expect(history.past).toHaveLength(50);
    expect(history.committed.todo).toHaveLength(51);

    for (let index = 0; index < 50; index += 1) {
      history = boardHistoryReducer(history, { type: 'historyUndone' });
    }

    expect(history.committed.todo).toHaveLength(1);
    expect(history.committed.todo[0]?.id).toBe('0');
    expect(history.past).toHaveLength(0);
  });

  it('keeps previews out of history and committed persistence state', () => {
    const base = board({ todo: [item('a')] });
    const history = boardHistoryReducer(
      createBoardHistory(base),
      {
        type: 'boardActionPreviewed',
        action: {
          type: 'itemMoved',
          itemId: 'a',
          from: 'todo',
          to: 'doing',
          targetIndex: 0,
        },
      },
    );

    expect(history.committed).toBe(base);
    expect(history.past).toEqual([]);
    expect(history.preview?.doing.map(({ id }) => id)).toEqual(['a']);
  });

  it('discards a preview without changing committed history', () => {
    const base = board({ todo: [item('a')] });
    let history = createBoardHistory(base);
    history = boardHistoryReducer(history, {
      type: 'boardActionPreviewed',
      action: {
        type: 'itemMoved',
        itemId: 'a',
        from: 'todo',
        to: 'doing',
        targetIndex: 0,
      },
    });

    history = boardHistoryReducer(history, {
      type: 'boardPreviewDiscarded',
    });

    expect(history.committed).toBe(base);
    expect(history.preview).toBeNull();
    expect(history.past).toEqual([]);
  });

  it('commits from committed state and clears any preview', () => {
    const base = board({ todo: [item('a')] });
    let history = createBoardHistory(base);
    history = boardHistoryReducer(history, {
      type: 'boardActionPreviewed',
      action: {
        type: 'itemMoved',
        itemId: 'a',
        from: 'todo',
        to: 'doing',
        targetIndex: 0,
      },
    });

    history = commit(history, { type: 'itemCreated', item: item('b') });

    expect(history.committed.todo.map(({ id }) => id)).toEqual(['a', 'b']);
    expect(history.committed.doing).toEqual([]);
    expect(history.preview).toBeNull();
    expect(history.past).toEqual([base]);
  });

  it('does not record board reducer no-ops', () => {
    const history = createBoardHistory(createEmptyBoard());

    const next = commit(history, {
      type: 'itemDeleted',
      itemId: 'missing',
    });

    expect(next).toBe(history);
  });
});
