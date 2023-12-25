# devsolux

A simple, fast, privacy-focused alternative to Google Analytics.

## Installing from source

### Requirements

- A server with Node.js version 16.13 or newer
- A database. DevSolux supports [MySQL](https://www.mysql.com/) and [Postgresql](https://www.postgresql.org/) databases.

### Build the application

```bash
yarn build

npm install pm2 -g
pm2 start npm --name analytics -- start
pm2 save
```

The build step will also create tables in your database if you ae installing for the first time. It will also create a login user with username **admin** and password **devsolux**.

### Start the application

```bash
yarn start
```

By default this will launch the application on `http://localhost:3000`. You will need to either
[proxy](https://docs.nginx.com/nginx/admin-guide/web-server/reverse-proxy/) requests from your web server
or change the [port](https://nextjs.org/docs/api-reference/cli#production) to serve the application directly.

## Installing with Docker

To build the devsolux container and start up a Postgres database, run:

```bash
docker compose up -d
```

Alternatively, to pull just the DevSolux Docker image with PostgreSQL support:

```bash
docker pull ghcr.io/devsolux/analytics:postgresql-latest
```

Or with MySQL support:

```bash
docker pull ghcr.io/devsolux/analytics:mysql-latest
```

## Getting updates

To get the latest features, simply do a pull, install any new dependencies, and rebuild:

```bash
git pull
yarn install
yarn build
```

To update the Docker image, simply pull the new images and rebuild:

```bash
docker compose pull
docker compose up --force-recreate
```

## Login
Default administrator account with the username: admin and password: umami

## License

MIT

## References
- https://github.com/umami-software/umami
- https://umami.is/docs
