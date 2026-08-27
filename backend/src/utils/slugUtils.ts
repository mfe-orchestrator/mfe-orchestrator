/**
 * Turns a display name into the url-friendly form.
 *
 * Kept out of the services on purpose: the data migration needs it too, and importing a service there
 * would drag the whole Fastify instance into a routine that only touches the database.
 */
export const slugify = (name: string): string =>
    name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
