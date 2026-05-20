FROM openswoole/openswoole:php8.5

RUN apt-get update && apt-get install -y --no-install-recommends \
        git unzip libzip-dev libsqlite3-dev libicu-dev libpq-dev \
        libssl-dev pkg-config \
    && docker-php-ext-install -j"$(nproc)" \
        pdo_sqlite zip intl pcntl sockets bcmath \
    && rm -rf /var/lib/apt/lists/*

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /app

COPY composer.json composer.lock ./
RUN composer install --no-interaction --no-scripts --no-autoloader --prefer-dist --ignore-platform-req=ext-openswoole

COPY docker/entrypoint.sh /usr/local/bin/app-entrypoint
RUN chmod +x /usr/local/bin/app-entrypoint

COPY . .
RUN composer dump-autoload --optimize

EXPOSE 8989

ENTRYPOINT ["/usr/local/bin/app-entrypoint"]
CMD ["php", "server.php"]
