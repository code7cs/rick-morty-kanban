import { boardReducer } from './board.reducer';
import type { BoardAction, BoardState } from './board.types';

export const MAX_HISTORY_LENGTH = 50;

export type BoardHistoryState = {
  committed: BoardState;
  past: BoardState[];
  preview: BoardState | null;
};

export type BoardHistoryAction =
  | { type: 'boardActionCommitted'; action: BoardAction }
  | { type: 'boardActionPreviewed'; action: BoardAction }
  | { type: 'boardPreviewDiscarded' }
  | { type: 'historyUndone' };

export function createBoardHistory(
  committed: BoardState,
): BoardHistoryState {
  return {
    committed,
    past: [],
    preview: null,
  };
}

export function boardHistoryReducer(
  state: BoardHistoryState,
  action: BoardHistoryAction,
): BoardHistoryState {
  switch (action.type) {
    case 'boardActionCommitted': {
      const committed = boardReducer(state.committed, action.action);

      if (committed === state.committed) {
        return state;
      }

      const retainedPast =
        state.past.length >= MAX_HISTORY_LENGTH
          ? state.past.slice(1)
          : state.past;

      return {
        committed,
        past: [...retainedPast, state.committed],
        preview: null,
      };
    }
    case 'boardActionPreviewed': {
      const source = state.preview ?? state.committed;
      const preview = boardReducer(source, action.action);

      return preview === source ? state : { ...state, preview };
    }
    case 'boardPreviewDiscarded':
      return state.preview ? { ...state, preview: null } : state;
    case 'historyUndone': {
      const previous = state.past.at(-1);

      if (!previous) {
        return state;
      }

      return {
        committed: previous,
        past: state.past.slice(0, -1),
        preview: null,
      };
    }
    default:
      return state;
  }
}
