import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getGroupInteractionIds,
  type Group,
  type Story,
  type UpdateGroupInput,
} from '@paralleax/shared';

interface StoryGroupsPanelProps {
  story: Story;
  selectedGroupId?: string;
  selectionIds: string[];
  readOnly: boolean;
  onSelect: (groupId: string) => void;
  onFocus: (interactionIds: string[]) => void;
  onInteraction: (interactionId: string) => void;
  onUpdate: (groupId: string, input: UpdateGroupInput) => Promise<boolean>;
  onDelete: (groupId: string) => Promise<boolean>;
}

export function StoryGroupsPanel(props: StoryGroupsPanelProps) {
  const { t } = useTranslation();
  const [collapsedAtCount, setCollapsedAtCount] = useState<number>();
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const groups = props.story.groups;
  const open = collapsedAtCount !== (groups?.length ?? 0);
  const { children, membership, interactions } = useMemo(() => {
    const children = new Map<string | undefined, Group[]>();
    const interactions = new Map(
      props.story.interactions.map((interaction) => [interaction.id, interaction]),
    );
    const membership = new Map<string, string[]>();
    for (const group of groups ?? []) {
      const parent = group.parentGroupId;
      const siblings = children.get(parent) ?? [];
      siblings.push(group);
      children.set(parent, siblings);
      membership.set(
        group.id,
        getGroupInteractionIds(groups ?? [], group.id).filter((id) => interactions.has(id)),
      );
    }
    return { children, membership, interactions };
  }, [groups, props.story.interactions]);

  async function mutate(action: () => Promise<boolean>) {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      setMessage((await action()) ? t('editor.groups.saved') : t('editor.groups.failed'));
    } finally {
      setBusy(false);
    }
  }

  function renderGroup(group: Group) {
    const ids = membership.get(group.id) ?? [];
    // Exclude descendants as well as self from the parent picker.
    const invalidParents = new Set<string>([group.id]);
    const pending = [group.id];
    while (expandedIds.has(group.id) && pending.length) {
      for (const child of children.get(pending.pop()!) ?? []) {
        if (invalidParents.has(child.id)) continue;
        invalidParents.add(child.id);
        pending.push(child.id);
      }
    }
    return (
      <li key={group.id}>
        <div className="story-group-row">
          <button
            type="button"
            className="ghost story-group-toggle"
            aria-label={t('editor.groups.toggle', { title: group.title })}
            aria-expanded={expandedIds.has(group.id)}
            aria-controls={`story-group-${group.id}`}
            onClick={() =>
              setExpandedIds((current) => {
                const next = new Set(current);
                if (next.has(group.id)) next.delete(group.id);
                else next.add(group.id);
                return next;
              })
            }
          >
            <span aria-hidden="true">{expandedIds.has(group.id) ? '▾' : '▸'}</span>
          </button>
          <button
            type="button"
            className={`context-entity-select context-entity-select-text ${props.selectedGroupId === group.id ? 'selected' : 'ghost'}`}
            aria-label={`${group.title} ${t('editor.groups.count', { count: ids.length })}`}
            aria-pressed={props.selectedGroupId === group.id}
            onClick={() => props.onSelect(group.id)}
          >
            <span className="context-row-copy">
              <strong>{group.title}</strong>
              <small>{t('editor.groups.count', { count: ids.length })}</small>
            </span>
          </button>
        </div>
        <div className="story-group-contents" id={`story-group-${group.id}`}>
          {expandedIds.has(group.id) ? (
            <>
              <button
                type="button"
                className="ghost"
                disabled={!ids.length}
                onClick={() => props.onFocus(ids)}
              >
                {t('editor.groups.focus')}
              </button>
              {!props.readOnly ? (
                <fieldset disabled={busy}>
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      const title = String(
                        new FormData(event.currentTarget).get('title') ?? '',
                      ).trim();
                      if (title) void mutate(() => props.onUpdate(group.id, { title }));
                    }}
                  >
                    <label>
                      {t('editor.graphSelection.groupTitle')}
                      <input
                        key={group.title}
                        name="title"
                        defaultValue={group.title}
                        required
                        maxLength={200}
                      />
                    </label>
                    <button type="submit">{t('editor.groups.rename')}</button>
                  </form>
                  <label>
                    {t('editor.groups.parent')}
                    <select
                      value={group.parentGroupId ?? ''}
                      onChange={(event) =>
                        void mutate(() =>
                          props.onUpdate(group.id, { parentGroupId: event.target.value || null }),
                        )
                      }
                    >
                      <option value="">{t('editor.groups.root')}</option>
                      {(groups ?? [])
                        .filter(({ id }) => !invalidParents.has(id))
                        .map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>
                            {candidate.title}
                          </option>
                        ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    disabled={!props.selectionIds.length}
                    onClick={() =>
                      void mutate(() =>
                        props.onUpdate(group.id, {
                          interactionIds: [
                            ...new Set([...group.interactionIds, ...props.selectionIds]),
                          ],
                        }),
                      )
                    }
                  >
                    {t('editor.groups.addSelection')}
                  </button>
                  <p className="hint">{t('editor.groups.membershipHint')}</p>
                  <button
                    type="button"
                    className="ghost danger"
                    onClick={() => void mutate(() => props.onDelete(group.id))}
                  >
                    {t('editor.groups.delete')}
                  </button>
                </fieldset>
              ) : null}
              <ul>
                {group.interactionIds
                  .filter((id) => interactions.has(id))
                  .map((id) => (
                    <li className="context-entity-row" key={id}>
                      <button
                        type="button"
                        className="context-entity-select context-entity-select-text ghost"
                        onClick={() => props.onInteraction(id)}
                      >
                        {interactions.get(id)!.title}
                      </button>
                      {!props.readOnly ? (
                        <button
                          type="button"
                          className="ghost"
                          disabled={busy}
                          aria-label={t('editor.groups.remove', {
                            title: interactions.get(id)!.title,
                          })}
                          onClick={() =>
                            void mutate(() =>
                              props.onUpdate(group.id, {
                                interactionIds: group.interactionIds.filter(
                                  (member) => member !== id,
                                ),
                              }),
                            )
                          }
                        >
                          ×
                        </button>
                      ) : null}
                    </li>
                  ))}
                {(children.get(group.id) ?? []).map(renderGroup)}
              </ul>
              {ids.length === 0 ? <p className="hint">{t('editor.groups.emptyGroup')}</p> : null}
            </>
          ) : null}
        </div>
      </li>
    );
  }

  return (
    <section className="story-groups-panel" aria-label={t('editor.groups.title')}>
      <div className="location-panel-header">
        <button
          className="ghost context-heading"
          type="button"
          aria-expanded={open}
          onClick={() => setCollapsedAtCount(open ? (groups?.length ?? 0) : undefined)}
        >
          <span className="context-heading-label">
            <span aria-hidden="true">{open ? '▾' : '▸'}</span>
            {t('editor.groups.title')}
          </span>
          <small>{groups?.length ?? 0}</small>
        </button>
      </div>
      {open ? (
        groups?.length ? (
          <ul className="context-category-list">
            {(children.get(undefined) ?? []).map(renderGroup)}
          </ul>
        ) : (
          <p className="hint">{t('editor.groups.empty')}</p>
        )
      ) : null}
      <p role="status" className="hint">
        {message}
      </p>
    </section>
  );
}
