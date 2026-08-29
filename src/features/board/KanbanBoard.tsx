import { DragDropProvider, DragOverlay } from '@dnd-kit/react';
import { isSortable } from '@dnd-kit/react/sortable';
import {
  type Dispatch,
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
} from 'react';
import type {
  CharactersStatus,
  CharacterSummary,
} from '../characters/characters.types';
import {
  boardHistoryReducer,
  createBoardHistory,
  type BoardHistoryAction,
} from './state/board.history';
import { boardReducer } from './state/board.reducer';
import {
  clearBoardState,
  loadBoardState,
  saveBoardState,
} from './state/board.storage';
import {
  createDragMove,
  findItemLocation,
  resolveDropPosition,
  type DragMove,
} from './dnd/board.drag';
import type {
  BoardAction,
  BoardState,
  ColumnId,
  KanbanItem,
} from './state/board.types';
import {
  CreateTaskForm,
  type CreateItemInput,
} from './components/CreateTaskForm';
import { Celebration } from './components/Celebration';
import { KanbanColumn } from './components/KanbanColumn';
import { TaskCard, TaskCardPreview } from './components/TaskCard';
import styles from './board.module.css';

const COLUMNS: Array<{ id: ColumnId; title: string }> = [
  { id: 'todo', title: 'To Do' },
  { id: 'doing', title: 'Doing' },
  { id: 'done', title: 'Done' },
];

type DragSession = {
  itemId: string;
  origin: {
    columnId: ColumnId;
    index: number;
  };
  lastTargetId: string | null;
};

type Props = {
  characters: CharacterSummary[];
  characterStatus: CharactersStatus;
  characterError: string | null;
  onRetryCharacters: () => void;
};

function dragMoveAction(move: DragMove): BoardAction {
  return {
    type: 'itemMoved',
    itemId: move.itemId,
    from: move.from,
    to: move.to,
    targetIndex: move.targetIndex,
  };
}

function applyDragMove(
  board: BoardState,
  dispatch: Dispatch<BoardHistoryAction>,
  session: DragSession,
  target: unknown,
): DragMove | null {
  const move = createDragMove(board, session.itemId, target);

  if (!move || session.lastTargetId === move.targetId) {
    return null;
  }

  dispatch({
    type: 'boardActionPreviewed',
    action: dragMoveAction(move),
  });

  session.lastTargetId = move.targetId;
  return move;
}

function movedIntoDone(
  origin: DragSession['origin'],
  board: BoardState,
  itemId: string,
) {
  const after = findItemLocation(board, itemId);

  return origin.columnId !== 'done' && after?.columnId === 'done';
}

function findBoardItem(
  board: BoardState,
  itemId: string,
): KanbanItem | null {
  const location = findItemLocation(board, itemId);

  return location ? board[location.columnId][location.index] : null;
}

