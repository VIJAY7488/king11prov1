export type EntityWithId = {
  id?: string | null;
  _id?: string | null;
} | null | undefined;

export function getEntityId(entity: EntityWithId): string {
  const id = typeof entity?.id === "string" ? entity.id.trim() : "";
  if (id) return id;
  const mongoId = typeof entity?._id === "string" ? entity._id.trim() : "";
  return mongoId;
}
