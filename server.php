<?php

declare(strict_types=1);

require_once __DIR__ . '/vendor/autoload.php';

use Conveyor\Constants;
use Conveyor\ConveyorServer;
use Conveyor\Events\PreServerStartEvent;
use Conveyor\SubProtocols\Conveyor\Persistence\WebSockets\Table\SocketChannelPersistenceTable;
use Hook\Filter;
use OpenSwoole\Http\Request;
use OpenSwoole\Http\Response;
use OpenSwoole\Timer;

$host = '0.0.0.0';
$port = 8989;
$publicDir = __DIR__ . '/public';
$staticRouteMap = [
    '/conveyor' => '/examples/conveyor.html',
];

// Create channel persistence before server so the timer closure shares the same instance.
// OpenSwoole Tables are shared memory — must be created before server forks workers.
$channelPersistence = new SocketChannelPersistenceTable();

// Serve static files from public/ for all unmatched HTTP requests.
Filter::addFilter(Constants::FILTER_REQUEST_HANDLER, function (callable $default) use ($publicDir, $staticRouteMap): callable {
    $mimeMap = [
        'html' => 'text/html; charset=utf-8',
        'css'  => 'text/css',
        'js'   => 'application/javascript',
        'json' => 'application/json',
        'png'  => 'image/png',
        'svg'  => 'image/svg+xml',
        'ico'  => 'image/x-icon',
    ];

    return function (Request $request, Response $response) use ($publicDir, $mimeMap, $staticRouteMap): void {
        $uri = $request->server['request_uri'] ?? '/';

        if ($uri === '/' || $uri === '') {
            $uri = '/index.html';
        }

        $uri = $staticRouteMap[$uri] ?? $uri;

        // Prevent directory traversal
        $realPublic = realpath($publicDir);
        $candidate  = realpath($publicDir . $uri);

        if ($candidate && $realPublic && str_starts_with($candidate, $realPublic) && is_file($candidate)) {
            $ext = strtolower(pathinfo($candidate, PATHINFO_EXTENSION));
            $response->header('Content-Type', $mimeMap[$ext] ?? 'application/octet-stream');
            $response->header('Access-Control-Allow-Origin', '*');
            $response->end(file_get_contents($candidate));
            return;
        }

        $response->status(404);
        $response->header('Content-Type', 'text/plain');
        $response->end('404 Not Found');
    };
});

echo "Starting WebSocket + HTTP server on {$host}:{$port}\n";
echo "  Presentation: http://localhost:{$port}/\n";
echo "  Echo demo:    http://localhost:{$port}/examples/echo.html\n";
echo "  Channel demo: http://localhost:{$port}/examples/channel.html\n";
echo "  Timer demo:   http://localhost:{$port}/examples/timer.html\n";
echo "  Conveyor UI:  http://localhost:{$port}/conveyor\n";

(new ConveyorServer())
    ->host($host)
    ->port($port)
    // Override default channel persistence so the timer closure shares the same instance
    ->persistence([Constants::CHANNELS => $channelPersistence])
    ->eventListeners([
        Constants::EVENT_PRE_SERVER_START => function (PreServerStartEvent $event) use ($channelPersistence): void {
            // Add workerStart handler to the OpenSwoole server before it forks.
            // Only worker 0 runs the timer to avoid duplicate pushes.
            $event->server->on('workerStart', function ($server, int $workerId) use ($channelPersistence): void {
                if ($workerId !== 0) {
                    return;
                }

                // Push current time to every client subscribed to 'timer-channel' every 2 seconds.
                Timer::tick(2000, function () use ($server, $channelPersistence): void {
                    $connections = array_filter(
                        $channelPersistence->getAllConnections(),
                        static fn(string $channel): bool => $channel === 'timer-channel'
                    );

                    foreach (array_keys($connections) as $rawFd) {
                        $fd = (int) $rawFd;
                        if ($server->isEstablished($fd)) {
                            $server->push($fd, json_encode([
                                'action' => 'timer-tick',
                                'data'   => date('H:i:s'),
                            ]));
                        }
                    }
                });
            });
        },
    ])
    ->start();
