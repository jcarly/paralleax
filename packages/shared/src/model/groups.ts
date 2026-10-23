/** Neutral authored organization metadata. Groups have no reader or runtime behavior. */
export interface Group {
  id: string;
  title: string;
  /** Direct members; each Interaction belongs to at most one Group in the Story. */
  interactionIds: string[];
  /** One optional same-Story parent; hierarchy is organizational only. */
  parentGroupId?: string;
}
