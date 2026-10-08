/**
 * Who may do what, said once.
 *
 * The database is the thing that actually enforces this — every rule here has a
 * policy or a function behind it in 20260920090000_roles_and_permissions.sql,
 * and nothing in this file can grant anything. It exists so the app can stop
 * offering people controls that will be refused.
 *
 * That mattered more than it sounds: refusing an UPDATE under row-level
 * security is not an error, it is zero rows and a success. A volunteer could
 * rename the pantry, see it change, and lose it on the next refresh with
 * nothing anywhere saying no.
 */

export type PantryRole = 'owner' | 'admin' | 'volunteer';

export const ROLE_LABELS: Record<PantryRole, string> = {
  owner: 'Owner',
  admin: 'Manager',
  volunteer: 'Volunteer',
};

/**
 * What the role means in the room, not in the schema. "Manager" rather than
 * "admin" because the people doing this job are shift leads, not sysadmins.
 */
export const ROLE_BLURBS: Record<PantryRole, string> = {
  owner: 'Runs the pantry. Sets everyone else’s access and can hand the pantry on.',
  admin: 'Can change how the pantry is set up — its details, low-stock levels and box types.',
  volunteer: 'The day-to-day work: scanning, packing, handing out and logging donations.',
};

export const ROLE_ICONS: Record<PantryRole, 'shield-crown' | 'shield-account' | 'account'> = {
  owner: 'shield-crown',
  admin: 'shield-account',
  volunteer: 'account',
};

/** Anything off the list reads as the least access, never the most. */
export function asRole(value: string | null | undefined): PantryRole {
  return value === 'owner' || value === 'admin' ? value : 'volunteer';
}

/**
 * May change the pantry's own row: its name, drop-off details, low-stock
 * levels, expiry window, family size, units-per-pound. The owner counts as a
 * manager everywhere, so no check ever has to name both.
 */
export const canEditPantry = (role: PantryRole) => role === 'owner' || role === 'admin';

/** May hand out roles, remove people, and pass the pantry on. The owner alone. */
export const canManageTeam = (role: PantryRole) => role === 'owner';

/**
 * Everything a volunteer does in normal use — scanning, packing, handing out,
 * logging donations, naming boxes, making folders — is theirs to do. Here as a
 * statement rather than a check nobody calls: the point of the volunteer role
 * is that the work needs no permission.
 */
export const canDoPantryWork = (_role: PantryRole) => true;

/**
 * What to say when the database refuses a pantry-level write. PostgREST reports
 * a refusal as zero rows rather than an error, so the store turns that silence
 * into this.
 */
export const ADMIN_ONLY_MESSAGE =
  'Only a pantry manager can change this. Ask your pantry owner for access.';
