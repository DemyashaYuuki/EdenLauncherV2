package fun.edenworld.skinbridge.core;

import java.time.Clock;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Bounded queue of skin applications. A job moves queued → generating → applying → applied (or
 * saved for the next login), or failed/cancelled. The same idempotency key from the same player
 * returns the existing job instead of generating twice.
 */
public final class JobService implements AutoCloseable {
	public enum Status {
		QUEUED,
		GENERATING,
		APPLYING,
		APPLIED,
		SAVED_OFFLINE,
		FAILED,
		CANCELLED
	}

	public record Job(String id, UUID player, Status status, String message, String errorCode, long updatedMs) {}

	public static final class QueueFullException extends Exception {
		private static final long serialVersionUID = 1L;
	}

	private interface Work {
		SkinBackend.ApplyResult run(JobService service, String jobId) throws SkinBackend.BackendException;
	}

	private static final int MAX_JOBS = 1024;
	private static final Duration RETENTION = Duration.ofMinutes(30);

	private final SkinBackend backend;
	private final Clock clock;
	private final Logger logger;
	private final ExecutorService executor;
	private final Map<String, Job> jobs = new LinkedHashMap<>();
	private final Map<String, String> idempotency = new LinkedHashMap<>();

	public JobService(SkinBackend backend, Clock clock, Logger logger, int workers, int queueSize) {
		this.backend = backend;
		this.clock = clock;
		this.logger = logger;
		this.executor = new ThreadPoolExecutor(
				workers,
				workers,
				30,
				TimeUnit.SECONDS,
				new ArrayBlockingQueue<>(queueSize),
				runnable -> {
					Thread thread = new Thread(runnable, "EdenSkinBridge-worker");
					thread.setDaemon(true);
					return thread;
				},
				new ThreadPoolExecutor.AbortPolicy());
	}

	private synchronized void put(Job job) {
		jobs.put(job.id(), job);
		long cutoff = clock.millis() - RETENTION.toMillis();
		jobs.values().removeIf(j -> j.updatedMs() < cutoff && isTerminal(j.status()));
		while (jobs.size() > MAX_JOBS) {
			String eldest = jobs.keySet().iterator().next();
			jobs.remove(eldest);
		}
		idempotency.values().removeIf(id -> !jobs.containsKey(id));
	}

	public static boolean isTerminal(Status status) {
		return status == Status.APPLIED
				|| status == Status.SAVED_OFFLINE
				|| status == Status.FAILED
				|| status == Status.CANCELLED;
	}

	private synchronized boolean transition(String id, Status from, Status to) {
		Job job = jobs.get(id);
		if (job == null || job.status() != from) {
			return false;
		}
		put(new Job(id, job.player(), to, job.message(), job.errorCode(), clock.millis()));
		return true;
	}

	private synchronized void finish(String id, Status status, String message, String code) {
		Job job = jobs.get(id);
		if (job != null && !isTerminal(job.status())) {
			put(new Job(id, job.player(), status, message, code, clock.millis()));
		}
	}

	public SkinBackend.ApplyResult generateAndApply(String jobId, byte[] png, String variant, UUID player)
			throws SkinBackend.BackendException {
		SkinBackend.SignedTexture texture = backend.generate(png, variant);
		if (!transition(jobId, Status.GENERATING, Status.APPLYING)) {
			throw new SkinBackend.BackendException("cancelled", "Cancelled");
		}
		return backend.apply(player, texture);
	}

	private synchronized Job submit(UUID player, String idempotencyKey, Work work) throws QueueFullException {
		String key = player + ":" + idempotencyKey;
		synchronized (this) {
			String existing = idempotency.get(key);
			if (existing != null && jobs.containsKey(existing)) {
				return jobs.get(existing);
			}
		}
		String id = SecureTokens.randomId();
		Job job = new Job(id, player, Status.QUEUED, null, null, clock.millis());
		synchronized (this) {
			put(job);
			idempotency.put(key, id);
		}
		try {
			executor.execute(() -> run(id, work));
		} catch (RejectedExecutionException e) {
			finish(id, Status.FAILED, "The server is busy, try again later", "busy");
			synchronized (this) {
				idempotency.remove(key);
			}
			throw new QueueFullException();
		}
		return job;
	}

	private void run(String id, Work work) {
		if (!transition(id, Status.QUEUED, Status.GENERATING)) {
			return;
		}
		try {
			SkinBackend.ApplyResult result = work.run(this, id);
			finish(id, result == SkinBackend.ApplyResult.APPLIED ? Status.APPLIED : Status.SAVED_OFFLINE, null, null);
		} catch (SkinBackend.BackendException e) {
			finish(id, "cancelled".equals(e.code()) ? Status.CANCELLED : Status.FAILED, e.getMessage(), e.code());
		} catch (RuntimeException e) {
			logger.log(Level.WARNING, "Skin job " + id + " failed", e);
			finish(id, Status.FAILED, "Internal error", "internal");
		}
	}

	public Job submitSkin(UUID player, String idempotencyKey, byte[] png, String variant) throws QueueFullException {
		return submit(player, idempotencyKey, (service, id) -> service.generateAndApply(id, png, variant, player));
	}

	public Job submitLook(UUID player, String idempotencyKey, String lookId) throws QueueFullException {
		return submit(player, idempotencyKey, (service, id) -> {
			if (!service.transition(id, Status.GENERATING, Status.APPLYING)) {
				throw new SkinBackend.BackendException("cancelled", "Cancelled");
			}
			return backend.applyLook(player, lookId);
		});
	}

	public synchronized Optional<Job> get(String id, UUID player) {
		Job job = jobs.get(id);
		return job != null && job.player().equals(player) ? Optional.of(job) : Optional.empty();
	}

	/** Cancels a job that has not reached the apply step yet. */
	public synchronized Optional<Job> cancel(String id, UUID player) {
		Job job = jobs.get(id);
		if (job == null || !job.player().equals(player)) {
			return Optional.empty();
		}
		if (job.status() == Status.QUEUED || job.status() == Status.GENERATING) {
			put(new Job(id, player, Status.CANCELLED, null, null, clock.millis()));
		}
		return Optional.of(jobs.get(id));
	}

	@Override
	public void close() {
		executor.shutdownNow();
	}
}
