/**
 * Where a project is exposed: on the domain of the project, under the subdomain of each environment. Each
 * application declares only the path it is exposed at, the same in every environment.
 */

const DNS_LABEL = "[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?"

/** A domain of at least two labels, e.g. `example.com`, in lowercase */
export const DOMAIN_NAME = new RegExp(`^(?=.{1,253}$)${DNS_LABEL}(\\.${DNS_LABEL})+$`)

/** One or more labels put in front of the domain, e.g. `dev` or `dev.eu`; empty: the domain itself */
export const SUBDOMAIN = new RegExp(`^(${DNS_LABEL}(\\.${DNS_LABEL})*)?$`)

/** A port a listener of the Gateway may take */
export const isListenerPort = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 65535

/** The name of a cert-manager ClusterIssuer, as Kubernetes takes it */
export const CERTIFICATE_ISSUER = /^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$/

/**
 * A path an application is exposed at, as the HTTPRoute CRD takes it: `/`, or segments of unreserved and
 * sub-delimiter characters and percent escapes. No query, fragment, `//`, `.` or `..` segment, nor an escaped
 * slash: the API server refuses them, and the whole application with them.
 */
export const EXPOSURE_PATH = /^(?!.*%2[fF])(\/|(\/(?!\.{1,2}(\/|$))([-A-Za-z0-9._~!$&'()*+,;=:@]|%[0-9a-fA-F]{2})+)+\/?)$/

/** At most what a probe or docs path may be */
export const EXPOSURE_PATH_MAX_LENGTH = 256

export const isExposurePath = (value: string): boolean => value.length <= EXPOSURE_PATH_MAX_LENGTH && EXPOSURE_PATH.test(value)

/** Two exposure paths are the same prefix with or without the trailing slash */
export const sameExposurePath = (a: string, b: string): boolean => (a.replace(/\/$/, "") || "/") === (b.replace(/\/$/, "") || "/")

/** The host an environment is exposed on: its subdomain of the domain, the domain itself without one */
export const exposedHost = (domain: string, subdomain?: string): string => (subdomain ? `${subdomain}.${domain}` : domain)
