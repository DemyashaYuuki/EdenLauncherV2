package fun.edenworld.skinbridge.core;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.time.Clock;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.logging.Logger;
import org.junit.jupiter.api.Test;

class JobServiceTest {
	@Test
	void concurrentRetriesReserveOnlyOneJob() throws Exception {
		AtomicInteger generations = new AtomicInteger();
		CountDownLatch generate = new CountDownLatch(1);
		SkinBackend backend = new SkinBackend() {
			public AuthGate.Readiness readiness() { return AuthGate.Readiness.ok(); }
			public SignedTexture generate(byte[] png, String variant) throws BackendException {
				generations.incrementAndGet();
				try {
					generate.await(10, TimeUnit.SECONDS);
				} catch (InterruptedException e) {
					Thread.currentThread().interrupt();
					throw new BackendException("interrupted", "Interrupted");
				}
				return new SignedTexture("value", "signature");
			}
			public ApplyResult apply(UUID player, SignedTexture texture) { return ApplyResult.APPLIED; }
			public List<Look> looks() { return List.of(); }
			public ApplyResult applyLook(UUID player, String id) { return ApplyResult.APPLIED; }
		};
		try (JobService jobs = new JobService(backend, Clock.systemUTC(), Logger.getLogger("test"), 2, 64);
			var pool = Executors.newFixedThreadPool(16)) {
			UUID player = UUID.randomUUID();
			CountDownLatch start = new CountDownLatch(1);
			List<Future<JobService.Job>> results = new ArrayList<>();
			for (int i = 0; i < 64; i++) results.add(pool.submit(() -> {
				start.await();
				return jobs.submitSkin(player, "same-retry-key", new byte[] {1}, "classic");
			}));
			start.countDown();
			String id = results.getFirst().get(10, TimeUnit.SECONDS).id();
			for (Future<JobService.Job> result : results) assertEquals(id, result.get(10, TimeUnit.SECONDS).id());
			generate.countDown();
			long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
			while (!JobService.isTerminal(jobs.get(id, player).orElseThrow().status()) && System.nanoTime() < deadline) Thread.sleep(10);
			assertEquals(JobService.Status.APPLIED, jobs.get(id, player).orElseThrow().status());
			assertEquals(1, generations.get());
		} finally {
			generate.countDown();
		}
	}
}