export function KanbanBoard({
  characters,
  characterStatus,
  characterError,
  onRetryCharacters,
}: Props) {
  const [history, dispatch] = useReducer(
    boardHistoryReducer,
    undefined,
    () => createBoardHistory(loadBoardState()),
  );
  const board = history.preview ?? history.committed;
  const dragSessionRef = useRef<DragSession | null>(null);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  useEffect(() => {
    saveBoardState(history.committed);
  }, [history.committed]);

  const activeItem = activeItemId
    ? findBoardItem(board, activeItemId)
    : null;
  const hasTasks = Object.values(board).some((items) => items.length > 0);

  const [celebrationId, setCelebrationId] = useState<string | null>(null);
  const clearCelebration = useCallback(() => {
    setCelebrationId(null);
  }, []);

  function handleCreate(input: CreateItemInput) {
    if (activeItemId !== null) {
      return;
    }

    dispatch({
      type: 'boardActionCommitted',
      action: {
        type: 'itemCreated',
        item: {
          id: crypto.randomUUID(),
          ...input,
        },
      },
    });
  }

  function handleDelete(itemId: string) {
    if (activeItemId !== null) {
      return;
    }

    dispatch({
      type: 'boardActionCommitted',
      action: {
        type: 'itemDeleted',
        itemId,
      },
    });
  }

  function handleReset() {
    if (activeItemId !== null) {
      return;
    }

    if (!window.confirm('Reset the board and remove all tasks?')) {
      return;
    }

    clearBoardState();
    dispatch({
      type: 'boardActionCommitted',
      action: { type: 'boardReset' },
    });
  }

  return (
    <div className={styles.boardShell}>
      {celebrationId && (
        <Celebration
          key={celebrationId}
          onComplete={clearCelebration}
        />
      )}

      <CreateTaskForm
        characters={characters}
        characterStatus={characterStatus}
        characterError={characterError}
        onRetryCharacters={onRetryCharacters}
        onCreate={handleCreate}
        canUndo={history.past.length > 0 && activeItemId === null}
        onUndo={() => dispatch({ type: 'historyUndone' })}
        canReset={hasTasks}
        onReset={handleReset}
      />

      <DragDropProvider
        onDragStart={(event) => {
          const { source } = event.operation;

          if (!isSortable(source)) {
            dragSessionRef.current = null;
            setActiveItemId(null);
            return;
          }

          const itemId = String(source.id);
          const origin = findItemLocation(history.committed, itemId);

          if (!origin) {
            dragSessionRef.current = null;
            setActiveItemId(null);
            return;
          }

          dragSessionRef.current = {
            itemId,
            origin,
            lastTargetId: null,
          };
          setActiveItemId(itemId);
        }}
        onDragOver={(event) => {
          const { source, target } = event.operation;
          const session = dragSessionRef.current;

          if (
            !isSortable(source) ||
            !session ||
            session.itemId !== String(source.id)
          ) {
            return;
          }

          applyDragMove(board, dispatch, session, target);
        }}
        onDragEnd={(event) => {
          const session = dragSessionRef.current;

          if (event.canceled) {
            dispatch({ type: 'boardPreviewDiscarded' });

            dragSessionRef.current = null;
            setActiveItemId(null);
            return;
          }

          const { source, target } = event.operation;

          if (!isSortable(source)) {
            dispatch({ type: 'boardPreviewDiscarded' });
            dragSessionRef.current = null;
            setActiveItemId(null);
            return;
          }

          const itemId = String(source.id);
          const activeSession =
            session && session.itemId === itemId
              ? session
              : (() => {
                  const origin = findItemLocation(
                    history.committed,
                    itemId,
                  );

                  return origin
                    ? { itemId, origin, lastTargetId: null }
                    : null;
                })();

          if (!activeSession) {
            dispatch({ type: 'boardPreviewDiscarded' });
            dragSessionRef.current = null;
            setActiveItemId(null);
            return;
          }

          const finalPosition = resolveDropPosition(target, board);

          if (!finalPosition) {
            dispatch({ type: 'boardPreviewDiscarded' });
            dragSessionRef.current = null;
            setActiveItemId(null);
            return;
          }

          const move = applyDragMove(
            board,
            dispatch,
            activeSession,
            target,
          );
          const finalBoard = move
            ? boardReducer(board, dragMoveAction(move))
            : board;
          const after = findItemLocation(finalBoard, itemId);

          if (
            after &&
            (activeSession.origin.columnId !== after.columnId ||
              activeSession.origin.index !== after.index)
          ) {
            dispatch({
              type: 'boardActionCommitted',
              action: {
                type: 'itemMoved',
                itemId,
                from: activeSession.origin.columnId,
                to: after.columnId,
                targetIndex: after.index,
              },
            });

            if (movedIntoDone(activeSession.origin, finalBoard, itemId)) {
              setCelebrationId(itemId + ':' + Date.now());
            }
          } else {
            dispatch({ type: 'boardPreviewDiscarded' });
          }

          dragSessionRef.current = null;
          setActiveItemId(null);
        }}
      >
        <DragOverlay
          className={styles.dragOverlay}
        >
          {activeItem ? <TaskCardPreview item={activeItem} /> : null}
        </DragOverlay>
        <div className={styles.board} aria-label="Kanban board">
          {COLUMNS.map((column) => (
            <KanbanColumn
              key={column.id}
              columnId={column.id}
              title={column.title}
              count={board[column.id].length}
            >
              {board[column.id].map((item, index) => (
                <TaskCard
                  key={item.id}
                  item={item}
                  columnId={column.id}
                  index={index}
                  onDelete={handleDelete}
                />
              ))}
            </KanbanColumn>
          ))}
        </div>
      </DragDropProvider>
    </div>
  );
}
