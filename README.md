# PHPTek 2026 WebSockets Demo App

This app powers the **"WebSockets made easy with OpenSwoole"** presentation and demos for PHPTek 2026.

> Note: due to time constraints for technical issues, we didn't cover the laravel integration, but it is done by using this package: https://github.com/kanata-php/conveyor-laravel-broadcaster.

Core purpose:

- Serve the talk deck in the browser
- Run simple WebSocket demo pages for echo, channels, timers, and Conveyor

Quick links:

- Slides PDF: [slides.pdf](./slides.pdf)
- Presentation app: `http://localhost:8989`
- Echo demo: `http://localhost:8989/examples/echo.html`
- Channel demo: `http://localhost:8989/examples/channel.html`
- Timer demo: `http://localhost:8989/examples/timer.html`
- Conveyor demo: `http://localhost:8989/conveyor`

## Run with Docker Compose

From this directory:

```bash
docker compose up --build
```

Then open:

```text
http://localhost:8989
```

To stop the app:

```bash
docker compose down
```
