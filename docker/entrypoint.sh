#!/bin/sh
set -eu

cd /app

mkdir -p .docker-state vendor

export COMPOSER_HOME="/tmp/composer"
mkdir -p "$COMPOSER_HOME"

lock_dir=".docker-state/composer-install.lock"
marker_file="vendor/.composer-install-complete"
expected_marker="$(sha1sum composer.lock | awk '{print $1}')"
bootstrap_role="${COMPOSER_BOOTSTRAP:-0}"

needs_install=0

if [ ! -f vendor/autoload.php ] || [ ! -f "$marker_file" ]; then
    needs_install=1
elif [ "$(cat "$marker_file")" != "$expected_marker" ]; then
    needs_install=1
fi

if [ "$needs_install" -eq 1 ]; then
    if [ "$bootstrap_role" = "1" ]; then
        if mkdir "$lock_dir" 2>/dev/null; then
            cleanup() {
                rmdir "$lock_dir"
            }

            trap cleanup EXIT INT TERM

            composer install --no-interaction --prefer-dist --ignore-platform-req=ext-openswoole
            printf '%s\n' "$expected_marker" > "$marker_file"
        else
            while [ -d "$lock_dir" ]; do
                sleep 1
            done

            if [ ! -f vendor/autoload.php ] || [ ! -f "$marker_file" ] || [ "$(cat "$marker_file")" != "$expected_marker" ]; then
                composer install --no-interaction --prefer-dist --ignore-platform-req=ext-openswoole
                printf '%s\n' "$expected_marker" > "$marker_file"
            fi
        fi
    else
        while [ ! -f vendor/autoload.php ] || [ ! -f "$marker_file" ] || [ "$(cat "$marker_file")" != "$expected_marker" ]; do
            sleep 1
        done
    fi
fi

exec "$@"
