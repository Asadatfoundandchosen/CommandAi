const SHUTDOWN_TIMEOUT_MS = 30_000;

export class GracefulShutdown {
  private callbacks: (() => Promise<void>)[] = [];
  private shuttingDown = false;

  register(callback: () => Promise<void>): void {
    this.callbacks.push(callback);
  }

  async shutdown(): Promise<void> {
    if (this.shuttingDown) {
      return;
    }
    this.shuttingDown = true;

    process.stdout.write("Starting graceful shutdown...\n");

    const forceExit = setTimeout(() => {
      process.stderr.write(
        `Shutdown timed out after ${SHUTDOWN_TIMEOUT_MS / 1000}s, forcing exit\n`,
      );
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);

    try {
      for (const callback of this.callbacks) {
        try {
          await callback();
        } catch (error) {
          process.stderr.write(`Shutdown callback error: ${String(error)}\n`);
        }
      }
      clearTimeout(forceExit);
      process.stdout.write("Shutdown complete\n");
      process.exit(0);
    } catch (error) {
      clearTimeout(forceExit);
      process.stderr.write(`Shutdown failed: ${String(error)}\n`);
      process.exit(1);
    }
  }
}

export const gracefulShutdown = new GracefulShutdown();

process.on("SIGTERM", () => {
  void gracefulShutdown.shutdown();
});
process.on("SIGINT", () => {
  void gracefulShutdown.shutdown();
});
