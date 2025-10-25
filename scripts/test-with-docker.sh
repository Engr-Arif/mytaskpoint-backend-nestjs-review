set -euo pipefail


ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DOCKER_COMPOSE_CMD="docker compose"

TIMEOUT=${WAIT_TIMEOUT_SEC:-60}

echo "(test-with-docker) Bringing up postgres and redis..."
if [ -z "${DONT_REMOVE_VOLUMES:-}" ]; then
	echo "(test-with-docker) Removing existing volumes to ensure clean DB (DONT_REMOVE_VOLUMES=1 to skip)"
	$DOCKER_COMPOSE_CMD down -v || true
fi


$DOCKER_COMPOSE_CMD up -d postgres redis

# Detect reasonable default host for containers depending on platform. Allow overrides via env.
if [ "${OS:-}" = "Windows_NT" ] || uname -s 2>/dev/null | grep -qiE "mingw|cygwin|msys"; then
	DEFAULT_PGHOST=host.docker.internal
else
	DEFAULT_PGHOST=127.0.0.1
fi

# Defaults (can be overridden by caller)
PGHOST=${PGHOST:-$DEFAULT_PGHOST}
PGPORT=${PGPORT:-5432}
PGUSER=${PGUSER:-postgres}
PGPASSWORD=${PGPASSWORD:-password}
PGDATABASE=${PGDATABASE:-dtm_dev}

# Use same host for redis unless overridden
REDIS_HOST=${REDIS_HOST:-$PGHOST}

export DATABASE_URL=${DATABASE_URL:-"postgresql://${PGUSER}:${PGPASSWORD}@${PGHOST}:${PGPORT}/${PGDATABASE}"}
export REDIS_URL=${REDIS_URL:-"redis://${REDIS_HOST}:6379"}

echo "(test-with-docker) DATABASE_URL=${DATABASE_URL}"

echo "(test-with-docker) Waiting up to ${TIMEOUT}s for Postgres to accept authenticated connections..."
end=$((SECONDS + TIMEOUT))
while [ $SECONDS -lt $end ]; do
	# Try connecting from inside the Postgres container using psql (this avoids host/network auth quirks)
	if docker compose exec -T postgres sh -c "PGPASSWORD=\"${PGPASSWORD}\" psql -U \"${PGUSER}\" -d \"${PGDATABASE}\" -c 'select 1' >/dev/null 2>&1"; then
		echo "(test-with-docker) Postgres is ready"
		break
	fi
	printf '.'
	sleep 1
done

if [ $SECONDS -ge $end ]; then
	echo "\n(test-with-docker) Timed out waiting for Postgres after ${TIMEOUT}s"
	$DOCKER_COMPOSE_CMD logs postgres || true
	$DOCKER_COMPOSE_CMD down -v || true
	exit 2
fi

echo "(test-with-docker) Running tests..."
npm test -- --runInBand --silent || TEST_EXIT_CODE=$?
TEST_EXIT_CODE=${TEST_EXIT_CODE:-0}

echo "(test-with-docker) Tearing down docker services..."
$DOCKER_COMPOSE_CMD down -v || true

exit $TEST_EXIT_CODE
