# Encryption of the stored credentials

The console keeps credentials on behalf of a project: the keys of a bucket, an Azure connection
string, a Google service account file, the token of a code repository. Set `SECRETS_ENCRYPTION_KEY`
and they are encrypted in the database with AES-256-GCM, and no longer disclosed by the API.

```bash
# 32 bytes, base64 or hex
openssl rand -base64 32
```

```bash
SECRETS_ENCRYPTION_KEY=<the generated key>
```

Nothing else has to be done: at the next boot a migration rewrites, encrypted, whatever was written
before the key existed. It is a re-save per document and it skips what is already encrypted, so
running it again costs one empty query per collection.

## What this protects against, and what it does not

**Protected — whoever reads the database.** A dump, a backup, a hosted Mongo somebody else operates,
a support engineer with a shell on the replica: they see ciphertext, and the key is not in there
with it.

**Not protected — whoever controls the process.** The backend has to decrypt those values to talk to
S3 or to GitHub in a deploy nobody is watching, so the key is necessarily within reach of anybody
holding the environment of the application. Application level encryption cannot change that.

To narrow that second case you need the key to live somewhere the decrypt is a remote, authenticated
call — AWS KMS, Azure Key Vault, HashiCorp Vault. Whoever holds the credentials of the application
can still ask for a decrypt, but they cannot walk off with a dump and read it offline, and every
decrypt lands in an audit log you can revoke. The stored format carries a `v1` marker precisely so
that scheme can be introduced beside this one without rewriting a single value.

The alternative that does protect fully — a passphrase held by the user and never stored — is
incompatible with what this product does: without somebody there to unlock it, no pipeline could
upload a bundle.

## What is covered

| Where | Fields |
| --- | --- |
| `storages` | `secretAccessKey`, `accountKey`, `connectionString`, `clientSecret`, `jsonKey` |
| `coderepositories` | `accessToken`, `refreshToken` |
| `deployments` | the same storage fields, inside the snapshot a deployment freezes |

Deployments are in the list because a deployment copies the storages of its project, credentials
included, and the serve API reads the bucket keys from that copy. Encrypting the `storages`
collection alone would leave every key of every past deployment in the clear right next to it.

What is deliberately left readable is what names a resource rather than proving you may use it:
bucket, container, region, account name, tenant and client id. The list screen needs them to tell one
storage from another, and none of them is usable on its own.

**Global variables are not encrypted, and should not be mistaken for secrets.** The platform serves
them to every browser that loads the application, as `window.globalConfig`. Anything genuinely
secret does not belong in there in the first place.

## In the API

The credentials are no longer returned. Where one would be, the API sends `••••••••••••`, and a
field that comes back exactly as that placeholder is understood as "not retyped": the stored value is
kept. That is what lets the edit forms keep working — they submit every field, including the ones
they never received.

The consequence for the Azure and GitLab screens is that "test connection" on an existing connection
sends the id of the repository instead of a token, and the backend uses the one it has.

## Rotating or losing the key

There is no rotation procedure yet. What the format allows is introducing `v2` alongside `v1`, so
values keep being readable while new writes use the new scheme.

Losing the key means losing the credentials: a value encrypted with it cannot be read back, and the
application says so explicitly at the first read rather than behaving as if the storage were
misconfigured. Recovering means retyping the credentials in the console. **Back the key up
separately from the database** — a backup holding both protects nothing.

If the key is removed from the environment while encrypted values are in the database, the
application starts but fails on the first credential it touches. A key of the wrong length stops the
boot instead, with the command to generate a correct one.
