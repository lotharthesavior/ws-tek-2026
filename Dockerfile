# ─── Stage 1: compile openswoole extension ─────────────────────────────────
FROM php:8.2-cli-bookworm AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    autoconf \
    g++ \
    libssl-dev \
    libcurl4-openssl-dev \
    make \
    && rm -rf /var/lib/apt/lists/*

# Build openswoole 22.x (last series supporting PHP 8.2; 26.x requires PHP 8.3).
# GitHub archive extracts to ext-openswoole-22.1.2/
RUN curl -fsSL https://github.com/openswoole/swoole-src/archive/refs/tags/v22.1.2.tar.gz \
      -o /tmp/openswoole.tar.gz \
    && tar -xzf /tmp/openswoole.tar.gz -C /tmp \
    && cd /tmp/ext-openswoole-22.1.2 \
    && phpize \
    && ./configure --enable-openssl --enable-http2 \
    && make -j"$(nproc)" \
    && make install \
    && rm -rf /tmp/openswoole.tar.gz /tmp/ext-openswoole-22.1.2

# ─── Stage 2: runtime ───────────────────────────────────────────────────────
FROM php:8.2-cli-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
    libssl3 \
    libcurl4 \
    git \
    && rm -rf /var/lib/apt/lists/*

# Copy compiled extension from builder
COPY --from=builder /usr/local/lib/php/extensions /usr/local/lib/php/extensions
RUN docker-php-ext-enable openswoole

# Install Composer
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /app

COPY composer.json ./
# No lock file: the host lock may contain PHP 8.4-only packages (symfony 8.x).
# Resolve fresh inside the container against PHP 8.2 constraints.
RUN COMPOSER_ALLOW_SUPERUSER=1 composer install \
    --no-dev \
    --optimize-autoloader \
    --no-scripts \
    --no-interaction

COPY . .

EXPOSE 8989

CMD ["php", "server.php"]
