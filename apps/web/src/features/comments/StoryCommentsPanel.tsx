import { useMemo, useState, type FormEvent } from 'react';
import type { CommentAnchor, StoryCommentThread } from '@paralleax/shared';
import { useTranslation } from 'react-i18next';
import type { CommentRealtimeStatus } from './useStoryComments';

export function StoryCommentsPanel({
  open,
  loading,
  error,
  threads,
  selectedThread,
  draftAnchor,
  canComment,
  canManageThread = false,
  realtimeStatus = 'unavailable',
  placement = 'overlay',
  onClose,
  onSelect,
  onCancelDraft,
  onCreate,
  onReply,
  onStatus,
  onReattach,
}: {
  open: boolean;
  loading: boolean;
  error: string;
  threads: StoryCommentThread[];
  selectedThread?: StoryCommentThread;
  draftAnchor?: CommentAnchor;
  canComment: boolean;
  canManageThread?: boolean;
  realtimeStatus?: CommentRealtimeStatus;
  placement?: 'overlay' | 'inspector';
  onClose: () => void;
  onSelect: (threadId: string | undefined) => void;
  onCancelDraft: () => void;
  onCreate: (body: string) => Promise<unknown>;
  onReply: (threadId: string, body: string) => Promise<unknown>;
  onStatus: (threadId: string, status: StoryCommentThread['status']) => Promise<unknown>;
  onReattach?: (threadId: string) => Promise<unknown>;
}) {
  const { t, i18n } = useTranslation();
  const [filter, setFilter] = useState<'open' | 'resolved' | 'all'>('open');
  const [body, setBody] = useState('');
  const [pending, setPending] = useState(false);
  const visibleThreads = useMemo(
    () => threads.filter((thread) => filter === 'all' || thread.status === filter),
    [filter, threads],
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!body.trim() || pending) return;
    setPending(true);
    const result = draftAnchor
      ? await onCreate(body.trim())
      : selectedThread
        ? await onReply(selectedThread.id, body.trim())
        : undefined;
    if (result) setBody('');
    setPending(false);
  }

  if (!open) return null;
  return (
    <aside
      className={`comments-panel ${placement === 'inspector' ? 'inspector-placement' : ''}`}
      aria-label={t('comments.panel')}
    >
      <header>
        <div>
          <span>{t('comments.eyebrow')}</span>
          <h2>{t('comments.title')}</h2>
          <small className={`comments-realtime-status ${realtimeStatus}`} role="status">
            <span aria-hidden="true" />
            {t(`comments.realtime.${realtimeStatus}`)}
          </small>
        </div>
        <button type="button" className="ghost" aria-label={t('comments.close')} onClick={onClose}>
          ×
        </button>
      </header>
      {error ? (
        <p className="comments-error" role="alert">
          {error}
        </p>
      ) : null}
      {draftAnchor ? (
        <section className="comment-composer-anchor">
          <b>{t('comments.newThread')}</b>
          <span>{anchorDescription(draftAnchor, t)}</span>
          <button className="ghost" type="button" onClick={onCancelDraft}>
            {t('comments.cancel')}
          </button>
        </section>
      ) : selectedThread ? (
        <section className="comment-thread-detail">
          <button className="ghost comments-back" type="button" onClick={() => onSelect(undefined)}>
            ← {t('comments.allThreads')}
          </button>
          <div className="comment-thread-heading">
            <div>
              <b>{selectedThread.anchorLabel}</b>
              <small>{t(`comments.status.${selectedThread.status}`)}</small>
            </div>
            {canManageThread ? (
              <button
                className="secondary"
                type="button"
                onClick={() =>
                  void onStatus(
                    selectedThread.id,
                    selectedThread.status === 'open' ? 'resolved' : 'open',
                  )
                }
              >
                {t(selectedThread.status === 'open' ? 'comments.resolve' : 'comments.reopen')}
              </button>
            ) : null}
          </div>
          {selectedThread.detached ? (
            <div className="comment-detached">
              <p>{t('comments.detached')}</p>
              {onReattach ? (
                <button
                  className="secondary"
                  type="button"
                  title={t('comments.reattachHelp')}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => void onReattach(selectedThread.id)}
                >
                  {t('comments.reattach')}
                </button>
              ) : null}
            </div>
          ) : null}
          <div className="comment-messages">
            {selectedThread.messages.map((message) => (
              <article key={message.id}>
                <header>
                  <b>{message.author.email}</b>
                  <time dateTime={message.createdAt}>
                    {new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }).format(new Date(message.createdAt))}
                  </time>
                </header>
                <p>{message.body}</p>
              </article>
            ))}
          </div>
        </section>
      ) : (
        <section className="comment-thread-list">
          <div className="comment-filters">
            {(['open', 'resolved', 'all'] as const).map((value) => (
              <button
                type="button"
                className={filter === value ? 'active' : ''}
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
                key={value}
              >
                {t(`comments.filters.${value}`)}
              </button>
            ))}
          </div>
          {loading ? (
            <p>{t('comments.loading')}</p>
          ) : visibleThreads.length ? (
            visibleThreads.map((thread) => (
              <button
                className="comment-thread-row"
                type="button"
                key={thread.id}
                onClick={() => onSelect(thread.id)}
              >
                <span className="comment-thread-pin" aria-hidden="true">
                  ◆
                </span>
                <span>
                  <b>{thread.anchorLabel}</b>
                  <small>{thread.messages.at(-1)?.body}</small>
                </span>
                <small>{thread.messages.length}</small>
              </button>
            ))
          ) : (
            <p className="comments-empty">{t('comments.empty')}</p>
          )}
        </section>
      )}
      {(draftAnchor || selectedThread) && canComment ? (
        <form className="comment-reply-form" onSubmit={(event) => void submit(event)}>
          <label>
            <span>{t(draftAnchor ? 'comments.comment' : 'comments.reply')}</span>
            <textarea
              value={body}
              maxLength={4000}
              rows={4}
              onChange={(event) => setBody(event.target.value)}
            />
          </label>
          <button type="submit" disabled={pending || !body.trim()}>
            {t(pending ? 'comments.sending' : 'comments.send')}
          </button>
        </form>
      ) : null}
    </aside>
  );
}

function anchorDescription(anchor: CommentAnchor, t: (key: string) => string) {
  if (anchor.kind === 'canvas') return t('comments.anchor.canvas');
  if (anchor.kind === 'text') return `“${anchor.selector.exact}”`;
  return t(`comments.anchor.${anchor.targetType}`);
}
