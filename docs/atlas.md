# Shared MongoDB Atlas for the team

Atlas setup verified: [`wad2-proj`](https://cloud.mongodb.com/v2/6ad85f75afe7cecbf2dd927b#/overview), cluster `Cluster0` (Free, AWS Singapore), database `wad2_dev`, database user `wad2-shared`. The owner created the database user and saved `0.0.0.0/0` network access. The app is connected through its ignored `.env`; `pnpm db:check` and live signup/login/session checks passed. AI client access was enabled with owner approval.

The current `wad2-shared` database user also has `atlasAdmin`, in addition to `readWrite` on `wad2_dev`. The application only needs the latter. Removing the extra administrator role is recommended; credentials and permissions were left as created by the owner.

Target setup:

| Setting | Value |
| --- | --- |
| Project | `wad2-proj` (reuse the existing team project if there is one) |
| Cluster | `Cluster0`, Free tier (formerly M0) |
| Region | Singapore if available on Free; otherwise the nearest available region |
| Shared development database | `wad2_dev` |
| Database user | `wad2-shared` currently; separate scoped users can be added per teammate |
| Local manual testing | `pnpm server:local`, database `wad2_local` |
| Automated tests | Disposable databases on random ports; never the Atlas URI |

Do not create a second cluster until you have checked whether the existing URI belongs to a team cluster. Free tier availability is shown in Atlas; select Free rather than Flex or a paid tier. No production deployment or migration of local accounts is implied by this setup.

## Atlas integration access

If the connected Atlas integration reports that MCP access is disabled, the Organization Owner must review Organization Settings > App Connections > Allow users to connect AI clients. This is an organization-wide policy, separate from app database credentials and network access. The owner must approve enabling it; reconnecting the integration alone does not change it. See [Manage AI Client Access](https://www.mongodb.com/docs/mcp-server/remote-mcp/manage-ai-client-access/).

## 1. Create or reuse the Atlas project and cluster

Open https://cloud.mongodb.com/ and sign in. Check existing projects first. If there is no team project, create `wad2-proj`, then create a Free cluster (the current team cluster is `Cluster0`). Choose Singapore if offered, or the nearest available Free region. Sample datasets are unnecessary. Wait for the cluster to be available.

An Atlas account/project login and a database user are different things. Atlas users manage the project through the website; database users authenticate an Express server or MongoDB Compass to the database. Teammates only need database credentials and allowed network access to run the app. Add Atlas project access separately if they also need the console. Keep project ownership with the people managing infrastructure; database users do not need administrator roles.

## 2. Create database users

Under Database Access (the current UI may group this under Security / Database & Network Access), create password-authenticated users such as `sheen-dev`, `isaac-dev`, `asher-dev`, `lokesh-dev` and `zachary-dev` as needed.

For each user:

- Generate a different strong password and keep it in a password manager.
- Grant the specific built-in role `readWrite` on database `wad2_dev`. Do not select read/write on every database or administrator access.
- If Atlas offers cluster restrictions, restrict the user to the development cluster.
- Give the username/password to its owner privately. Database passwords can differ while all users access the same database.

You do not need to create application accounts manually in Atlas. The first successful application signup creates a document in `wad2_dev.users`, with a password hash. The API initializes its unique email index. Database users are not the email/password accounts used by the app's login page.

## 3. Allow teammates' networks

Under Network Access, each teammate adds their current **public** IP address (or has the project owner do it). Atlas's Add Current IP Address control detects it. Home and campus network addresses can differ and can change; update an entry if a connection stops working after moving networks.

The owner saved `0.0.0.0/0` for shared development, allowing connections from any IPv4 address. Database authentication is still required. A future deployed API needs its own outbound IP allowed; frontend visitors do not connect directly to MongoDB.

## 4. Configure each teammate's local environment

After saving your database user in Atlas, the local helper prompts for its password without echoing it, URL-encodes credentials and updates the ignored `.env`:

```sh
pnpm atlas:configure                 # defaults to wad2-shared
pnpm atlas:configure isaac-dev    # use your own database user
pnpm db:check
```

It uses the verified team cluster `cluster0.jotoksx.mongodb.net` and database `wad2_dev`, preserves unrelated settings and an existing strong JWT secret, and backs up the previous environment to ignored `.local/env-before-atlas`. Do not type the password as a command-line argument or paste it into chat. Run from the repository root.

The equivalent manual configuration follows.

From the cluster's Connect > Drivers dialog, select Node.js and copy the connection string into the teammate's **ignored local `.env`**. Replace the placeholders and explicitly set the database path to `wad2_dev`:

```dotenv
MONGODB_URI=mongodb+srv://<own-db-username>:<own-URL-encoded-password>@<actual-cluster-host>/wad2_dev?retryWrites=true&w=majority
JWT_SECRET=<shared-development-signing-secret>
USE_MOCK_AI=true
```

Use the real hostname supplied by Atlas. URL-encode the database username/password when they contain URI-special characters; do not URL-encode the whole URI. Never paste live credentials into Git, PR descriptions or chat.

Use the same development JWT signing secret across team API servers if tokens should be interchangeable between them. The database credentials are individual; the application signing secret is shared. A strong secret has been generated in Sheen's ignored `.env` during setup; copy only the required settings through a private secret-sharing channel, not the entire `.env` (which may contain unrelated AI keys). You can also generate a replacement locally:

```sh
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

Store that value as `JWT_SECRET`. Changing it invalidates tokens signed with the old value. Use a different signing secret and separate database for a future production environment. Never use a `VITE_` prefix for either database credentials or the JWT secret.

## 5. Verify and run

Once this branch is shared with the team, each teammate runs:

```sh
pnpm install
# Configure .env as above (copy .env.example only if .env does not already exist).
pnpm db:check
pnpm server
# In another terminal:
pnpm dev
```

`db:check` checks the signing-secret length, connects to the configured database, pings MongoDB and initializes the User model's unique email index. It does not create sample app accounts or print secrets. It requires an explicit database path so a missing `/wad2_dev` cannot silently put the team in MongoDB's default `test` database. The check can create the `users` collection/index on the chosen database.

Open http://localhost:5173/signup and create a sample account. Another teammate, using the same cluster/database, can log into that app account with the same email/password. Confirm the document appears under `wad2_dev.users`. Everyone's accounts are shared, so use distinct sample email addresses and avoid clearing the shared collection while other people are testing.

Stop any running `server:local` API before starting `server`; they both use port 3000. Connecting to Atlas does not migrate local accounts. Create a fresh sample account in the shared database.

## 6. Keep testing local

```sh
pnpm server:local   # persistent MongoDB on your machine; ignores Atlas URI for this process
pnpm test:api       # disposable MongoDB for auth tests
pnpm test:e2e       # disposable MongoDB for real auth browser tests
```

The local launcher uses `.local/jwt-secret`, so local tokens are independent of Atlas development tokens. Both `.env` and `.local/` are excluded from Git. The automated auth tests overwrite their process's MongoDB URI with a disposable instance before making database requests; they do not read the shared database.

## Troubleshooting

- **JWT configuration fails:** set a random `JWT_SECRET` of at least 32 bytes; this is not your Atlas password.
- **Connection times out:** verify the cluster is available, your current public IP is allowed, the network permits MongoDB connections, and the driver URI is correct.
- **Authentication/authorization fails:** use a database user's credentials, not your Atlas website login. Check password encoding and `readWrite` on `wad2_dev`.
- **Account exists for one person but not another:** compare the cluster hostname and database path privately. Both must match; database usernames may differ. Verify neither person is still using `server:local`.
- **A token fails on another teammate's API:** check the development JWT signing secret matches. Signing in again obtains a token from the current API server.
- **Duplicate email on signup:** accounts are shared. Log in instead or use a different sample address.

## Official references

- [Create a Free cluster](https://www.mongodb.com/docs/atlas/tutorial/deploy-free-tier-cluster/)
- [Database users versus Atlas users](https://www.mongodb.com/docs/atlas/tutorial/create-mongodb-user-for-cluster/)
- [Configure IP access](https://www.mongodb.com/docs/atlas/security/ip-access-list/)
- [Manage Atlas project access](https://www.mongodb.com/docs/atlas/access/manage-project-access/)
