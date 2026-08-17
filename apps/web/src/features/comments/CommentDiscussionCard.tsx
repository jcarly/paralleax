import { useState, type FormEvent } from 'react';
import type { StoryCommentThread } from '@paralleax/shared';
import { useTranslation } from 'react-i18next';

export function CommentDiscussionCard({
  thread,
  expanded,
  canComment,
  canManageThread,
  variant = 'rail',
  onExpand,
  onReply,
  onStatus,
  onReattach,
}: {
  thread: StoryCommentThread;
  expanded: boolean;
  canComment: boolean;
  canManageThread: boolean;
  variant?: 'rail' | 'post-it';
  onExpand: () => void;
  onReply: (body: string) => Promise<unknown>;
  onStatus: (status: StoryCommentThread['status']) => Promise<unknown>;
  onReattach?: () => Promise<unknown>;
}) {
  const { t, i18n } = useTranslation();
  const [body, setBody] = useState('');
  const [pending, setPending] = useState(false);
  const latestMessage = thread.messages.at(-1);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!body.trim() || pending) return;
    setPending(true);
    const result = await onReply(body.trim());
    if (result) setBody('');
    setPending(false);
  }

  return (
    <article
      className={`comment-discussion-card ${variant} ${expanded ? 'expanded' : ''} ${
        thread.status === 'resolved' ? 'resolved' : ''
      } ${thread.detached ? 'detached' : ''}`}
    >
      <button
        className="comment-discussion-summary"
        type="button"
        aria-expanded={expanded}
        aria-label={t('comments.openThread', { label: thread.anchorLabel })}
        onClick={onExpand}
      >
        <span className="comment-discussion-heading">
          <b>{latestMessage?.author.email ?? thread.createdBy.email}</b>
          <small>{t('comments.messageCount', { count: thread.messages.length })}</small>
        </span>
        {thread.anchor.kind === 'text' ? (
          <q>{thread.anchor.selector.exact}</q>
        ) : variant === 'rail' ? (
          <small className="comment-discussion-anchor">{thread.anchorLabel}</small>
        ) : null}
        {!expanded ? (
          <span className="comment-discussion-preview">
            {latestMessage?.body ?? t('comments.emptyThread')}
          </span>
        ) : null}
      </button>

      {expanded ? (
        <div className="comment-discussion-detail">
          {thread.detached ? (
            <div className="comment-detached inline">
              <p>{t('comments.detached')}</p>
              {onReattach ? (
                <button
                  className="secondary"
                  type="button"
                  title={t('comments.reattachHelp')}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => void onReattach()}
                >
                  {t('comments.reattach')}
                </button>
              ) : null}
            </div>
          ) : null}
          <div className="comment-discussion-messages">
            {thread.messages.map((message) => (
              <div key={message.id}>
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
              </div>
            ))}
          </div>
          {canComment ? (
            <form className="comment-inline-reply" onSubmit={(event) => void submit(event)}>
              <label>
                <span>{t('comments.reply')}</span>
                <textarea
                  aria-label={t('comments.reply')}
                  value={body}
                  maxLength={4000}
                  rows={3}
                  onChange={(event) => setBody(event.target.value)}
                />
              </label>
              <button type="submit" disabled={pending || !body.trim()}>
                {t(pending ? 'comments.sending' : 'comments.send')}
              </button>
            </form>
          ) : null}
          {canManageThread ? (
            <button
              className="ghost comment-inline-status"
              type="button"
              onClick={() => void onStatus(thread.status === 'open' ? 'resolved' : 'open')}
            >
              {t(thread.status === 'open' ? 'comments.resolve' : 'comments.reopen')}
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export function CommentDraftCard({
  description,
  variant = 'rail',
  onCreate,
  onCancel,
}: {
  description: string;
  variant?: 'rail' | 'post-it';
  onCreate: (body: string) => Promise<unknown>;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [body, setBody] = useState('');
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!body.trim() || pending) return;
    setPending(true);
    const result = await onCreate(body.trim());
    if (result) setBody('');
    setPending(false);
  }

  return (
    <article className={`comment-discussion-card comment-draft-card ${variant} expanded`}>
      <header>
        <b>{t('comments.newThread')}</b>
        <small>{description}</small>
      </header>
      <form className="comment-inline-reply" onSubmit={(event) => void submit(event)}>
        <label>
          <span>{t('comments.comment')}</span>
          <textarea
            aria-label={t('comments.comment')}
            autoFocus
            value={body}
            maxLength={4000}
            rows={3}
            onChange={(event) => setBody(event.target.value)}
          />
        </label>
        <div>
          <button className="ghost" type="button" onClick={onCancel}>
            {t('comments.cancel')}
          </button>
          <button type="submit" disabled={pending || !body.trim()}>
            {t(pending ? 'comments.sending' : 'comments.send')}
          </button>
        </div>
      </form>
    </article>
  );
}
